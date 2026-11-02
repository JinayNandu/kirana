// =====================================================================
//  settings.js -- language, and what this thing is.
// =====================================================================

import { $, esc, mount, show, registerScreen, langSeg, pickLang, h1,
         theRole, lockStore } from './ui.js';
import { gated, passed } from './lock.js';
import { t, getLang } from './i18n.js';
import { ready } from './store.js';
import { icon } from './icons.js';

registerScreen('set', async () => {
  const c = t();
  const box = $('s-set');
  const d = await ready();
  const store = d.shop;

  mount(box, h1(c.setTitle)
    + '<h2>' + esc(c.setLang) + '</h2>'
    + langSeg()
    + '<hr class="rule">'
    + '<h2>' + esc(c.setAbout) + '</h2>'
    + '<div class="card">'
    +   '<p><b>' + esc(store.name[getLang()] || store.name.en) + '</b></p>'
    +   '<p class="hint">' + esc(store.addr[getLang()] || store.addr.en) + '</p>'
    +   '<p><a href="tel:' + esc(store.phone) + '">' + icon('phone') + esc(store.phone) + '</a></p>'
    + '</div>'
    + '<p class="sub">' + esc(c.aboutBody) + '</p>'

    // The pack shots are other people's photographs under a share-alike
    // licence, so naming the source is a CONDITION of using them, not a
    // courtesy. It is one line and it sits on a screen nobody has to
    // read, which is the right weight for it.
    + '<p class="sub tiny">' + esc(c.photoCredit)
    +   ' <a href="https://openfoodfacts.org" target="_blank" rel="noopener">'
    +   'openfoodfacts.org</a></p>'

    // The address book, reachable outside a checkout. Same screen as
    // the one mid-order -- with no run picked it has no Place order
    // button, which is the only difference between "where should this
    // go" and "the addresses I have saved".
    + (theRole() === 'customer'
        ? '<hr class="rule">'
          + '<h2>' + esc(c.addrBook) + '</h2>'
          + '<p class="sub">' + esc(c.addrBookSub) + '</p>'
          + '<button type="button" class="btn ghost" id="gobook">'
            + esc(c.addrBookBtn) + '</button>'
        : '')

    // Everything this app knows lives in this browser, so a reset is
    // the only "log out" there is -- and demoing the same flow twice
    // needs it.
    + '<hr class="rule">'
    + '<h2>' + esc(c.resetTitle) + '</h2>'
    + '<p class="sub">' + esc(c.resetSub) + '</p>'
    + '<button type="button" class="btn ghost danger" id="wipe">'
      + esc(c.resetBtn) + '</button>');

  const book = $('gobook');
  if (book) book.onclick = () => show('addr');

  const off = $('lockoff');
  if (off) off.onclick = () => lockStore();

  let armed = false;
  const wipe = $('wipe');
  wipe.onclick = () => {
    // Two taps, because it cannot be undone and the button sits one
    // scroll below a language switch.
    if (!armed){
      armed = true;
      wipe.textContent = c.resetConfirm;
      wipe.classList.add('arm');
      setTimeout(() => {
        if (!armed) return;
        armed = false;
        wipe.textContent = c.resetBtn;
        wipe.classList.remove('arm');
      }, 4000);
      return;
    }
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    location.reload();
  };

  const seg = $('langseg');
  if (seg) seg.onclick = (e) => {
    const b = e.target.closest('button[data-lang]');
    if (b) pickLang(b.dataset.lang);
  };
});
