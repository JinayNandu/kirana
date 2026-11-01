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

import { esc, $ } from './ui.js';
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
      + '<p class="proof">' + esc(c.payProof) + '</p>'
      + '<button type="button" class="btn" data-pay="done">' + esc(c.payMark) + '</button>'
      + '<button type="button" class="btn ghost" data-pay="cod">'
        + esc(c.paySwitchCod) + '</button>'
      + '</div>';
  }

  // Nothing chosen yet.
  return '<div class="card paybox">'
    + '<p><b>' + esc(c.payHow) + '</b></p>'
    + (can
        ? '<button type="button" class="btn" data-pay="upi">' + esc(c.payByUpi) + '</button>'
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
      if (what === 'done') await orders.setPaid(order.id, true, 'upi');
      else await orders.setPayMethod(order.id, what);
      if (after) after();
    } catch (err){ console.warn('pay', err); }
  };
}
