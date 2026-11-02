// =====================================================================
//  settings.js -- language, and what this thing is.
// =====================================================================

import { $, esc, mount, show, registerScreen, langSeg, pickLang, h1,
         theRole, lockStore, toast, repaint } from './ui.js';
import { gated, passed } from './lock.js';
import { t, getLang } from './i18n.js';
import { ready, session, shared } from './store.js';
import { icon } from './icons.js';

registerScreen('set', async () => {
  const c = t();
  const box = $('s-set');
  const d = await ready();
  const store = d.shop;
  // Null on the local backend, where there is nobody to be.
  const me = shared() ? await session.whoami() : null;

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

    // Only where there is something to sign IN to. With no database
    // behind the app, an account would be an account on one phone,
    // which is what the address book already is.
    + (theRole() === 'customer' && shared()
        ? '<hr class="rule">'
          + '<h2>' + esc(c.acctTitle) + '</h2>'
          + (me && !me.guest
              ? '<div class="acct">' + icon('user')
                + '<span class="acctwho">'
                + esc(c.acctIn.replace('{s}', me.email || '')) + '</span></div>'
                + '<p class="sub">' + esc(c.acctInSub) + '</p>'
                + '<button type="button" class="btn ghost" id="signout">'
                  + esc(c.acctOut) + '</button>'
              : '<p class="sub">' + esc(c.acctGuest) + '</p>'
                + '<button type="button" class="btn ghost" id="dosignin">'
                  + esc(c.acctGuestBtn) + '</button>')
        : '')

    // Locking is only offered where it means something Same screen as
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

  siWire();
  const si = $('dosignin');
  if (si) si.onclick = () => siShow();
  const so = $('signout');
  if (so) so.onclick = async () => {
    await session.signOut();
    toast(t().acctOutDone);
    repaint();
  };

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

// ---------------------------------------------------------------------
//  Signing in
//
//  An overlay, for the same two reasons the Store gate is one: it has
//  steps that must not join the back stack, and it holds inputs. An
//  input must never sit inside a region its own handler repaints --
//  that is what cost this app its search keyboard -- so nothing in
//  here is ever rebuilt. Only textContent is written, into nodes that
//  already exist in index.html.
//
//  NOBODY IS MADE TO DO THIS. Every visitor already has a session,
//  anonymously, and can browse, save addresses and order without ever
//  seeing this box. What signing in buys is that those addresses stop
//  being tied to one phone. A login wall in front of a shop is how a
//  shop loses the customer at the door.
// ---------------------------------------------------------------------
let siOpen = false;
let siMode = null;     // 'link' when upgrading an anonymous user, else 'signin'
let siEmail = '';

const siErr = (msg) => {
  const el = $('sierr');
  el.textContent = msg || '';
  el.hidden = !msg;
};

function siDraw(){
  if (!siOpen) return;
  const c = t();
  $('siic').innerHTML = icon('user');
  $('six').textContent = c.close;
  const onCode = !$('sistep2').hidden;
  $('sih').textContent   = onCode ? c.siCodeTitle : c.siTitle;
  $('sisub').textContent = onCode
    ? c.siCodeSub.replace('{s}', siEmail)
    : c.siSub;
  $('silab').textContent     = c.siEmail;
  $('sicodelab').textContent = c.siCode;
  $('sigo').textContent = onCode ? c.siVerify : c.siSend;
}

function siShow(){
  siOpen = true;
  $('signin').hidden = false;
  $('sistep1').hidden = false;
  $('sistep2').hidden = true;
  $('siemail').value = '';
  $('sicode').value = '';
  siErr('');
  siDraw();
  setTimeout(() => $('siemail').focus(), 30);
}

function siHide(){
  siOpen = false;
  $('signin').hidden = true;
  $('siemail').value = '';
  $('sicode').value = '';
  siErr('');
}

async function siSubmit(){
  const c = t();
  const go = $('sigo');
  const onCode = !$('sistep2').hidden;

  if (!onCode){
    const email = $('siemail').value.trim();
    // Deliberately loose. A regex that tries to be clever about email
    // rejects addresses that are perfectly real; the only check worth
    // making here is that there is something either side of an @, and
    // the code either arrives or it does not.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ siErr(c.siBadEmail); return; }
    go.disabled = true;
    go.textContent = c.siSending;
    siErr('');
    try {
      const r = await session.sendCode(email);
      siMode = r.mode;
      siEmail = email;
      $('sistep1').hidden = true;
      $('sistep2').hidden = false;
      siDraw();
      setTimeout(() => $('sicode').focus(), 30);
    } catch (e){
      console.warn('sendCode', e);
      siErr(c.siFailed);
      siDraw();
    } finally {
      go.disabled = false;
    }
    return;
  }

  const code = $('sicode').value.replace(/\D/g, '');
  if (code.length !== 6){ siErr(c.siShortCode); return; }
  go.disabled = true;
  go.textContent = c.siVerifying;
  siErr('');
  try {
    await session.verifyCode(siEmail, code, siMode);
    siHide();
    toast(c.siDone);
    repaint();
  } catch (e){
    console.warn('verifyCode', e);
    $('sicode').value = '';
    siErr(c.siBadCode);
    siDraw();
    $('sicode').focus();
  } finally {
    go.disabled = false;
  }
}

function siWire(){
  if ($('sigo').dataset.wired) return;
  $('sigo').dataset.wired = '1';
  $('sigo').onclick = siSubmit;
  $('six').onclick = () => siHide();
  $('signin').onmousedown = (e) => { if (e.target === $('signin')) siHide(); };
  for (const id of ['siemail', 'sicode']){
    $(id).onkeydown = (e) => { if (e.key === 'Enter') siSubmit(); };
  }
  $('sicode').oninput = () => {
    const el = $('sicode');
    const clean = el.value.replace(/\D/g, '').slice(0, 6);
    if (clean !== el.value) el.value = clean;
    siErr('');
    // Six digits is the whole code. Waiting for a button press after
    // the last one is ceremony on something read off another screen.
    if (clean.length === 6) siSubmit();
  };
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && siOpen) siHide(); });
}
