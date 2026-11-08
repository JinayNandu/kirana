-- =====================================================================
--  db/products.sql -- the shop edits its own catalogue.
--
--  Run ONCE, by hand: Supabase -> SQL Editor -> paste all of this ->
--  Run. Safe to run again; the second run changes nothing.
--
--  app/data/catalog.json stays the starting catalogue. This table holds
--  only what the shop has CHANGED -- a price, a photo, out of stock,
--  taken off sale -- plus any product the shop has added, and the app
--  lays it over the JSON at load. The same "derived, then overlaid"
--  shape as the delivery windows: most products never get a row.
--
--  Everyone reads, because the new price has to reach a customer before
--  they have a session. Only a session that typed the Store code writes
--  -- is_staff(), the same test as every other write the shop makes.
-- =====================================================================

create table if not exists product_edits (
  id         text primary key check (id ~ '^p-[a-z0-9-]{1,40}$'),
  added      boolean not null default false,  -- true: not in catalog.json
  name       jsonb,                           -- {"en": "...", "hi": ...}
  brand      text,
  cat        text,
  pack       jsonb,                           -- {"n": 500, "u": "g"}
  price      integer check (price is null or price > 0),
  mrp        integer check (mrp is null or mrp > 0),
  stock      integer check (stock is null or stock >= 0),
  hidden     boolean not null default false,
  photo      text,                            -- public URL, bucket below
  tile       text,
  updated_at timestamptz not null default now(),
  -- Whole rupees (the column type), and never a price above its MRP.
  check (price is null or mrp is null or price <= mrp),
  -- A product the shop added has to be a whole product.
  check (not added or (name ? 'en' and cat is not null and pack is not null
                       and price is not null and mrp is not null))
);
alter table product_edits enable row level security;

drop policy if exists pe_read on product_edits;
create policy pe_read on product_edits for select using (true);
drop policy if exists pe_write on product_edits;
create policy pe_write on product_edits for all
  using (is_staff()) with check (is_staff());

-- anon as well as authenticated: the catalogue loads BEFORE the app
-- starts a session, so the first read goes out with no user at all.
grant select on product_edits to anon, authenticated;
grant insert, update, delete on product_edits to authenticated;

-- ---------------------------------------------------------------------
--  Photos. A PUBLIC bucket: a product photo is on the shop's shelf for
--  anyone to see, and a public URL needs no signing. Writing is staff
--  only. 2 MB and images only -- the app shrinks a phone photo to about
--  100 KB before sending it, so the limit only ever stops a mistake.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product photos: staff add" on storage.objects;
create policy "product photos: staff add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_staff());

drop policy if exists "product photos: staff change" on storage.objects;
create policy "product photos: staff change" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-photos' and public.is_staff());

drop policy if exists "product photos: staff remove" on storage.objects;
create policy "product photos: staff remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_staff());
