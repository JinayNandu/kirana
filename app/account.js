// =====================================================================
//  account.js -- who the customer is, and the standing offer to say so.
//
//  Three things live here, and they are one feature:
//
//    the pill      always up on the storefront, bottom right
//    the card      what the pill opens once there is a name to show
//    the overlay   email, then a six-digit code
//
//  NOBODY IS EVER MADE TO DO THIS. Every visitor already has a
//  session, anonymously, from app.js -- they can browse, save
//  addresses and place orders without ever touching any of it. What
//  signing in buys is that those addresses stop being tied to one
//  phone. A login wall in front of a shop is how a shop loses the
//  customer at the door, so there is no wall anywhere in this file:
//  an offer on the storefront, the same offer at checkout where it is
//  about an address being typed right now, and nothing else.
//
//  It imports ui.js and is imported BY app.js and the role modules --
//  never the other way round, so the graph stays a tree.
// =====================================================================

import { $, esc, show, toast, repaint, onPaint,
         registerOverlay } from './ui.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { session, shared } from './store.js';

// The answer to whoami(), held rather than re-asked. The pill redraws
// on every language change and every screen paint; a network round
// trip on each of those would be a request per keystroke in the search
// box. Refreshed explicitly at the two moments it can change.
let me = null;
let known = false;      // has whoami() answered even once?

export const who = () => me;
// Null while the answer is still outstanding, which is NOT the same as
// "signed out" -- a caller that treats it as such draws the offer and
// then takes it away a moment later.
export const isGuest = () => (known ? !!(me && me.guest) : null);

const label = (u) => u.name
  || (u.email ? u.email.split('@')[0] : '');

// ---------------------------------------------------------------------
//  The pill
// ---------------------------------------------------------------------
function drawPill(){
  const el = $('acct');
  if (!el) return;

  // Nothing to sign in to on the local backend, where an account would
  // be an account on one phone -- which is exactly what the address
  // book already is. Hidden until whoami() has answered, so the
  // signed-out offer never flashes in front of somebody who is in.
  if (!shared() || !known){
    el.hidden = true;
    delete document.body.dataset.acct;
    return;
  }

  const c = t();
  const guest = !me || me.guest;
  el.hidden = false;
  el.classList.toggle('in', !guest);
  document.body.dataset.acct = '1';

  const av = $('acctav');
  const name = guest ? '' : label(me);
  // A letter beats a generic silhouette the moment there IS a name --
  // it is the shortest true thing the app can say about who you are.
  av.textContent = '';
  if (guest) av.innerHTML = icon('user');
  else av.textContent = (name.charAt(0) || '?').toUpperCase();

  $('acctlab').textContent = c.acctCta;
  $('acctbtn').setAttribute('aria-label', guest ? c.acctCta : c.acctTitle);
}

// ---------------------------------------------------------------------
//  The card -- what the pill opens once there is a name
// ---------------------------------------------------------------------
let cardOpen = false;

function cardDraw(){
  if (!cardOpen || !me) return;
  const c = t();
  const nm = label(me);
  $('accav').textContent = (nm.charAt(0) || '?').toUpperCase();
  $('acch').textContent = me.email || nm;
  $('accsub').textContent = c.acctInSub;
  $('accbook').textContent = c.addrBook;
  $('accout').textContent = c.acctOut;
}

function cardShow(){ cardOpen = true; $('acctcard').hidden = false; cardDraw(); }
function cardHide(){ cardOpen = false; $('acctcard').hidden = true; }

// ---------------------------------------------------------------------
//  The overlay
//
//  Nothing in here is ever rebuilt. The email and code fields live
//  inside it, and an input must never sit in a region its own handler
//  repaints -- that is what cost this app its search keyboard. Only
//  textContent is written, into nodes that already exist in
//  index.html.
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

export function siShow(){
  cardHide();
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
    // The cache first, THEN the screen. A repaint off a stale `me`
    // redraws the checkout offer to somebody who has just accepted it.
    await refresh();
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

// ---------------------------------------------------------------------
//  Wiring, once
// ---------------------------------------------------------------------
export async function refresh(){
  if (!shared()){ known = true; drawPill(); return null; }
  try { me = await session.whoami(); }
  catch (e){ console.warn('whoami', e); me = null; }
  known = true;
  drawPill();
  return me;
}

export function start(){
  $('acctbtn').onclick = () => {
    // Signed out, the pill IS the offer -- opening a card first to
    // explain it would be an extra tap in front of a one-tap thing.
    if (!me || me.guest) siShow();
    else cardShow();
  };
  $('acctcard').onmousedown = (e) => {
    if (e.target === $('acctcard')) cardHide();
  };
  $('accbook').onclick = () => { cardHide(); show('addr'); };
  $('accout').onclick = async () => {
    cardHide();
    await session.signOut();
    await refresh();
    toast(t().acctOutDone);
    repaint();
  };

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

  registerOverlay(() => siOpen, siHide);
  registerOverlay(() => cardOpen, cardHide);

  // The pill and the card carry words, so they redraw with everything
  // else when the language changes.
  onPaint(() => { drawPill(); cardDraw(); });

  return refresh();
}

// ---------------------------------------------------------------------
//  The offer at checkout
//
//  A card, not a gate: the order goes through either way and the copy
//  says so. It is here rather than earlier because this is the one
//  moment the offer is about something concrete -- THIS address, being
//  typed now, which nobody wants to type twice.
// ---------------------------------------------------------------------
export function offerHtml(c){
  if (!shared() || isGuest() !== true) return '';
  return '<div class="sioffer">'
    + '<p>' + esc(c.acctSaveTitle) + '</p>'
    + '<p class="hint">' + esc(c.acctSaveSub) + '</p>'
    + '<button type="button" class="btn ghost" id="sioffergo">'
      + esc(c.acctGuestBtn) + '</button>'
    + '</div>';
}

export function offerWire(){
  const b = $('sioffergo');
  if (b) b.onclick = () => siShow();
}
