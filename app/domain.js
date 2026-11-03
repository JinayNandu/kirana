// =====================================================================
//  domain.js -- pure. No DOM, no storage, no fetch.
//
//  This file owns EVERY date and clock read in the app. Nothing else
//  may construct a date or ask what time it is, because the one thing
//  this app is entirely about is which day a delivery falls on.
//
//  `toISOString().slice(0,10)` is UTC. On an IST device between 00:00
//  and 05:30 it returns YESTERDAY -- so a run id keyed on it is wrong
//  for five and a half hours every night and the symptom is "all the
//  orders vanished at midnight". slots.pl greps for it and fails on a
//  hit anywhere in app/.
// =====================================================================

const IST = 'Asia/Kolkata';

// formatToParts rather than a format string: assembling the parts
// ourselves cannot be bent by a locale quirk, and the whole point of
// this file is that its output is never surprising.
const DP = new Intl.DateTimeFormat('en-GB',
  { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });

// hourCycle:'h23', NOT hour12:false. hour12:false returns "24:00" for
// midnight in several engines, so 00:05 would compute as 1445 minutes
// instead of 5 -- after every cut-off, giving an empty slot picker for
// the first hour of every day.
const TP = new Intl.DateTimeFormat('en-GB',
  { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const parts = (fmt, d) => {
  const o = {};
  for (const p of fmt.formatToParts(d)) o[p.type] = p.value;
  return o;
};

export function istDate(d = new Date()){
  const p = parts(DP, d);
  return p.year + '-' + p.month + '-' + p.day;          // 2026-10-27
}

export function istMins(d = new Date()){
  const p = parts(TP, d);
  return (+p.hour) * 60 + (+p.minute);                  // 0 .. 1439
}

export function istNow(d = new Date()){
  return { date: istDate(d), mins: istMins(d) };
}

// Date arithmetic on a date-only string, done in UTC so no timezone
// and no DST can touch it. India has no DST ever, but the VIEWER's
// zone might, and that is what this avoids.
export function addDays(dateStr, n){
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  const p2 = (x) => String(x).padStart(2, '0');
  return t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate());
}

export const mins  = (hhmm) => { const [h, m] = String(hhmm).split(':'); return (+h) * 60 + (+m); };
export const clock = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

// THE comparison that decides everything. Date AND minute, never
// minute-of-day alone: comparing bare clock times makes tomorrow's
// 08:45 cut-off look earlier than today's 19:15, so tomorrow's first
// run would never be offered after 8:45 this morning.
export const stamp = (date, m) => date + '#' + String(m).padStart(4, '0');

// 12-hour, because that is how a time is said in Borivali.
export function fmtTime(m){
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), mi = m % 60;
  const h = (h24 % 12) === 0 ? 12 : h24 % 12;
  return h + ':' + String(mi).padStart(2, '0') + ' ' + (h24 < 12 ? 'AM' : 'PM');
}
export const fmtRange = (a, b) => fmtTime(a) + ' – ' + fmtTime(b);

export function fmtDay(dateStr, todayStr, t){
  if (dateStr === todayStr) return t.today;
  if (dateStr === addDays(todayStr, 1)) return t.tomorrow;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });
}

// =====================================================================
//  Money -- integer rupees everywhere.
//
//  Every price in a kirana is a whole rupee, so there is no floating
//  point anywhere in this app: no toFixed, no rounding rule, and no
//  drift down a thirty-line cart.
// =====================================================================

export function rupees(n){
  const neg = n < 0;
  const s = String(Math.abs(Math.round(n)));
  let out = s;
  if (s.length > 3){
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const g = [];
    while (rest.length > 2){ g.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest) g.unshift(rest);
    out = g.join(',') + ',' + last3;
  }
  return (neg ? '-₹' : '₹') + out;
}

export function packLabel(pack, t){
  if (!pack) return '';
  const u = { g: t.unitG, kg: t.unitKg, ml: t.unitMl, l: t.unitL,
              pc: t.unitPc, pkt: t.unitPkt, dozen: t.unitDozen }[pack.u] || pack.u;
  return pack.n + ' ' + u;
}

// The minimum order is checked against the ITEMS total, never the
// grand total -- otherwise the delivery fee pushes a 140-rupee order
// over a 150-rupee minimum, which is a refund waiting to happen.
// A coupon is matched loosely, because the code gets read out over a
// counter and typed on a phone -- spaces and case are not the
// customer's problem.
export function matchCoupon(code, coupons){
  if (!coupons || !coupons.percent) return null;
  const want = String(code || '').replace(/\s+/g, '').toUpperCase();
  if (!want) return null;
  const hit = (coupons.codes || []).find((c) => String(c).toUpperCase() === want);
  return hit ? { code: String(hit), percent: coupons.percent } : null;
}

// Buy 2 get 1 free: every THIRD unit of the same product is free.
// Integer division, so two cost two, three cost two, seven cost
// five -- and it can never hand out part of a packet.
export const freeUnits = (qty) => Math.floor((qty || 0) / 3);

export function totals(lines, byId, rules, coupon, offers){
  const b2g1 = new Set((offers && offers.b2g1) || []);
  let items = 0, mrp = 0, count = 0, offerOff = 0, freeCount = 0;
  for (const l of lines || []){
    const p = byId[l.pid];
    if (!p) continue;
    const free = b2g1.has(l.pid) ? freeUnits(l.qty) : 0;
    items    += p.price * (l.qty - free);
    offerOff += p.price * free;
    freeCount += free;
    mrp   += p.mrp   * l.qty;
    count += l.qty;
  }
  // Whole rupees, like everything else here. Rounded once, on the
  // basket total -- rounding per line would let the sum of the parts
  // disagree with the total by a rupee or two.
  const discount = (coupon && coupon.percent)
    ? Math.round(items * coupon.percent / 100) : 0;

  const payable = items - discount;
  const fee = (payable >= rules.freeOver || payable === 0) ? 0 : rules.fee;
  return {
    count, items, mrp,
    // What the offer took off, and how many packets it gave
    // away. Kept apart from `saved` because they are different
    // claims: one is a discount this shop is running, the
    // other is the gap to the printed price.
    offerOff, freeCount,
    saved: mrp - items,                    // 0 now: everything sells at MRP
    coupon: coupon ? coupon.code : null,
    couponPercent: coupon ? coupon.percent : 0,
    discount, payable,
    fee,
    free: fee === 0 && items > 0,
    // The minimum is measured on the goods, BEFORE any coupon. It asks
    // whether the trip is worth making, and a discount code should not
    // be able to drop a basket under the bar it already cleared.
    short: Math.max(0, rules.minOrder - items),
    grand: payable + fee,
  };
}

// =====================================================================
//  Status machines -- one table, read by the UI and by the checker.
// =====================================================================

// ACCEPTED sits between placed and packed because they are two
// different facts and the shop used to publish only the second.
// Accepting is a decision -- the shop has seen the order and will
// fill it -- and packing is work that happens later. A customer
// watching `placed` for forty minutes cannot tell a busy shop from
// a shop that never looked, and that is the whole anxiety of
// ordering from a small place rather than an app with a fleet.
// THREE STAGES. `packed` and `out` are gone, on the owner's call --
// he was looking at five buttons where the work has two moments in
// it: deciding to fill the order, and handing it over. Packing and
// loading are things he does between them, not states anybody needs
// to publish, and every extra tap was a tap in front of a customer
// waiting at a counter.
//
// `failed` survives because it is not a stage, it is the delivery
// that did not happen, and a board where that order sits in
// `accepted` forever is a board nobody trusts by day three.
export const ORDER_NEXT = {
  placed:    ['accepted', 'cancelled'],
  accepted:  ['delivered', 'failed', 'cancelled'],
  delivered: [],
  failed:    ['delivered', 'cancelled'],  // tried again, or written off
  cancelled: [],
};

// Three things actually happen to a delivery window: it stops taking
// orders, the orders go out, the orders arrive. There used to be a
// separate "loaded" step for loading a tempo, which went when the
// tempo view did -- a state nobody acts on is a button nobody
// understands.
// The window moves in step with the orders on it, which is the
// point of doing all of them at once: close and accept the lot,
// then mark the lot delivered.
export const RUN_NEXT = {
  open:      ['cutoff', 'cancelled'],
  cutoff:    ['done', 'cancelled'],
  done:      [],
  cancelled: [],
};

// The steps a CUSTOMER is shown, in order. Deliberately not the keys
// of ORDER_NEXT: `failed` and `cancelled` are endings, not stages,
// and a progress line that lists them puts a warning on an order
// going perfectly well.
export const ORDER_TRAIL = ['placed', 'accepted', 'delivered'];

// A history timestamp as a clock time in Borivali. It goes through
// the same formatter as everything else in this file for the same
// reason: one place reads the clock, so a phone set to another zone
// still shows the time the SHOP did the thing.
export function istClock(iso){
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = parts(TP, d);
  return p.hour + ':' + p.minute;
}

export const canAdvance   = (from, to) => (ORDER_NEXT[from] || []).includes(to);
export const canAdvanceRun = (from, to) => (RUN_NEXT[from] || []).includes(to);

export const ORDER_TONE = {
  placed: '', accepted: 'sky',
  delivered: 'leaf', failed: 'bad', cancelled: 'bad',
};
export const RUN_TONE = {
  open: 'leaf', cutoff: 'sky', done: '', cancelled: 'bad',
};

// =====================================================================
//  Runs -- derived from the timetable, then overlaid with whatever was
//  actually written. Tomorrow's runs exist the moment the IST clock
//  passes midnight: no cron, no generate button, no empty table.
// =====================================================================

export function deriveRun(date, slot){
  return {
    id: 'run-' + date + '-' + slot.id,
    date, slot: slot.id, label: slot.label,
    cutoff: slot.cutoff,
    from: slot.from, to: slot.to,      // the window the customer is promised
    cap: slot.cap, enabled: slot.enabled !== false,
    status: 'open',
    closedAt: null, sentAt: null, doneAt: null,
  };
}

// The whole delivery promise, in one string: "11:00 AM – 12:00 PM".
// Every address gets the same one. A per-street estimate was more
// precise and less true -- it only existed for the thirteen localities
// that were on a list, and it moved with traffic.
export const windowOf = (run) => fmtTime(mins(run.from)) + ' – ' + fmtTime(mins(run.to));

// An explicit write wins; otherwise the clock decides.
export function runState(run, nowDate, nowMins){
  if (run.status && run.status !== 'open') return run.status;
  return stamp(nowDate, nowMins) >= stamp(run.date, mins(run.cutoff)) ? 'cutoff' : 'open';
}

export const isBookable = (run, nowDate, nowMins) =>
  run.enabled && runState(run, nowDate, nowMins) === 'open';

// Whole days since the epoch, for a date-only string. UTC throughout,
// so this is pure integer arithmetic with no clock in it.
export const dayNum = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// Minutes until this run's cut-off. Negative once it has gone.
export const minsToCutoff = (run, nowDate, nowMins) =>
  (dayNum(run.date) - dayNum(nowDate)) * 1440 + mins(run.cutoff) - nowMins;

// Minutes until this run's window OPENS. The cut-off is the shop's
// deadline; this is the customer's answer to "when does my shopping
// turn up", which is the question they actually asked.
export const minsToStart = (run, nowDate, nowMins) =>
  (dayNum(run.date) - dayNum(nowDate)) * 1440 + mins(run.from) - nowMins;

// "About" is doing real work here, not hedging.
//
// This counts down to a van leaving a shop. "10 hr 31 min" claims a
// precision nobody has, and the 31 reads as a promise somebody made.
// Rounding to what a person would actually say -- about eleven hours,
// about half an hour -- is the same fact in an honest shape, and it is
// the shape that survives the van leaving four minutes late.
export function fmtAbout(m, t){
  if (m <= 0) return null;
  const T = t || {};
  const put = (s, n) => String(s).replace('{n}', n);
  // Never "about 2 minutes" -- at that range a customer wants the
  // clock time, and five is the smallest unit worth rounding to.
  if (m < 50) return put(T.unitMinutes || '{n} minutes', Math.max(5, Math.round(m / 5) * 5));
  if (m < 90) return T.unitOneHour || 'an hour';
  return put(T.unitHours || '{n} hours', Math.round(m / 60));
}

// Takes the string table, because "11 hr 58 min" sitting inside an
// otherwise Marathi sentence is exactly the kind of leak that makes a
// translation look like a veneer.
export function fmtSoon(m, t){
  if (m <= 0) return null;
  const hr = (t && t.unitHr) || 'hr', min = (t && t.unitMin) || 'min';
  if (m < 60) return m + ' ' + min;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? h + ' ' + hr + ' ' + r + ' ' + min : h + ' ' + hr;
}

// A festival is on between two dates, inclusive, in IST. Comparing
// the strings is correct and deliberate: YYYY-MM-DD sorts
// lexicographically in calendar order, which is the one thing that
// format exists for, and it keeps this function free of a clock.
// The caller passes today from istDate(), so there is still exactly
// one place in this app that reads the time.
export const festivalOn = (fest, today) =>
  !!(fest && fest.id && fest.from && fest.to && today >= fest.from && today <= fest.to);

// =====================================================================
//  Delivery fee
//
//  Free on every order, at every distance, with no threshold -- so the
//  UI says so out loud rather than quietly charging nothing. The
//  arithmetic above still runs, because `freeAlways` is a setting and
//  not a law: a shop that starts charging again should not need code.
// =====================================================================

export const deliveryFree = (rules) => !!rules.freeAlways || !rules.fee;
