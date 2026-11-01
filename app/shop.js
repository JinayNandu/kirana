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
import { ready, runs, orders, catalog, live } from './store.js';
import {
  rupees, packLabel, istDate, istMins, addDays,
  runState, windowOf, ORDER_TONE, RUN_TONE,
} from './domain.js';
import { pname } from './customer.js';

const S = { runId: null, orderId: null, picked: {} };

const lbl = (r) => t()[r.label] || r.label;
const stName = (s) => t()['st' + s[0].toUpperCase() + s.slice(1)] || s;
const rsName = (s) => t()['rs' + s[0].toUpperCase() + s.slice(1)] || s;

// One line a driver can read, in the order he needs it.
export function addressOf(o){
  return [o.customer.flat, o.customer.society, o.customer.area]
    .filter((x) => x && String(x).trim()).join(', ');
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
      if (n.byStatus.placed)  return f(c.bPack, { n: n.byStatus.placed });
      if (n.byStatus.packed)  return f(c.bReady, { n: n.byStatus.packed });
      if (n.byStatus.out)     return f(c.bOut,   { n: n.byStatus.out });
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
      return '<button type="button" class="card runcard'
        + (r.enabled ? '' : ' off') + '" data-run="' + esc(r.id) + '">'
        + '<span class="rc1"><b>' + esc(windowOf(r)) + '</b>'
        +   '<span class="pill ' + esc(pill[0]) + '">' + esc(pill[1]) + '</span></span>'
        + '<span class="rc2">' + esc(lbl(r)) + '</span>'
        + (n.orders
            ? '<span class="rc3">'
              + '<span>' + esc(f(n.orders === 1 ? c.oneOrder : c.nOrders, { n: n.orders }))
              +   ' · ' + esc(f(c.nItemsShort, { n: n.items })) + '</span>'
              + '<span class="money">' + esc(rupees(n.cash)) + '</span>'
              + '</span>'
              + (todo ? '<span class="rc4">' + esc(todo) + icon('chev') + '</span>' : '')
            : '')
        + '</button>';
    };

    // What the shop opens this screen to find out, in the order it
    // wants to know it: the money first, then the work.
    const sum = { orders: 0, items: 0, cash: 0, paid: 0, paidCount: 0, pack: 0, out: 0 };
    for (const r of list){
      if (!r.enabled) continue;
      const n = await runs.counts(r.id);
      sum.orders += n.orders; sum.items += n.items;
      sum.cash += n.cash; sum.paid += n.paidTotal; sum.paidCount += n.paidCount;
      sum.pack += (n.byStatus.placed || 0);
      sum.out  += (n.byStatus.out || 0);
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
        + (sum.pack || sum.out
            ? '<p class="tdo">'
              + (sum.pack ? '<span class="pill spice">'
                  + esc(f(c.bPack, { n: sum.pack })) + '</span>' : '')
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

    mount(box, h1(c.boardTitle) + head
      + '<h2>' + esc(c.boardToday) + '</h2>' + a.join('')
      + '<h2>' + esc(c.boardTomorrow) + '</h2>' + b.join(''));

    box.onclick = (e) => {
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
    const action = {
      open:   ['cutoff', c.closeRun,  'spice'],
      cutoff: ['out',    c.dispatch,  'sky'],
      out:    ['done',   c.finishRun, ''],
    }[st];

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

      + (action ? '<button type="button" class="btn ' + esc(action[2]) + '" id="adv">'
          + esc(action[1]) + '</button>' : '')

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
          +     (o.paid ? '<span class="pill leaf">' + esc(c.payDone) + '</span>' : '')
          +     '<span class="pill ' + esc(ORDER_TONE[o.status] || '') + '">'
          +       esc(stName(o.status)) + '</span>'
          +   '</span>'
          + '</span>'
          + icon('chev') + '</li>').join('') + '</ul>'
        : empty(c.noOrdersRun, '')));

    $('loadl').onclick = () => show('load');

    const adv = $('adv');
    if (adv) adv.onclick = async () => {
      try {
        if (action[0] === 'out'){
          // Numbered in the order they came in. There is no route to
          // sort by -- the driver decides his own, which is the point.
          await orders.sequence(r.id, list.map((o) => o.id));
          const notPacked = list.filter((o) => o.status === 'placed').length;
          for (const o of list) if (o.status === 'packed') await orders.advance(o.id, 'out');
          if (notPacked) toast(f(c.warnNotPacked, { n: notPacked }));
        }
        if (action[0] === 'done'){
          for (const o of list) if (o.status === 'out') await orders.advance(o.id, 'delivered');
        }
        await runs.setStatus(r.id, action[0]);
      } catch (err){ toast(String(err.message)); }
    };

    box.onclick = (e) => {
      const li = e.target.closest('[data-order]');
      if (!li) return;
      S.orderId = li.dataset.order;
      S.picked = {};
      show('pick');
    };
  };

  await draw();
  onLeave(live.subscribe('orders', draw));
  onLeave(live.subscribe('runs', draw));
});

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
    const done = o.lines.filter((l) => S.picked[l.pid]).length;
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
      + '<p class="sub">' + esc(f(c.pickedN, { n: done, d: o.lines.length })) + '</p>'
      + '<ul class="plist pick">' + o.lines.map((l) =>
          '<li class="pkrow' + (S.picked[l.pid] ? ' on' : '') + '" data-pick="' + esc(l.pid) + '">'
          + '<span class="tick">' + icon('check') + '</span>'
          + '<span class="mono lq">' + esc(String(l.qty)) + '</span>'
          + '<span class="pbody"><span class="pname">' + esc(l.nameEn) + '</span>'
          +   '<span class="hint">' + esc(packLabel(l.pack, c)) + '</span></span>'
          + '<span class="mono">' + esc(rupees(l.lineTotal)) + '</span></li>').join('')
      + '</ul>'
      + '<div class="card totals">'
      +   '<p class="trow"><span><b>' + esc(o.paid ? c.payDone : c.toPay) + '</b></span>'
      +     '<span class="mono"><b>' + esc(rupees(o.grand)) + '</b></span></p></div>'
      + '<button type="button" class="btn ' + (o.paid ? 'ghost' : 'sky') + '" id="paid">'
        + esc(o.paid ? c.markUnpaid : c.markPaid) + '</button>'
      + (o.status === 'placed'
          ? '<button type="button" class="btn" id="packed"'
            + (done === o.lines.length ? '' : ' disabled') + '>' + esc(c.markPacked) + '</button>'
          : '<p class="sub"><span class="pill ' + esc(ORDER_TONE[o.status] || '') + '">'
            + esc(stName(o.status)) + '</span></p>'));

    box.onclick = (e) => {
      const li = e.target.closest('[data-pick]');
      if (!li) return;
      S.picked[li.dataset.pick] = !S.picked[li.dataset.pick];
      draw();
    };
    $('paid').onclick = async () => {
      try { await orders.setPaid(o.id, !o.paid, 'upi'); }
      catch (err){ toast(String(err.message)); }
    };
    const b = $('packed');
    if (b && !b.disabled) b.onclick = async () => {
      try { await orders.advance(o.id, 'packed'); show('run', false); }
      catch (err){ toast(String(err.message)); }
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
