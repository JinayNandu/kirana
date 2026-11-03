// =====================================================================
//  pay.js -- UPI by QR, or cash. No payment gateway.
//
//  The app does NOT take money. It renders the shop's UPI id as a QR
//  carrying the exact amount and the order code, and the customer
//  scans it with whatever UPI app they already use. Money goes from
//  their bank to the shop's: no gateway, no per-transaction fee, no
//  settlement delay, no card details anywhere near this code.
//
//  There is deliberately NO `upi://` deep-link button. It does nothing
//  at all on a desktop, and on a phone it hands off to an app that may
//  or may not be installed -- so it looked broken more often than it
//  worked. A QR works from any device with a camera and needs no
//  handoff.
//
//  WHAT IT CANNOT DO: know whether the payment happened. UPI sends no
//  callback to a static page. So the customer is asked to show the
//  payment screenshot at the door, and `paid` is a note somebody
//  makes -- never a fact the app observed.
// =====================================================================

import { esc, $, toast } from './ui.js';
import { t } from './i18n.js';

const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
let qrLoading = null;

function loadQR(){
  if (qrLoading) return qrLoading;
  if (window.QRCode) return (qrLoading = Promise.resolve(window.QRCode));
  qrLoading = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = () => (window.QRCode ? ok(window.QRCode) : no(new Error('qr-missing')));
    s.onerror = () => no(new Error('qr-cdn'));
    document.head.appendChild(s);
  });
  return qrLoading;
}

// Built by hand rather than with URLSearchParams, which encodes a
// space as "+" -- several UPI apps show that literally in the payee
// name and the note.
export function upiPayload(upi, amount, code){
  if (!upi || !upi.vpa) return null;
  const q = (k, v) => k + '=' + encodeURIComponent(v);
  return 'upi://pay?' + [
    q('pa', upi.vpa),
    q('pn', upi.payeeName || ''),
    q('am', String(Math.round(amount))),
    q('cu', 'INR'),
    q('tn', code ? 'Order ' + code : ''),
  ].join('&');
}

export function payBlock(upi, order, c, opts){
  const o = opts || {};
  const can = !!(upi && upi.vpa);

  if (order.paid){
    return '<div class="card paybox ispaid">'
      + '<p><b>' + esc(c.payDone) + '</b></p>'
      + '<p class="hint">' + esc(c.payDoneSub) + '</p></div>';
  }

  // SAID they have paid, which is not the same as paid and must not
  // be stored as if it were. Nothing in this app can see a UPI
  // payment -- there is no callback to a static page -- so the only
  // confirmation that exists is a person at a door looking at a
  // screenshot. Recording it as `paid` took the order off the
  // shop's money-to-collect before anybody had checked anything,
  // which is the one error here that costs the shop actual money.
  //
  // It writes pay_method, not paid: mark_method() is a write the
  // customer already has and it cannot touch `paid`, so the claim
  // persists across a reload without widening what a customer may
  // do to their own order.
  if (order.payMethod === 'upi_said'){
    return '<div class="card paybox issaid">'
      + '<p><b>' + esc(c.paySaidHead) + '</b></p>'
      + '<p class="proof">' + esc(c.paySaidSub) + '</p>'
      + '<p class="hint">' + esc(c.paySaidStill) + '</p>'
      + (can ? '<button type="button" class="btn ghost" data-pay="upi">'
          + esc(c.paySaidBack) + '</button>' : '')
      + '</div>';
  }

  // Chosen cash.
  if (order.payMethod === 'cod'){
    return '<div class="card paybox">'
      + '<p><b>' + esc(c.payCodChosen) + '</b></p>'
      + '<p class="hint">' + esc(c.payCodSub) + '</p>'
      + (can ? '<button type="button" class="btn ghost" data-pay="upi">'
          + esc(c.paySwitchUpi) + '</button>' : '')
      + '</div>';
  }

  // Chosen UPI -- show the code, and say what to do after paying.
  if (order.payMethod === 'upi' && can){
    return '<div class="card paybox' + (upi.demo ? ' isdemo' : '') + '">'
      + (upi.demo ? '<p class="demostrip">' + esc(c.payDemo) + '</p>' : '')
      + '<p><b>' + esc(c.payScanHead) + '</b></p>'
      + '<div class="qrwrap"><div class="qrtile" id="' + esc(o.qrId) + '"></div></div>'
      // The QR assumes a camera and a second device to point it at.
      // These are for everybody else: the customer paying from the
      // same phone that is holding this screen, the one whose
      // scanner will not focus, and the one who pays by phone
      // number because that is the only way they have ever done it.
      + '<p class="payhand">' + esc(c.payByHand) + '</p>'
      + '<dl class="payids">'
      +   '<dt>' + esc(c.payIdLab) + '</dt>'
      +   '<dd class="mono">' + esc(upi.vpa) + '</dd>'
      +   (upi.phone
            ? '<dt>' + esc(c.payPhoneLab) + '</dt>'
              + '<dd class="mono">' + esc(upi.phone) + '</dd>' : '')
      + '</dl>'
      + '<p class="proof">' + esc(c.payProof) + '</p>'
      + '<button type="button" class="btn" data-pay="done">' + esc(c.payMark) + '</button>'
      + '<button type="button" class="btn ghost" data-pay="cod">'
        + esc(c.paySwitchCod) + '</button>'
      + '</div>';
  }

  // Nothing chosen yet.
  //
  // BOTH buttons are ghosts, and that is the point. UPI used to be
  // the filled one, which is a shop with a preference -- and the
  // preference it stated was the one that suits the shop, not the
  // customer. Plenty of this shop's customers pay cash because that
  // is what they have; a screen that pushes past them to recommend
  // UPI reads as a bank, not a kirana. This is a question with two
  // right answers, so it is drawn as one.
  return '<div class="card paybox">'
    + '<p><b>' + esc(c.payHow) + '</b></p>'
    + (can
        ? '<button type="button" class="btn ghost" data-pay="upi">' + esc(c.payByUpi) + '</button>'
        : '<p class="hint">' + esc(c.upiNotSet) + '</p>')
    + '<button type="button" class="btn ghost" data-pay="cod">' + esc(c.payCod) + '</button>'
    + '</div>';
}

// Called after the markup is in the document. A QR built into a hidden
// container measures zero and comes out blank.
export async function drawQR(id, upi, order){
  const el = $(id);
  if (!el) return;
  const payload = upiPayload(upi, order.grand, order.code);
  if (!payload) return;

  let QR;
  try { QR = await loadQR(); }
  catch { el.innerHTML = '<p class="hint">' + esc(t().upiNoQr) + '</p>'; return; }
  if (!el.isConnected) return;

  el.innerHTML = '';
  // --qr-ink / --qr-paper are defined identically in both palettes, so
  // reading them once is safe here in a way it would not be for a
  // themed colour: there is nothing to go stale when the theme flips.
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fb) => (css.getPropertyValue(n).trim() || fb);
  new QR(el, {
    text: payload, width: 176, height: 176,
    colorDark: tok('--qr-ink', '#111111'),
    colorLight: tok('--qr-paper', '#FFFFFF'),
    correctLevel: QR.CorrectLevel.M,
  });
}

// One delegated handler for the whole block, wherever it is drawn.
//
// ASSIGNED, not addEventListener: the screens that use this redraw on
// every live update, and mount() replaces the contents without
// replacing the box -- so listeners would pile up and every tap would
// fire N times.
export function wirePay(box, order, orders, after){
  box.onclick = async (e) => {
    const b = e.target.closest('[data-pay]');
    if (!b) return;
    const what = b.dataset.pay;
    try {
      // 'done' is the customer SAYING so. It moves pay_method and
      // leaves `paid` alone, so the shop's figures do not move
      // until somebody has seen the screenshot.
      if (what === 'done'){
        await orders.setPayMethod(order.id, 'upi_said');
        toast(t().paySaidSub);
      }
      else await orders.setPayMethod(order.id, what);
      if (after) after();
    } catch (err){
      // This used to be a console.warn and nothing else, which is
      // the exact shape of button this app forbids everywhere else:
      // the customer taps "I have paid", the write fails, and the
      // screen does not move. They cannot tell a refusal from a
      // slow network, so they tap again, and the only record of it
      // is in a console nobody standing at a door will open.
      console.warn('pay', err);
      toast(t().payNotSaved);
    }
  };
}
