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

import { T, TXT, t, setLang, getLang, bootLang, LANGS, LANG_NAMES } from './i18n.js';
import { icon } from './icons.js';

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
  'shop', 'cat', 'find', 'cart', 'slot', 'addr', 'done', 'track', 'orders',
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
export function setRole(r, firstRun){
  if (!HOME[r]) return;
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
  drawTabs();
  repaint();
}

export function pickLang(code){
  setLang(code);
  paint();
}

export function langSeg(){
  return '<div class="seg" id="langseg" role="group">'
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

  $('roleseg').onclick = (e) => {
    const b = e.target.closest('button[data-role]');
    if (b) setRole(b.dataset.role);
  };

  $('tabs').onclick = (e) => {
    const b = e.target.closest('button[data-go]');
    if (b) show(b.dataset.go, false);
  };

  let r = 'customer';
  try { r = sessionStorage.getItem('kirana.role') || 'customer'; } catch {}
  setRole(HOME[r] ? r : 'customer', true);
  paint();
}
