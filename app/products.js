// =====================================================================
//  products.js -- the shop changes its own catalogue.
//
//  Screens: prods (every product, searchable) and pedit (one product,
//  or a new one).
//
//  The shop opens this to do one of two things -- change what
//  something costs, or put something new on the shelf -- and both are
//  a search and a form. Every write goes through catalog.save(), which
//  checks what the form sent the same way in both backends.
//
//  Behind the Store gate, like the board: these screens exist only in
//  the shop role, and the database refuses a write from any session
//  that has not typed the Store code (is_staff(), db/products.sql).
// =====================================================================

import {
  $, esc, mount, show, goBack, registerScreen, onLeave, toast, h1,
} from './ui.js';
import { t, f, getLang, LANG_NAMES } from './i18n.js';
import { icon } from './icons.js';
import { catalog, live, shared } from './store.js';
import { rupees, packLabel, PACK_UNITS } from './domain.js';
import { pname, ptile } from './customer.js';

const S = { pid: null, q: '', photo: null, preview: null };

const cname = (c) => c.name[getLang()] || c.name.en;
const UNIT_KEY = { g: 'unitG', kg: 'unitKg', ml: 'unitMl', l: 'unitL',
                   pc: 'unitPc', pkt: 'unitPkt', dozen: 'unitDozen' };

// The same label as every other form here: an asterisk for required,
// the word for optional, never one marked and the next one silent.
const lab = (id, text, req) =>
  '<label for="' + esc(id) + '">' + esc(text)
  + (req ? '<span class="req" aria-hidden="true">*</span><span class="sr">required</span>'
         : '<span class="opt">' + esc(t().optionalTag) + '</span>')
  + '</label>';

const field = (id, text, req, val, attrs) =>
  '<div class="fset">' + lab(id, text, req)
  + '<input id="' + esc(id) + '" class="field"' + (attrs || '')
  + ' value="' + esc(val == null ? '' : val) + '"></div>';

const opt = (v, text, on) =>
  '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(text) + '</option>';

// A phone photo is 3-12 MB. It is shrunk HERE, to 800px on the long
// side and a JPEG of roughly 100 KB, before it goes anywhere: a shelf
// tile is 64px, and anything bigger is spent from a customer's data.
async function shrink(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('PHOTO'));
      i.src = url;
    });
    const k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    // JPEG has no transparency, so a PNG's clear background would turn
    // black. Painted with the paper every pack shot already sits on.
    g.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--shot-paper').trim();
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    return await new Promise((res, rej) =>
      cv.toBlob((b) => (b ? res(b) : rej(new Error('PHOTO'))), 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The big tile on the form: the new photo if one was just chosen,
// otherwise the product's own, otherwise its glyph.
function bigTile(p, src){
  const s = src || (p && p.img ? p.src : null);
  return '<span class="ptile pbig' + (s ? ' shot' : '') + '">'
    + icon(p ? p.tile : 'box')
    + (s ? '<img class="pshot on" src="' + esc(s) + '" alt="">' : '')
    + '</span>';
}

// ---------------------------------------------------------------------
//  s-prods -- every product, in shelf order.
//
//  The search field is mounted ONCE and only the list under it is
//  redrawn. An input inside the region its own handler repaints loses
//  the keyboard on every keystroke -- the customer's search did exactly
//  that until it was fixed (CLAUDE.md, "The search box kept losing the
//  keyboard").
// ---------------------------------------------------------------------
registerScreen('prods', async () => {
  const c = t();
  const box = $('s-prods');
  mount(box, h1(c.tabProducts)
    + '<div id="prodnote"></div>'
    + '<button type="button" class="btn" id="padd">' + icon('plus') + esc(c.prodAdd) + '</button>'
    + '<div class="fset">'
    +   '<label for="pq" class="sr">' + esc(c.prodSearch) + '</label>'
    +   '<input id="pq" class="field" type="search" autocomplete="off"'
    +     ' placeholder="' + esc(c.prodSearch) + '" value="' + esc(S.q) + '">'
    + '</div>'
    + '<p class="sub" id="pcount"></p>'
    + '<ul class="plist" id="plist"></ul>');

  // Said, not hidden: an editor that saves nowhere useful has to say
  // so before anybody spends ten minutes typing prices into it.
  const note = async () => {
    const st = await catalog.editsState();
    mount($('prodnote'), !shared()
      ? '<p class="hint pnote">' + esc(c.prodLocal) + '</p>'
      : st === 'missing'
        ? '<div class="card nostaff"><p>' + esc(c.prodSetup) + '</p></div>'
        : '');
  };

  const draw = async () => {
    const all = await catalog.storeList();
    const cats = await catalog.categories();
    const catName = Object.fromEntries(cats.map((x) => [x.id, cname(x)]));
    // Every word must match something, in any language -- the same rule
    // as the customer's search, so a word that finds it there finds it
    // here.
    const words = S.q.toLowerCase().split(/\s+/).filter(Boolean);
    const text = (p) => [p.id, p.brand, ...Object.values(p.name)].join(' ').toLowerCase();
    const list = words.length
      ? all.filter((p) => words.every((w) => text(p).includes(w))) : all;
    mount($('pcount'), esc(f(c.prodSub, { n: all.filter((p) => !p.hidden).length })));
    if (!list.length){
      mount($('plist'), '<li class="empty">' + esc(f(c.noResults, { s: S.q.trim() })) + '</li>');
      return;
    }
    let out = '';
    let last = null;
    for (const p of list){
      if (p.cat !== last){
        out += '<li class="pcat"><h2>' + esc(catName[p.cat] || p.cat) + '</h2></li>';
        last = p.cat;
      }
      out += '<li class="prow prodrow" data-pid="' + esc(p.id) + '">'
        + ptile(p)
        + '<span class="pbody"><span class="pname">' + esc(pname(p)) + '</span>'
        +   '<span class="hint">' + esc(packLabel(p.pack, c))
        +     (p.mrp > p.price ? ' · MRP ' + esc(rupees(p.mrp)) : '') + '</span>'
        +   (p.hidden
              ? '<span class="opills"><span class="pill bad">' + esc(c.prodOff) + '</span></span>'
              : !p.stock
                ? '<span class="opills"><span class="pill">' + esc(c.outOfStock) + '</span></span>'
                : '')
        + '</span>'
        + '<span class="pprice mono">' + esc(rupees(p.price)) + icon('chev') + '</span>'
        + '</li>';
    }
    mount($('plist'), out);
  };

  let timer = null;
  $('pq').oninput = (e) => {
    S.q = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(draw, 160);
  };
  $('padd').onclick = () => { S.pid = null; show('pedit'); };
  $('plist').onclick = (e) => {
    const li = e.target.closest('[data-pid]');
    if (!li) return;
    S.pid = li.dataset.pid;
    show('pedit');
  };

  await draw();
  await note();
  onLeave(live.subscribe('catalog', draw));
  onLeave(() => clearTimeout(timer));
  // Asked again on the way in, so the shop sees the database as it is
  // now rather than as it was when this page loaded. Not awaited: the
  // list is already on screen, and refresh() announces 'catalog' when
  // it has something newer.
  catalog.refresh().then(note).catch(() => {});
});

// ---------------------------------------------------------------------
//  s-pedit -- one product, or a new one. Nothing is written until Save.
// ---------------------------------------------------------------------
const PE_ERR = {
  NAME: 'peErrName', NOT_VEG: 'peErrVeg', SIZE: 'peErrSize', CAT: 'peErrCat',
  PRICE: 'peErrPrice', MRP: 'peErrPrice', NO_TABLE: 'peErrSetup',
  NOT_STAFF: 'peErrStaff', PHOTO: 'peErrPhoto', STORAGE_FULL: 'peErrPhoto',
};

registerScreen('pedit', async () => {
  const c = t();
  const box = $('s-pedit');
  const p = S.pid ? await catalog.byId(S.pid) : null;
  if (S.pid && !p){ goBack(); return; }
  const cats = await catalog.categories();
  const name = (p && p.name) || {};
  // A hidden product's stock reads 0 by design; what the shelf held
  // before it was taken off sale is in wasStock.
  const inStock = p ? (p.hidden ? p.wasStock : p.stock) > 0 : true;
  S.photo = null;

  mount(box, h1(p ? c.peEdit : c.prodAdd)
    + '<div class="pephoto">'
    +   '<span id="peprev">' + bigTile(p, null) + '</span>'
    +   '<label class="btn ghost" for="pefile">' + esc(c.pePhotoBtn) + '</label>'
    +   '<input id="pefile" type="file" accept="image/*" hidden>'
    + '</div>'
    + field('pe-name', c.peName, true, name.en, ' autocomplete="off"')
    + field('pe-brand', c.peBrand, false, p ? p.brand : '', ' autocomplete="off"')
    + '<div class="fset">' + lab('pe-n', c.peSize, true)
    +   '<div class="perow">'
    +     '<input id="pe-n" class="field" inputmode="decimal" autocomplete="off"'
    +       ' value="' + esc(p ? p.pack.n : '') + '">'
    +     '<select id="pe-u" class="field" aria-label="' + esc(c.peSize) + '">'
    +       PACK_UNITS.map((u) => opt(u, c[UNIT_KEY[u]] || u, p ? p.pack.u === u : u === 'g')).join('')
    +     '</select>'
    +   '</div></div>'
    + '<div class="fset">' + lab('pe-cat', c.peCat, true)
    +   '<select id="pe-cat" class="field">'
    +     (p ? '' : opt('', '-', true))
    +     cats.map((x) => opt(x.id, cname(x), p && p.cat === x.id)).join('')
    +   '</select></div>'
    + '<div class="perow">'
    +   field('pe-price', c.pePrice, true, p ? p.price : '', ' inputmode="numeric" autocomplete="off"')
    // The printed MRP, always, for a product that exists: it does not
    // move when the shop takes a rupee off, and an empty box here would
    // quietly drag it down to the new price.
    +   field('pe-mrp', c.peMrp, false, p ? p.mrp : '', ' inputmode="numeric" autocomplete="off"')
    + '</div>'
    + '<p class="hint">' + esc(c.peMrpHint) + '</p>'
    + '<div class="fset"><label>' + esc(c.peStock) + '</label>'
    +   '<div class="pair">'
    +     '<button type="button" class="btn ghost' + (inStock ? ' on' : '') + '" data-stock="1">'
    +       esc(c.peInStock) + '</button>'
    +     '<button type="button" class="btn ghost' + (inStock ? '' : ' on') + '" data-stock="0">'
    +       esc(c.outOfStock) + '</button>'
    +   '</div></div>'
    // Optional, and folded away: the shop types the name it knows, and
    // a customer reading in another language sees that name until
    // somebody adds theirs -- pname() falls back to English.
    + '<details class="fset pelangs"><summary>' + esc(c.peOther) + '</summary>'
    +   field('pe-hi', LANG_NAMES.hi, false, name.hi, ' autocomplete="off"')
    +   field('pe-gu', LANG_NAMES.gu, false, name.gu, ' autocomplete="off"')
    +   field('pe-mr', LANG_NAMES.mr, false, name.mr, ' autocomplete="off"')
    + '</details>'
    + '<p class="ferr" id="peerr" hidden></p>'
    + '<button type="button" class="btn" id="pesave">' + esc(c.save) + '</button>'
    + (p ? '<button type="button" class="btn ghost pehide" id="pehide">'
          + esc(p.hidden ? c.peShow : c.peHide) + '</button>' : ''));

  const showErr = (code) => {
    const el = $('peerr');
    if (!code){ el.hidden = true; return; }
    el.textContent = c[PE_ERR[code]] || c.peErrSave;
    el.hidden = false;
    el.scrollIntoView({ block: 'center' });
  };

  box.querySelector('.pair').onclick = (e) => {
    const b = e.target.closest('[data-stock]');
    if (!b) return;
    for (const x of box.querySelectorAll('[data-stock]')) x.classList.toggle('on', x === b);
  };

  $('pefile').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    showErr(null);
    try {
      S.photo = await shrink(file);
      if (S.preview) URL.revokeObjectURL(S.preview);
      S.preview = URL.createObjectURL(S.photo);
      mount($('peprev'), bigTile(p, S.preview));
    } catch (err){
      S.photo = null;
      showErr('PHOTO');
    }
  };

  const val = (id) => $(id).value;
  const gather = (hidden) => ({
    name: { en: val('pe-name'), hi: val('pe-hi'), gu: val('pe-gu'), mr: val('pe-mr') },
    brand: val('pe-brand'),
    packN: val('pe-n').trim().replace(',', '.'),
    packU: val('pe-u'),
    cat: val('pe-cat'),
    price: val('pe-price').trim(),
    mrp: val('pe-mrp').trim(),
    inStock: !!box.querySelector('[data-stock="1"].on'),
    hidden,
  });

  const save = async (btn, hidden) => {
    showErr(null);
    const was = btn.textContent;
    btn.disabled = true;
    btn.textContent = c.peSaving;
    try {
      await catalog.save(S.pid, gather(hidden), S.photo);
      S.photo = null;
      toast(hidden && !(p && p.hidden) ? c.prodOff : c.peSaved);
      goBack();
    } catch (err){
      btn.disabled = false;
      btn.textContent = was;
      showErr(String((err && err.message) || err));
    }
  };
  $('pesave').onclick = (e) => save(e.currentTarget, !!(p && p.hidden));
  const hb = $('pehide');
  if (hb) hb.onclick = (e) => save(e.currentTarget, !p.hidden);

  onLeave(() => {
    if (S.preview) URL.revokeObjectURL(S.preview);
    S.preview = null;
  });
});
