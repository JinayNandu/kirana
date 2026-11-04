// =====================================================================
//  customer.js -- the storefront.
//
//  Screens: shop, cat, find, cart, slot, addr, done, track, orders.
//
//  No delivery zones and no route. The shop delivers wherever the
//  customer is, every order is free to deliver, and everyone gets the
//  same one-hour window. What used to compute a per-street arrival
//  time is in parked/.
// =====================================================================

import { offerHtml, offerWire, who } from './account.js';
import {
  $, esc, mount, show, goBack, registerScreen, repaint, onLeave, toast,
  setCartCount, clearNav, h1, sub, empty,
} from './ui.js';
import { t, f, getLang } from './i18n.js';
import { icon } from './icons.js';
import { ready, catalog, cart, runs, orders, profile, places, live } from './store.js';
import { payBlock, drawQR, wirePay } from './pay.js';
import {
  rupees, packLabel, fmtTime, mins, fmtDay, istDate, istMins,
  minsToCutoff, minsToStart, fmtSoon, fmtAbout, windowOf, ORDER_TONE,
  freeUnits, ORDER_TRAIL, istClock, canEditOrder, matchCoupon,
  totals as calcTotals, payState,
} from './domain.js';

const S = { catId: null, q: '', runId: null, orderId: null, coupErr: false,
            addrId: null, editId: null };

// Brand plus name, with two exceptions. Loose goods carry brand
// "Shop", where "Shop Onion" would be daft; and some products ARE
// their brand, where the naive join gives "Parle Parle-G". The
// duplicate test runs against the ENGLISH name whatever language is
// showing, because the brand is Latin and the name may not be.
export function pname(p){
  const n = p.name[getLang()] || p.name.en;
  if (!p.brand || p.brand === 'Shop') return n;
  const dup = p.name.en.toLowerCase().indexOf(p.brand.toLowerCase()) === 0;
  return dup ? n : p.brand + ' ' + n;
}
const cname = (c) => c.name[getLang()] || c.name.en;

// Two-letter monogram. "AM" on a carton reads as Amul instantly, and
// it is what a generic pack glyph on its own cannot do.
function monogram(p){
  const src = (p.brand && p.brand !== 'Shop') ? p.brand : (p.name.en || '');
  const words = src.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/);
  return ((words[0] || '?')[0] + (words[1] ? words[1][0] : (words[0] || '?')[1] || ''))
    .toUpperCase();
}

// The glyph and the monogram are ALWAYS rendered, and a photograph is
// laid over them when one exists. So a pack shot that 404s, or that a
// slow connection never delivers, degrades to the drawing underneath
// instead of leaving a hole -- no onerror handler, no class to toggle,
// nothing to get out of step. `p.img` comes from the data layer, so a
// product with no photograph never requests one.
const ptile = (p) =>
  '<span class="ptile">' + icon(p.tile)
  + '<span class="pmono">' + esc(monogram(p)) + '</span>'
  + (p.img
      // NO loading="lazy", deliberately. It is the obvious thing for a
      // list of thumbnails and it cost an afternoon: lazy loading is
      // driven by intersection, and in an embedded page -- which is
      // exactly how this app is shown -- it can simply never fire, so
      // every tile stays a glyph and the photographs appear nowhere.
      // What it would have saved is bounded anyway: a category is
      // about twelve products, ~300 KB, and the home screen shows
      // categories rather than products. Reliability is worth more
      // than that here, because an image nobody ever sees is worse
      // than one fetched slightly early.
      // onload marks the TILE as well as the image, so the glyph and
      // the monogram under it can be hidden. They were covered by the
      // photograph's white backdrop before; on the browsing grid that
      // backdrop is gone, and "AA" reappeared in the corner of the
      // Aashirvaad packet it was only ever standing in for.
      ? '<img class="pshot" src="./img/' + esc(p.id) + '.jpg" alt=""'
        + ' decoding="async"'
        + ' onload="this.classList.add(\'on\');this.parentNode.classList.add(\'shot\')"'
        + ' onerror="this.remove()">'
      : '')
  // Bottom right, which is where it was asked for and also where it
  // costs least: a pack shot carries its brand band across the TOP,
  // and that is the part anyone actually reads at this size.
  + (p.offer === 'b2g1'
      ? '<span class="offtag">' + esc(t().offTag) + '</span>' : '')
  + '</span>';

// Every question says whether it has to be answered. An asterisk for
// required, the word for optional -- a form where some fields are
// marked and others are silent makes the reader guess.
const lbl = (id, text, req) =>
  '<label for="' + esc(id) + '">' + esc(text)
  + (req ? '<span class="req" aria-hidden="true">*</span><span class="sr">required</span>'
         : '<span class="opt">' + esc(t().optionalTag) + '</span>')
  + '</label>';

function stepper(p, qty){
  if (!p.stock) return '<span class="pill">' + esc(t().outOfStock) + '</span>';
  if (!qty) return '<button type="button" class="btn small ghost addb" data-add="'
    + esc(p.id) + '">' + esc(t().add) + '</button>';
  return '<span class="step">'
    + '<button type="button" data-dec="' + esc(p.id) + '" aria-label="-">' + icon('minus') + '</button>'
    + '<b class="mono">' + esc(String(qty)) + '</b>'
    + '<button type="button" data-inc="' + esc(p.id) + '" aria-label="+">' + icon('plus') + '</button>'
    + '</span>';
}

// The CART row, and nowhere else -- browsing and search both draw
// cards. So the bold figure here is what this LINE costs, not what
// one packet costs: in a basket the question is "what am I paying
// for these", and the stepper beside it already says how many.
//
// It showed the unit price with no line total at all, which is why
// three packets on a buy-2-get-1 read as full price: 20, and a 3 in
// the stepper, and nothing anywhere saying one of them was free.
function productRow(p, qty){
  const free  = p.offer === 'b2g1' ? freeUnits(qty) : 0;
  const line  = p.price * (qty - free);
  // The printed price for the whole line. One rule covers both the
  // offer and a product ever priced under its MRP, instead of two
  // branches that could disagree.
  const gross = p.mrp * qty;
  return '<li class="prow">' + ptile(p)
    + '<span class="pbody">'
    +   '<span class="pname">' + esc(pname(p)) + '</span>'
    +   '<span class="ppack hint">' + esc(packLabel(p.pack, t()))
    +     (qty > 1 ? ' · ' + esc(f(t().eachBy, { n: qty, s: rupees(p.price) })) : '')
    +   '</span>'
    +   '<span class="pprice"><b class="mono">' + esc(rupees(line)) + '</b>'
    +     (gross > line ? '<s class="mono hint">' + esc(rupees(gross)) + '</s>' : '')
    +     (free > 0
          ? '<span class="pill leaf">' + esc(f(t().nFree, { n: free })) + '</span>' : '')
    +   '</span>'
    + '</span>'
    + '<span class="pact">' + stepper(p, qty) + '</span>'
    + (p.stock > 0 && p.stock <= 5
        ? '<span class="plow hint">' + esc(f(t().lastFew, { n: p.stock })) + '</span>' : '')
    + '</li>';
}

async function qtyMap(){
  const m = {};
  for (const l of await cart.lines()) m[l.pid] = l.qty;
  return m;
}

// Two shapes for the same products, chosen by where they are.
//
// BROWSING is a grid of cards with a big photograph: that is what a
// customer is doing on a category screen -- looking for the packet
// they already know by sight -- and a 64px thumbnail in a vertical
// list makes them read brand names instead. The CART stays rows,
// because there the question is what you have and what it costs, the
// pictures are only confirmation, and a grid would push the total and
// the button off the screen.
async function productList(list, grid){
  const q = await qtyMap();
  if (!list.length) return '';
  const one = grid ? productCard : productRow;
  return '<ul class="' + (grid ? 'pgrid' : 'plist') + '">'
    + list.map((p) => one(p, q[p.id] || 0)).join('') + '</ul>';
}

function productCard(p, qty){
  return '<li class="pcard">' + ptile(p)
    + '<span class="pname">' + esc(pname(p)) + '</span>'
    + '<span class="ppack hint">' + esc(packLabel(p.pack, t())) + '</span>'
    // Confirmation at the moment of adding: the badge promises the
    // offer, and once the third one is in the basket this says it
    // actually happened.
    + (p.offer === 'b2g1' && freeUnits(qty) > 0
        ? '<span class="pfree">' + esc(f(t().nFree, { n: freeUnits(qty) })) + '</span>' : '')
    + (p.stock > 0 && p.stock <= 5
        ? '<span class="plow">' + esc(f(t().lastFew, { n: p.stock })) + '</span>' : '')
    + '<span class="pbuy"><b class="mono">' + esc(rupees(p.price)) + '</b>'
    +   stepper(p, qty) + '</span>'
    + '</li>';
}

// A line of what was ordered, for the confirmation and tracking
// screens. Reading back what you just bought is the whole point of a
// receipt, and the order-placed screen had been showing only a total.
// What the offer took off this order, and how many packets it gave
// away, DERIVED from the lines rather than read from a stored field.
//
// The lines are printed directly above this summary, so deriving it
// is the only way to guarantee the two agree -- and a stored copy
// would have had to exist in two databases. It did not exist in
// one of them: a Supabase order carries no freeCount column, so the
// summary fell back to `saved`, got the MONEY right (because every
// product sells at MRP, which makes the two the same number) and
// printed "0 free" beside it.
//
// Integer arithmetic throughout, because every price in this app is
// a whole rupee and data.pl refuses one that is not.
function offerOf(o){
  let off = 0, free = 0;
  for (const l of o.lines || []){
    const paid = l.unitPrice > 0 ? Math.round(l.lineTotal / l.unitPrice) : l.qty;
    free += Math.max(0, l.qty - paid);
    off  += Math.max(0, (l.unitPrice * l.qty) - l.lineTotal);
  }
  return { off, free };
}

const orderLines = (o, c) =>
  '<ul class="plist flat">' + o.lines.map((l) => {
    // DERIVED, never stored: how many were charged for, out of the
    // money that was actually charged. Exact integer arithmetic, so
    // it cannot drift from the figure beside it the way a second
    // saved field could -- and it needs no column in anybody's
    // database.
    const free = offerOf({ lines: [l] }).free;
    return '<li class="lrow"><span class="mono lq">' + esc(String(l.qty)) + '</span>'
      + '<span>' + esc(l.nameEn) + '<span class="hint"> · '
      + esc(packLabel(l.pack, c))
      + (free > 0 ? ' · ' + esc(f(c.nFree, { n: free })) : '')
      + '</span></span>'
      + '<span class="mono">' + esc(rupees(l.lineTotal)) + '</span></li>';
  }).join('')
  + '</ul>';

// A compact card for the suggestion strips. Horizontal, because the
// cart screen's job is the total and the button -- a vertical list of
// add-ons would push both off the page.
// Takes a QUANTITY, like every other card shape does. It used to
// hardcode an Add button and never call stepper() at all, so a
// product added from any strip -- Buy it again, Goes well with your
// order, the offer rail, the festive rail -- went into the basket
// and the card went on saying "Add". The tab bar counted up and the
// thing you had just tapped looked untouched.
function railCard(p, qty){
  return '<li class="scard">'
    + ptile(p)
    + '<span class="sname">' + esc(pname(p)) + '</span>'
    + '<span class="spack hint">' + esc(packLabel(p.pack, t())) + '</span>'
    + '<span class="sbuy"><b class="mono">' + esc(rupees(p.price)) + '</b>'
    +   stepper(p, qty) + '</span>'
    + '</li>';
}

// `q` is the basket, as a pid -> qty map. Every caller already had
// to be async to fetch its list, so one more await costs nothing and
// keeps the counting in one place.
const rail = (title, list, q, sub) => list.length
  ? '<h2 class="railhead">' + esc(title) + '</h2>'
    + (sub ? '<p class="railsub">' + esc(sub) + '</p>' : '')
    + '<ul class="srail">'
    + list.map((p) => railCard(p, (q && q[p.id]) || 0)).join('') + '</ul>'
  : '';

const row = (l, r, tone, raw) =>
  '<p class="trow' + (tone ? ' ' + tone : '') + '">'
  + '<span>' + (raw ? l : esc(l)) + '</span>'
  + '<span class="mono">' + (raw ? r : esc(r)) + '</span></p>';

// A strip's CONTENTS are chosen once per visit; only the quantities
// re-render after that.
//
// "Buy it again" and "Goes well with your order" both leave out
// whatever is already in the basket -- a suggestion for something
// you have is a wasted slot -- and that is right when the list is
// BUILT. It was wrong on every repaint: adding from a strip made
// the card vanish under your finger at the one moment you most want
// it to stay, which is when you were about to tap + and make it
// two. The basket count went up and the thing you touched was gone.
//
// Cleared on the way out of the screen, so the next visit asks
// again and a product bought five minutes ago is gone from the
// suggestions by the time you come back.
async function strip(key, make){
  // SCOPED TO WHOEVER IS SIGNED IN. Signing in makes a different
  // set of past orders visible, and a cache that outlived that
  // handed the customer the empty "Buy it again" they had a moment
  // earlier -- until they reloaded the page by hand. account.js does
  // repaint on the way in; what it could not do was clear a cache it
  // must not import (customer.js already imports account.js, and the
  // other direction is the circular import this project forbids).
  const me = who();
  const k = ((me && (me.email || me.id)) || 'guest') + '|' + key;
  S.strips = S.strips || {};
  if (!S.strips[k]) S.strips[k] = await make();
  return S.strips[k];
}

// Delegated: one handler per box that CONTAINS its targets.
function wireSteppers(box){
  box.onclick = async (e) => {
    const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
    const add = e.target.closest('[data-add]'), go = e.target.closest('[data-cat]');
    const op  = e.target.closest('[data-order]');
    if (add){ await cart.add(add.dataset.add, 1); return; }
    if (inc){ await cart.add(inc.dataset.inc, 1); return; }
    if (dec){
      const cur = (await cart.lines()).find((l) => l.pid === dec.dataset.dec);
      await cart.setQty(dec.dataset.dec, (cur ? cur.qty : 0) - 1); return;
    }
    if (go){ S.catId = go.dataset.cat; show('cat'); return; }
    if (op){ S.orderId = op.dataset.order; show('track'); return; }
  };
}

// ---------------------------------------------------------------------
//  The banner. Free delivery first, because it is the offer; then the
//  next window, which is the same for every address.
// ---------------------------------------------------------------------
async function nextSlotBanner(){
  const c = t();
  const list = (await runs.bookable()).filter((r) => !r.full);
  const today = istDate();

  if (!list.length){
    return '<div class="banner"><p class="bhead">' + icon('truck')
      + '<span>' + esc(c.freeDelivery) + '</span></p>'
      + '<p class="bline"><b>' + esc(c.noneToday) + '</b></p></div>';
  }

  const r = list[0];
  const now = istMins();
  const left = minsToCutoff(r, today, now);
  // Two different facts, and only one of them is ever urgent.
  // Normally what a customer wants is when their shopping turns up;
  // only with the cut-off in sight does the shop's deadline matter
  // more than the delivery, and then it matters a lot.
  const out  = fmtAbout(minsToStart(r, today, now), c);
  const rush = left > 0 && left <= 90 ? fmtSoon(left, c) : null;
  return '<div class="banner">'
    + '<p class="bhead">' + icon('truck') + '<span>' + esc(c.freeDelivery) + '</span></p>'
    + '<p class="bline"><b>' + esc(f(c.nextSlotHead,
        { s: fmtDay(r.date, today, c).toLowerCase() + ' ' + windowOf(r) })) + '</b></p>'
    + '<p class="bline hint">' + esc(c.anywhere) + '</p>'
    + (rush
        ? '<p class="bline"><span class="pill spice">'
          + esc(f(c.orderWithin, { s: rush })) + '</span></p>'
        : out
        ? '<p class="bline"><span class="pill leaf">'
          + esc(f(c.goesOutIn, { s: out })) + '</span></p>' : '')
    + '</div>';
}

// The offer gets a band of its own rather than a heading, because a
// heading is what every other strip on this screen has and this one
// is the only thing on it that saves anybody money. Same shape as
// the festive band, in the attention colour instead of the season's.
async function offerBlock(){
  const c = t();
  const list = await catalog.onOffer(10);
  if (!list.length) return '';
  const q = await qtyMap();
  return '<div class="offbox">'
    + '<p class="offhead">' + icon('gift') + '<span>' + esc(c.offB2G1) + '</span></p>'
    + '<p class="offsub">' + esc(c.offB2G1Sub) + '</p>'
    + '</div>'
    + '<ul class="srail offrail">'
    + list.map((p) => railCard(p, q[p.id] || 0)).join('') + '</ul>';
}

// The festive shelf. Drawn only while the shopkeeper's dates say so,
// and only if i18n has wording for that festival id -- an id nobody
// has written a greeting for draws nothing at all, which is a better
// failure than a banner reading `undefined` over a row of sweets.
async function festiveBlock(){
  const c = t();
  const fest = await catalog.festival();
  if (!fest.on) return '';
  const q = await qtyMap();
  const key = 'fest' + fest.id.charAt(0).toUpperCase() + fest.id.slice(1);
  if (!c[key]) return '';
  // A BUTTON, because it was a sign pointing at nothing: tapping the
  // greeting did not move, and the one thing anybody wants from a
  // Diwali banner is the shelf behind it. The rail under it holds
  // nine; the aisle holds every sweet, biscuit and chocolate.
  return '<button type="button" class="festbox" id="festgo">'
    + '<span class="festhead">' + icon('diya') + '<span>' + esc(c[key]) + '</span></span>'
    + '<span class="festsub">' + esc(c[key + 'Sub'] || '') + '</span>'
    + '</button>'
    + '<ul class="srail festrail">'
    + fest.products.map((p) => railCard(p, q[p.id] || 0)).join('')
    + '</ul>';
}

// ---------------------------------------------------------------------
//  s-shop
// ---------------------------------------------------------------------
registerScreen('shop', async () => {
  const c = t();
  const box = $('s-shop');
  const cats = await catalog.categories();

  mount(box,
    '<div class="searchbar">' + icon('search')
      + '<input id="q" class="field" type="search" placeholder="' + esc(c.searchph) + '">'
      + '</div>'
    + await nextSlotBanner()
    // The PRODUCTS bought before, not the order they were bought in.
    // This used to be one card reading "K-0007 · 4 · Rs 693", which is
    // the shop's own filing reference: the customer never knew that
    // number, cannot tell what is in it, and has no reason to care.
    // What they recognise is the packet. Reordering a whole past
    // order still exists, on the screen for that order, which is where
    // you are actually looking at one.
    + await festiveBlock()
    + rail(c.buyAgain, await strip('home.again', () => orders.againItems(10)),
           await qtyMap(), c.buyAgainSub)
    // The offer, where somebody browsing will meet it. A discount
    // nobody is shown is a discount the shop pays for twice.
    + await offerBlock()
    // The same heading as a strip carries. It is the biggest thing on
    // this screen by area and it was wearing the smallest heading.
    + '<h2 class="railhead">' + esc(c.catsHead) + '</h2>'
    + '<div class="cgrid">' + cats.map((cat) =>
        // Same arrangement as a product tile: the glyph is always
        // drawn and the photograph sits over it, so a category whose
        // hero has no picture simply keeps the drawing.
        '<button type="button" class="ccard" data-cat="' + esc(cat.id) + '">'
        + '<span class="ctile">' + icon(cat.tile)
        +   (cat.hero
              ? '<img class="cshot" src="./img/' + esc(cat.hero) + '.jpg" alt=""'
                + ' decoding="async"'
                + ' onload="this.classList.add(\'on\');this.parentNode.classList.add(\'shot\')"'
                + ' onerror="this.remove()">'
              : '')
        + '</span>'
        + '<span>' + esc(cname(cat)) + '</span></button>').join('')
      + '</div>');

  wireSteppers(box);
  onLeave(() => { S.strips = null; });

  const fg = $('festgo');
  // The aisle the band is advertising. It pointed at snacks while
  // there was no sweets aisle to point at, which meant a Diwali
  // banner delivering you to a shelf of crisps.
  if (fg) fg.onclick = () => { S.catId = 'sweets'; show('cat'); };

  const qbox = $('q');
  qbox.oninput = () => {
    const v = qbox.value.trim();
    if (v.length < 2) return;
    S.q = v; show('find');
  };

});

// ---------------------------------------------------------------------
//  s-cat  /  s-find
// ---------------------------------------------------------------------
registerScreen('cat', async () => {
  const box = $('s-cat');
  const cats = await catalog.categories();
  const cat = cats.find((c) => c.id === S.catId) || cats[0];
  const list = await catalog.byCat(cat.id);
  mount(box, h1(cname(cat)) + sub(f(t().nItems, { n: list.length })) + await productList(list, true));
  wireSteppers(box);
});

registerScreen('find', async () => {
  const c = t();
  const box = $('s-find');

  // The input is mounted ONCE and never replaced again.
  //
  // It used to sit inside the markup that `repaint()` rebuilds, and
  // every keystroke therefore destroyed the element being typed into
  // and put a fresh one in its place. The browser cannot keep focus on
  // a node that no longer exists, so the caret vanished and the phone
  // keyboard dropped -- you could enter two characters, then had to
  // tap the box again for the next two. Only the RESULTS redraw now.
  mount(box,
    '<div class="searchbar">' + icon('search')
      + '<input id="q2" class="field" type="search" autocomplete="off"'
      + ' value="' + esc(S.q) + '"></div>'
    + '<div id="fres"></div>');

  const q2 = $('q2'), res = $('fres');

  const draw = async () => {
    const list = await catalog.search(S.q, getLang());
    res.innerHTML = list.length
      ? sub(f(c.nItems, { n: list.length })) + await productList(list, true)
      : empty(f(c.noResults, { s: S.q }), c.noResultsSub);
    wireSteppers(res);
  };
  await draw();

  // Carry on where the previous screen left off: focus the box and put
  // the caret after what was already typed, so the next letter simply
  // continues the word instead of landing nowhere.
  q2.focus();
  try { q2.setSelectionRange(q2.value.length, q2.value.length); } catch {}

  // A short debounce, because searching on every keystroke over a
  // hundred products rebuilds the list faster than anyone can read it.
  let timer = null;
  q2.oninput = () => {
    S.q = q2.value.trim();
    clearTimeout(timer);
    timer = setTimeout(draw, 160);
  };
  onLeave(() => clearTimeout(timer));
});

// ---------------------------------------------------------------------
//  s-cart
// ---------------------------------------------------------------------
registerScreen('cart', async () => {
  const c = t();
  const box = $('s-cart');
  const d = await ready();
  const lines = await cart.lines();

  if (!lines.length){
    mount(box, h1(c.cartTitle) + empty(c.cartEmpty, c.cartEmptySub)
      + '<button type="button" class="btn" id="goshop">' + esc(c.goShop) + '</button>');
    $('goshop').onclick = () => show('shop', false);
    return;
  }

  const map = await catalog.byIds(lines.map((l) => l.pid));
  const q = await qtyMap();
  const tot = await cart.totals();
  const rows = lines.map((l) => map[l.pid]).filter(Boolean);

  mount(box, h1(c.cartTitle)
    + sub(f(tot.count === 1 ? c.oneItem : c.nItems, { n: tot.count }))
    + await productList(rows)

    // Two strips, two different questions, and they are allowed to
    // overlap: "what goes with this" and "what do you usually get"
    // are not the same answer, and suppressing one to dedupe would
    // lose whichever was the better reason.
    //
    // They sit ABOVE the coupon and the total because they are the
    // last chance to ADD something, and everything below here is
    // settling up. Under the total they were worse than useless:
    // adding from one left a figure the customer had already read
    // sitting stale further up the page, and pushed the button they
    // were reaching for off the bottom.
    + rail(c.goesWith, await strip('cart.goes', () => catalog.suggest(8)), q)
    + rail(c.buyAgain, await strip('cart.again', () => orders.againItems(8)), q, c.buyAgainSub)

    // Everything sells at MRP, so a coupon is the only discount there
    // is -- which makes it worth a field of its own rather than a link.
    + '<div class="card coupbox">'
    +   '<label for="coup">' + esc(c.couponLabel) + '</label>'
    +   (tot.coupon
        ? '<p class="couphit"><span class="pill leaf">'
          + esc(f(c.couponOn, { s: tot.coupon, n: tot.couponPercent })) + '</span>'
          + '<button type="button" class="linkb" id="coupoff">' + esc(c.couponOff) + '</button></p>'
        : '<div class="couprow">'
          + '<input id="coup" class="field" autocomplete="off" inputmode="numeric"'
          + ' placeholder="' + esc(c.couponPlace) + '">'
          + '<button type="button" class="btn small" id="coupgo">' + esc(c.couponApply) + '</button>'
          + '</div>'
          + (S.coupErr ? '<p class="ferr">' + esc(c.couponBad) + '</p>' : ''))
    + '</div>'

    + '<div class="card totals">'
    +   row(c.itemsTotal, rupees(tot.items + tot.offerOff))
    +   (tot.offerOff > 0
        ? row(f(c.offerRow, { n: tot.freeCount }), '-' + rupees(tot.offerOff), 'leaf') : '')
    +   (tot.discount > 0
        ? row(f(c.couponSaved, { s: tot.coupon }), '-' + rupees(tot.discount), 'leaf') : '')
    +   row(c.deliveryFee, c.feeFree, 'leaf')
    +   '<hr class="trule">'
    +   row('<b>' + esc(c.toPay) + '</b>', '<b>' + esc(rupees(tot.grand)) + '</b>', '', true)
    + '</div>'
    + (tot.short > 0
        ? '<p class="ferr">' + esc(f(c.minOrderShort,
            { s: rupees(d.delivery.minOrder), d: rupees(tot.short) })) + '</p>'
        : '<p class="hint freeline">' + icon('truck') + esc(c.freeDelivery) + '</p>')
    + '<button type="button" class="btn" id="next"' + (tot.short > 0 ? ' disabled' : '') + '>'
      + esc(c.chooseRun) + '</button>');

  wireSteppers(box);
  onLeave(() => { S.strips = null; });

  const go = $('coupgo'), inp = $('coup'), off = $('coupoff');
  if (go) go.onclick = async () => {
    const hit = await cart.applyCoupon(inp.value);
    S.coupErr = !hit;                 // the repaint is driven by the cart event
    if (hit) toast(f(c.couponOn, { s: hit.code, n: hit.percent }));
    else repaint();
  };
  if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter' && go) go.click(); };
  if (off) off.onclick = async () => { S.coupErr = false; await cart.clearCoupon(); };

  const nx = $('next');
  if (nx && !nx.disabled) nx.onclick = () => show('slot');
});

// ---------------------------------------------------------------------
//  s-slot -- three windows, the same for everybody.
// ---------------------------------------------------------------------
registerScreen('slot', async () => {
  const c = t();
  const box = $('s-slot');
  const list = await runs.bookable();
  const today = istDate();

  // A picker left open across a cut-off goes stale. place() is what
  // actually guards it, but repainting every 30s means the customer
  // usually never meets that error at all.
  const timer = setInterval(() => repaint(), 30000);
  onLeave(() => clearInterval(timer));

  if (!list.length){
    mount(box, h1(c.slotTitle) + empty(c.noneToday, ''));
    return;
  }

  const cards = [];
  let lastDay = null;
  for (const r of list){
    const day = fmtDay(r.date, today, c);
    if (day !== lastDay){ cards.push('<h2>' + esc(day) + '</h2>'); lastDay = day; }

    const nowM = istMins();
    const left = minsToCutoff(r, today, nowM);
    const out  = fmtAbout(minsToStart(r, today, nowM), c);
    const rush = left > 0 && left <= 90 ? fmtSoon(left, c) : null;
    const sel = S.runId === r.id;

    cards.push('<button type="button" class="card slot' + (sel ? ' on' : '')
      + (r.full ? ' full' : '') + '" data-run="' + esc(r.id) + '"'
      + (r.full ? ' disabled' : '') + '>'
      + '<span class="srow1"><b>' + esc(c[r.label] || r.label) + '</b>'
      +   '<span class="mono win">' + esc(windowOf(r)) + '</span></span>'
      + '<span class="srow3 hint">' + esc(f(c.orderByTime, { s: fmtTime(mins(r.cutoff)) })) + '</span>'
      + '<span class="srow4">'
      +   (r.full ? '<span class="pill bad">' + esc(c.runFull) + '</span>'
         : rush ? '<span class="pill spice">' + esc(f(c.orderWithin, { s: rush })) + '</span>'
         : out  ? '<span class="pill leaf">'  + esc(f(c.goesOutIn,  { s: out  })) + '</span>' : '')
      + '</span></button>');
  }

  mount(box, h1(c.slotTitle) + sub(c.slotSub) + cards.join('')
    + '<p class="hint freeline">' + icon('truck') + esc(c.freeDelivery) + '</p>'
    + '<button type="button" class="btn" id="go"' + (S.runId ? '' : ' disabled') + '>'
    + esc(c.continue) + '</button>');

  box.onclick = (e) => {
    const b = e.target.closest('[data-run]');
    if (!b) return;
    S.runId = b.dataset.run;
    repaint();
  };
  const go = $('go');
  if (go && !go.disabled) go.onclick = () => show('addr');
});

// ---------------------------------------------------------------------
//  s-addr -- free text, because the shop delivers wherever you are.
// ---------------------------------------------------------------------
// =====================================================================
//  The address book
//
//  One screen does two jobs, because it is the same list either way:
//  mid-order it is "where should this go", and from Settings it is
//  "the addresses I have saved". `S.runId` is the difference, and the
//  only thing it changes is whether there is a Place order button at
//  the bottom.
//
//  THE LOCATION BUTTON IS GONE. It worked -- it reverse-geocoded, it
//  filled the street, it refused to guess the suburb -- and it was
//  still wrong to ship. OSM's idea of where you are in Borivali is
//  200-300 m out and it labels half the ward Dahisar, so the street it
//  offered was often not the customer's street. A field that is filled
//  in and wrong is worse than one that is empty, because nobody
//  re-reads a box that already has words in it. geo.js is in parked/
//  with the rest of the measurements, not deleted.
// =====================================================================

// No placeholders. Grey example text inside a box reads as a value
// that is already there, and the label above is doing that job
// properly.
const afield = (id, label, req, val, type, hint) =>
  '<div class="fset">' + lbl(id, label, req)
  + '<input id="' + esc(id) + '" class="field"'
  + (type ? ' type="' + esc(type) + '"' : '')
  + ' value="' + esc(val || '') + '">'
  + (hint ? '<p class="hint">' + esc(hint) + '</p>' : '')
  + '</div>';

// Home and Office are what nearly every address is called, so they
// are a tap. The third opens a field, for the people whose answer is
// "Amma's place".
//
// The KEY is stored, not the word. An address saved in Marathi and
// later read in Hindi would otherwise keep the label it was saved
// with, and a list reading "ghar / Office / itar" is a shop that
// cannot decide what language it speaks. Anything that is not one of
// the two known keys is free text, shown exactly as it was typed.
const LABS = [
  ['home',  'home', 'addrLabHome'],
  ['work',  'case', 'addrLabWork'],
  ['other', 'pin',  'addrLabOther'],
];

// 'office' is in here because addresses saved before this existed
// carry a typed label, and the common two upgrade themselves free.
const labelKeyOf = (s) => {
  const k = String(s || '').trim().toLowerCase();
  if (k === 'home') return 'home';
  if (k === 'work' || k === 'office') return 'work';
  return k ? 'other' : '';
};

const labelText = (a, c) => {
  const k = labelKeyOf(a.label);
  if (k === 'home') return c.addrLabHome;
  if (k === 'work') return c.addrLabWork;
  return a.label || a.name;
};

const labelField = (a, c) => {
  const key = labelKeyOf(a.label);
  return '<div class="fset">'
    + '<label>' + esc(c.addrLabel)
    +   '<span class="opt">' + esc(c.optionalTag) + '</span></label>'
    + '<div class="labrow" id="labrow">'
    +   LABS.map(([k, ic, tk]) =>
          '<button type="button" data-lab="' + esc(k) + '"'
          + ' aria-pressed="' + (key === k ? 'true' : 'false') + '">'
          + icon(ic) + '<span>' + esc(c[tk]) + '</span></button>').join('')
    + '</div>'
    // Rendered once, then only ever shown or hidden. Building it on
    // the tap would be a handler creating the very input it then has
    // to focus -- and this app has already lost its search keyboard
    // once to a field replaced underneath the caret.
    + '<input id="flabel" class="field labother" type="text"'
    +   ' value="' + esc(key === 'other' ? a.label : '') + '"'
    +   ' aria-label="' + esc(c.addrLabelOther) + '"'
    +   (key === 'other' ? '' : ' hidden') + '>'
    + '</div>';
};

// The address first, the name for it last. Asking what to call a
// place before being told where it is is the wrong way round, and it
// put the one OPTIONAL question at the top of a form of required
// ones -- where it reads as the first thing being asked for.
const addrForm = (a, c) =>
  afield('fname',  c.fWho,      true,  a.name,  'text')
  + afield('fphone', c.fPhone,    true,  a.phone, 'tel')
  + afield('fflat',  c.fFlat,     true,  a.flat)
  + afield('fsoc',   c.fSociety,  true,  a.society)
  + afield('farea',  c.fArea,     true,  a.area)
  + afield('fmark',  c.fLandmark, false, a.landmark)
  + labelField(a, c);

// Direct DOM, and deliberately no repaint: the custom-name field sits
// inside this block, so a handler redrawing its own container would
// throw away whatever was being typed into it.
function labelWire(){
  const row = $('labrow');
  if (!row) return;
  row.onclick = (e) => {
    const b = e.target.closest('button[data-lab]');
    if (!b) return;
    for (const x of row.querySelectorAll('button[data-lab]'))
      x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
    const other = b.dataset.lab === 'other';
    const fl = $('flabel');
    fl.hidden = !other;
    if (other) fl.focus();
  };
}

// The address, or null having already put the reason on screen.
function readAddrForm(c){
  const v = (id) => $(id).value.trim();
  // '' when nothing is chosen, which is allowed -- the card then
  // falls back to the name of whoever takes delivery.
  const lab = $('labrow') && $('labrow').querySelector('button[aria-pressed="true"]');
  const key = lab ? lab.dataset.lab : '';
  const got = {
    label: key === 'other' ? v('flabel') : key,
    name: v('fname'), phone: v('fphone').replace(/\D/g, ''),
    flat: v('fflat'), society: v('fsoc'), area: v('farea'),
    landmark: v('fmark'),
  };
  for (const [el, ok, msg] of [
    ['fname',  got.name.length > 0,            c.errName],
    ['fphone', /^[6-9]\d{9}$/.test(got.phone), c.errPhone],
    ['fflat',  got.flat.length > 0,            c.errFlat],
    ['fsoc',   got.society.length > 0,         c.errSociety],
    ['farea',  got.area.length > 0,            c.errArea2],
  ]){
    $(el).classList.toggle('bad', !ok);
    if (!ok){ fieldErr(el, msg); return null; }
  }
  $('aerr').hidden = true;
  return got;
}

const addrLines = (a) =>
  [a.flat, a.society, a.area, a.landmark].filter(Boolean).join(', ');

// The label is what you called it; the name underneath is who takes
// it in. An address with no label falls back to the name, so a card
// is never headed by a blank.
const addrCard = (a, chosen, c) =>
  '<li class="aitem">'
  + '<button type="button" class="acard" data-pick="' + esc(a.id) + '"'
  +   ' aria-pressed="' + (chosen ? 'true' : 'false') + '">'
  +   '<span class="atop"><span class="aname">' + esc(labelText(a, c)) + '</span>'
  +     (a.isDefault ? '<span class="apill">' + esc(c.addrDefault) + '</span>' : '')
  +   '</span>'
  +   '<span class="alines">' + esc(addrLines(a)) + '</span>'
  +   '<span class="awho">' + esc(a.name) + ' · ' + esc(a.phone) + '</span>'
  + '</button>'
  + '<button type="button" class="alink" data-edit="' + esc(a.id) + '">'
  +   esc(c.addrEdit) + '</button>'
  + '</li>';

registerScreen('addr', async () => {
  const c = t();
  const box = $('s-addr');
  const checkout = !!S.runId;
  const book = await places.list();

  // An empty book goes STRAIGHT to the form. A list with nothing in
  // it, above a button that opens the form, is a screen whose entire
  // contribution is one extra tap at the exact moment somebody is
  // trying to place their first order.
  if (!book.length){
    const me = (await profile.get()) || {};
    mount(box, h1(checkout ? c.addrTitle : c.addrBook)
      + '<p class="sub">' + esc(checkout ? c.anywhere : c.addrNoneSub) + '</p>'
      + addrForm({ name: me.name, phone: me.phone }, c)
      + (checkout ? offerHtml(c) : '')
      + '<p id="aerr" class="ferr" hidden></p>'
      + '<button type="button" class="btn" id="place">'
        + esc(checkout ? c.placeOrder : c.addrSave) + '</button>');

    offerWire();
    labelWire();

    $('place').onclick = async () => {
      const got = readAddrForm(c);
      if (!got) return;
      const saved = await places.save({ ...got, isDefault: true });
      await profile.save({ name: got.name, phone: got.phone });
      S.addrId = saved.id;
      if (!checkout){ toast(c.addrSaved); repaint(); return; }
      await placeNow(saved, c);
    };
    return;
  }

  // Whatever was chosen last, unless it has since been deleted.
  if (!S.addrId || !book.some((a) => a.id === S.addrId)){
    S.addrId = (book.find((a) => a.isDefault) || book[0]).id;
  }

  mount(box, h1(checkout ? c.addrTitle : c.addrBook)
    + '<p class="sub">' + esc(checkout ? c.anywhere : c.addrPickOne) + '</p>'
    + '<ul class="abook" id="abook">'
    +   book.map((a) => addrCard(a, checkout && a.id === S.addrId, c)).join('')
    + '</ul>'
    + '<button type="button" class="btn ghost" id="anew">' + esc(c.addrAdd) + '</button>'
    + (checkout ? offerHtml(c) : '')
    + '<p id="aerr" class="ferr" hidden></p>'
    + (checkout
        ? '<button type="button" class="btn" id="place">' + esc(c.placeOrder) + '</button>'
        : ''));

  offerWire();

  $('abook').onclick = (e) => {
    // Edit is tested first: it sits inside the card's box, so a tap on
    // it is also a tap on the card, and whichever is asked about first
    // wins.
    const ed = e.target.closest('button[data-edit]');
    if (ed){ S.editId = ed.dataset.edit; show('aedit'); return; }
    const pick = e.target.closest('button[data-pick]');
    if (pick && checkout){ S.addrId = pick.dataset.pick; repaint(); }
  };
  $('anew').onclick = () => { S.editId = null; show('aedit'); };

  const go = $('place');
  if (go) go.onclick = async () => {
    const a = await places.get(S.addrId);
    // Deleted in another tab between the draw and the tap.
    if (!a){ S.addrId = null; repaint(); return; }
    await placeNow(a, c);
  };
});

registerScreen('aedit', async () => {
  const c = t();
  const box = $('s-aedit');
  const a = S.editId ? await places.get(S.editId) : null;
  const me = (await profile.get()) || {};

  mount(box, h1(a ? c.addrTitleEdit : c.addrTitleNew)
    + addrForm(a || { name: me.name, phone: me.phone }, c)
    // Offered only where it would change something. On the only
    // address, or on the one already default, it is a switch that
    // does nothing.
    + (a && !a.isDefault
        ? '<label class="arow"><input type="checkbox" id="fdef" class="cbx">'
          + '<span>' + esc(c.addrSetDefault) + '</span></label>'
        : '')
    + '<p id="aerr" class="ferr" hidden></p>'
    + '<button type="button" class="btn" id="asave">' + esc(c.addrSave) + '</button>'
    + (a ? '<button type="button" class="btn ghost danger" id="adel">'
           + esc(c.addrDelete) + '</button>' : ''));

  labelWire();

  $('asave').onclick = async () => {
    const got = readAddrForm(c);
    if (!got) return;
    const def = $('fdef');
    const saved = await places.save(a
      ? { ...got, id: a.id, isDefault: a.isDefault || !!(def && def.checked) }
      : got);
    // Remembered as the defaults for the NEXT new address, not as the
    // address itself -- the book is the address now.
    await profile.save({ name: got.name, phone: got.phone });
    S.addrId = saved.id;
    toast(c.addrSaved);
    goBack();
  };

  const del = $('adel');
  if (del){
    // Two taps, the same as Clear all data, because it cannot be
    // undone and it sits directly under Save.
    let armed = false;
    del.onclick = async () => {
      if (!armed){
        armed = true;
        del.textContent = c.addrDeleteConfirm;
        del.classList.add('arm');
        setTimeout(() => {
          if (!armed) return;
          armed = false;
          del.textContent = c.addrDelete;
          del.classList.remove('arm');
        }, 4000);
        return;
      }
      await places.remove(a.id);
      if (S.addrId === a.id) S.addrId = null;
      toast(c.addrDeleted);
      goBack();
    };
  }
});

async function placeNow(a, c){
  try {
    const o = await orders.place({
      runId: S.runId,
      // COPIED, never referenced. An address edited or deleted next
      // month must not rewrite where this order went.
      name: a.name, phone: a.phone,
      flat: a.flat, society: a.society, area: a.area,
      landmark: a.landmark || '',
      ll: a.ll || null,
    });
    S.orderId = o.id;
    S.runId = null;
    clearNav();
    show('done', false);
  } catch (err){
    const msg = String(err.message);
    if (msg.indexOf('RUN_CLOSED') === 0 || msg.indexOf('RUN_FULL') === 0){
      const nxt = (await runs.bookable()).filter((r) => !r.full)[0];
      $('aerr').textContent = nxt
        ? f(c.errRunClosed, { s: '', d: windowOf(nxt) }).replace(/\s+/g, ' ').trim()
        : c.noneToday;
      $('aerr').hidden = false;
      S.runId = null;
      setTimeout(() => show('slot', false), 1600);
    } else {
      $('aerr').textContent = msg;
      $('aerr').hidden = false;
    }
  }
}

function fieldErr(id, msg){
  const e = $('aerr');
  e.textContent = msg;
  e.hidden = false;
  const el = $(id);
  el.focus();
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ---------------------------------------------------------------------
//  s-done -- the confirmation now shows WHAT was ordered, not just a
//  total, and offers UPI straight away.
// ---------------------------------------------------------------------
registerScreen('done', async () => {
  const c = t();
  const box = $('s-done');
  const draw = async () => {
    const o = await orders.byId(S.orderId);
    if (!o){ show('shop', false); return; }
    const run = await runs.byId(o.runId);
    const d = await ready();

    mount(box, '<div class="doneart">' + icon('check') + '</div>'
      + h1(c.doneTitle)
      + '<p class="donecode mono">' + esc(f(c.doneCode, { s: o.code })) + '</p>'
      + '<p class="sub">' + esc(f(c.arriveBetween,
          { s: fmtDay(run.date, istDate(), c).toLowerCase() + ' ' + windowOf(run) })) + '</p>'

      + '<h2>' + esc(c.doneItems) + '</h2>'
      + orderLines(o, c)
      + '<div class="card totals">'
      +   row(c.itemsTotal, rupees(o.itemsTotal + offerOf(o).off))
      +   (offerOf(o).off > 0
          ? row(f(c.offerRow, { n: offerOf(o).free }),
                '-' + rupees(offerOf(o).off), 'leaf') : '')
      +   ((o.discount || 0) > 0
          ? row(f(c.couponSaved, { s: o.coupon }), '-' + rupees(o.discount), 'leaf') : '')
      +   row(c.deliveryFee, c.feeFree, 'leaf')
      +   '<hr class="trule">'
      +   row('<b>' + esc(c.toPay) + '</b>', '<b>' + esc(rupees(o.grand)) + '</b>', '', true)
      + '</div>'

      + payBlock(d.upi, o, c, { qrId: 'doneqr' })

      + '<button type="button" class="btn ghost" id="track">' + esc(c.trackIt) + '</button>'
      + '<button type="button" class="btn ghost" id="more">' + esc(c.keepShopping) + '</button>');

    drawQR('doneqr', d.upi, o);
    wirePay(box, o, orders);
    $('track').onclick = () => show('track');
    $('more').onclick = () => show('shop', false);
  };
  await draw();
  onLeave(live.subscribe('orders', draw));
});

// ---------------------------------------------------------------------
//  s-track
// ---------------------------------------------------------------------
// The order's own progress, read off its append-only history rather
// than inferred from the status -- so a step shows the time the shop
// actually did it, and a step with no time beside it has genuinely
// not happened. The status pill at the top says where it IS; this
// says how it got there and what is left.
function trail(o, c){
  const at = new Map((o.history || []).map((h) => [h.to, h.at]));
  // The trail has room for the whole sentence; the pills do not, so
  // they keep their own short words. tr*, not st*.
  const label = (s) => c['tr' + s[0].toUpperCase() + s.slice(1)]
    || c['st' + s[0].toUpperCase() + s.slice(1)] || s;
  // An order that was cancelled or nobody was home stopped going
  // forwards, and drawing the rest of the road would promise a
  // delivery that is not coming.
  const stopped = o.status === 'cancelled' || o.status === 'failed';
  const steps = ORDER_TRAIL.filter((s) => !stopped || at.has(s));
  if (!steps.length) return '';
  return '<h2>' + esc(c.trackProgress) + '</h2>'
    + '<ul class="trail">'
    + steps.map((s) => {
        const when = at.get(s);
        return '<li class="' + (when ? 'on' : '')
          + (o.status === s ? ' now' : '') + '">'
          + '<span class="tdot"></span>'
          + '<span class="tname">' + esc(label(s)) + '</span>'
          + '<span class="hint mono">' + esc(when ? istClock(when) : '')
          + '</span></li>';
      }).join('')
    + '</ul>';
}

registerScreen('track', async () => {
  const c = t();
  const box = $('s-track');
  const draw = async () => {
    const o = await orders.byId(S.orderId);
    if (!o){ show('orders', false); return; }
    const run = await runs.byId(o.runId);
    const d = await ready();

    mount(box, h1(f(c.trackTitle, { s: o.code }))
      + '<p class="sub"><span class="pill ' + esc(ORDER_TONE[o.status] || '') + '">'
        + esc(c['st' + o.status[0].toUpperCase() + o.status.slice(1)] || o.status) + '</span>'
        // Said-paid is neither of the other two. "Not paid yet" over a
        // QR the customer has just paid is the app contradicting
        // itself in the same breath as "Payment noted".
        + ' <span class="pill ' + (payState(o) === 'verified' ? 'leaf'
            : payState(o) === 'said' ? 'spice' : '') + '">'
        + esc(payState(o) === 'verified' ? c.payDone
            : payState(o) === 'said' ? c.pillSaidPaid : c.payUnpaid) + '</span></p>'

      + '<div class="card">'
      +   '<p class="trow"><span>' + esc(c.arriveBetween.replace('{s}', '').trim()) + '</span>'
      +     '<span class="mono">' + esc(windowOf(run)) + '</span></p>'
      +   '<p class="trow"><span>' + esc(fmtDay(run.date, istDate(), c)) + '</span>'
      +     '<span class="hint">' + esc(c.freeAlways) + '</span></p>'
      +   (run.status === 'open' || run.status === 'cutoff'
            ? '<p class="hint">' + esc(c.notLeftYet) + '</p>' : '')
      + '</div>'

      + trail(o, c)

      + '<h2>' + esc(c.doneItems) + '</h2>'
      + orderLines(o, c)
      + '<div class="card totals">'
      +   row(c.deliveryFee, c.feeFree, 'leaf')
      +   row('<b>' + esc(c.toPay) + '</b>', '<b>' + esc(rupees(o.grand)) + '</b>', '', true)
      + '</div>'

      + payBlock(d.upi, o, c, { qrId: 'trackqr' })

      // Reordering the whole lot belongs HERE, on the order you are
      // looking at, and not on the home screen as a card showing an
      // order code. Here the items are listed right above the button,
      // so "this again" means something you can see.
      // Only while the shop could still act on a change: an hour
      // before the window, and before the order leaves `placed` or
      // `accepted`. The server checks the second of those; the hour
      // is checked here, which is exactly where place() checks the
      // cut-off -- see db/order-edit.sql.
      + (canEditOrder(run, istDate(), istMins())
         && (o.status === 'placed' || o.status === 'accepted')
          ? '<button type="button" class="btn ghost" id="oedit">'
            + esc(c.editOrder) + '</button>'
          : '')
      + '<button type="button" class="btn ghost" id="again">'
        + esc(c.reorder) + '</button>'

      + '<a class="btn ghost" href="tel:' + esc(d.shop.phone) + '">' + esc(c.callShop) + '</a>');

    drawQR('trackqr', d.upi, o);
    wirePay(box, o, orders);
    const oe = $('oedit');
    if (oe) oe.onclick = () => { S.edit = null; show('oedit'); };
    $('again').onclick = async () => {
      for (const l of o.lines) await cart.add(l.pid, l.qty);
      toast(f(c.nItems, { n: o.lines.length }));
      show('cart');
    };
  };
  await draw();
  onLeave(live.subscribe('orders', draw));
  onLeave(live.subscribe('runs', draw));
});

// ---------------------------------------------------------------------
//  s-oedit -- the customer changing their own order
//
//  A working copy in S.edit, not the order itself: nothing is written
//  until Save, so backing out costs a tap and leaves no trace. The
//  totals are recomputed by the SAME calcTotals() the cart uses, so
//  an edited order is priced by the rules a new one would be -- offer
//  first, then the coupon, rounded once.
// ---------------------------------------------------------------------
registerScreen('oedit', async () => {
  const c = t();
  const box = $('s-oedit');

  const draw = async () => {
    const o = await orders.byId(S.orderId);
    if (!o){ show('orders', false); return; }
    const d = await ready();
    const run = await runs.byId(o.runId);

    // Seeded once per visit. Re-seeding on every repaint would undo
    // the tap that caused the repaint.
    if (!S.edit || S.edit.id !== o.id){
      S.edit = { id: o.id, q: {} };
      for (const l of o.lines) S.edit.q[l.pid] = l.qty;
    }
    const q = S.edit.q;
    const lines = o.lines
      .map((l) => ({ pid: l.pid, qty: q[l.pid] || 0 }))
      .filter((l) => l.qty > 0);
    // The coupon that was on the order, re-matched -- a code
    // withdrawn since it was placed must not still apply.
    const coupon = matchCoupon(o.coupon, d.coupons);
    const tot = calcTotals(lines, d.byId, d.delivery, coupon, d.offers);

    mount(box, h1(f(c.editTitle, { s: o.code }))
      + '<p class="sub">' + esc(c.editSub) + '</p>'
      + '<ul class="plist flat">' + o.lines.map((l) => {
          const n = q[l.pid] || 0;
          return '<li class="erow' + (n ? '' : ' egone') + '">'
            + '<span class="ebody"><b>' + esc(l.nameEn) + '</b>'
            +   '<span class="hint">' + esc(packLabel(l.pack, c)) + '</span></span>'
            + '<span class="estep">'
            +   '<button type="button" data-q="' + esc(l.pid) + '" data-d="-1"'
            +     ' aria-label="-">&minus;</button>'
            +   '<span class="mono eq">' + esc(String(n)) + '</span>'
            +   '<button type="button" data-q="' + esc(l.pid) + '" data-d="1"'
            +     ' aria-label="+">+</button>'
            + '</span></li>';
        }).join('') + '</ul>'
      + '<div class="card totals">'
      +   row(c.itemsTotal, rupees(tot.items + tot.offerOff))
      +   (tot.offerOff > 0
            ? row(f(c.offerRow, { n: tot.freeCount }),
                  '-' + rupees(tot.offerOff), 'leaf') : '')
      +   (tot.discount > 0
            ? row(f(c.couponSaved, { s: tot.coupon }),
                  '-' + rupees(tot.discount), 'leaf') : '')
      +   row(c.deliveryFee, c.feeFree, 'leaf')
      +   row('<b>' + esc(c.toPay) + '</b>', '<b>' + esc(rupees(tot.grand)) + '</b>', '', true)
      + '</div>'
      + '<button type="button" class="btn" id="esave">' + esc(c.editSave) + '</button>'
      + '<button type="button" class="btn ghost" id="ecancel">'
        + esc(c.editCancel) + '</button>');

    // One handler on the list, not one per button: the list is
    // rebuilt on every tap and a per-button handler would be bound
    // to a node that no longer exists.
    box.onclick = async (e) => {
      const b = e.target.closest('[data-q]');
      if (b){
        const pid = b.dataset.q, dq = Number(b.dataset.d);
        q[pid] = Math.max(0, (q[pid] || 0) + dq);
        draw();
        return;
      }
      if (e.target.closest('#ecancel')){ S.edit = null; show('track', false); return; }
      if (!e.target.closest('#esave')) return;
      if (!lines.length){ toast(c.editEmpty); return; }
      try {
        await orders.edit(o.id, lines);
        S.edit = null;
        toast(c.editDone);
        show('track', false);
      } catch (err){ toast(String(err.message)); }
    };
  };
  await draw();
});

// ---------------------------------------------------------------------
//  s-orders
// ---------------------------------------------------------------------
registerScreen('orders', async () => {
  const c = t();
  const box = $('s-orders');
  const draw = async () => {
    const list = await orders.mine();
    if (!list.length){ mount(box, h1(c.ordersTitle) + empty(c.noOrders, c.noOrdersSub)); return; }
    mount(box, h1(c.ordersTitle) + '<ul class="plist flat">' + list.map((o) =>
      '<li class="orow" data-order="' + esc(o.id) + '">'
      + '<span class="obody"><b class="mono">' + esc(o.code) + '</b>'
      + '<span class="hint">' + esc(o.lines.length + ' · ' + rupees(o.grand)
          + (payState(o) === 'verified' ? ' · ' + c.payDone
            : payState(o) === 'said' ? ' · ' + c.pillSaidPaid : '')) + '</span></span>'
      + '<span class="pill ' + esc(ORDER_TONE[o.status] || '') + '">'
      + esc(c['st' + o.status[0].toUpperCase() + o.status.slice(1)] || o.status) + '</span>'
      + icon('chev') + '</li>').join('') + '</ul>');
    wireSteppers(box);
  };
  await draw();
  onLeave(live.subscribe('orders', draw));
});

// ---------------------------------------------------------------------
//  The cart badge, kept right from one place.
// ---------------------------------------------------------------------
async function syncBadge(){
  const lines = await cart.lines();
  setCartCount(lines.reduce((n, l) => n + l.qty, 0));
}
live.subscribe('cart', () => { syncBadge(); repaint(); });
syncBadge();
