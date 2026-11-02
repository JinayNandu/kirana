# Showing it to Milan

Twenty minutes, one phone. Read this once beforehand; do not read it
to him.

The app is live at **https://jinaynandu.github.io/kirana/**

---

## Before he arrives — 5 minutes

**Put both links on his phone**, not yours. The first thing he does
should be tapping his own bookmark, not watching you type a URL.

| | |
|---|---|
| **Shop** | `jinaynandu.github.io/kirana/` |
| **Store** | `jinaynandu.github.io/kirana/?store` |

The Store code is **not written here and must never be.** This
repository is public, and a code committed to it is a key left in the
lock — including in the history, where deleting it later does not
help. You know it; tell Milan out loud.

Then, on the phone you will hand him:

1. Open the Shop link. **Settings → Clear all data** (it asks twice).
   The basket has test items in it and a saved address in somebody
   else's name.
2. Check it loads and the Diwali band is showing.
3. **Now** open the Store link, type the code, confirm the board
   opens. Leave that tab open — you will come back to it.
4. Open the Shop link in a **second tab**, and start there.

⚠️ **That order is not arbitrary.** Clearing data wipes all of this
phone's local storage, including the fact that the Store view has
been unlocked. Clear first and set up second, or you will be typing
the code again in front of him.

⚠️ **One phone, TWO TABS.** There is no Shop/Store button any more —
the two links are completely separate, which is the point of them.
Keep the Shop link in one tab and the Store link in another, and
move between them by switching tabs.

⚠️ **And one phone, not two.** The database shows the board only the
orders placed by that same device, until Milan's own user id is in
the `staff` table — and that cannot happen until he has signed in
once. Two devices would show him an empty board. See the end of this
file.

---

## 1. "This is your shop" — 2 minutes

Open the Shop link and hand him the phone. Say almost nothing. Let
him scroll.

What he should notice without being told:

- **His name across the top**, his locality, and the green **PURE VEG**
  mark beside it.
- **Free delivery on all orders** — and the next window, with
  *"goes out in about 8 hours"* rather than a countdown to a cut-off.
- **Happy Diwali**, with sweets, dry fruit, diyas and agarbatti.
- Ten aisles, each one a photograph of a packet he actually sells.

If he says nothing, ask: *"Does this look like your shop?"* That is
the only question that matters in the first two minutes.

## 2. Let him order — 4 minutes

**Do not demo this. Hand him the phone and let him do it.** A
shopkeeper who has placed one order understands the whole thing; a
shopkeeper who has watched ten screens understands none of it.

Steer him only this far:

1. **Tap "Buy 2, get 1 free" and add three Lay's.** Watch his face at
   the third tap — the tile says **1 free** and the basket line reads
   `3 × ₹20`, **₹40**, with ₹60 struck through.
2. **Cart.** The Offer line takes ₹20 off. Point out that 160 minus 45
   is 115 — the column adds up, which is what a customer checking
   their own bill wants to be able to do.
3. **Coupon `1626`** if he asks about discounts. 5% off.
4. **Choose a delivery time.** Three windows today, three tomorrow.
   *This is the pitch.* Say it plainly: **Blinkit cannot promise a
   window, and you can.**
5. **Address, then Place order.** Let him type his own address.

## 3. The counter — 4 minutes

Switch to the Store tab. If it has gone to sleep, reopen the Store
link and type the code.

His order is sitting there. Walk him through it in his own words:

- **The board** — money to collect today, what is still to pack.
- **Open the window** → his order → **the picking list**. This is the
  screen he will actually hold while walking his own shelves.
- **Close orders and start packing** → **Send out for delivery** →
  **Mark delivered.** Three taps, named for what to do next rather
  than for a status.
- **What to load** — every product across every order in that window,
  summed. Ask him whether that is how he would want it grouped.

## 4. What it costs — 1 minute

**Nothing.** No commission, no per-order fee, no monthly charge. The
hosting is free and the database is free at this size.

Blinkit and Zepto take **20–30% of every order**. That is the whole
argument, and it is worth saying once, slowly.

---

## Be honest about these, before he finds them

Say them yourself. Every one of them makes the rest more believable.

| | |
|---|---|
| **Prices are made up** | Realistic Mumbai MRPs, not his. He must correct them — it is one file, and there is a tool that prints a price list for him to mark up. |
| **The UPI id takes no money** | `demo.not.real@example` cannot resolve. The QR, the amount and the order code are all real; only the payee is not. His real id is a one-line change. |
| **The Marathi and Hindi have never been read by a speaker** | **Ask him to read them.** Switch to मराठी in front of him. This is the single most valuable thing he can give you in twenty minutes and it costs him nothing. |
| **The photographs are not his stock** | They are openly-licensed pack shots. 106 of 117 products have one; the rest are drawn. His own shelf, photographed on a phone against a sheet of white paper, would beat all of them. |
| **Sign-in is not proven yet** | The pill at the bottom right offers it. **Do not demo it** — the six-digit email has not been tested end to end. |

---

## Ask him these — this is the real reason for the meeting

The app is a prop. The answers are the product.

1. **Are these the right products?** What does he sell most that is
   missing? What is on this list that he does not stock?
2. **Are three windows right?** 11–12, 3–4, 7–8. Should it be two?
   Four? Different hours?
3. **An hour before each window to pack — is that enough?**
4. **Who actually delivers**, and on what?
5. **Is 25 orders in a window realistic**, or is it 5, or 50?
6. **Would he want a minimum order?** There is none right now.
7. **Which products should "buy 2 get 1" sit on?** Six snack packs is
   a guess.

Write the answers down in the room. Most of them are one number in
one file.

---

## After the demo

In rough order of what it buys you:

1. **His price corrections** — `perl tools/pricelist.pl > prices.txt`,
   hand him the file, read it back with `setprice.pl`.
2. **Change the Store code. This one is not optional.**

   Two reasons, and the second is the real one. The name on the shop
   sign is the first thing anybody would try — and worse, the code
   was written into a commit message and pushed, so it is sitting in
   this repository's public history and can simply be read. That is
   my mistake, not a design decision.

   It costs nothing today, because the orders table is empty and
   there is nothing behind the door. It costs a customer's name,
   phone and address the moment there is a real order. So this runs
   **before** the shop takes its first one, not "soon":

   ```bash
   perl tools/setpin.pl <6 digits>
   git add -A && git commit -m "new Store code" && git push
   ```

   Do not try to scrub the old one out of the history. It is pushed
   and public; forks and the API keep serving old objects, so a
   force-push buys a feeling rather than a fix. Rotating the code is
   what actually makes the leaked one worthless.
3. **Sign in once on his phone**, then put his user id from Supabase
   → Authentication → Users into the `staff` table:
   `insert into staff (user_id) values ('<uuid>');`
   Until that row exists his board only shows orders placed on his own
   phone — which is why this demo is on one device.
4. **His real UPI id** in `shop.json`, and `upi.demo` to false.
5. **Photographs of his own stock**, if he is willing.
