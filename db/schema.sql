-- =====================================================================
--  Milan's Super Shoppe -- the database
--
--  Paste the whole file into the Supabase SQL editor and run it. It is
--  idempotent: running it twice changes nothing the second time.
--
--  ---------------------------------------------------------------
--  WHAT IS *NOT* HERE, AND WHY
--
--  The catalogue. All 115 products, their prices, the categories, the
--  pairings and the delivery windows stay in app/data/*.json, in git.
--  They are edited with tools/pricelist.pl and tools/setprice.pl, they
--  are checked by tools/data.pl, and they are the same for everybody
--  who opens the app. Putting them in Postgres would buy nothing and
--  cost the shopkeeper his one-command price edit.
--
--  What IS here is only what moves per person and per day: orders,
--  the shopkeeper's overrides on a delivery window, and the address
--  book. Five tables.
--
--  ---------------------------------------------------------------
--  THE ADDRESS IS COPIED INTO THE ORDER, NEVER REFERENCED
--
--  orders carries cust_name, cust_phone, flat, society, area and
--  landmark as plain columns, not a foreign key to addresses. This is
--  deliberate and it is the same rule as the price on an order line:
--  an address edited or deleted next month must not rewrite where
--  last week's order went.
--
--  It also means the shop NEVER needs to read anybody's address book.
--  There is no policy letting it, which is the point.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  staff -- membership of this table IS the Store view
--
--  Nobody can write it from the app. Add the shopkeeper by hand:
--
--    insert into staff (user_id) values ('<his uuid from Auth > Users>');
-- ---------------------------------------------------------------------
create table if not exists staff (
  user_id  uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);
alter table staff enable row level security;

-- SECURITY DEFINER so the function can read `staff` without going back
-- through `staff`'s own policy. Without that, every policy that calls
-- it recurses and Postgres refuses the query -- which looks exactly
-- like "the shop cannot see any orders".
create or replace function is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

drop policy if exists staff_read on staff;
create policy staff_read on staff for select using (is_staff());

-- ---------------------------------------------------------------------
--  addresses -- the address book, one row per saved address
--
--  Each carries its OWN name and phone, because "where does it go" and
--  "who takes it in" are two questions. Groceries to your mother's go
--  to her, and the number the driver rings has to be hers.
-- ---------------------------------------------------------------------
create table if not exists addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  label      text,
  name       text not null,
  phone      text not null,
  flat       text not null,
  society    text not null,
  area       text not null,
  landmark   text,
  ll         jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists addresses_user on addresses (user_id, created_at desc);
alter table addresses enable row level security;

drop policy if exists addr_own on addresses;
create policy addr_own on addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
--  orders
--
--  The code (K-0007) is derived from a sequence rather than counted in
--  the browser. Two customers ordering in the same second on different
--  phones is exactly the case a localStorage counter could not get
--  right, and the code is what the shopkeeper shouts across the shop.
-- ---------------------------------------------------------------------
create sequence if not exists order_seq start 1;

create table if not exists orders (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint not null default nextval('order_seq'),
  code        text generated always as ('K-' || lpad(seq::text, 4, '0')) stored,
  user_id     uuid default auth.uid() references auth.users on delete set null,
  run_id      text not null,
  status      text not null default 'placed',
  placed_at   timestamptz not null default now(),

  -- the address, SNAPSHOTTED. See the note at the top of this file.
  cust_name   text not null,
  cust_phone  text not null,
  flat        text,
  society     text,
  area        text,
  landmark    text,
  ll          jsonb,

  -- Money is integer rupees everywhere in this app. int, never numeric:
  -- there is no half a rupee in a kirana and no float to drift.
  items_total int  not null,
  mrp_total   int  not null,
  saved       int  not null default 0,
  coupon      text,
  coupon_pct  int  not null default 0,
  discount    int  not null default 0,
  fee         int  not null default 0,
  grand       int  not null,

  paid        boolean not null default false,
  paid_at     timestamptz,
  paid_via    text,
  pay_method  text,
  -- Position within the run. NOT the order number: that is `seq`,
  -- and an order keeps it wherever it ends up in the round.
  stop_seq    int,
  note        text,
  history     jsonb not null default '[]'::jsonb
);
create index if not exists orders_run    on orders (run_id);
create index if not exists orders_user   on orders (user_id, placed_at desc);
create index if not exists orders_placed on orders (placed_at desc);
alter table orders enable row level security;

create table if not exists order_lines (
  id         bigserial primary key,
  order_id   uuid not null references orders on delete cascade,
  pid        text not null,
  name_en    text not null,
  pack       jsonb,
  qty        int  not null,
  unit_price int  not null,
  unit_mrp   int  not null,
  line_total int  not null
);
create index if not exists order_lines_order on order_lines (order_id);
alter table order_lines enable row level security;

-- You see your own orders. The shop sees all of them. Nobody sees
-- anybody else's -- and this is the rule the six-digit code in the app
-- could never enforce, because it runs in a browser the customer owns.
drop policy if exists ord_read on orders;
create policy ord_read on orders for select
  using (user_id = auth.uid() or is_staff());

drop policy if exists ord_insert on orders;
create policy ord_insert on orders for insert
  with check (user_id = auth.uid());

-- Only the shop moves an order along. A customer with UPDATE on their
-- own row could set status to 'delivered' or rewrite `grand`, so they
-- get none -- marking a payment goes through mark_paid() below, which
-- can do that one thing and nothing else.
drop policy if exists ord_staff_write on orders;
create policy ord_staff_write on orders for update
  using (is_staff()) with check (is_staff());

drop policy if exists line_read on order_lines;
create policy line_read on order_lines for select using (
  exists (select 1 from orders o where o.id = order_id
          and (o.user_id = auth.uid() or is_staff()))
);
drop policy if exists line_insert on order_lines;
create policy line_insert on order_lines for insert with check (
  exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid())
);

-- "I have paid" -- the customer's one write to their own order.
--
-- Nothing in this app can CONFIRM a UPI payment; there is no callback
-- to a static page. This records a claim, which is what the shop's own
-- UPI app then checks. It is not an observation.
create or replace function mark_paid(oid uuid, method text)
  returns void language sql security definer set search_path = public as $$
  update orders set paid = true, pay_method = method
   where id = oid and user_id = auth.uid() and paid = false;
$$;

-- How the customer SAYS they will pay, which is separate from whether
-- the money has turned up. Same reasoning as mark_paid(): they have no
-- UPDATE on orders, so their one choice goes through a function that
-- can set one column on one of their own rows.
create or replace function mark_method(oid uuid, method text)
  returns void language sql security definer set search_path = public as $$
  update orders set pay_method = method
   where id = oid and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
--  runs -- ONLY the shopkeeper's overrides
--
--  A delivery window is derived from app/data/runplan.json for a date
--  and then any row here is merged over it. So tomorrow's windows exist
--  the instant the IST clock passes midnight with no cron to fire, most
--  days write nothing at all, and a window from last March is never
--  stored and never queried.
-- ---------------------------------------------------------------------
create table if not exists runs (
  id         text primary key,          -- run-2026-11-02-s3
  enabled    boolean,
  status     text,
  note       text,
  updated_at timestamptz not null default now()
);
alter table runs enable row level security;

-- Everyone reads: the slot picker has to know a window was closed
-- early. Only the shop writes.
drop policy if exists runs_read on runs;
create policy runs_read on runs for select using (true);
drop policy if exists runs_write on runs;
create policy runs_write on runs for all
  using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
--  Realtime -- the two-window demo, for real this time
--
--  Customer on a phone, Store on the counter tablet: the board ticks
--  with no refresh. RLS is applied per subscriber, so the customer's
--  socket carries only their own orders.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'orders') then
    alter publication supabase_realtime add table orders;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'runs') then
    alter publication supabase_realtime add table runs;
  end if;
end $$;
