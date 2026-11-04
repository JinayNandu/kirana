# Kirana — project context

Read this before changing anything. Everything here was either
established by testing or decided deliberately; none of it is a guess.

---

## What this is

An ordering app for **Milan's Super Shoppe** — Shop 1, 2 & 3, Sagar
Apartment, Devidas Cross Lane, Prem Nagar, Borivali West, Mumbai
400103, phone 8169022727 — which is losing business to Blinkit and
Zepto.

It cannot compete on ten-minute delivery and does not try. What the shop
has instead is **three delivery windows a day, free to anywhere**,
cheaper prices, and customers it knows by name. The app sells that, not
speed: *free delivery, from your own shop, in a window you can plan
around.*

Two roles in one page, switched from the header:

| Role | What it is for |
|---|---|
| **Shop** | the customer storefront — browse, basket, coupon, pick a window, place the order, pay |
| **Store** | the counter — orders by window, picking lists, **what to load**, mark paid and delivered. **Behind a six-digit code**, so a customer who taps it does not land in the shop's paperwork |

There was a third, **Tempo**, for the driver — a stop list, cash to
collect, mark delivered. It is gone on the owner's call, along with the
"who is driving" field. The shopkeeper does the whole lifecycle from
the Store view; a driver with a phone can open that same view.


---

## Stack and constraints

- **No Node, no npm. Python is blocked by group policy.** Perl 5.42.2 at
  `C:/Users/Nandu jinay/AppData/Local/Programs/Git/usr/bin/perl.exe`.
- Therefore **zero build step** — vanilla HTML/CSS/ES modules, no
  bundler, no `package.json`, no test runner.
- ES modules refuse to run over `file://`, so local work needs a server:

```bash
perl tools/serve.pl 8110 app
```

  `tools/serve.pl` is Manchira's, with one change: it listens on **both**
  `127.0.0.1` **and** `::1`. Chrome on Windows resolves `localhost` to
  `::1` first, so the IPv4-only original was reachable by curl and
  invisible to the browser — which looks exactly like the app being
  broken. It binds to loopback only and deliberately not to a wildcard.

- **There IS a browser here.** Unlike Manchira, the app can be loaded,
  clicked and screenshotted. That is why this project has six check
  scripts and not twenty-five.

### Verified reachable from this laptop

Zscaler blocks some domains here, which would kill a CDN dependency
silently. Checked: `cdnjs.cloudflare.com` serves qrcodejs 1.0.0 (the
only runtime CDN left, used for the UPI QR) and Google Fonts resolves.

The map's CDNs were checked too and all worked -- unpkg / cdnjs /
jsdelivr for Leaflet, and tile.openstreetmap.org for imagery. That is
in parked/ now, so nothing in the running app depends on them.

---

## Layout

```
app/
  index.html        one document: all CSS, 17 <section id="s-*">, role switch
  app.js            entry -- the only module that knows both roles
  ui.js             $, esc, show/goBack/teardown, per-role NAV, paint, boot
  i18n.js           T = {en, hi, gu, mr}, 294 keys each
  domain.js         PURE -- IST clock, window derivation, status tables, money
  store.js          the facade; ONE import line is the Supabase swap
  backend-local.js  localStorage + cross-tab storage events
  backend-supabase.js  the same four rules over Postgres + Realtime
  account.js        the sign-in overlay, the pill, the checkout offer
  customer.js shop.js settings.js
  lock.js           PURE -- the code that opens the Store view
  pay.js            UPI link + QR. Takes no money -- see below.
  seed.js           demo orders, on a device that has never been used
  icons.js          26 pack glyphs + interface icons
  config.js         CDN pins -- technical plumbing ONLY
  data/
    shop.json         THE SHOPKEEPER'S FILE -- name, address, phone,
                      UPI id, what delivery costs
    catalog.json      117 products
    categories.json   10 categories
    pairs.json        what goes with what -- basket suggestions
    runplan.json      the three delivery windows
db/
  schema.sql        tables, row-level security, the SECURITY DEFINER
                    functions a customer is allowed to call
  store-code.sql    shop_secret + claim_staff(). Run once, by hand.
tools/
  serve.pl          static server, both loopback families
  pricelist.pl      prints the catalogue as an editable price list
  setprice.pl       reads that list back and applies the corrections
  setpin.pl         sets that code. Writes a hash, never the code
  check.pl          runs all six checks
  balance.pl i18n.pl data.pl slots.pl tokens.pl money.pl
parked/
  the fixed tempo route -- map.js, zones/routes/paths, mkroute.pl,
  bakeroute.pl, and a README on putting it back. Taken out on the
  owner's call; nothing in it is broken.
```

**Everything the shopkeeper owns is in `app/data/shop.json`** — name,
address and phone in all three languages, the UPI id, and the delivery
rules. It is JSON rather than part of `config.js` so that changing it
needs no knowledge of JavaScript and the Perl checks can read the same
numbers the app does. `money.pl` used to regex `config.js` for the fee,
which was a guess dressed up as a check.

Two flags in it change behaviour and both fail loudly rather than
quietly:

- `"placeholder"` — while true, `data.pl` fails. An invented shop name
  and a phone that does not dial are fine while nobody outside the room
  has seen it, and are the worst possible thing to ship by accident.
- `"demo"` — while true, `seed.js` drops a few invented orders onto the
  next window, but **only on a device that has never been used**. It
  exists so the Store board and the load list are not empty the first
  time someone is shown this. Turn it off before a real customer orders.

**One HTML document, JavaScript split into modules.** One document
because everything parity is checked over must be single-sourced — one
`<style>`, one `T`, one `show()`, one set of sections — and because the
role switch must not be a page load. The JavaScript splits because three
roles are genuinely three apps, and because putting JS in `.js` files
deletes the class of bug that forced Manchira to write `jsneutral.pm`.

**`ui.js` must never import a role module.** They import it and register
their screens into `ENTER`. A circular ES module import hands you
`undefined` for something that looks hoisted and throws at render, and
no checker can see it.

**No service worker in v1.** `serve.pl` already sends `no-store`, and a
stale service worker during iteration costs more time than anything
else. Add it at the end if the demo needs installability.

---

## Hard rules — do not break these

### Every date and clock read lives in `domain.js`

`toISOString().slice(0,10)` is **UTC**. On an IST device between 00:00
and 05:30 it returns *yesterday*, so a run id keyed on it is wrong for
five and a half hours every night and the symptom is "all the orders
vanished at midnight" — invisible in daylight, trivial to reproduce at
1 AM. `slots.pl` greps every module for it and fails on a hit.

Two details inside that are not optional:

- **`hourCycle: 'h23'`, never `hour12: false`.** `hour12:false` returns
  `"24:00"` for midnight in several engines, so 00:05 computes as 1445
  minutes instead of 5 — after every cut-off, giving an empty slot
  picker for the first hour of every day.
- **`formatToParts`, not a format string.** Assembling the parts
  ourselves cannot be bent by a locale quirk.

### Compare date AND minute, never minute-of-day alone

`stamp(date, mins)` exists for this. A bare clock comparison makes
tomorrow's 08:45 cut-off look *earlier* than today's 19:15, so tomorrow's
first run is never offered after 8:45 this morning.

**This has already been got wrong once in this codebase**, in
the old driver view's `lateBy()`, which read "running 657 min late" on
a run sent tonight for tomorrow's window. Same trap, different door.
`slots.pl` covers the window side.

### Runs are derived, then overlaid

A run is computed from `runplan.json` for a date, then any stored record
for that id is merged over it. Three things fall out: tomorrow's runs
exist the instant the IST clock passes midnight with no cron to fire;
only the *delta* is persisted, so most days write nothing; and a run far
in the past is never stored and never queried.

An explicit write always beats the clock, which is how "the shopkeeper
closed this run early" and "the cut-off passed" produce the same state
without a special case.

### The cut-off is enforced in the data layer, never in the picker

A customer can sit on the address screen across a cut-off. `place()`
re-checks and throws `RUN_CLOSED` / `RUN_FULL`; the Supabase version
puts the same check in a Postgres function. The UI names the next
option — *"The 12:30 run has just closed. The next leaves 5:00 PM"* —
because a generic failure here loses the order.

### A cart line is `{pid, qty}` and nothing else

**No price.** A cart that stores a price disagrees with itself the
moment the shopkeeper edits one, and it surfaces as "the cart total
isn't the confirmation total", which is unfixable once there are two
sources of truth. Price resolves from the catalogue at render and is
snapshotted into the order line at placement — the one moment it must
freeze.

### Money is integer rupees everywhere

Every price in a kirana is a whole rupee, so there is no floating point
in this app: no `toFixed`, no rounding rule, no drift down a thirty-line
basket. `data.pl` rejects a non-integer price.

**There is no minimum order** — the owner's call. Any basket, however
small, can be ordered.

The rule for one is kept anyway, because `freeOver` and `minOrder` are
still live numbers in `shop.json` and somebody will set them: **a
minimum is measured on the ITEMS total, never the grand total**, or the
delivery fee pushes a ₹140 basket over a ₹150 minimum and the fee is
quietly paying for the shortfall. `money.pl` asserts that case against a
**synthetic** minimum, because testing the live one had gone vacuous —
it was building a product priced at `0 - 10` and passing on a basket of
−10.

### Any status, any time -- and the tables that used to stop you

`ORDER_NEXT` and `RUN_NEXT` in `domain.js` are the only tables, and
they are now built rather than written out:

```js
export const ORDER_NEXT = Object.fromEntries(
  ORDER_STATES.map((s) => [s, ORDER_STATES.filter((x) => x !== s)]));
```

Every status reachable from every other. The picking list draws all
five, one tap each, with the current one filled.

⚠️ **This replaces a rule that used to be in this file**: that the
tables walk a chain and an invalid move throws. They did, and the
cost showed up in use -- tomorrow's order could not be marked
delivered today, and a tap made by mistake could not be taken back.
A machine telling a shopkeeper he has not done the thing he just did
is worse than any ordering it was protecting. The owner asked for
the policing to go; the STAGES below are unchanged.

What is still refused is a move to the status already set, which is
the one genuinely empty action: a silent no-op is a button that
looks like it worked.

**Declining is a status, not a feature.** `cancelled` was already in
the table; once every status has a button, the shop can decline an
order without anything being built for it.

`placed -> accepted -> delivered`. **Three stages, on the owner's
call.** He was looking at five things to tap on one screen -- accept,
mark packed, send out, mark delivered, mark paid -- for work with two
moments in it: deciding to fill the order, and handing it over.
Packing and loading happen BETWEEN those; they are not states anybody
needs to publish, and each one was a tap taken in front of a customer
standing at a counter.

`accepted` is a stage because accepting and delivering are two
different facts and the shop used to publish only the second: a
customer watching "Placed" for forty minutes cannot tell a busy shop
from a shop that never looked.

None of it needed a migration -- `status` is free text with no enum
and no check constraint, and the labels resolve as `c['st' + Status]`.
⚠️ That also means a row left over from the old five can still say
`packed`, and nothing will reject it. Such a row draws no trail step
and offers no button, which is the right failure, but it is why
`ORDER_NEXT` keeps no entry for a state it can no longer reach.

`ORDER_TRAIL` is the subset a CUSTOMER is shown, and deliberately not
the keys of `ORDER_NEXT`: `failed` and `cancelled` are endings rather
than stages, and a progress line listing them puts a warning on an
order going perfectly well. The track screen reads it off the order's
append-only `history`, so each step carries the time the shop did it
and a step with no time beside it has genuinely not happened.

**The trail has its own labels, `tr*` rather than `st*`.** It has room
for the whole sentence -- *"Accepted and scheduled for delivery"* --
and a pill has room for one word. Sharing one key forced the pill to
carry the sentence, and "Delivered - paid" then sat beside a separate
"Paid" pill saying the same thing twice.

`failed` ("Nobody home") earns its place and survived the cut to three
stages, as a ghost button on an accepted order. It is not a stage: it
is the delivery that did not happen. Whoever delivers *will* arrive
and find nobody in, and a board where that order sits in `accepted`
forever is a board nobody trusts by day three.

### A delivery window moves in step with the orders on it

`open` → `cutoff` → `done`, and the buttons say *Accept all and
schedule for delivery* and *Mark all delivered and paid* -- the same
two moves a single order makes, done to every order in the window at
once. **That is the whole reason the button exists**: a window of
twelve orders is twelve identical taps otherwise.

It has been cut twice. The states used to read *Taking orders*, *Pack
now*, *Loaded*, *On the road* -- status names rather than
instructions, and the owner could not tell what they meant. `loaded`
went with the tempo view and `out` went with `packed`: **a state
nobody acts on is a button nobody understands.**

**Both moves live on the BOARD as well**, on every window that has
orders, tomorrow's included. They were a screen deeper, which is a
tap and a scroll before the thing the shop actually wants. `bulk()`
in shop.js is shared by the board and the run screen so the two
cannot drift apart. Empty windows get no buttons, which is what
stops six cards becoming twelve.

⚠️ **A window whose hour has gone with work still on it goes red** --
the pill reads *Delayed*, the card takes a `--bad` border, and it is
the only red on that screen so it cannot be mistaken for anything
else. `runEnded()` compares date AND minute like everything else in
domain.js: yesterday's 8 PM is earlier than today's 11 AM and a bare
clock comparison says the opposite.

The board also stops shouting at empty windows. A window past its
cut-off with nothing in it says **No orders**, not *Closed · pack
these* — an instruction to do nothing is worse than silence.

### A customer can change their own order, up to an hour before

`canEditOrder()` in domain.js: more than `EDIT_LEAD_MINS` (60) from
the window opening, and the order still `placed` or `accepted`. The
track screen then offers **Change this order**, which opens `s-oedit`
-- its own screen, touching neither the cart nor checkout.

A working copy lives in `S.edit`; nothing is written until Save, so
backing out costs a tap and leaves no trace. Totals recompute through
the SAME `calcTotals()` the cart uses, so an edited order is priced
by the rules a new one would be. **Both backends re-price from the
catalogue** rather than trusting the figures the screen sent: a line
total is the one number a customer could profit from choosing.

⚠️ **The hour is enforced in the BROWSER, and cannot be enforced
anywhere else.** The timetable lives in `app/data/runplan.json`, not
in Postgres, so there is no window time on the row for
`edit_order()` to compare against. What the server does guarantee is
ownership, a status that is still `placed` or `accepted`, and at
least one line. That is exactly the standing of the existing
cut-off -- `place()` checks `isBookable()` in the browser too -- so
it is no weaker than the rest of the app and no stronger. Nobody
should build on it believing the hour is a hard edge.

A customer has no UPDATE on `orders` at all, so the write goes
through `edit_order()` in `db/order-edit.sql`, the same shape as
`mark_paid()`: a SECURITY DEFINER function that can do one thing.
**Run it once by hand**, like `db/store-code.sql`.

The hour falls exactly where the order cut-off already falls. That
is not a coincidence worth hiding: the shop stops taking orders and
stops accepting changes at the same moment, because that is the
moment it starts packing.

### There is no live GPS tracking, and there should not be

`watchPosition` only fires while the page is foregrounded. Whoever is
delivering has a phone that locks within a minute, and iOS stops
delivering position to a backgrounded tab entirely — so the dot freezes
where he was. **A stale dot saying "at Vazira Naka" while he is at I.C.
Colony destroys the trust the feature exists to build.** With no backend
the position could not travel from his phone to the customer's anyway.

What replaces it costs nothing and is true: the window states are taps
somebody already makes, so *"sent out at 5:02"* is an observation and
not a guess. A customer-facing live map is **Phase 2 and needs a
server.**

### The search box kept losing the keyboard

Typing two characters moved the caret out of the field and dismissed
the phone keyboard, so a search had to be entered two letters at a tap.

The cause was `repaint()` wired to `oninput`. The input lived INSIDE
the markup that repaint rebuilds, so every keystroke destroyed the
element being typed into and put a fresh one in its place -- and a
browser cannot hold focus on a node that no longer exists.

The input is now mounted once and never replaced; only the results
redraw, into their own container. Typing is debounced 160ms, and the
field takes focus with the caret after whatever was typed on the
previous screen, so a word begun in the shop header simply continues.
**An input must never sit inside the region its own handler repaints.**

### The picking list is one button

Every line of it once carried a tick, and the packed button stayed
disabled until all of them were ticked -- so a four-item order took
five taps, and a shopkeeper holding the bag had to tell the app what
he could already see. The list is what to put in the bag, not a form
to fill in. The ticks went, then the packed button itself.

The stages are a row of buttons now, every status always drawn and
the current one filled -- see "Any status, any time". Their labels
are whole sentences, in the owner's words: *Accepted and delivery
scheduled*, *Delivered and payment received / verified*. They are
`sb*` keys and fall back to the pill's `st*` word where there is
none -- the same split the customer's trail makes with `tr*`, for the
same reason: a pill has room for one word and a button has room for
the sentence.

⚠️ **The payment buttons are drawn only once an order is
DELIVERED** -- *Mark unpaid* and *Verified* side by side, the current
one filled (*Received* instead of Verified on an order that was never
on the UPI path). Paying is part of the last stage, so a separate
"Mark paid" standing next to "Accept" was a third decision at the one
moment there is nothing to decide. After delivery they have a job
again: the customer who in the end did not pay. `settle()` only ever
marks paid ON the move to delivered -- it once ran after every
advance, so accepting an order marked it paid -- and because it does,
a delivered order arrives with Verified already lit.

### The board answers "how much, and what do I pack"

That is the question the shop opens the Store view with, and the board
used to answer a different one -- what STATE each window was in. It now
leads with a tally: **the money to collect today** in 28px, the order
and item count under it, what has already been paid online, and pills
for the work outstanding (*4 to pack*, *2 out for delivery*).

Each window card then shows its time, its state, its own orders and
items, **its own money**, and one line of work with a chevron. And each
ORDER in a window carries its own amount, because "977 to collect" at
the top of a screen does not tell whoever is handing over a bag what to
ask this particular customer for. A paid order shows its figure
**struck through** rather than hidden: still worth seeing, simply not
owed.

⚠️ **Tomorrow is not dimmed.** It was drawn at 60% opacity and read as
switched off, which it never was -- those cards have always opened. The
only thing dimmed now is a window the shopkeeper has actually turned
off, which really is unavailable.

### Everyone gets the same window

Three one-hour windows a day — 11:00–12:00, 15:00–16:00, 19:00–20:00 —
and every address gets the same one. Each closes an hour before it
starts, which is the shopkeeper's picking time.

There used to be a fixed route with per-locality arrival times
("the tempo reaches your lane around 5:25–5:50"). It was more precise
and less true: it only worked for the thirteen localities that were on
a list, and it moved with traffic. A flat hour is a weaker promise
that holds for every address, including the ones nobody has thought of
yet.

`data.pl` asserts the windows do not overlap and that each closes
before it opens — an order that could fall into two windows at once
has no right answer.

### No placeholders in the address form

Grey example text inside an input reads as a value that is already
there. Next to the two fields the location button genuinely does fill,
half the form looked answered when it was empty. The labels above each
box say what it is, which is the job the placeholder was doing badly.

**The landmark is not auto-filled either**, though the geocoder offers
one. OSM returns whatever building it has nearest, which is a real
place but not necessarily YOUR landmark -- and the whole point of that
field is that the customer knows something the map does not.

### The Store view is behind a code

Tapping **Store** used to be all it took to reach the board, the
picking lists, every customer's address and the day's money. Now it
asks for a six-digit code.

**The check sits on `setRole`, not on the four Store screens.** One
road into the role means one gate; a gate per screen is a gate
somebody forgets to add to the fifth.

**`lock.js` is pure, like `domain.js`** -- no DOM, no `ui.js` import.
`ui.js` owns the gate screen and calls in to ask whether it has to
draw one, so the import graph stays a tree.

#### Two links, one document

| | |
|---|---|
| `…/kirana/` | the customer. **No Store button at all.** |
| `…/kirana/?store` | the shopkeeper. Opens straight onto the gate. |

**The URL decides, and nothing remembers.** There is no role switch in
either link: `#roleseg` is hidden outright, and `isStoreLink()` reads
`location.search` at boot.

⚠️ It did remember, in localStorage, so the owner's phone would know
it had been given the staff link. That was wrong in a way only a real
device shows you: once a phone had opened `?store` ONCE, the plain
link showed the Store button too — so the two links were identical on
the one device where the difference mattered, and stayed that way
forever. Reading the URL is a rule a person can hold in their head.
The link you opened is what you get, on any phone, every time.

The shopkeeper reaches the shop by opening the shop's link, the same
way his customers do. **The unlock is still remembered**
(`kirana.storeopen`), so reopening the staff link goes straight to the
board without the code.

⚠️ **`?store` is not a lock and nothing may ever be built on the
belief that it is.** Same file, same JavaScript, and `?store` is five
characters anybody could guess or read in the source. All the URL
decides is which half of the app draws.

⚠️ **The CODE, however, is now a real credential**, which it was
not when the paragraph above was first written. It used to decide
only whether a button appeared -- the database refused a stranger
regardless, so leaking it bought a shop-shaped screen with nothing
in it. Typing it now calls `claim_staff()`, which puts THIS session
into `staff`, so whoever has the code reads every customer's name,
phone and address.

That trade was made deliberately and on the owner's call. The
alternative on offer was an email sign-in plus a uuid pasted into a
database console, per device -- a developer's errand standing in for
a feature. What it costs is that **length is now the only defence
that survives**: bcrypt makes a guess slow, but six digits is a
million guesses and that is hours. See "Changing the code".

**`?store`, not `?shop`.** In this app "Shop" is the CUSTOMER's half
and "Store" is the staff half — the same trap that made the gate say
*Store code* rather than *shop code*. Naming the link after the wrong
one is how somebody hands the owner the customer link and then
wonders why he cannot see his orders.

This replaces an earlier rule that the role switch is always visible
"because this is a demo of three roles and hiding the switch is how a
demo fumbles". That was true of a demo and stopped being true the day
a customer was going to open it.

#### What it is, said plainly

It is a lock on a door, and it is worth having: it stops the thing
that actually happens, which is a customer tapping Store out of
curiosity and landing in the shop's own paperwork.

It is **not** a safe, and three things are true about that:

- Every line of this app is served to whoever opens it, so the
  mechanism is public by construction. What is not public is the code.
- A customer's own orders are readable from a developer console on
  their own device, gate or no gate. That has always been true and
  costs nothing: there is nothing of anybody else's on a customer's
  phone to reach.
- ⚠️ **The Supabase swap HAS happened**, and this section used to
  predict what it would change. Orders live in Postgres now, so the
  browser is no longer anywhere near the right place to decide who
  may read them -- and it does not. `ord_read` is
  `user_id = auth.uid() or is_staff()`, enforced per row by the
  server, and a session that is neither gets an empty result rather
  than a refusal.
- ⚠️ **An empty result is indistinguishable from a quiet
  morning**, which cost an evening: the board rendered "No orders yet
  today." over a shop full of orders, and sent us hunting a bug in
  the orders rather than in the session. It says which it is now --
  `notStaffHtml()` in shop.js, built on `session.isStaff()`, which
  had existed from the start and was called by nothing.

#### Why the code is not written in shop.json

`shop.json` is fetched by the page, so a code written in it plainly
would be a key left in the lock. What is published instead is
**PBKDF2-SHA256 of the code**, which runs one way only.

One derivation produces 64 bytes and both halves are used:

| | | |
|---|---|---|
| first 32 | `proof` | published. Verifies a typed code. |
| last 32 | `token` | **never published.** Kept on the device that unlocked. |

`seal` is SHA-256 of the token, and is what a later visit checks the
stored token against. That split is the whole reason there are two
halves: **if the unlock flag were a boolean, or anything derivable
from the published file, it could be forged by typing one line into a
console.** This way the only road to a valid token is the code.

600,000 iterations, which `tools/setpin.pl` writes into the file
rather than hardcoding, so raising it later is a re-run and nothing
else. Measured at ~600 ms per attempt in Chrome on this laptop, so
roughly 1-2 s on a cheap phone -- paid once per device, behind a
button that says *Checking...*.

⚠️ **Be honest about what that count buys.** A six-digit code is
a million possibilities, and dedicated hardware running PBKDF2-SHA256
gets through a million guesses in minutes. No iteration count fixes
that for six digits. What it does buy is that the code cannot simply
be **read** out of the file, which is the thing that would otherwise
happen to every copy of this app the moment somebody opened developer
tools.

#### Changing the code

```bash
perl tools/setpin.pl <code>      # then commit and push
perl tools/setpin.pl --off       # remove the gate entirely
```

⚠️ **THE CODE LIVES IN TWO PLACES AND THEY MUST AGREE.**
`shop.json` decides whether the gate opens; `shop_secret` in Postgres
decides whether the board has anything in it. Setting one without the
other gives a Store view that opens onto an empty board -- which is
the exact bug this mechanism was built to end, rebuilt by hand.
`setpin.pl` prints the matching SQL for that reason; run it in
Supabase -> SQL Editor. `db/store-code.sql` is the whole thing,
table and function included, and it REFUSES to run with its
placeholder still in place -- storing the hash of the literal word
CHANGE-ME looks exactly like success, and did.

Use a long code. Both halves accept 4-12 lowercase letters or digits;
ten random ones are not brute-forceable and six digits are.

**The code is nowhere in this repository and cannot be recovered from
it** -- not from `shop.json`, not from here. If it is forgotten, set a
new one. It is told to the shopkeeper out of band, and writing it into
any file in this repo would undo the entire point, since the
repository is public.

⚠️ **The shopkeeper cannot change it himself.** It is a command
plus a push, the same shape as correcting a price. That is the
accepted limitation today; an in-app change would only ever be
per-device, which is worse than useless -- changed on his phone, still
the old one on his tablet.

`setpin.pl` refuses `000000`, `123456` and four others by name. A code
anybody would try first is not a code.

#### The three edges, each tested

- **Five wrong tries cost a minute**, and the button says how long is
  left. Not about compute -- the derivation is already slow -- but
  about somebody standing at the counter with the shopkeeper's phone
  working through 1234, 0000, 1111. A correct code during the cool-off
  is still refused. Typing during it does not wipe the message saying
  why, which it did at first: a dead button with nothing beside it
  reads as a bug.
- **No `crypto.subtle`, no gate opening.** It exists only in a secure
  context -- https, or localhost -- and over plain http on a LAN it is
  simply undefined. The gate then shows no code box at all, says why,
  and **stays shut**. Failing open there would be a lock that a wrong
  URL removes; failing shut with no explanation would be "the code box
  does nothing", which is unanswerable.
- **No code set at all is a supported configuration.** With no `staff`
  block the app is exactly what it was: no padlock, no gate, straight
  into the Store view. `data.pl` says so in a loud note rather than
  failing, because a check that fails on a supported setup is a check
  people learn to ignore.

#### Smaller decisions that each took seeing it

- **The gate is an overlay, not a `<section id="s-*">`.** A screen
  would join the back stack, and a lock you can reach by pressing Back
  is not a lock. The back gesture instead closes the gate and leaves
  the screen underneath exactly where it was.
- **The padlock beside "Store" is driven by `data-locked` on the body,
  not by which role is showing.** A device that has been through the
  gate and switched back to the storefront is still through it, and a
  padlock back on the button would say otherwise.
- **Six digits auto-submits.** There is nothing left to decide at the
  sixth, and a button press there is ceremony on something typed once
  in a device's life.
- **"Store code", not "Shop code".** *Shop* in this app is the
  customer's half, so "shop code" named the opposite of what it is.
- **Locking from Settings drops the role too.** Leaving the board on
  screen after locking it would make the button a lie. The control is
  drawn only in the Store view on a device that is through the gate --
  on the storefront it would advertise a door to the people it is shut
  against.
- **One derivation proves two implementations agree.** `setpin.pl` is
  Perl and `lock.js` is WebCrypto, and no Perl check can compare them.
  Typing the code into a browser is what proves it, and that is the
  one thing here that has to be done by hand.

## Delivery is free, everywhere

No fee, no distance threshold, no delivery area. The app says so out
loud (`freeAlways` in `shop.json`) rather than quietly charging
nothing, and `data.pl` fails if the words and the data stop agreeing.

**There are no delivery zones.** The customer types an address in free
text — flat, building, area. Anyone, anywhere, can order. What used to
gate this is in `parked/`.

## "Use my location"

**The button is back, and the thing that makes it safe is that it asks
first whether it can work.**

It existed once and was deleted, because geolocation is blocked inside
an embedded page unless the host allows it, this app is shown as one,
and a control that reliably fails is worse than no control. That
reasoning was right; the mistake was drawing the button unconditionally
and finding out afterwards. `geo.js` now asks
`document.permissionsPolicy.allowsFeature('geolocation')` -- which
answers for the frame the code is actually running in -- and the button
is **rendered only where the answer is yes**. Where it is no, nothing
is drawn and the form is the form it always was. The old failure mode
is now a button that was never created.

It fills the **street**, and a landmark when OSM has a named building
("Shiv Temple Borivali", which is more use to a driver than a road
name). Flat, building, name and phone are on no map and stay the
customer's to type, which is what the hint under the button says before
it is pressed. It sits **above** the fields because that is the order
it is used in; underneath, it reads as an afterthought for a form you
have already filled.

Two rules it obeys:

- **It only ever fills an EMPTY field.** Someone who has typed their
  street should not have it overwritten by a geocoder's idea of it.
- ⚠️ **It never fills the suburb, and that is measured rather than
  cautious.** Reverse-geocoding the shop's own coordinates returns
  *"Dahisar West"* for an address that is plainly Borivali West,
  because S.V. Road is the ward boundary and the geocoder snaps to it.
  A wrong locality on a delivery address is worse than an empty one, so
  a point with no street reports finding nothing rather than offering
  the suburb as a consolation.

### Not Nominatim, for a reason that cost a measurement

Nominatim is the obvious geocoder and **cannot be called from a
browser**: it sends no `Access-Control-Allow-Origin`, so the request is
blocked before it is made. Its reverse endpoint answers 200 to curl and
the header is simply absent -- which is exactly the kind of thing that
looks like working code until it runs in a page.

**Photon** (`photon.komoot.io`) is the same OpenStreetMap data, allows
CORS, needs no key and costs nothing. It was chosen over BigDataCloud
on the only thing that matters for filling a form: for the shop's
coordinates Photon returns *"Devidas Road ... 400103"* and BigDataCloud
returns *"Mumbai"* with an empty postcode.

Both are free, keyless and therefore rate-limited and unsupported. One
lookup per button press is well inside acceptable use; an autocomplete
firing per keystroke would not be, which is why this is a button and
not a typeahead. The URL is one line in `config.js`, so moving to a
paid geocoder at launch is that line. Settings carries the attribution,
since the data is ODbL.

`order.customer.ll` carries real coordinates again when the customer
offered them, and stays null when they did not. The Store screens
already handled both.


## Everything sells at MRP, and a coupon is the only discount

`price` equals `mrp` on every row, because that is how the shop
prices. So no per-product saving is shown — no strikethrough, no
"₹X off" badge — and `data.pl` still refuses a price above its MRP.

The only discount is a **coupon code**, in `shop.json`:

```json
"coupons": { "percent": 5, "codes": ["1626", "2048", "3714", "4290", "5361"] }
```

Four digits, because they get read out over a counter and typed on a
phone. Matched **case-insensitively with spaces stripped** — `" 16 26 "`
works — since nobody types a code carefully. Adding or withdrawing a
code is an edit here and nothing else; `percent: 0` switches coupons
off entirely.

Two rules that are easy to get wrong:

- **The discount is rounded once, on the basket total**, not per line.
  Rounding per line lets the sum of the parts disagree with the total.
- **A minimum, if ever set, is measured on the goods BEFORE the
  coupon.** It asks whether the trip is worth making, and a discount
  code should not be able to drop a basket under a bar it had already
  cleared.

A coupon is **re-matched at placement**, not trusted from the cart, so
a code withdrawn between adding it and ordering does not still apply.

## What goes with what — the two basket strips

Two horizontal strips, and they are **separate mechanisms that are
allowed to overlap**. One is about the basket, the other about the
person; a product can honestly belong in both.

**They sit between the item list and the coupon field**, not at the
foot of the screen. They were at the foot and it was wrong: they are
the last chance to ADD something, and everything below them — coupon,
total, checkout — is settling up. Under the total, adding from a strip
left a figure the customer had already read sitting stale further up
the page and pushed the button they were reaching for off the bottom.
Above it, the redraw holds the scroll position and the total changes in
view, which is the whole point.

**"Goes well with your order"** — `catalog.suggest()`, scored over
`data/pairs.json`, which is a flat file of ordinary shop knowledge:

```json
"p-tatatea500": ["p-sugar1", "p-amultaaza500", "p-parleg250", "p-chaimasala50"],
"byCategory":   { "snacks": ["drinks", "tea"], "tea": ["dairy", "snacks"] }
```

Two layers, because one alone fails in a different way each time. Named
pairs score **3** and carry the real knowledge — tea wants sugar,
specifically. Category rules score **1** and exist so that a product
nobody has written a pair for still suggests *something* sane. Scores
**sum across the basket**, which is the whole trick: milk and tea
together both push sugar, so sugar comes first.

Three rules it obeys, each of which is a way the strip would otherwise
look stupid:

- **Never suggest what is already in the basket** — checked on every
  bump, not filtered afterwards.
- **Never suggest what is out of stock.** A suggestion that cannot be
  bought is worse than no suggestion.
- **One of each idea, keyed on the product name and deliberately not
  the brand.** Eight slots, eight different thoughts. Bisleri 1L and 2L
  are one thought; so are the Vim and Exo dishwash bars, which a basket
  of soap was offering side by side. Exactly four names in this
  catalogue are shared that way — dishwash bar, mango drink, drinking
  water, cola — and in every one of them the second is a wasted slot.

Ties break on **price, cheapest first**. A tie means the data has no
opinion, and in that case the cheaper suggestion is the easier yes.

**"Buy it again"** — `orders.againItems()`, which walks this device's
past orders **newest first** and takes each product once. No scoring and
no pairs file: it is a history, and the most recent thing is the most
likely thing. It hides what is already in the basket for the same reason
the other strip does, and skips anything out of stock.

The strip is simply absent when it would be empty, which is every new
device — a heading over nothing reads as a bug.

**The same strip is the home screen's "Buy it again".** It used to be
one card there reading *M-0007 - 4 - Rs 693*. That is the shop's own
filing reference: the customer never knew the number, cannot tell what
is inside it, and has no reason to care. **What they recognise is the
packet.**

Reordering a whole past order survives, moved to the screen for **that
order**, where the items are listed directly above the button, so
"Order this again" refers to something you can see. That is where it
belonged all along; on the home screen it was a feature wearing a
database key as its label.

**All 117 products have an entry** — 320 pairings — and `data.pl`
**fails** if one does not. Without an entry a basket of that product
alone falls through to its category rule, which offers the cheapest
things from a neighbouring aisle: technically a suggestion, visibly a
shrug.

`data.pl` also validates every pairing against the catalogue — ids and
categories must exist, nothing may suggest itself. **A pairing naming a
product the shop dropped is invisible at runtime**: it is skipped
silently, so the feature quietly gets weaker and looks like a bad idea
rather than stale data.

And it reports the other direction, which is a note and not a failure:
**16 products nothing ever suggests**, reachable only by browsing. Every
one is a brand variant — the second atta, the third tea, the second
detergent — and that is right. A strip offering a second brand of tea to
someone who just bought tea is noise, and the name-based dedupe would
drop it anyway. The number is worth watching, because a *non*-variant
appearing in that list is a real gap.

## Paying — UPI, and no payment gateway

The app does **not** take money. After placing an order the customer
chooses **Pay by UPI** or **Cash on delivery**. Choosing UPI renders a
QR carrying the shop's id, the exact amount and the order code; they
scan it with whatever UPI app they already use and money goes from
their bank to the shop's.

⚠️ **There is no `upi://` deep-link button, and that is deliberate.**
It was there and it was removed: the link does nothing at all on a
desktop, and on a phone it hands off to an app that may not be
installed — so it looked broken more often than it worked. A QR works
from any device with a camera and needs no handoff.

Because nothing here can confirm a payment, the UPI panel tells the
customer to **show the payment screenshot to the delivery associate**.
That is the receipt, and it is the only one that exists.

What that buys: no gateway, no per-transaction fee, no settlement
delay, no KYC beyond what the shop already has, and no card details
anywhere near this code.

⚠️ **What it cannot do is know whether the payment happened.** UPI
sends no callback to a static page. So `paid` is a note somebody
makes, not a fact the app observed.

⚠️ **So the customer's "I have paid" is recorded as a CLAIM and
not as payment.** It writes `pay_method = 'upi_said'` and leaves
`paid` alone, so the money stays in the shop's "to collect" and the
order wears a "Paid by UPI · to be verified" flag until somebody has
looked at the screenshot. It used to set `paid = true`, which dropped the figure
the shop collects on the customer's word alone -- of every error
available here, the one that costs the shop actual money.

No migration for that either: `mark_method()` already existed, is
already granted to `authenticated`, and cannot touch `paid` -- so the
claim survives a reload without widening what a customer may do to
their own order.

Only the SHOP marks `paid`: from the picking list, or in the one tap
that closes a delivery, since at a doorstep handing the bag over and
being paid for it are one moment. That tap is **"Delivered and
payment received / verified"**, and `settle()` in shop.js runs it ONLY on the
move to `delivered` -- it once ran after every advance, so accepting
an order marked it paid. The shop's own UPI app stays the source of
truth.
Anything else needs a server and a gateway; see "Why not a real
gateway" below.

**It currently carries a DEMO id — `demo.not.real@example`.** The
owner asked for a working-looking QR in the demo, and this is how to
have one safely: `example` is not a real UPI handle, so no payment app
can resolve the payee and money physically cannot move. The pay block
also wears an amber strip saying so, in all three languages, because
somebody looking at a QR should not have to know any of that to feel
safe about it.

`data.pl` enforces the safe half: with `upi.demo` true it FAILS if the
handle after the @ is a real one (ybl, okaxis, paytm, ...), since a
demo id on a live handle could send a customer's money to whoever owns
it. Proved by setting `demo.not.real@ybl` and watching it fail.

With `upi.vpa` empty instead, the app shows a plain notice and no QR
at all. **To go live:** put the real id in, set `demo` to false, and
the strip disappears by itself.

The QR is **black on white in both themes**, via `--qr-ink` and
`--qr-paper` — a token pair defined identically in every palette. A QR
themed to the page loses the contrast a scanner needs, and declaring
that as a non-varying token is the honest way to say "not themed"
rather than hardcoding white and arguing with `tokens.pl`.

### Three states for money, and one function that names them

`payState()` in domain.js is the only thing that decides what an
order's money is. The board, the window screen, the order rows, the
picking list, the customer's track screen and both backends'
`counts()` all ask it, rather than each reading `paid` and
`pay_method` for itself and slowly disagreeing.

| | means | the shop sees |
|---|---|---|
| `owed` | nothing paid, nothing claimed | *To pay* |
| `said` | the customer says they paid by UPI; nobody has looked | *Paid by UPI, to be verified on delivery*, in amber |
| `verified` | the shop has seen the money, or been handed it | *Paid by UPI · verified*, or *Paid* for cash |

**"Paid" is never said about money nobody has checked.** The owner
asked for exactly this: a QR payment reads *paid by UPI, to be
verified*, never *already paid*, until somebody at the door has looked
at the screenshot. A `said` order stays inside "to collect", and the
board and the window screen add an amber line naming how much of that
is claimed (`saidTotal` in `counts()`).

⚠️ **One older shape is folded into `said` on purpose: `paid = true`
with no `paid_via`.** Only the shop's `setPaid()` writes `paid_via`.
The customer's own `mark_paid()` -- how "I have paid" worked before it
became a claim -- writes `paid` and `pay_method` and nothing else.
Rows like that are in the live database from before the change, and
reading them as verified would put money nobody has looked at under
"already paid". No migration: the rule reads the row as it is.

**Mark unpaid also withdraws the claim.** It sets `paid` false AND
moves `pay_method` from `upi_said` back to `upi`. Left alone, the
claim would put *paid by UPI, to be verified* straight back on an
order the shop has just called unpaid -- and the customer's own
screen offers the QR again, which is right: the shop looked and the
money was not there.

**UPI is named only where the customer was on the UPI path**
(`pay_method` `upi` or `upi_said`). An order whose customer never
chose a way to pay is still settled as `paid_via = 'upi'`, which is
what it has always defaulted to, but it reads *Paid* and its button
reads *Received*: the app does not know it was UPI and does not say
so. `payVia()` is the one rule for what gets WRITTEN -- cash for cash
on delivery, UPI otherwise -- so the delivered tap and the Verified
button cannot record different answers.

### Why not a real gateway

Asked and answered: it is not a day's work and it is architecturally
blocked.

- A gateway (Razorpay, Cashfree, PhonePe PG) needs a **server**. You
  cannot take payments from a static page safely: the amount has to be
  computed and signed somewhere the customer cannot edit, or anyone
  pays ₹1 for a ₹500 basket.
- It needs business registration, GST, a settlement account and KYC.
- It costs ~2% plus GST per transaction and settles T+1 or T+2.

So it waits behind the Supabase step, and for one kirana the UPI link
is not a poor substitute — it is cheaper, instant, and the shopkeeper
already knows how to read his own UPI app.

## Design

Warm paper, deep green `--leaf`, turmeric `--spice` for the run that is
about to close. **47 tokens, one palette.** No component
rule names a colour — `tokens.pl` enforces both halves of that.

- `--on-leaf` / `--on-spice` / `--on-sky` for text on a filled accent.
  **Never hardcode `#fff`** — these exist so a filled accent can be
  restyled in one place, and they are what a restored dark palette
  would redefine first.
- `--ink-dim` had to be measured and moved **twice**: 2.73 on `--sunk`
  in light and 3.57 in dark, both fails for 13px text. The pack
  monogram now uses `--ink-soft` instead, because it was the only
  dim-on-sunk pairing in the app.
- **`[hidden]{display:none !important}` is load-bearing.** Any rule
  giving an element a `display` beats the UA's `[hidden]`, and the back
  button sat on the home screen for exactly that reason.
- A card is for an object — one product, one order, one stop.
- `.wrap` bottom padding must clear the 54px fixed tab bar or the last
  button on every screen sits under it.
- The picking list is a **card list, never a `<table>`** — it is the one
  screen genuinely used on a phone while standing at a shelf.

### Two shapes for the same products

**Browsing is a grid of cards led by a big photograph. The cart is
rows.** `productList(list, grid)` picks between them and both read the
same catalogue.

The reason is what the customer is doing. On a category screen they
are looking for the packet they already know by sight, and a 64px
thumbnail in a vertical list makes them read brand names instead. In
the cart the question is what you have and what it costs -- the
pictures are only confirmation there, and a grid would push the total
and the button off the screen.

Three details that each took seeing it drawn:

- **No white backdrop on a card that is already white.** The
  photograph became an invisible region with a packet floating in it.
  Dropping it lets the tile's `--sunk` show through the letterboxing,
  which frames every shot in a soft grey well and makes a row of
  differently shaped packets look like one set. The cart's rows KEEP
  the backdrop: at 64px a grey edge reads as a smudge.
- **The glyph has to get out of the way.** It and the two-letter
  monogram were only ever hidden by that white backdrop, so removing
  it put "AA" back in the corner of the Aashirvaad packet it had been
  standing in for. `onload` now marks the tile as well as the image,
  and `.ptile.shot` hides what the photograph replaced.
- **`margin-top:auto` on the price row.** Cards in a row then agree on
  where the button is, however long their names run.

The Add control is a filled `--leaf-wash` with the accent's own ink
(7.53 light, 8.42 dark) rather than a quiet outline -- but still not a
solid green block, because twelve of those in a grid shout over the
products they are selling.

### The header is a filled band

The header used to be `--card`, so the app opened on three shades of
off-white and read as a document rather than a shop. One deep green
band across the top is most of the difference between "a web page" and
"an app", and it costs one declaration.

`--brand` is **the same green in both themes**, like `--qr-paper` and
`--shot-paper` and for the same reason: a shop sign does not change
colour at dusk, and this is the one surface carrying the shop's
identity. Only the text on it is themed, through `--on-brand` (8.50 on
the band) and `--on-brand-dim` (4.91, which 11px uppercase needs).
The role switch sits in `--brand-well`, because `--sunk` was built for
paper and vanishes on green.

`tokens.pl` caught the first attempt at that well, written as a literal
`rgba(0,0,0,.22)`. That is the check doing exactly its job.

The next-run banner carries the whole competitive argument, so it
stopped looking like one more bordered box: a wash that fades across
the card and a thick `--leaf` edge down the left. The search field is
fully rounded and 50px tall, because it is the first thing a hand goes
to and a square 44px input looked like one more form field among six.

**Categories get a glyph, not a colour.** Ten category colours would be
ten token pairs × two palettes plus an `-ink` each plus twenty new
contrast measurements.

## Pack shots

**106 of the 115 products carry a real photograph of the real packet.**
They are fetched by `tools/getimages.pl` and **shipped in `app/img/`**,
3.5 MB in all, not hotlinked.

Where they come from, and why not Google: Google Images is a search
index, not a source. It serves no stable embeddable URL, and every
brand pack shot on it belongs to that brand. Hotlinking a rival
grocery app's CDN is worse, and `bigbasket` and `cdn.grofers.com` both
answer **403** from this laptop anyway: an image that 403s in the shop
is a broken tile in front of a customer. These come instead from the
three **Open Facts** databases, which are crowd-photographed and
openly licensed (photographs CC-BY-SA, data ODbL):

| | |
|---|---|
| openfoodfacts.org | food, drink, tea, dairy, staples, masala |
| openbeautyfacts.org | soap, shampoo, toothpaste |
| openproductsfacts.org | detergent, cleaning, household |

Settings carries the credit, because that is a **condition** of using
them and not a courtesy.

The loose goods have no packet and no barcode, so no barcode database
holds a picture of them. Onion, potato, poha and the rest come from
**Wikimedia Commons** instead, through a hand-written search term each
(`%COMMONS` in the script): Commons rewards precision and punishes
vagueness, and a bare "onion" returns botanical plates.

### A wrong pack shot is worse than none

"Amul Butter" over a tub of Danish spread reads as a careless shop, so
every candidate is scored and weak ones are **rejected** rather than
guessed at. **Every brand word must appear** in the result, which is
the check that stops a search for Amul butter settling on anybody's
butter, plus at least one word of the product name; an `en:india` tag
is worth four points because the pack on a Borivali shelf is not the
export version. A different VARIANT of the right brand is accepted on
purpose: Colgate Triple Action standing in for Colgate Strong Teeth is
what a customer reads as "Colgate", and the shelf has both.

Two things this got wrong first time, both worth keeping:

- **Searching only the full phrase left the whole cleaning aisle on
  glyphs.** These are keyword searches over a sparse index: "Surf
  Excel Easy Wash Detergent Powder" returns nothing on
  openproductsfacts, while "Surf Excel" returns fourteen rows. The
  script now tries three queries, narrowest first, and **the scoring
  is unchanged** so a looser query never means a looser match. It only
  means the right row gets seen.
- **A busy moment at Open Food Facts returns an HTML "page temporarily
  unavailable", not a status code**, so one attempt reads as "this
  product does not exist" when it means "ask again in a second". That
  silently cost a perfectly good Lay's pack shot. Four tries now, and
  anything that is not JSON does not count as an answer.

### Categories wear one of their own products

The ten category cards are photographs too, each showing a `hero`
product named in `categories.json` -- Aashirvaad over "Atta, Rice &
Dal", Parle-G over "Snacks & Biscuits", a tomato over "Fruit &
Vegetables" for the colour, since everything around it is a packet.

Chosen for **recognition**, not for price or stock: the pack a
Borivali household would name if you asked them what that shelf is.
It is data rather than code so the shopkeeper can change which, and
the backend drops a hero that has no photograph and falls back to
another product from the same aisle -- a hero pointing at a glyph
product would put an empty white card at the top of the shop.

`data.pl` fails if a hero names a product from a **different**
category. That is the mistake that looks deliberate: a tin of ghee
over "Soap & Personal Care" reads as a shop that does not know its own
shelves.

### The glyph is still there, underneath

Every tile still renders the drawn glyph and the monogram, with the
photograph laid **over** them. A 404, a slow connection, or a product
with no match degrades to the drawing instead of a hole, with no
`onerror` bookkeeping and no class to get out of step.

⚠️ **The white backdrop belongs to a LOADED photograph**, which took a
bug to learn. `.pshot` painted `--shot-paper` from the moment the tag
existed, so every not-yet-arrived tile was a blank white box covering
its own glyph. It reads as broken rather than loading. The image is
now transparent and `opacity:0` until its own `onload` adds `.on`.

⚠️ **There is deliberately no `loading="lazy"`.** It is the obvious
thing to put on a list of thumbnails, and it cost an afternoon. Lazy
loading is driven by intersection, and in an **embedded** page, which
is exactly how this app is shown, it can simply never fire: every tile
stays a glyph and the photographs appear nowhere at all. That was
reproduced here, not guessed -- the same screen rendered all twelve
photographs with the attribute removed and none with it present.

What it would have saved is bounded anyway. A category is about twelve
products, roughly 300 KB, and the home screen shows categories rather
than products, so there is no screen that pulls the whole 3.5 MB. An
image nobody ever sees is worse than one fetched slightly early.

The tile went **52px to 64px** at the same time. A line glyph reads
fine small because it is three strokes; a photograph of a packet has a
brand band, a flavour name and a picture on it, and at 52px none of
those survive.

`data.pl` checks both directions: an `images.json` entry whose file was
never written, and a file nothing points at. The second is not
hypothetical. The first fetch was killed halfway and left **8 orphan
files** that would have shipped and never shown.

⚠️ **The photographs are crowd-contributed and the quality varies.**
Most are clean pack shots. A few are poor: the Lizol one is a cropped
half-bottle with Bengali text on it. Re-fetching a single product is
`perl tools/getimages.pl p-lizol975`, and the matched barcode is kept
in `app/data/images.json` so a wrong match can be traced.

**9 products keep their drawn glyph** for want of a confident match:
Thums Up, Coca-Cola, Tata Sampann Chai Masala, coriander, Colin, Exo,
Good Knight, and the two Origami paper lines.

**No emoji, then or now.** Emoji are filled, OS-drawn glyphs;
several of these groceries have none at all (atta, agarbatti,
detergent), and they would collide with the stroked icon language
everywhere else. Under every photograph the tile still carries a
stroked pack-shape glyph plus a
two-letter brand monogram — "AM" on a carton reads as Amul instantly.

The biscuit glyph was a circle with five scattered dots and read
unmistakably as a **sad face** at 26px. Symmetry is what stops a pattern
of dots turning into a face.

---

## A pure veg shop

Milan's Super Shoppe sells **no eggs, no meat, no fish**. The one
non-vegetarian row the catalogue ever had — `p-eggs12`, "Eggs, tray of
12" — is gone, along with its photograph, its search tags in three
languages, its seven entries in `pairs.json`, its line in the demo
order, and the `egg` glyph, which had nothing left to stand for.

The dairy aisle was called **"Milk, Bread & Eggs"**. It is **"Milk,
Bread & Paneer"** now, in all three languages. Renaming it mattered as
much as removing the product: a category heading is read by everyone
who opens the shop, including the people the shop is for.

⚠️ **`data.pl` enforces this, and that is the point.** A catalogue is
edited by hand, by whoever is to hand, and the day eggs come back they
will arrive as one ordinary-looking row among 114. The check reads
every product's name in all three languages and every search tag, and
fails on `egg`, `chicken`, `mutton`, `fish`, `prawn`, `bacon`, `meat`,
and on `अंड`, `चिकन`, `मांस`.

### The mark in the header

**"Pure Veg", beside the locality, on every screen in both roles** —
the FSSAI mark (a filled green circle inside a green square) and the
words, translated.

- **It is drawn inline in `index.html`, NOT in `icons.js`.** That set
  is stroked line art — `fill:none; stroke:currentColor` — and this
  mark's meaning depends on the circle being **solid**. It is a
  regulated symbol, not an icon, and it would be wrong if it
  inherited that language.
- **It sits on a light chip.** The header band is green, and a green
  mark on a green band is not a mark. A shop's veg sticker is stuck
  *on* the door, not painted into it.
- `--veg-ink` / `--veg-paper` are **fixed, not themed** — the same
  rule as `--qr-ink` / `--qr-paper`. Green on light is what the mark
  *means*; a dark version of it is not a darker mark, it is a wrong
  one. `parked/dark-palette.css` is told so in writing.
- Measured **5.08** on the chip, which 10px needs.
- ⚠️ **`.brand small` had to become a flex row.** `.brand` truncates
  with an ellipsis, and with the mark inside one run of text the
  *mark* was what got cut off on a narrow screen — precisely
  backwards. The locality takes the squeeze now; the mark never does.
  Checked at 375px in all three languages and with the back button
  showing, which is the narrowest the brand ever gets.

**Word boundaries are load-bearing**: `\begg` matches "eggs" and does
not match **Deggi Mirch**, which is a chilli powder and has to stay.
Proved by breaking it three ways — an English name, a Devanagari name
and a search tag — and by checking that a name containing "Deggi"
still passes.

## One palette

**Dark mode is parked**, on the owner's call — *"for now only keep the
light mode, the dark mode is not looking too good"*. It is in
`parked/dark-palette.css` with everything already measured written
down, so putting it back is a paste and not a re-derivation.

`:root` keeps `color-scheme:light`, which is doing real work rather
than stating the obvious: without it a phone set to dark renders the
form controls, scrollbars and autofill in dark against a light page,
which looks like a bug rather than a preference. **Verified with the
OS set to dark**: `--paper` resolves `#F7F5F0` and `color-scheme` is
`light`.

⚠️ **`tokens.pl` now refuses to run if a dark `:root` block comes
back**, naming the parked file. Three checks went with the palette —
light/dark colour parity, no dark-only tokens, and the two dark blocks
being byte-identical — and a second palette without them ships holes
that are invisible from the light one: a token defined in light and
forgotten in dark renders as whatever it inherits, which is usually
almost right.

## Buy 2 get 1 free

Six small snack packs. **Every THIRD unit of the same product is
free** — 2 cost 2, 3 cost 2, 6 cost 4, 7 cost 5. Integer division, so
it can never hand out part of a packet.

The list lives in `shop.json` beside the coupons, because it is the
shopkeeper's to change: add an id, remove one, or empty the list to
switch the offer off. The offer has to sit on something a basket
naturally holds three of, or it is decoration — which is why it is on
the ₹20 chip packets and not on a ₹345 tin of ghee.

⚠️ **Order of operations: the free unit is priced out BEFORE the
coupon.** So the 5% discounts what is actually owed, and the two never
multiply. `money.pl` asserts exactly that case: three packets owe ₹50,
and the coupon takes 3 of that 50 rather than of the 75 they would
have cost.

`money.pl` checks the arithmetic against a **written table** —
1,2,3,4,5,6,7,9,12 and what each should cost — not against a second
copy of the formula, because a mirror that agrees with the
implementation proves nothing. Proved by breaking it two ways (every
second unit free; an off-by-one on the divisor) and by checking the
half that silently *over*-discounts: a product not on the offer,
bought nine at a time, must never get one free.

The two implementations agreeing is the one thing no script here can
check — same shape as `setpin.pl` versus `lock.js` — so it was
verified in the browser: 1,2,3,4,6,7,9 of Lay's all charge the right
number of packets.

⚠️ **`items` is NET of the offer**, so the cart's Items line prints
`items + offerOff`. It printed the net figure once, above a `-₹45`
row, and the column stopped adding up: 115, minus 45, total 115. A
person checking their own bill has to be able to do the subtraction.

The badge sits **bottom right of the photograph** — where it costs
least, since a pack shot carries its brand band across the top and
that is the part anyone reads at tile size. The home rail shows **in
stock only**: an offer on something that cannot be bought is a promise
the shelf cannot keep.

## The festive shelf

A maroon-and-gold band and a rail of nine things, between two dates in
`shop.json`.

⚠️ **It takes itself down.** `from` and `to` are IST dates, inclusive;
outside them neither the band nor the rail exists. That is the only
reason a seasonal banner is safe to ship — nobody has to remember to
remove it. Proved by moving the window to last year and watching both
vanish while the rest of the home screen carried on.

⚠️ **The shopkeeper sets the dates; the app does not compute them.**
The festival calendar is lunar, and an app that guessed would
eventually put a greeting on the wrong fortnight — worse than no
greeting, because it is the shop appearing not to know its own year.

**An `id` with no wording draws nothing.** `id` picks the greeting out
of `i18n.js`; set it to a festival nobody has written strings for and
the band is skipped entirely rather than rendering `undefined` over a
row of sweets. Proved by setting it to `pongal`.

`festivalOn()` is pure and sits in `domain.js` with every other date
rule. It compares `YYYY-MM-DD` as **strings**, which is deliberate:
that format sorts in calendar order, which is the one thing it exists
for, and it keeps the function free of a clock. The caller passes
today from `istDate()`, so there is still exactly one place in this
app that reads the time.

Three products had to exist first — a Diwali shelf made only of what
the shop already stocked would have been incense, candles and a bar of
Dairy Milk. **Soan Papdi, Kaju Katli and Mixed Dry Fruits**, with
photographs.

`--fest` / `--fest-ink` are **fixed, not themed**, like the veg mark:
a season is not a surface. Measured **9.19**.

## The home screen is images

**Three across, photograph first, name underneath, no card.**

It was two across with a 56px thumbnail beside the words and a border
round the pair, which spent most of each tile on frame and whitespace
and left the photograph as the smallest thing in it. An aisle is
recognised by the packet on its shelf, not by reading ten labels —
that is the whole reason every grocery app on a phone looks like this.
The tinted square **is** the tile, so the eye lands on the photograph
rather than on a box.

⚠️ **Enlarging a tile exposes its photograph**, which cost three
heroes. At 56px nobody could tell; at 109px the dairy aisle was a
blurry blue bag, Soap & Personal Care was a Colgate box on floral
upholstery, and Oil & Masala was a washed-out tin of ghee. They are
**Amul Butter, Dove and Fortune** now — picked by rendering every
photographed product in those three aisles side by side and choosing
with eyes, not by scoring.

## Four languages

**English, हिंदी, ગુજરાતી, मराठी** — in that order, on every screen.

The order is the shop's, not the alphabet's: Borivali West speaks all
three, and whoever sits last on the row is the one who has to look
hardest. 294 keys each, and `i18n.pl` fails if any block is missing
one.

**Everything is translated** — the shop's name and address, eleven
aisle names, and all 117 product names.

**Brands stay in Latin.** `pname()` prints the brand and then the
translated name, so it reads "Haldiram's સોન પાપડી". That is how a
packet is read in a Borivali shop and how every grocery app in India
shows one; transliterating Haldiram into three scripts would make it
harder to recognise, not easier.

Product names were briefly left falling back to English, with a
second shorter language list in `data.pl` to let them lag. Both are
gone. **A list of exemptions is a list somebody forgets to shorten.**

`catalog.search()` reads `p.name[lang]`, so the translations make
search work in each language for free: લોટ finds both attas, દૂધ
finds the milks, ડુંગળી finds the onion.

⚠️ **Gujarati is not Devanagari.** It is a different Unicode block
(U+0A80–U+0AFF), and the mojibake check hardcoded U+0900–U+097F. Left
alone it would have called every correct Gujarati string with an em
dash in it double-encoded — and a check that cries wolf is worse than
no check. Each language is now tested against **its own** script.

### The double-encode bug, twice more

Adding a language is exactly when it happens, and it happened twice in
one sitting.

A script reads a JSON file with `->utf8->decode` (bytes to
characters), assigns a literal that is still **bytes**, and writes with
`->utf8->encode`. The text goes through UTF-8 twice. The shop's own
name shipped as `àª®àª¿àª²àª¨`, and three product names had been
sitting mangled since the Diwali sweets were added.

Two things came out of it:

- **`decode_utf8` the literal before assigning it**, so the value is in
  the same alphabet as everything else in the structure before
  JSON::PP encodes the lot once. Or edit the file as raw text and
  never decode at all — which is what the i18n.js rule already says.
- **`data.pl` now checks shop.json, categories.json and catalog.json
  for it.** `i18n.pl` has guarded `i18n.js` since the day it ate 28
  lines of Marathi; the data files were never guarded, and that is
  precisely where it landed.

⚠️ **That check must DECODE before it judges.** `data.pl` reads its
JSON as bytes, and every byte of UTF-8 Devanagari sits in 0x80–0xFF —
so testing the raw string reports "Latin-1 present, Devanagari absent"
about perfectly good text, every time. The first version of this check
failed all 273 strings, which is the same as failing none.

## Cross-tab sync — the demo

Two windows side by side, customer left, Store right: place an order and
the board ticks with no server and no refresh.

The `storage` event fires in every **other** tab of the origin and
deliberately not in the one that wrote, so a single path cannot serve
both — the writer notifies itself directly. Writes bump a revision key
with a random tail, so two writes in the same millisecond still differ
and an identical value still counts as a change.

**Verified**: a write in one browsing context fires the subscriber in
another exactly once per topic, with no double-fire.

⚠️ **Known limit, written down rather than hoped away.** Two tabs
writing the same collection in the same instant can clobber each other,
because this stores whole arrays. `commit()` re-reads immediately before
writing, which narrows the window to microseconds but does not close it.
Row-level writes are precisely what Supabase gives for free, and this is
half the argument for making the swap.

---

## The Supabase swap

`store.js` is nine lines. Changing one import is the whole swap:

```js
import * as backend from './backend-local.js';
// import * as backend from './backend-supabase.js';   // <-- the swap
```

It works because both backends obey four rules — **every method is
`async`** even when answered from memory; **returns are deep-cloned**;
**ids are minted by the backend**; and **`live.subscribe` returns an
unsubscribe function**. A fifth, quieter one: `backend-local.js` imports
nothing secret, so the app runs with no credentials file at all.

**`backend-supabase.js` is written now**, against the schema in
`db/schema.sql`. It was deliberately NOT written for a long time, on
the grounds that several hundred lines of untested code against a
schema that does not exist is speculation rather than preparation.
That was right, and is why the seam held when the schema finally
existed.

⚠️ **The swap is no longer a commented import line.** `store.js`
chooses on whether `config.js` names a project, so an app with no
credentials still runs entirely in one browser -- which is what keeps
it demoable, and what lets a change be tested without writing rows
into the shop's real database. `shared()` reports which, and the UI
uses it rather than promising things one browser cannot do.

---

## Verification

```bash
perl tools/check.pl
```

Six checks, and they exist because they catch what clicking cannot — a
wrong value that still renders, and time-dependent rules you would
otherwise have to sit and wait for.

| script | catches |
|---|---|
| `balance.pl` | unbalanced brackets and strings. **Found the real one**: a `mount(` that was never closed. Neutralises regex literals, or `/[&<>"]/g` pairs its quote with the next string. |
| `i18n.pl` | en/hi/gu/mr key parity, **duplicate keys** (they overwrite silently and counting does not catch it), placeholder parity, and a **missing trailing comma** -- a syntax error that leaves every brace and quote balanced, so balance.pl cannot see it, and the whole app then fails to parse. It has happened twice; the check is proved by removing one and watching it fail., and **double-encoded Devanagari** -- see below. |
| `data.pl` | ids, categories, whole rupees, `price <= mrp`, all three names present, the delivery windows not overlapping, a demo UPI id that cannot resolve, every pairing naming a product that still exists, every product having a pairing of its own, and the shape of the Store code -- including a **loud failure if the code itself ever gets written into `shop.json`**, which is served to every visitor |
| `slots.pl` | the run state machine across a whole day, **including 00:15 IST**; also greps for `toISOString` outside `domain.js` |
| `tokens.pl` | every `var(--x)` is defined; no literal colour in a component rule; and it REFUSES TO RUN if a dark `:root` block reappears, because the checks that guarded a second palette were parked with it |
| `money.pl` | 500 random baskets; the minimum-order-on-items case against a synthetic minimum, since the shop now has none; and 200 coupon baskets for whole-rupee, once-on-the-total rounding |

### The bug that every other check passed through

A script edited `i18n.js`, decoded it to characters, spliced in a byte
string, and encoded the whole file again. The Devanagari went through
UTF-8 twice and landed as runs of Latin-1 letters -- `माझं` as
`Ã Â¤Â®Ã Â¤Â¾Ã Â¤Â`. **28 lines of Marathi and Hindi were silently
turned to rubbish.**

Nothing caught it. The file still parsed, the keys still matched, the
app still rendered, `i18n.pl` reported all three languages agreeing --
and the one person who could have read the difference was not in the
room. That is the whole danger of a language nobody on the project
speaks: there is no accidental review.

Two things came out of it:

- **`i18n.pl` now fails on it.** A Marathi or Hindi value holding
  U+00C0..U+00FF and no Devanagari at all is double-encoded; real
  Devanagari never decodes to those. Proved by re-breaking one string
  and watching the check go red -- the first attempt at that proof
  broke the ENGLISH value, which is ASCII and round-trips unchanged,
  so it proved nothing and looked like a passing test.
- **Patch `i18n.js` in raw bytes.** No `decode`, no `encode`. The
  needles are ASCII and the values are already the UTF-8 bytes they
  should be, so nothing needs converting and nothing can be converted
  twice. Where a block must be found per language, find the ASCII key
  three times in order -- en, hi, gu, mr -- rather than matching on
  translated text.


**Each one was proved by breaking the code and watching it fail**, not
by passing on a clean tree. `slots.pl` with a minute-only comparison
loses all of tomorrow's runs; `i18n.pl` catches a duplicate key, a
missing key and a dropped placeholder; `tokens.pl` catches a token
missing from dark, a dark-only token, and a hardcoded hex.

Everything else is checked in a browser, which this machine has.

### Still to check by hand

- **On a real phone**: that the map is usable with a thumb, and that
  `tel:` links dial.
- **`Intl` resolving IST with the OS clock set elsewhere.** Perl can
  test the rules; only a browser can test the conversion.
- ⚠️ **Nobody who speaks Marathi or Hindi has read any of the strings.**
  I wrote all 175 × 2. The phrasing most likely to be stiff is the
  slot-picker copy, which is where the whole pitch lands. Worth thirty
  minutes of review before a real customer sees it.

---

## Open, and owned by the user

- **The depot is a point ON Devidas Road, not the shop door** —
  `19.2382, 72.8513`, which Nominatim reverse-geocodes to
  *Devidas Road … 400103*, matching the written address on both street
  and postcode. Accurate to roughly 200–300 m, because OSM has no
  Devidas **Cross** Lane, no Prem Nagar and no Sagar Apartment. That is
  fine for leg times and route planning and not fine for anything
  anyone navigates to. Get the exact door from the owner if the driver
  ever needs it.

  Worth knowing how it got here: an earlier map pin put the shop at
  `19.2312, 72.8496`, which reverse-geocoded to Chandavarkar Lane in
  **400092** — 800 m south and the wrong postcode. The route was built
  and baked twice against that before the owner confirmed Devidas Lane.
  **Reverse-geocode any coordinate before building on it, and when it
  disagrees with the written address, ask rather than pick.**
- **Prices are illustrative, not scraped.** Realistic 2026 Mumbai MRPs,
  but a Borivali shopper will spot a wrong atta price instantly.

  Correcting them is a round trip, not a code change:

  ```bash
  perl tools/pricelist.pl > prices.txt   # hand this to the shopkeeper
  perl tools/setprice.pl prices.txt      # read his edits back
  perl tools/data.pl                     # confirm
  ```

  `setprice.pl` reads only `<id> <price>` from each line, so the file
  can be edited in place or a handful of lines pasted out of a message,
  and anything absent is left alone. **A price above the MRP raises the
  MRP to match** — the shop selling at MRP is normal, and the
  alternative is the app advertising a saving that does not exist,
  which is worse than showing no saving at all. Nine of the 115 already
  sit at MRP and correctly show no discount badge.
- ⚠️ **The UPI id is a DEMO one and takes no money.** `demo.not.real@example`
  cannot resolve, and the pay block says so in an amber strip. The flow
  is real -- correct link, correct amount, correct order code, QR
  renders black-on-white in both themes -- only the payee is not.
  **To go live:** put the shop's real id in `shop.json`, set
  `upi.demo` to false. `data.pl` refuses a demo flag on a real handle.
- **Demo seeding is OFF** (`demo: false` in shop.json), so the app
  starts genuinely blank. Settings has a two-tap **Clear all data**
  button, which is the only "log out" there is when everything lives
  in one browser -- and what makes demoing the same flow twice
  possible.
- **`paid` is a note, not an observation.** Nothing in this app can
  confirm a UPI payment. The shopkeeper's own UPI app is the source of
  truth, and the delivered tap and the *Verified* button are how that
  gets recorded here.
- **The three windows and the 25-order cap are guesses**, not
  measurements. Both are one number each in `runplan.json`.
