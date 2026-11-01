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
| **Store** | the counter — orders by window, picking lists, **what to load**, mark paid and delivered |

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
  i18n.js           T = {en, mr, hi}, 187 keys each
  domain.js         PURE -- IST clock, window derivation, status tables, money
  store.js          the facade; ONE import line is the Supabase swap
  backend-local.js  localStorage + cross-tab storage events
  customer.js shop.js settings.js
  pay.js            UPI link + QR. Takes no money -- see below.
  seed.js           demo orders, on a device that has never been used
  icons.js          20 pack glyphs + interface icons
  config.js         CDN pins -- technical plumbing ONLY
  data/
    shop.json         THE SHOPKEEPER'S FILE -- name, address, phone,
                      UPI id, what delivery costs
    catalog.json      115 products
    categories.json   10 categories
    pairs.json        what goes with what -- basket suggestions
    runplan.json      the three delivery windows
tools/
  serve.pl          static server, both loopback families
  pricelist.pl      prints the catalogue as an editable price list
  setprice.pl       reads that list back and applies the corrections
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

### Invalid status transitions throw

`ORDER_NEXT` and `RUN_NEXT` in `domain.js` are the only tables. A silent
no-op is a button that looks like it worked.

`failed` ("Nobody home") earns its place: whoever delivers *will* arrive and
find nobody in, and a board where that order sits in `out` forever is a
board nobody trusts by day three.

### A delivery window has three states, named for what to do next

`open` → `cutoff` → `out` → `done`, and the buttons say *Close orders
and start packing*, *Send out for delivery*, *Mark all delivered*.

That is a rewrite. They used to read *Taking orders*, *Pack now*,
*Loaded*, *On the road* — status names rather than instructions, and
the owner could not tell what they meant. The `loaded` state went with
the tempo view: **a state nobody acts on is a button nobody
understands.**

The board also stops shouting at empty windows. A window past its
cut-off with nothing in it says **No orders**, not *Closed · pack
these* — an instruction to do nothing is worse than silence.

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
one card there reading *K-0007 - 4 - Rs 693*. That is the shop's own
filing reference: the customer never knew the number, cannot tell what
is inside it, and has no reason to care. **What they recognise is the
packet.**

Reordering a whole past order survives, moved to the screen for **that
order**, where the items are listed directly above the button, so
"Order this again" refers to something you can see. That is where it
belonged all along; on the home screen it was a feature wearing a
database key as its label.

**All 115 products have an entry** — 316 pairings — and `data.pl`
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
makes, not a fact the app observed — the customer can tap "I have
paid", the shopkeeper can mark it from the picking list, the driver
can mark it as cash. The shop's own UPI app stays the source of truth.
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
about to close. **41 tokens, both palettes, same set.** No component
rule names a colour — `tokens.pl` enforces both halves of that.

- `--on-leaf` / `--on-spice` / `--on-sky` for text on a filled accent.
  **Never hardcode `#fff`** — the dark accents are light.
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
holds a picture of them. Onion, eggs, poha and the rest come from
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

**`backend-supabase.js` is deliberately not written.** Several hundred
lines of untested code against a schema that does not exist is
speculation, not preparation.

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
| `i18n.pl` | en/mr/hi key parity, **duplicate keys** (they overwrite silently and counting does not catch it), placeholder parity, and a **missing trailing comma** -- a syntax error that leaves every brace and quote balanced, so balance.pl cannot see it, and the whole app then fails to parse. It has happened twice; the check is proved by removing one and watching it fail., and **double-encoded Devanagari** -- see below. |
| `data.pl` | ids, categories, whole rupees, `price <= mrp`, all three names present, the delivery windows not overlapping, a demo UPI id that cannot resolve, every pairing naming a product that still exists, and every product having a pairing of its own |
| `slots.pl` | the run state machine across a whole day, **including 00:15 IST**; also greps for `toISOString` outside `domain.js` |
| `tokens.pl` | both palettes define the same colour set; no literal colour in a component rule |
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
  three times in order -- en, mr, hi -- rather than matching on the
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
  truth and the "mark paid" buttons are how that gets recorded here.
- **The three windows and the 25-order cap are guesses**, not
  measurements. Both are one number each in `runplan.json`.
