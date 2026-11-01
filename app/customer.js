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

import {
  $, esc, mount, show, registerScreen, repaint, onLeave, toast,
  setCartCount, clearNav, h1, sub, empty,
} from './ui.js';
import { t, f, getLang } from './i18n.js';
import { icon } from './icons.js';
import { ready, catalog, cart, runs, orders, profile, live } from './store.js';
import { payBlock, drawQR, wirePay } from './pay.js';
import { why as geoWhy, detect as geoDetect } from './geo.js';
import {
  rupees, packLabel, fmtTime, mins, fmtDay, istDate, istMins,
  minsToCutoff, fmtSoon, windowOf, ORDER_TONE,
} from './domain.js';

const S = { catId: null, q: '', runId: null, orderId: null, coupErr: false };

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
      ? '<img class="pshot" src="./img/' + esc(p.id) + '.jpg" alt=""'
        + ' decoding="async" onload="this.classList.add(\'on\')"'
        + ' onerror="this.remove()">'
      : '')
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

function productRow(p, qty){
  const off = p.mrp - p.price;
  return '<li class="prow">' + ptile(p)
    + '<span class="pbody">'
    +   '<span class="pname">' + esc(pname(p)) + '</span>'
    +   '<span class="ppack hint">' + esc(packLabel(p.pack, t())) + '</span>'
    +   '<span class="pprice"><b class="mono">' + esc(rupees(p.price)) + '</b>'
    +     (off > 0 ? '<s class="mono hint">' + esc(rupees(p.mrp)) + '</s>'
                   + '<span class="pill leaf">' + esc(f(t().offMrp, { s: rupees(off) })) + '</span>' : '')
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

async function productList(list){
  const q = await qtyMap();
  if (!list.length) return '';
  return '<ul class="plist">' + list.map((p) => productRow(p, q[p.id] || 0)).join('') + '</ul>';
}

// A line of what was ordered, for the confirmation and tracking
// screens. Reading back what you just bought is the whole point of a
// receipt, and the order-placed screen had been showing only a total.
const orderLines = (o, c) =>
  '<ul class="plist flat">' + o.lines.map((l) =>
    '<li class="lrow"><span class="mono lq">' + esc(String(l.qty)) + '</span>'
    + '<span>' + esc(l.nameEn) + '<span class="hint"> · '
    + esc(packLabel(l.pack, c)) + '</span></span>'
    + '<span class="mono">' + esc(rupees(l.lineTotal)) + '</span></li>').join('')
  + '</ul>';

// A compact card for the suggestion strips. Horizontal, because the
// cart screen's job is the total and the button -- a vertical list of
// add-ons would push both off the page.
function railCard(p){
  return '<li class="scard">'
    + ptile(p)
    + '<span class="sname">' + esc(pname(p)) + '</span>'
    + '<span class="spack hint">' + esc(packLabel(p.pack, t())) + '</span>'
    + '<span class="sbuy"><b class="mono">' + esc(rupees(p.price)) + '</b>'
    +   '<button type="button" class="btn small ghost" data-add="' + esc(p.id) + '">'
    +     esc(t().add) + '</button></span>'
    + '</li>';
}

const rail = (title, list) => list.length
  ? '<h2 class="railhead">' + esc(title) + '</h2>'
    + '<ul class="srail">' + list.map(railCard).join('') + '</ul>'
  : '';

const row = (l, r, tone, raw) =>
  '<p class="trow' + (tone ? ' ' + tone : '') + '">'
  + '<span>' + (raw ? l : esc(l)) + '</span>'
  + '<span class="mono">' + (raw ? r : esc(r)) + '</span></p>';

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
  const left = minsToCutoff(r, today, istMins());
  const soon = fmtSoon(left, c);
  return '<div class="banner">'
    + '<p class="bhead">' + icon('truck') + '<span>' + esc(c.freeDelivery) + '</span></p>'
    + '<p class="bline"><b>' + esc(f(c.nextSlotHead,
        { s: fmtDay(r.date, today, c).toLowerCase() + ' ' + windowOf(r) })) + '</b></p>'
    + '<p class="bline hint">' + esc(c.anywhere) + '</p>'
    + (soon ? '<p class="bline"><span class="pill spice">'
        + esc(f(c.closesIn, { s: soon })) + '</span></p>' : '')
    + '</div>';
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
    + rail(c.buyAgain, await orders.againItems(10))
    + '<h2>' + esc(c.catsHead) + '</h2>'
    + '<div class="cgrid">' + cats.map((cat) =>
        // Same arrangement as a product tile: the glyph is always
        // drawn and the photograph sits over it, so a category whose
        // hero has no picture simply keeps the drawing.
        '<button type="button" class="ccard" data-cat="' + esc(cat.id) + '">'
        + '<span class="ctile">' + icon(cat.tile)
        +   (cat.hero
              ? '<img class="cshot" src="./img/' + esc(cat.hero) + '.jpg" alt=""'
                + ' decoding="async" onload="this.classList.add(\'on\')"'
                + ' onerror="this.remove()">'
              : '')
        + '</span>'
        + '<span>' + esc(cname(cat)) + '</span></button>').join('')
      + '</div>');

  wireSteppers(box);

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
  mount(box, h1(cname(cat)) + sub(f(t().nItems, { n: list.length })) + await productList(list));
  wireSteppers(box);
});

registerScreen('find', async () => {
  const c = t();
  const box = $('s-find');
  const list = await catalog.search(S.q, getLang());
  mount(box,
    '<div class="searchbar">' + icon('search')
      + '<input id="q2" class="field" type="search" value="' + esc(S.q) + '">'
      + '</div>'
    + (list.length
        ? sub(f(c.nItems, { n: list.length })) + await productList(list)
        : empty(f(c.noResults, { s: S.q }), c.noResultsSub)));
  wireSteppers(box);
  const q2 = $('q2');
  q2.oninput = () => { S.q = q2.value.trim(); if (S.q.length >= 2) repaint(); };
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
    + rail(c.goesWith, await catalog.suggest(8))
    + rail(c.buyAgain, await orders.againItems(8))

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
    +   row(c.itemsTotal, rupees(tot.items))
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

    const left = minsToCutoff(r, today, istMins());
    const soon = fmtSoon(left, c);
    const sel = S.runId === r.id;

    cards.push('<button type="button" class="card slot' + (sel ? ' on' : '')
      + (r.full ? ' full' : '') + '" data-run="' + esc(r.id) + '"'
      + (r.full ? ' disabled' : '') + '>'
      + '<span class="srow1"><b>' + esc(c[r.label] || r.label) + '</b>'
      +   '<span class="mono win">' + esc(windowOf(r)) + '</span></span>'
      + '<span class="srow3 hint">' + esc(f(c.orderByTime, { s: fmtTime(mins(r.cutoff)) })) + '</span>'
      + '<span class="srow4">'
      +   (r.full ? '<span class="pill bad">' + esc(c.runFull) + '</span>'
                  : (soon ? '<span class="pill spice">' + esc(f(c.closesIn, { s: soon })) + '</span>' : ''))
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
registerScreen('addr', async () => {
  const c = t();
  const box = $('s-addr');
  const me = (await profile.get()) || {};

  const field = (id, label, req, ph, val, type) =>
    '<div class="fset">' + lbl(id, label, req)
    + '<input id="' + esc(id) + '" class="field"'
    + (type ? ' type="' + esc(type) + '"' : '')
    + (ph ? ' placeholder="' + esc(ph) + '"' : '')
    + ' value="' + esc(val || '') + '"></div>';

  mount(box, h1(c.addrTitle)
    + '<p class="sub">' + esc(c.anywhere) + '</p>'
    // Above the fields, not below them, because that is the order it
    // is used in: tap this first, then fill in the parts no map can
    // know. Underneath, it reads as an afterthought for a form you
    // have already finished typing.
    + '<div class="fset locbox">'
    +   '<button type="button" class="btn ghost" id="useloc">'
    +     icon('pin') + '<span>' + esc(c.useLoc) + '</span></button>'
    +   '<p class="hint" id="lochint">' + esc(c.useLocHint) + '</p>'
    + '</div>'
    + field('fname',  c.fName,     true,  '',            me.name,  'text')
    + field('fphone', c.fPhone,    true,  '',            me.phone, 'tel')
    + field('fflat',  c.fFlat,     true,  c.phFlat2,     me.flat)
    + field('fsoc',   c.fSociety,  true,  c.phSociety,   me.society)
    + field('farea',  c.fArea,     true,  c.phArea2,     me.area)
    + field('fmark',  c.fLandmark, false, c.phLandmark,  me.landmark)

    + '<p id="aerr" class="ferr" hidden></p>'
    + '<button type="button" class="btn" id="place">' + esc(c.placeOrder) + '</button>');

  // Coordinates fill in the parts a map can know -- the street, and a
  // named landmark if OSM has one. Flat, building, name and phone are
  // not on any map and stay the customer's to type, which is why the
  // button says what it will and will not do before it is pressed.
  //
  // The button is ALWAYS drawn, and says what is stopping it when
  // something is. It was hidden where the embedding page forbids
  // geolocation, which was tidy and wrong: the first person to go
  // looking for the feature asked why it was missing. An absent
  // control teaches nobody anything, and on a demo it looks like the
  // feature was never built. So the check moved from render time to
  // press time, where it has a sentence to put on the screen.
  let gotLL = null;
  const loc = $('useloc');
  if (loc) loc.onclick = async () => {
    const hint = $('lochint');

    // Why it cannot run, before trying and failing with something
    // vague. `blocked` is the one that matters here: the browser
    // refuses geolocation to an embedded page, so this is what a
    // preview says, and the same code needs no change at all once the
    // app sits on the shop's own web address.
    const stop = geoWhy();
    if (stop !== 'ok'){
      hint.textContent = stop === 'nosupport' ? c.locNoSupport : c.locBlocked;
      hint.classList.add('ferr');
      return;
    }

    loc.disabled = true;
    loc.querySelector('span').textContent = c.useLocBusy;
    hint.classList.remove('ferr');
    hint.textContent = c.useLocHint;
    try {
      const g = await geoDetect();
      gotLL = g.ll;

      // Only ever fills an EMPTY field. Someone who has already typed
      // their street should not have it replaced by the geocoder's
      // idea of it, and that is doubly true here: OSM labels several
      // points in Borivali West as Dahisar or Borivali East, because
      // S.V. Road is the ward boundary and the geocoder snaps to it.
      const fill = (id, val) => {
        if (!val) return false;
        const el = $(id);
        if (el.value.trim()) return false;
        el.value = val;
        return true;
      };
      // The STREET and the postcode only -- never the suburb, and this
      // is not caution, it is measured. Reverse-geocoding the shop's
      // own coordinates returns "Dahisar West" for an address that is
      // plainly Borivali West, because S.V. Road is the ward boundary
      // and the geocoder snaps to it. A wrong locality on a delivery
      // address is worse than an empty one the customer fills in, so a
      // point with no street reports finding nothing rather than
      // offering the suburb as a consolation.
      if (!g.street) throw new Error('nothing');
      fill('farea', g.street);
      fill('fmark', g.landmark);

      hint.textContent = f(c.locFound,
        { s: [g.street, g.postcode].filter(Boolean).join(', ') });
    } catch (err){
      const msg = {
        denied: c.locDenied, unavailable: c.locUnavailable,
        timeout: c.locTimeout, lookup: c.locLookup, nothing: c.locNothing,
      }[err && err.message] || c.locUnavailable;
      hint.textContent = msg;
      hint.classList.add('ferr');
    } finally {
      loc.disabled = false;
      loc.querySelector('span').textContent = c.useLoc;
    }
  };

  $('place').onclick = async () => {
    const v = (id) => $(id).value.trim();
    const name = v('fname'), phone = v('fphone').replace(/\D/g, '');
    const flat = v('fflat'), society = v('fsoc'), area = v('farea');

    for (const [el, ok, msg] of [
      ['fname', name.length > 0,             c.errName],
      ['fphone', /^[6-9]\d{9}$/.test(phone), c.errPhone],
      ['fflat', flat.length > 0,             c.errFlat],
      ['fsoc',  society.length > 0,          c.errSociety],
      ['farea', area.length > 0,             c.errArea2],
    ]){
      $(el).classList.toggle('bad', !ok);
      if (!ok){ fieldErr(el, msg); return; }
    }
    $('aerr').hidden = true;

    try {
      const o = await orders.place({
        runId: S.runId, name, phone, flat, society, area,
        landmark: v('fmark'),
        // `customer.ll` has been in the order shape all along, always
        // null since the first location button was removed. It carries
        // coordinates again when the customer offered them -- the
        // Store screens already handle either.
        ll: gotLL,
      });
      S.orderId = o.id;
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
  };
});

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
      +   row(c.itemsTotal, rupees(o.itemsTotal))
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
        + ' <span class="pill ' + (o.paid ? 'leaf' : '') + '">'
        + esc(o.paid ? c.payDone : c.payUnpaid) + '</span></p>'

      + '<div class="card">'
      +   '<p class="trow"><span>' + esc(c.arriveBetween.replace('{s}', '').trim()) + '</span>'
      +     '<span class="mono">' + esc(windowOf(run)) + '</span></p>'
      +   '<p class="trow"><span>' + esc(fmtDay(run.date, istDate(), c)) + '</span>'
      +     '<span class="hint">' + esc(c.freeAlways) + '</span></p>'
      +   (run.status === 'open' || run.status === 'cutoff'
            ? '<p class="hint">' + esc(c.notLeftYet) + '</p>' : '')
      + '</div>'

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
      + '<button type="button" class="btn ghost" id="again">'
        + esc(c.reorder) + '</button>'

      + '<a class="btn ghost" href="tel:' + esc(d.shop.phone) + '">' + esc(c.callShop) + '</a>');

    drawQR('trackqr', d.upi, o);
    wirePay(box, o, orders);
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
          + (o.paid ? ' · ' + c.payDone : '')) + '</span></span>'
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
