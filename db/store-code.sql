-- ---------------------------------------------------------------------
--  The Store code, checked where it can actually decide something.
--
--  Run this ONCE in Supabase -> SQL Editor. Change the code on the
--  last statement first.
--
--  WHY THIS EXISTS
--
--  The gate in lock.js runs in the browser, so it only ever decided
--  whether a BUTTON was drawn. The server never knew the code had
--  been typed. So whoever got past the gate still read the database
--  as a stranger, and `ord_read` handed them nothing -- which is what
--  "No orders yet today" on a shop full of orders actually meant.
--
--  claim_staff() is the same code, checked where it can open the
--  DATA. On a match it puts the CALLING session into `staff`. A phone
--  becomes the shop by typing the code and nothing else: no email, no
--  account, no uuid copied out of a dashboard.
--
--  WHAT IT COSTS
--
--  The code becomes a real credential. Before this, leaking it got
--  you a shop-shaped UI with nothing in it. After this, it gets you
--  every customer's name, phone and address. Two things follow:
--
--    - Never set it to anything that has been public. The word on the
--      shop sign is the first thing anybody would try.
--    - Length is the only real defence. bcrypt makes each guess slow,
--      but six digits is a million guesses and that is hours, not
--      years. Ten characters is not.
-- ---------------------------------------------------------------------

create extension if not exists pgcrypto;

create table if not exists shop_secret (
  id         int primary key default 1,
  code_hash  text        not null,
  set_at     timestamptz not null default now(),
  constraint shop_secret_one_row check (id = 1)
);

alter table shop_secret enable row level security;
-- Deliberately NO policy. Nothing reaches this table except the
-- SECURITY DEFINER function below, which is the entire point of it.
-- A policy here would be a way in; its absence is the lock.

create or replace function claim_staff(code text) returns boolean
  language plpgsql volatile security definer set search_path = public as $$
declare hash text;
begin
  -- No session, nothing to put in `staff`.
  if auth.uid() is null then return false; end if;

  select code_hash into hash from shop_secret where id = 1;
  if hash is null then return false; end if;

  -- crypt() re-derives with the salt carried in the stored hash, so
  -- this is a constant-time-ish bcrypt compare, not a string match.
  if hash <> crypt(code, hash) then return false; end if;

  insert into staff (user_id) values (auth.uid())
    on conflict (user_id) do nothing;
  return true;
end;
$$;

revoke all on function claim_staff(text) from public;
-- Anonymous sign-ins carry the `authenticated` role with
-- is_anonymous = true, so this covers a phone that has never signed
-- in -- which is the whole case this exists for.
grant execute on function claim_staff(text) to authenticated;

-- ---------------------------------------------------------------------
--  SET THE CODE. Change it here before running.
--  It must match the code in app/data/shop.json, which
--  `perl tools/setpin.pl <code>` writes.
-- ---------------------------------------------------------------------
insert into shop_secret (id, code_hash)
values (1, crypt('CHANGE-ME', gen_salt('bf', 10)))
on conflict (id) do update set code_hash = excluded.code_hash, set_at = now();
