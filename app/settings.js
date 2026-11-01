// =====================================================================
//  settings.js -- language, and what this thing is.
// =====================================================================

import { $, esc, mount, registerScreen, langSeg, pickLang, h1 } from './ui.js';
import { t, getLang } from './i18n.js';
import { ready } from './store.js';
import { icon } from './icons.js';
import { GEO } from './config.js';
import { status as geoStatus } from './geo.js';

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
    +   'openfoodfacts.org</a><br>' + esc(GEO.attribution) + '</p>'

    // Says plainly whether this device can share a location, so that
    // "the location button did nothing" is answerable by looking
    // rather than by guessing. It reports what the browser says, not
    // what the app hopes.
    + '<p class="sub tiny">' + esc(c.locStatus) + ': '
    +   esc(geoStatus().why === 'ok' ? c.locOn : c.locOff) + '</p>'

    // Everything this app knows lives in this browser, so a reset is
    // the only "log out" there is -- and demoing the same flow twice
    // needs it.
    + '<hr class="rule">'
    + '<h2>' + esc(c.resetTitle) + '</h2>'
    + '<p class="sub">' + esc(c.resetSub) + '</p>'
    + '<button type="button" class="btn ghost danger" id="wipe">'
      + esc(c.resetBtn) + '</button>');

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
