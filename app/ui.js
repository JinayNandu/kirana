// =====================================================================
//  ui.js -- the shell.
//
//  Owns the screen stack, the header, the tab bar and the toast.
//
//  IT MUST NEVER IMPORT customer.js OR shop.js. Those
//  import this, and register their screens into ENTER. A circular ES
//  module import hands you `undefined` for something that looks
//  hoisted and throws at render -- a bug no checker can see.
// =====================================================================

import { T, TXT, t, setLang, getLang, bootLang, LANGS,
         LANG_NAMES } from './i18n.js';
import { icon } from './icons.js';
import { gated, passed, stuck, tryCode, waiting, forget } from './lock.js';

export const $ = (id) => document.getElementById(id);

// Touches only & < > " -- braces are left alone on purpose, so a
// placeholder can be filled after escaping.
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const mount = (el, html) => { if (el) el.innerHTML = html; };

// ---------------------------------------------------------------------
//  Screens
// ---------------------------------------------------------------------
export const SCREENS = [
  'shop', 'cat', 'find', 'cart', 'slot', 'addr', 'aedit', 'done', 'track', 'orders',
  'board', 'run', 'pick', 'load',
  'set',
];

const HOME = { customer: 'shop', shop: 'board' };

// A stack PER ROLE. Switch to Store, open a picking list, switch back,
// and you land exactly where you left with your basket intact --
// and goBack() can never walk you across a role boundary, which is the
// most disorienting thing a role switch can do.
const NAV     = { customer: [], shop: [] };
const CURRENT = { customer: null, shop: null };

const ENTER = {};                      // screen -> draw fn, registered by role modules
export const registerScreen = (name, fn) => { ENTER[name] = fn; };

// Chrome that lives outside the screens and has to redraw when the
// language changes -- the account pill, so far. Same shape as
// registerScreen, and for the same reason: ui.js must never import
// the module that owns the thing it is drawing.
const PAINTERS = [];
export const onPaint = (fn) => { PAINTERS.push(fn); };

// Overlays take the back press and the Escape key BEFORE the screen
// stack does. Without that the screen behind one changes while it
// stays up, which is the single thing a modal must never allow.
// Each registers a pair -- is it open, and close it -- so there is
// exactly one place that decides, however many of them there are.
const OVERLAYS = [];
export const registerOverlay = (isOpen, close) => {
  OVERLAYS.push({ isOpen, close });
};
const overlayUp = () => OVERLAYS.find((o) => o.isOpen());

let role = 'customer';
let current = null;
let cleanups = [];

// A screen that subscribes to anything registers its undo here.
// Without this, subscriptions pile up and every event fires N times.
export const onLeave = (fn) => { cleanups.push(fn); };
function teardown(){
  for (const f of cleanups){ try { f(); } catch (e) { console.warn('cleanup', e); } }
  cleanups = [];
}

export const screen = () => current;
export const theRole = () => role;

export function show(name, push = true){
  if (!SCREENS.includes(name)) { console.warn('no such screen', name); return; }
  teardown();
  const home = HOME[role];
  if (name === home) NAV[role].length = 0;
  else if (push && current && current !== name) NAV[role].push(current);

  current = name;
  CURRENT[role] = name;
  for (const s of SCREENS){ const el = $('s-' + s); if (el) el.hidden = (s !== name); }
  $('backbtn').hidden = (name === home);

  drawTabs();
  window.scrollTo(0, 0);
  parkSync();
  const fn = ENTER[name];
  if (fn) { try { fn(); } catch (e) { console.error('draw ' + name, e); } }
}

// Redraw the screen already on show, without touching the stack.
export function repaint(){
  const fn = ENTER[current];
  if (!fn) return;
  const y = window.scrollY;
  try { fn(); } catch (e) { console.error('repaint ' + current, e); }
  window.scrollTo(0, y);
}

export function goBack(){
  const prev = NAV[role].pop();
  show(prev || HOME[role], false);
}

// Forget the trail for this role. Used after an order is placed: the
// screens behind it are a cart that is now empty and a form that has
// already been submitted, so back must mean the shop, not resubmit.
export function clearNav(){ NAV[role].length = 0; }

// ---------------------------------------------------------------------
//  The phone back gesture IS the header back button.
//
//  NAV is the app's own trail and the browser knows nothing about it,
//  so without this a back swipe leaves the app from any screen. Keep
//  EXACTLY ONE history entry parked above the page whenever we are not
//  at a role's home; back spends it and popstate walks our stack.
// ---------------------------------------------------------------------
let parked = false, ownPop = false;

function parkSync(){
  const needed = current !== HOME[role];
  if (needed && !parked){ history.pushState({ k: 1 }, ''); parked = true; }
  else if (!needed && parked){ ownPop = true; parked = false; history.back(); }
}

addEventListener('popstate', () => {
  if (ownPop){ ownPop = false; return; }   // our own spend, not the user's
  // A gate standing over a screen takes the back press. Without
  // this the screen behind it changes while the gate stays up, which
  // is the one thing a modal must never allow.
  const up = overlayUp();
  if (up){ up.close(); if (parked) history.pushState({ k: 1 }, ''); return; }
  parked = false;
  goBack();
});

// ---------------------------------------------------------------------
//  Roles
//
//  Role lives in sessionStorage, NOT localStorage -- it is per tab by
//  design. Two windows side by side, one Shop and one Store, is the
//  whole demo; a shared role would switch both at once.
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//  Two front doors, one document
//
//  A customer opening the plain link never sees the Store button. It
//  is a door they cannot open, and the only thing it can do for them
//  is invite a tap that ends at a code box. The shopkeeper opens the
//  link with ?store on it once, and the device remembers.
//
//  ⚠️ THIS IS NOT A LOCK, and nothing should ever be built on the
//  belief that it is. Same file, same JavaScript, and `?store` is
//  five characters anybody could guess or find in the source. What
//  keeps a stranger off the board is the six-digit code, and after
//  the Supabase swap the server refusing to hand them anybody's
//  orders. All this decides is whether a BUTTON is drawn.
//
//  `?store` and not `?shop`, deliberately: in this app "Shop" is the
//  CUSTOMER's half and "Store" is the staff half. Naming the link
//  after the wrong one is exactly how somebody hands the owner the
//  customer link and wonders why he cannot see his orders.
// ---------------------------------------------------------------------
const DOOR = 'kirana.storedoor';

function storeDoor(){
  let open = false;
  try { open = localStorage.getItem(DOOR) === '1'; } catch {}
  const asked = /(^|[?&])store(=|&|$)/.test(location.search);
  if (asked){
    open = true;
    try { localStorage.setItem(DOOR, '1'); } catch {}
  }
  // An attribute on the body, like data-locked and data-acct: the
  // CSS decides what that means, and no screen has to ask.
  if (open) document.body.setAttribute('data-store', '');
  else document.body.removeAttribute('data-store');
  return { open, asked };
}

export function setRole(r, firstRun){
  if (!HOME[r]) return;

  // The Store view is behind a code. The check sits HERE, on the one
  // road into the role, rather than on each of its four screens --
  // a gate per screen is a gate somebody forgets to add to the fifth.
  //
  // On a reload this is restoring a role, not answering a tap, so it
  // falls back to the storefront quietly instead of opening a gate
  // over a page nobody has asked anything of yet.
  if (r === 'shop' && !passed()){
    if (firstRun){ setRole('customer', true); return; }
    openLock();
    return;
  }
  if (!firstRun) CURRENT[role] = current;
  role = r;
  document.body.dataset.role = r;
  try { sessionStorage.setItem('kirana.role', r); } catch {}
  for (const b of $('roleseg').querySelectorAll('button')){
    b.setAttribute('aria-pressed', String(b.dataset.role === r));
  }
  show(CURRENT[r] || HOME[r], false);
}

// ---------------------------------------------------------------------
//  Tabs -- a different bar per role, so the screen says which role you
//  are in without anyone reading the header.
// ---------------------------------------------------------------------
const TABS = {
  customer: [
    { s: 'shop',   i: 'store',   k: 'tabShop' },
    { s: 'cart',   i: 'cart',    k: 'tabCart' },
    { s: 'orders', i: 'receipt', k: 'tabOrders' },
    { s: 'set',    i: 'globe',   k: 'setTitle' },
  ],
  shop: [
    { s: 'board', i: 'truck', k: 'tabRuns' },
    { s: 'set',   i: 'globe', k: 'setTitle' },
  ],
};

let cartCount = 0;
export const setCartCount = (n) => { cartCount = n | 0; drawTabs(); };

function drawTabs(){
  const c = t();
  mount($('trow'), TABS[role].map((tab) => {
    const on = current === tab.s;
    const badge = (tab.s === 'cart' && cartCount > 0)
      ? '<span class="tbadge">' + esc(String(cartCount)) + '</span>' : '';
    return '<button type="button" data-go="' + esc(tab.s) + '"'
      + (on ? ' aria-current="true"' : '') + '>'
      + icon(tab.i) + badge
      + '<span>' + esc(c[tab.k] || tab.k) + '</span></button>';
  }).join(''));
}

// ---------------------------------------------------------------------
//  The Store gate
//
//  An overlay, deliberately not a <section id="s-*">. A screen would
//  join the back stack, and a lock you can reach by pressing Back is
//  not a lock.
//
//  Nothing in here rebuilds the box's markup. The code field is inside
//  it, and an input must never sit in a region its own handler
//  repaints -- that is what cost this app its search keyboard. Only
//  textContent is written, into nodes that already exist.
// ---------------------------------------------------------------------
let lockOpen = false;
let waitTimer = null;

export const isLockOpen = () => lockOpen;

// The padlock beside "Store" in the header. Shown while this device
// is outside the gate, gone the moment it is through -- and it stays
// gone after a switch back to the storefront, because that device is
// still through.
function markLocked(){
  if (gated() && !passed()) document.body.dataset.locked = '1';
  else delete document.body.dataset.locked;
}

function lockErr(msg){
  const el = $('lockerr');
  el.textContent = msg || '';
  el.hidden = !msg;
}

export function drawLock(){
  if (!lockOpen) return;
  const c = t();
  $('lockic').innerHTML = icon('lock');
  $('lockh').textContent = c.lockTitle;
  $('locklab').textContent = c.lockLabel;
  $('lockgo').textContent = c.lockGo;
  $('lockx').textContent = c.close;

  // Served over plain http, where crypto.subtle does not exist and no
  // code can be checked at all. Say that, rather than showing a box
  // that cannot work -- "it does nothing when I type the code" is
  // otherwise an unanswerable complaint.
  const dead = stuck();
  $('locksub').textContent = dead ? c.lockStuck : c.lockSub;
  $('lockpin').hidden = dead;
  $('locklab').hidden = dead;
  $('lockgo').hidden = dead;
  if (dead) lockErr('');
}

function openLock(){
  lockOpen = true;
  $('lock').hidden = false;
  $('lockpin').value = '';
  lockErr('');
  drawLock();
  countdown();
  if (!stuck()) setTimeout(() => $('lockpin').focus(), 30);
}

export function closeLock(){
  lockOpen = false;
  clearTimeout(waitTimer);
  $('lock').hidden = true;
  $('lockpin').value = '';
  lockErr('');
}

// While the cool-off is running the button is dead and says how long
// is left. A disabled button with no reason on it reads as a bug.
function countdown(){
  clearTimeout(waitTimer);
  const left = waiting();
  const go = $('lockgo');
  if (!left){
    go.disabled = false;
    go.textContent = t().lockGo;
    return;
  }
  go.disabled = true;
  go.textContent = t().lockWait.replace('{n}', String(Math.ceil(left / 1000)));
  waitTimer = setTimeout(countdown, 1000);
}

async function submitLock(){
  const c = t();
  const field = $('lockpin');
  const code = (field.value || '').replace(/\D/g, '');
  if (waiting()) { lockErr(c.lockTooMany); countdown(); return; }
  if (code.length !== 6){ lockErr(c.lockShort); return; }

  // The derivation is deliberately slow, so the button has to say it
  // is working or the first tap reads as nothing happening.
  const go = $('lockgo');
  go.disabled = true;
  go.textContent = c.lockBusy;
  lockErr('');

  const r = await tryCode(code);

  if (r === 'ok'){
    closeLock();
    markLocked();
    setRole('shop');
    toast(c.lockOpened);
    return;
  }
  field.value = '';
  if (r === 'wait'){ lockErr(c.lockTooMany); countdown(); return; }
  if (r === 'stuck'){ drawLock(); return; }
  lockErr(c.lockWrong);
  countdown();
  field.focus();
}

function wireLock(){
  $('lockgo').onclick = submitLock;
  $('lockx').onclick = () => closeLock();

  // Tapping the dimmed area behind the box means "not this" -- but a
  // tap that STARTED inside the box and drifted out while selecting
  // does not, which is why this tests the target rather than using a
  // click handler on the backdrop alone.
  $('lock').onmousedown = (e) => { if (e.target === $('lock')) closeLock(); };

  const field = $('lockpin');
  field.oninput = () => {
    const clean = field.value.replace(/\D/g, '').slice(0, 6);
    if (clean !== field.value) field.value = clean;
    // Clearing the error on each keystroke is right EXCEPT during
    // the cool-off, where it would leave a dead button with nothing
    // beside it saying why.
    lockErr(waiting() ? t().lockTooMany : '');
    // Six digits is the whole code, so there is nothing left to
    // decide -- waiting for a button press here is one tap of
    // ceremony on something typed once in a device's life.
    if (clean.length === 6 && !waiting()) submitLock();
  };
  field.onkeydown = (e) => { if (e.key === 'Enter') submitLock(); };

  registerOverlay(() => lockOpen, closeLock);
}

// Settings calls this. Clearing the token is the only "sign out"
// there is, and it must drop the role as well -- leaving the Store
// view on screen after locking it would make the button a lie.
export function lockStore(){
  forget();
  markLocked();
  setRole('customer');
  toast(t().lockNow);
}

// ---------------------------------------------------------------------
//  Toast
// ---------------------------------------------------------------------
let toastTimer = null;
export function toast(msg){
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

// ---------------------------------------------------------------------
//  Language
// ---------------------------------------------------------------------
// The header carries the SHOP's name, not a product name -- this is
// one shop's app and "Kirana" above Milan's counter would be odd. It
// is set once the data has loaded and falls back to the generic name
// until then, and it is held rather than written so that a language
// switch repaints it in the right script.
let shopInfo = null, areaInfo = null;
export function setShop(shop, area){
  shopInfo = shop; areaInfo = area;
  paint();
}

export function paint(){
  const c = t();
  const lang = getLang();
  for (const [id, key] of Object.entries(TXT)){
    const el = $(id);
    if (el) el.textContent = c[key];
  }
  const name = shopInfo ? (shopInfo.name[lang] || shopInfo.name.en) : c.brand;
  const sub2 = areaInfo ? (areaInfo.name[lang] || areaInfo.name.en) : c.brandsub;
  const b = $('l-brand'); if (b) b.textContent = name;
  const bs = $('l-brandsub'); if (bs) bs.textContent = sub2;
  document.title = name;
  drawLangRow();
  drawTabs();
  drawLock();
  for (const f of PAINTERS){ try { f(); } catch (e) { console.warn('paint', e); } }
  repaint();
}

export function pickLang(code){
  setLang(code);
  paint();
}

// ---------------------------------------------------------------------
//  Choosing one, in the open
//
//  All three names, side by side, in a row of their own under the
//  header -- so they are on every screen and nothing has to be opened
//  to find out what the choices are.
//
//  This was a single button reading EN, and that was wrong twice
//  over. "EN" is not a word anybody recognises, and a chooser that
//  must be TAPPED to reveal its contents cannot be read by the one
//  person it exists for: somebody looking at an app in a script they
//  cannot read, who has to SEE मराठी to know it is on offer.
//
//  Each name stays in its own script for exactly that reason -- a
//  list that said "Marathi" in English would have the same problem
//  one level down.
// ---------------------------------------------------------------------
const drawLangRow = () => mount($('langrow'), langSeg());

function wireLang(){
  // Delegated to the ROW, which survives every redraw. The seg inside
  // it does not -- it is rebuilt on each paint, because which button
  // is pressed changes as you choose.
  $('langrow').onclick = (e) => {
    const b = e.target.closest('button[data-lang]');
    if (b) pickLang(b.dataset.lang);
  };
}

export function langSeg(){
  return '<div class="seg" id="langseg" role="group" aria-label="'
    + esc(t().setLang) + '">'
    + LANGS.map((code) =>
        '<button type="button" data-lang="' + esc(code) + '" aria-pressed="'
        + (getLang() === code ? 'true' : 'false') + '">'
        + esc(LANG_NAMES[code]) + '</button>').join('')
    + '</div>';
}

// ---------------------------------------------------------------------
//  Shared chrome used by every role module
// ---------------------------------------------------------------------
export const h1 = (s) => '<h1>' + esc(s) + '</h1>';
export const sub = (s) => '<p class="sub">' + esc(s) + '</p>';
export const empty = (head, body) =>
  '<div class="empty"><p><strong>' + esc(head) + '</strong></p>'
  + (body ? '<p class="hint">' + esc(body) + '</p>' : '') + '</div>';

// ---------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------
export function boot(){
  bootLang();

  // One delegated handler per box that CONTAINS its targets. A handler
  // bound to a sibling never fires and the feature is silently dead.
  $('backbtn').onclick = () => goBack();

  wireLock();
  markLocked();
  wireLang();

  // One Escape handler for every overlay, asked in registration
  // order. A listener per overlay closes all of them at once the
  // day two are ever up together.
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const up = overlayUp();
    if (up) up.close();
  });

  $('roleseg').onclick = (e) => {
    const b = e.target.closest('button[data-role]');
    if (b) setRole(b.dataset.role);
  };

  $('tabs').onclick = (e) => {
    const b = e.target.closest('button[data-go]');
    if (b) show(b.dataset.go, false);
  };

  const door = storeDoor();
  let r = 'customer';
  try { r = sessionStorage.getItem('kirana.role') || 'customer'; } catch {}
  // Arriving ON the staff link goes to the board, which means the
  // gate opens -- that is the whole point of the link. Otherwise
  // restore whatever this tab was last on, and never the Store view
  // on a device that has never been given the link.
  if (door.asked) r = 'shop';
  else if (!door.open) r = 'customer';
  // firstRun false on the staff link, so setRole() opens the code
  // box instead of falling back to the storefront quietly.
  setRole(HOME[r] ? r : 'customer', !door.asked);
  paint();
}
