// =====================================================================
//  shop.js -- the counter view.
//
//  Screens: board, run, pick, load.
//
//  The load list is the feature that justifies the whole product: it
//  is the one screen a delivery cannot leave without. It is also the
//  only arithmetic here a human cannot check by eye.
//
//  There is no route any more. The shopkeeper closes a window, picks
//  the orders and sends them out; the driver works out his own order
//  from the addresses.
// =====================================================================

import {
  $, esc, mount, show, registerScreen, onLeave, toast, h1, sub, empty,
} from './ui.js';
import { t, f, getLang } from './i18n.js';
import { icon } from './icons.js';
import { ready, runs, orders, catalog, live, session, shared } from './store.js';
import { forget } from './lock.js';
import {
  rupees, packLabel, istDate, istMins, addDays,
  runState, windowOf, runEnded, ORDER_STATES, ORDER_TONE, RUN_TONE,
} from './domain.js';
import { pname } from './customer.js';

const S = { runId: null, orderId: null };

const lbl = (r) => t()[r.label] || r.label;
const stName = (s) => t()['st' + s[0].toUpperCase() + s.slice(1)] || s;
const rsName = (s) => t()['rs' + s[0].toUpperCase() + s.slice(1)] || s;

// One line a driver can read, in the order he needs it.
export function addressOf(o){
  return [o.customer.flat, o.customer.society, o.customer.area]
    .filter((x) => x && String(x).trim()).join(', ');
}

// The board shows what row-level security allows and nothing else:
// your own orders, or EVERY order once this user is on the staff
// list. A device that is neither gets an empty result -- which the
// board rendered as "No orders yet today.", a sentence that is
// indistinguishable from a genuinely quiet morning and sent us
// looking for a bug in the orders instead of the session.
//
// session.isStaff() existed for this from the start and was called
// by nothing.
async function notStaffHtml(c){
  if (!shared()) return '';
  let staff = false;
  try { staff = await session.isStaff(); }
  catch (e){ return ''; }              // never let a notice break the board
  if (staff) return '';
  // One cause now, so one notice. This used to print a uuid and an
  // INSERT statement, which was a developer's answer to a
  // shopkeeper's problem: it asked the person holding the phone to
  // copy an id into a database console, and on a second device it
  // asked them to do it again. The code does it now.
  let claim = null;
  try { claim = session.claimState ? await session.claimState() : null; }
  catch (e){ claim = null; }
  // Nothing on this screen can fix a missing function, so it gets the
  // setup line and no button. Offering 'Enter the Store code' to
  // somebody who just entered it is a loop with no way out of it.
  if (claim === 'missing'){
    return '<div class="card nostaff"><p>' + esc(c.bNoSetup) + '</p></div>';
  }
  return '<div class="card nostaff">'
    + '<p>' + esc(c.bNotStaff) + '</p>'
    + '<button type="button" class="btn ghost" id="recode">'
      + esc(c.bEnterCode) + '</button>'
    + '</div>';
}

// ---------------------------------------------------------------------
//  s-board
// ---------------------------------------------------------------------
registerScreen('board', async () => {
  const c = t();
  const box = $('s-board');

  const draw = async () => {
    const today = istDate(), now = istMins();
    const list = await runs.today();
    const tmrw = await runs.forDate(addDays(today, 1));

    // The one line that says what is waiting to be DONE, rather than
    // what state a window is in. "2 to pack" is an instruction; "Closed
    // - pack these" was a label, and the owner could not tell from it
    // whether anything was actually owed.
    const work = (n) => {
      if (n.byStatus.placed)   return f(c.bAccept, { n: n.byStatus.placed });
      if (n.byStatus.accepted) return f(c.bOut,    { n: n.byStatus.accepted });
      if (n.byStatus.delivered && n.orders === n.byStatus.delivered) return c.bAllDone;
      return '';
    };

    const card = async (r) => {
      const st = runState(r, today, now);
      const n = await runs.counts(r.id);
      // A closed window with nothing in it says so. "Closed, pack
      // these" over nought orders is a instruction to do nothing.
      const empty = !n.orders && st !== 'open';
      const pill = !r.enabled ? ['', c.runOff]
                 : empty      ? ['', c.rsNone]
                 : [RUN_TONE[st] || '', rsName(st)];
      const todo = r.enabled && n.orders ? work(n) : '';
      // Been and gone, with something still on it. Red, because this
      // is the one thing on this screen the shop has to see without
      // looking for it.
      const open = n.orders - (n.byStatus.delivered || 0)
        - (n.byStatus.cancelled || 0);
      const late = r.enabled && open > 0 && runEnded(r, today, now);
      return '<div class="rcwrap">'
        + '<button type="button" class="card runcard'
        + (r.enabled ? '' : ' off') + (late ? ' late' : '')
        + '" data-run="' + esc(r.id) + '">'
        + '<span class="rc1"><b>' + esc(windowOf(r)) + '</b>'
        +   '<span class="pill ' + esc(late ? 'bad' : pill[0]) + '">'
        +     esc(late ? c.rsLate : pill[1]) + '</span></span>'
        + '<span class="rc2">' + esc(lbl(r)) + '</span>'
        + (n.orders
            ? '<span class="rc3">'
              + '<span>' + esc(f(n.orders === 1 ? c.oneOrder : c.nOrders, { n: n.orders }))
              +   ' · ' + esc(f(c.nItemsShort, { n: n.items })) + '</span>'
              + '<span class="money">' + esc(rupees(n.cash)) + '</span>'
              + '</span>'
              + (todo ? '<span class="rc4">' + esc(todo) + icon('chev') + '</span>' : '')
            : '')
        + '</button>'
        // BOTH moves, always, on any window that has anything to move
        // -- including tomorrow's. The shopkeeper knows whether a
        // thing has been delivered better than a state machine does.
        // Empty windows get no buttons, which is what keeps six cards
        // from becoming twelve.
        + (n.orders
            ? '<div class="rcact">'
              + '<button type="button" class="btn ghost" data-runset="cutoff"'
              +   ' data-runid="' + esc(r.id) + '">' + esc(c.bulkAccept) + '</button>'
              + '<button type="button" class="btn ghost" data-runset="done"'
              +   ' data-runid="' + esc(r.id) + '">' + esc(c.bulkDone) + '</button>'
              + '</div>'
            : '')
        + '</div>';
    };

    // What the shop opens this screen to find out, in the order it
    // wants to know it: the money first, then the work.
    const sum = { orders: 0, items: 0, cash: 0, paid: 0, paidCount: 0,
                  accept: 0, out: 0 };
    for (const r of list){
      if (!r.enabled) continue;
      const n = await runs.counts(r.id);
      sum.orders += n.orders; sum.items += n.items;
      sum.cash += n.cash; sum.paid += n.paidTotal; sum.paidCount += n.paidCount;
      sum.accept += (n.byStatus.placed || 0);
      sum.out  += (n.byStatus.accepted || 0);
    }

    const head = sum.orders
      ? '<div class="card tally">'
        + '<p class="tbig"><span>' + esc(c.bMoney) + '</span>'
        +   '<b class="mono">' + esc(rupees(sum.cash)) + '</b></p>'
        + '<p class="trow"><span>'
        +   esc(f(sum.orders === 1 ? c.oneOrder : c.nOrders, { n: sum.orders }))
        +   ' · ' + esc(f(c.nItemsShort, { n: sum.items })) + '</span>'
        +   (sum.paidCount
              ? '<span class="hint">' + esc(f(c.bPaid, { s: rupees(sum.paid) })) + '</span>'
              : '') + '</p>'
        + (sum.accept || sum.out
            ? '<p class="tdo">'
              + (sum.accept ? '<span class="pill spice">'
                  + esc(f(c.bAccept, { n: sum.accept })) + '</span>' : '')
              + (sum.out ? '<span class="pill sky">'
                  + esc(f(c.bOut, { n: sum.out })) + '</span>' : '')
              + '</p>'
            : '')
        + '</div>'
      : '<div class="card tally"><p class="tquiet">' + esc(c.bNothing) + '</p></div>';

    const a = [];
    for (const r of list) a.push(await card(r));
    // Tomorrow is NOT dimmed. It was, at 60% opacity, and read as
    // disabled -- which it never was; those cards have always opened.
    // A window the shop can already look into should not look switched
    // off just because it has not come round yet.
    const b = [];
    for (const r of tmrw) if (r.enabled) b.push(await card(r));

    mount(box, h1(c.boardTitle) + (await notStaffHtml(c)) + head
      + '<h2>' + esc(c.boardToday) + '</h2>' + a.join('')
      + '<h2>' + esc(c.boardTomorrow) + '</h2>' + b.join(''));

    box.onclick = (e) => {
      // Forget the unlock and reload: boot re-runs, sees the store
      // link with the gate unpassed, and asks for the code -- which
      // is the one thing that can make this session the shop.
      if (e.target.closest('#recode')){ forget(); location.reload(); return; }
      const act = e.target.closest('[data-runset]');
      if (act){
        bulk(act.dataset.runid, act.dataset.runset)
          .catch((err) => toast(String(err.message)));
        return;
      }
      const btn = e.target.closest('[data-run]');
      if (!btn) return;
      S.runId = btn.dataset.run;
      show('run');
    };
  };

  await draw();
  onLeave(live.subscribe('orders', draw));
  onLeave(live.subscribe('runs', draw));
});

// ---------------------------------------------------------------------
//  s-run
// ---------------------------------------------------------------------
registerScreen('run', async () => {
  const c = t();
  const box = $('s-run');

  const draw = async () => {
    const r = await runs.byId(S.runId);
    if (!r){ show('board', false); return; }
    const st = runState(r, istDate(), istMins());
    const list = await orders.forRun(r.id);
    const n = await runs.counts(r.id);

    // One action at a time, named for what it does next rather than
    // for the state it moves into.

    mount(box, h1(f(c.runTitle, { s: lbl(r) }))
      + '<p class="sub"><span class="pill ' + esc(RUN_TONE[st] || '') + '">' + esc(rsName(st))
        + '</span> <span class="mono">' + esc(windowOf(r)) + '</span></p>'

      + '<div class="card totals">'
      +   '<p class="trow"><span>'
      +     esc(f(n.orders === 1 ? c.oneOrder : c.nOrders, { n: n.orders })) + '</span>'
      +     '<span class="mono">' + esc(f(c.cashExpected, { s: rupees(n.cash) })) + '</span></p>'
      +   '<p class="trow"><span>' + esc(f(c.nItemsShort, { n: n.items })) + '</span>'
      +     '<span class="hint">' + esc(n.paidCount
            ? f(c.paidAlready, { s: rupees(n.paidTotal) }) : c.freeAlways) + '</span></p>'
      + '</div>'

      + '<button type="button" class="btn ghost" id="loadl">' + icon('truck')
        + esc(c.openLoadList) + '</button>'

      // Both, always. Same rule as the board.
      + '<button type="button" class="btn spice" data-runset="cutoff"'
      +   ' data-runid="' + esc(r.id) + '">' + esc(c.closeRun) + '</button>'
      + '<button type="button" class="btn" data-runset="done"'
      +   ' data-runid="' + esc(r.id) + '">' + esc(c.finishRun) + '</button>'

      + '<h2>' + esc(c.ordersTitle) + '</h2>'
      + (list.length ? '<ul class="plist flat">' + list.map((o) =>
          // Each order carries its OWN amount, because "977 to collect"
          // at the top of the screen does not tell whoever is handing
          // over a bag what to ask this particular customer for. A paid
          // one shows the figure struck through: the money is real and
          // still worth seeing, it is simply not owed.
          '<li class="orow" data-order="' + esc(o.id) + '">'
          + (o.seq ? '<span class="seqn mono">' + esc(String(o.seq)) + '</span>' : '')
          + '<span class="obody">'
          +   '<span class="oline1"><b class="mono">' + esc(o.code) + '</b>'
          +     '<span class="omoney mono' + (o.paid ? ' paid' : '') + '">'
          +       esc(rupees(o.grand)) + '</span></span>'
          +   '<span class="hint">' + esc(o.customer.name + ' · ' + addressOf(o)) + '</span>'
          +   '<span class="opills">'
          +     (o.paid ? '<span class="pill leaf">' + esc(c.payDone) + '</span>'
                : o.payMethod === 'upi_said'
                  ? '<span class="pill spice">' + esc(c.pillSaidPaid) + '</span>' : '')
          +     '<span class="pill ' + esc(ORDER_TONE[o.status] || '') + '">'
          +       esc(stName(o.status)) + '</span>'
          +   '</span>'
          + '</span>'
          + icon('chev') + '</li>').join('') + '</ul>'
        : empty(c.noOrdersRun, '')));

    $('loadl').onclick = () => show('load');


    box.onclick = (e) => {
      const act = e.target.closest('[data-runset]');
      if (act){
        bulk(act.dataset.runid, act.dataset.runset)
          .catch((err) => toast(String(err.message)));
        return;
      }
      const li = e.target.closest('[data-order]');
      if (!li) return;
      S.orderId = li.dataset.order;
      show('pick');
    };
  };

  await draw();
  onLeave(live.subscribe('orders', draw));
  onLeave(live.subscribe('runs', draw));
});

// Handing the bag over and being paid for it are one moment at a
// doorstep, so one tap closes both. Only ever ON the way to
// delivered, and never a way to UN-pay: the separate toggle above
// is there for the customer who did not, in the end, pay.
// Every order in a window, moved the way one order moves. Shared by
// the board and the run screen so the two cannot drift: the whole
// point of the button is that a window of twelve orders is twelve
// identical taps otherwise.
async function bulk(runId, to){
  const list = await runs.ordersOf(runId);
  if (to === 'cutoff'){
    // Numbered in the order they came in. There is no route to sort
    // by -- whoever delivers decides his own.
    await orders.sequence(runId, list.map((o) => o.id));
    for (const o of list){
      if (o.status === 'placed') await orders.advance(o.id, 'accepted');
    }
  }
  if (to === 'done'){
    // A declined order is not an undelivered one, and nothing should
    // quietly deliver it.
    for (const o of list){
      if (o.status !== 'delivered' && o.status !== 'cancelled'){
        await orders.advance(o.id, 'delivered');
        await settle(o, orders, 'delivered');
      }
    }
  }
  await runs.setStatus(runId, to);
}

async function settle(o, orders, to){
  if (to !== 'delivered' || o.paid) return;
  await orders.setPaid(o.id, true, o.payMethod === 'cod' ? 'cash' : 'upi');
}

// ---------------------------------------------------------------------
//  s-pick -- a card list, never a table. This is the one screen used
//  on a phone while standing at a shelf, and a table at 375px either
//  scrolls sideways or crushes to unreadable.
// ---------------------------------------------------------------------
registerScreen('pick', async () => {
  const c = t();
  const box = $('s-pick');

  const draw = async () => {
    const o = await orders.byId(S.orderId);
    if (!o){ show('run', false); return; }
    const ll = o.customer.ll;

    mount(box, h1(f(c.pickTitle, { s: o.code }))
      + '<div class="card">'
      +   '<p><b>' + esc(o.customer.name) + '</b></p>'
      +   '<p>' + esc(addressOf(o)) + '</p>'
      +   (o.customer.landmark ? '<p class="hint">' + esc(o.customer.landmark) + '</p>' : '')
      +   '<p><a href="tel:' + esc(o.customer.phone) + '">' + esc(o.customer.phone) + '</a>'
      +     (ll ? ' · <a target="_blank" rel="noopener" href="'
            + 'https://www.google.com/maps/search/?api=1&query='
            + esc(ll[0] + ',' + ll[1]) + '">' + esc(c.openMaps) + '</a>' : '') + '</p>'
      + '</div>'
      // A list to read off a shelf, not a form to fill in. Every line
      // used to carry a tick and the packed button stayed disabled
      // until all of them were ticked -- so a four-item order took
      // five taps, and the shopkeeper who already had the bag in his
      // hand had to tell the app what he could see. One tap now.
      + '<p class="sub">' + esc(f(c.nItemsShort, { n: o.lines.length })) + '</p>'
      + '<ul class="plist pick">' + o.lines.map((l) =>
          '<li class="pkrow">'
          + '<span class="mono lq">' + esc(String(l.qty)) + '</span>'
          + '<span class="pbody"><span class="pname">' + esc(l.nameEn) + '</span>'
          +   '<span class="hint">' + esc(packLabel(l.pack, c)) + '</span></span>'
          + '<span class="mono">' + esc(rupees(l.lineTotal)) + '</span></li>').join('')
      + '</ul>'
      + '<div class="card totals">'
      +   '<p class="trow"><span><b>' + esc(o.paid ? c.payDone : c.toPay) + '</b></span>'
      +     '<span class="mono"><b>' + esc(rupees(o.grand)) + '</b></span></p></div>'
      // The customer has said they paid. The money is still owed as
      // far as this app is concerned, and the only way to settle
      // that is to look at their screen.
      + (!o.paid && o.payMethod === 'upi_said'
          ? '<p class="saidpaid">' + esc(c.sSaidPaid) + '</p>' : '')
      // ONLY AFTER DELIVERY, as a correction. Paying is part of
      // stage three now, so a separate "mark paid" standing beside
      // "Accept" was a third thing to think about at the one moment
      // there is nothing to think about. Once delivered it has a
      // job again: the customer who, in the end, did not pay.
      + (o.status === 'delivered'
          ? '<button type="button" class="btn ghost" id="paid">'
            + esc(o.paid ? c.markUnpaid : c.markPaid) + '</button>'
          : '')
      // EVERY status, always, with the current one marked. The screen
      // used to offer the one move the table allowed next, which
      // meant a tap made by mistake could not be taken back and
      // tomorrow's order could not be marked delivered today. The
      // shopkeeper knows which of these is true better than a state
      // machine does; his job here is to say so in one tap.
      + '<h2>' + esc(c.setStatus) + '</h2>'
      + '<div class="statusrow">'
      + ORDER_STATES.map((s) =>
          '<button type="button" class="btn ghost' + (o.status === s ? ' on' : '')
          + '" data-set="' + esc(s) + '">' + esc(stName(s)) + '</button>').join('')
      + '</div>'
      + (o.status === 'delivered'
          ? '<p class="sub"><span class="pill ' + esc(ORDER_TONE[o.status] || '') + '">'
            + esc(stName(o.status)) + '</span></p>'
          : ''));

    const pb = $('paid');
    if (pb) pb.onclick = async () => {
      try { await orders.setPaid(o.id, !o.paid, 'upi'); }
      catch (err){ toast(String(err.message)); }
    };
    box.onclick = async (e) => {
      const sb = e.target.closest('[data-set]');
      if (!sb) return;
      const to = sb.dataset.set;
      if (to === o.status) return;       // the one genuinely empty tap
      try {
        await orders.advance(o.id, to);
        // Only ever ON the way to delivered -- settle() checks, and it
        // is checked here too because this row can set any status.
        await settle(o, orders, to);
        show('run', false);
      } catch (err){ toast(String(err.message)); }
    };
  };
  await draw();
  onLeave(live.subscribe('orders', draw));
});

// ---------------------------------------------------------------------
//  s-load -- what goes out.
// ---------------------------------------------------------------------
registerScreen('load', async () => {
  const c = t();
  const box = $('s-load');

  const draw = async () => {
    const r = await runs.byId(S.runId);
    if (!r){ show('board', false); return; }
    const rows = await runs.load(r.id);
    const n = await runs.counts(r.id);
    const cats = await catalog.categories();
    const catName = {};
    for (const x of cats) catName[x.id] = x.name[getLang()] || x.name.en;

    if (!rows.length){
      mount(box, h1(c.loadTitle) + empty(c.noOrdersRun, ''));
      return;
    }

    let out = '', lastCat = null;
    for (const row of rows){
      if (row.cat !== lastCat){
        out += '<h2>' + esc(catName[row.cat] || row.cat) + '</h2>';
        lastCat = row.cat;
      }
      out += '<li class="ldrow">'
        + '<span class="ldq mono">' + esc(String(row.qty)) + '</span>'
        + '<span class="pbody"><span class="pname">'
          + esc(row.product ? pname(row.product) : row.pid) + '</span>'
        + '<span class="hint">' + esc(row.product ? packLabel(row.product.pack, c) : '')
          + ' · ' + esc(f(c.nOrders, { n: row.orders })) + '</span></span></li>';
    }

    mount(box, h1(c.loadTitle)
      + sub(f(c.loadSub, { s: lbl(r) }))
      + '<div class="card totals"><p class="trow"><span>'
        + esc(f(c.loadTotal, { n: n.items, d: n.orders })) + '</span>'
        + '<span class="mono">' + esc(f(c.cashExpected, { s: rupees(n.cash) })) + '</span></p></div>'
      + '<ul class="plist load">' + out + '</ul>');
  };

  await draw();
  onLeave(live.subscribe('orders', draw));
});
