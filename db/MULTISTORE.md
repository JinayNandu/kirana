# More than one shop

Not built. This is the design, written down while it is still cheap —
there are two test orders in the database and one store, so the
decisions below cost minutes now and a migration later.

---

## The one thing that is urgent

**`orders`, `runs` and `staff` have no store dimension at all.** Adding
`store_id` to a table holding two test rows is a minute's work. Adding
it to a table holding three months of a real shop's orders is a
migration with a backfill and a window where the app is wrong.

Everything else here can wait. That cannot, or rather it can, but it
gets steadily more expensive and never cheaper.

## What a store is

`app/data/shop.json` becomes a **row**, not a file.

```sql
create table stores (
  id       text primary key,      -- 'milan' -- short, it goes in URLs and run ids
  name     jsonb not null,        -- {en, mr, hi}
  addr     jsonb not null,
  phone    text not null,
  area     text,                  -- 'Borivali West' -- what the picker groups by
  ll       jsonb,
  upi      jsonb,                 -- each shop's own id; money must not cross
  delivery jsonb,
  coupons  jsonb,                 -- each shop's own codes
  runplan  jsonb,                 -- each shop's own hours
  staff_proof jsonb,              -- each shop's own six-digit code
  active   boolean not null default true
);
```

This costs something real and it is worth naming: `shop.json` was a
file **so the Perl checks could read the same numbers the app does**,
and so the shopkeeper needed no JavaScript to change his own phone
number. With fifty shops that argument stops working — you cannot ship
fifty shops in a file in git.

So `shop.json` becomes the **seed for the first row**, `data.pl` keeps
checking it as the shape every store must satisfy, and the table is the
truth. The shopkeeper gets a screen instead of a file, which he was
going to need anyway.

## The catalogue is shared. The shelf is not.

This is the decision that matters most, because the catalogue is where
all the expensive work is: 115 products with names in three languages,
106 pack shots fetched and quality-checked, 316 pairings, the glyphs,
the Devanagari search tags. **None of that is per shop.** A packet of
Aashirvaad atta is the same packet in Borivali and in Kandivali.

What differs per shop is **price and whether it is in stock**.

```sql
create table store_products (
  store_id text not null references stores on delete cascade,
  pid      text not null,         -- into the shared catalog.json
  price    int  not null,
  mrp      int  not null,
  stock    boolean not null default true,
  primary key (store_id, pid)
);
```

**A store with no row for a product simply does not sell it.** The
catalogue is the universe; a store's rows are its shelf. That is what
lets a shop that stocks 60 lines and one that stocks 200 share
everything that was expensive to build.

`tools/pricelist.pl` and `tools/setprice.pl` then take a store id, and
a new shop starts from a copy of an existing shop's prices rather than
from nothing.

## Where store_id goes, and where it does not

| | |
|---|---|
| `orders.store_id` | **required.** An order belongs to one shop. |
| `runs` | `run-<store>-<date>-<slot>`, or a `store_id` column. The second is cleaner to query. |
| `staff` | `(user_id, store_id)`. A person is staff **of a shop**, not staff in general — and `is_staff()` takes a store. |
| `addresses` | ⚠️ **NO.** A customer's home is their home whichever shop they buy from. Tying an address to a store would make somebody retype it the first time they order from a second shop, which is the exact thing the address book exists to stop. |

`is_staff(store_id)` replaces `is_staff()`, and the order policy
becomes "yours, or you are staff **of its store**". Today's version
would show every shopkeeper every shop's orders the moment there are
two.

## The picker

**Customer:** a first screen — *where are you ordering from?* — grouped
by area, each store a card with its name, area and next delivery
window. The chosen store persists, so a returning customer lands in
their shop rather than at a menu. A shop that is closed or inactive is
shown and says so, the same rule the slot picker already follows: a
thing that silently vanishes reads as a broken app.

**Store view:** staff of exactly one shop go straight to that board —
no picker, because a choice with one option is not a choice. Staff of
several get the same list. The six-digit code becomes per shop, which
it has to be: Milan's code must not open somebody else's board.

## Email, and why the sender has to be generic now

One Supabase project has **one SMTP sender and one set of templates**.
There is no per-store From address and no per-store body without
running a mail service of our own.

So the sign-in email must not say Milan's Super Shoppe. It is a code
for **the platform**, not for a shop — and a customer who signs in once
and then orders from three shops should not get mail from whichever one
they happened to start at.

⚠️ **This is the only item here that is wrong in production right now.**
The Brevo sender is named *Milan's Super Shoppe*. It should be the
platform's name and a neutral address, and that is a dashboard change
taking a minute, not a code change.

A shop's name belongs in the **order** emails, if those ever exist.
Those would be sent per order and can say whatever they like.

## Order of work

1. **Prove the single-store version first.** Sign-in round trip, the
   staff row, and the two-window demo — a customer ordering on one
   device and the board ticking on another. Multi-store on top of an
   unproven base means two layers to suspect when something breaks.
2. `stores` + `store_products`, seeded from `shop.json` and
   `catalog.json`.
3. `store_id` through `orders`, `runs`, `staff`; `is_staff(store_id)`.
4. The two pickers.
5. Generic email sender. *(Or do this one now — it is a dashboard
   field.)*
