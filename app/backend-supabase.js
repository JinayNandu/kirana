// =====================================================================
//  backend-supabase.js -- the same contract as backend-local.js, over
//  a real database, so that a customer's order on their phone appears
//  on the shopkeeper's counter.
//
//  It obeys the four rules that make store.js a seam and not a wish:
//
//   1. EVERY METHOD IS async, even ones answered from memory.
//   2. RETURNS ARE DEEP-CLONED. No live reference into a cache; a
//      caller that mutated one would corrupt every other screen.
//   3. IDS ARE MINTED BY THE BACKEND. Postgres mints them here, which
//      is the point: two customers ordering in the same second on
//      different phones is exactly what a localStorage counter could
//      not get right, and the order code is what the shopkeeper
//      shouts across the shop.
//   4. live.subscribe RETURNS AN UNSUBSCRIBE FUNCTION.
//
//  ---------------------------------------------------------------
//  WHAT STAYS LOCAL, AND WHY
//
//  The catalogue, the categories, the pairings and the delivery
//  timetable are static JSON in git, read by backend-local.js, and
//  they are simply re-exported from here. They are the same for
//  everybody, they are edited with tools/setprice.pl, and they are
//  checked by tools/data.pl. Moving them into Postgres would buy
//  nothing and cost the shopkeeper his one-command price edit.
//
//  THE CART STAYS LOCAL TOO. A basket is a thing on one device in one
//  sitting -- syncing it would mean a half-built cart on a phone
//  rewriting the one open on a laptop, which is a feature nobody asked
//  for and a bug everybody would report.
//
//  ---------------------------------------------------------------
//  SNAKE_CASE AT THE EDGE
//
//  Postgres columns are snake_case and this app is camelCase. The two
//  translators below are the ONLY place that is true. A row never
//  reaches a screen and a screen's object never reaches a query.
// =====================================================================

import { createClient }
  from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE } from './config.js';
import {
  istDate, istMins, addDays, deriveRun, runState, isBookable,
  canAdvance, canAdvanceRun, matchCoupon, totals as calcTotals, freeUnits,
  payState,
} from './domain.js';
import * as local from './backend-local.js';

// Static data, the cart and the on-device defaults are backend-local's
// job in both worlds.
export const { ready, catalog, cart, profile } = local;

const DATA = local.ready();
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export const sb = createClient(SUPABASE.url, SUPABASE.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // There is no redirect to come back from: the whole app is one
    // page and the email carries a six-digit code, not a link.
    detectSessionInUrl: false,
  },
});

const oops = (error) => { if (error) throw new Error(error.message || String(error)); };

// "That email is already registered" is the one auth error this app
// treats as an ordinary answer rather than a failure. The code reads
// the code first and the message only as a fallback, because the
// message is English prose that Supabase is free to reword.
const taken = (e) => !!e && (e.code === 'email_exists'
  || /already (been )?registered|already exists/i.test(e.message || ''));

// ---------------------------------------------------------------------
//  Who is this
//
//  EVERY VISITOR GETS A SESSION, anonymously, on first load. Nobody is
//  asked to sign in to buy groceries -- a login wall in front of a
//  shop is how a shop loses the customer at the door.
//
//  What it buys is that auth.uid() is never null, so every order and
//  every address has an owner and the row-level rules are one line
//  each. Signing in with an email later makes the SAME user
//  permanent, which is why the address book and the order history
//  survive it rather than being left behind on a stranger's account.
// ---------------------------------------------------------------------
let whoCache = null;

export async function signedIn(){
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

export async function begin(){
  let s = await signedIn();
  if (!s){
    const { data, error } = await sb.auth.signInAnonymously();
    oops(error);
    s = data.session;
  }
  whoCache = s && s.user;
  return s;
}

let lastClaim = null;
// Kept so a failed claim can be asked about from the console rather
// than guessed at. A wrong code and a broken function both end as
// 'no', and only one of them is the shopkeeper's fault.
let lastError = null;

export const session = {
  async whoami(){
    const { data } = await sb.auth.getUser();
    const u = data && data.user;
    if (!u) return null;
    const p = (await local.profile.get()) || {};
    return {
      id: u.id,
      email: u.email || null,
      // An anonymous user is a real user with no way back to it from
      // another device. The UI says so rather than pretending the
      // person is signed in.
      guest: !!u.is_anonymous || !u.email,
      name: p.name || null,
      phone: p.phone || null,
    };
  },

  // Ask for a code. `shouldCreateUser` is deliberately absent: a first
  // order from a new email must work, and refusing to create the user
  // would mean "that code never arrived" for everybody new.
  async sendCode(email){
    const u = (await sb.auth.getUser()).data.user;
    // An anonymous user is UPGRADED rather than replaced, so the
    // addresses they already saved stay theirs. verifyCode() below
    // mirrors this branch.
    if (u && u.is_anonymous){
      const { error } = await sb.auth.updateUser({ email });
      if (!error) return { mode: 'upgrade' };
      // That address already belongs to somebody, which is not an
      // error here -- it is the ordinary case of a customer who
      // signed in once and has opened the app on a second phone.
      // They are anonymous again on this device, so the upgrade
      // path cannot work; sign them into the account they already
      // have and let this device's empty anonymous one go.
      if (!taken(error)) oops(error);
    }
    const { error } = await sb.auth.signInWithOtp({ email });
    oops(error);
    return { mode: 'signin' };
  },

  async verifyCode(email, token, mode){
    const { error } = await sb.auth.verifyOtp({
      email, token,
      // 'email_change' confirms the address just attached to an
      // anonymous user; 'email' signs an existing one in.
      type: mode === 'upgrade' ? 'email_change' : 'email',
    });
    oops(error);
    bust();
    return session.whoami();
  },

  async signOut(){
    await sb.auth.signOut();
    whoCache = null;
    bust();
    // Straight back to an anonymous session, so the app is never in a
    // state where there is no user and every read fails.
    await begin();
    return session.whoami();
  },

  // THE STORE CODE, HANDED TO THE SERVER.
  //
  // lock.js checks the code in the browser, which can only ever
  // decide whether a BUTTON is drawn -- the database never heard
  // about it, so whoever got past the gate still read `orders` as a
  // stranger and saw an empty board. claim_staff() checks the same
  // code against a bcrypt hash nothing can read and, on a match,
  // puts THIS session into `staff`. No email, no account, no uuid
  // copied out of a dashboard: the code is the whole credential.
  //
  // 'missing' is its own answer because it is a setup mistake, not a
  // wrong code, and telling somebody their code is wrong when the
  // function was never deployed sends them to rotate a code that was
  // fine.
  async claimStaff(code){
    const { data, error } = await sb.rpc('claim_staff', { code });
    if (error){
      const m = (error.message || '') + ' ' + (error.code || '');
      lastError = m;
      lastClaim = /PGRST202/i.test(m) ? 'missing' : 'no';
    } else {
      lastClaim = data ? 'ok' : 'no';
    }
    // EVERYTHING FETCHED BEFORE THIS WAS FETCHED AS A STRANGER.
    // Boot renders the customer home even on the store link, and
    // that render asks for orders -- which row-level security
    // answers with nothing, because this session was not staff a
    // moment ago. The answer is then cached, and the board drawn
    // seconds later reads the cache rather than the database: an
    // empty board that fills the instant you reload, which is
    // exactly what it looked like.
    if (lastClaim === 'ok'){ bust(); fire('orders'); }
    return lastClaim;
  },

  // A database with no claim_staff() in it cannot be talked round by
  // typing the code again, and the board was about to tell somebody
  // who had JUST typed it to type it. This is how it tells the two
  // apart.
  async claimState(){ return lastClaim; },
  async claimError(){ return lastError; },

  async isStaff(){
    const { data, error } = await sb.from('staff').select('user_id').limit(1);
    // The policy on `staff` is `is_staff()`, so a non-staff user sees
    // an empty list rather than an error. Either way: not staff.
    if (error) return false;
    return (data || []).length > 0;
  },
};

// ---------------------------------------------------------------------
//  live -- Realtime, with the local cart left where it is
//
//  Row-level security is applied per subscriber, so the customer's
//  socket carries only their own orders and the shop's carries all of
//  them. That is the rule doing the work, not the client asking
//  nicely.
// ---------------------------------------------------------------------
const subs = new Map();                 // topic -> Set<cb>
let channel = null;

function fire(topic){
  for (const cb of subs.get(topic) || []){
    try { cb(); } catch (e) { console.error('subscriber', topic, e); }
  }
}

function openChannel(){
  if (channel) return;
  channel = sb.channel('kirana')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
        () => { bust(); fire('orders'); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' },
        () => { bustRuns(); fire('runs'); })
    .subscribe();
}

export const live = {
  subscribe(topic, cb){
    if (topic === 'cart') return local.live.subscribe(topic, cb);
    openChannel();
    if (!subs.has(topic)) subs.set(topic, new Set());
    subs.get(topic).add(cb);
    return () => { const s = subs.get(topic); if (s) s.delete(cb); };
  },
};

// ---------------------------------------------------------------------
//  One generation of orders at a time
//
//  Screens repaint rather than diff, and a repaint asks several
//  questions -- how many on this run, what is on the board, what is
//  the load list. Querying per question would be a dozen round trips
//  for one screen. So a generation is fetched once and shared, and
//  ANY change at all throws it away: a Realtime event, or a write
//  from this tab. Nothing is ever served from a cache that an event
//  has already contradicted.
// ---------------------------------------------------------------------
let ordersGen = null;
const bust = () => { ordersGen = null; };

async function allOrders(){
  if (!ordersGen) ordersGen = (async () => {
    const { data, error } = await sb
      .from('orders')
      .select('*, order_lines(*)')
      .order('placed_at', { ascending: true });
    oops(error);
    return (data || []).map(toApp);
  })().catch((e) => { ordersGen = null; throw e; });
  return ordersGen;
}

const toApp = (r) => ({
  id: r.id,
  code: r.code,
  placedAt: r.placed_at,
  runId: r.run_id,
  userId: r.user_id || null,
  status: r.status,
  customer: {
    name: r.cust_name, phone: r.cust_phone,
    flat: r.flat, society: r.society, area: r.area,
    landmark: r.landmark || '', ll: r.ll || null,
  },
  lines: (r.order_lines || []).map((l) => ({
    pid: l.pid, nameEn: l.name_en, pack: l.pack || {},
    qty: l.qty, unitPrice: l.unit_price, unitMrp: l.unit_mrp,
    lineTotal: l.line_total,
  })),
  itemsTotal: r.items_total, mrpTotal: r.mrp_total, saved: r.saved,
  coupon: r.coupon, couponPercent: r.coupon_pct, discount: r.discount,
  fee: r.fee, grand: r.grand,
  paid: r.paid, paidAt: r.paid_at, paidVia: r.paid_via,
  payMethod: r.pay_method,
  seq: r.stop_seq,
  history: r.history || [],
  note: r.note || '',
});

// ---------------------------------------------------------------------
//  places -- the address book, in Postgres
// ---------------------------------------------------------------------
const addrToApp = (r) => ({
  id: r.id, label: r.label || '', name: r.name, phone: r.phone,
  flat: r.flat, society: r.society, area: r.area,
  landmark: r.landmark || '', ll: r.ll || null,
  isDefault: r.is_default, at: r.created_at,
});
const addrToRow = (a) => ({
  label: a.label || null, name: a.name, phone: a.phone,
  flat: a.flat, society: a.society, area: a.area,
  landmark: a.landmark || null, ll: a.ll || null,
});

export const places = {
  async list(){
    const { data, error } = await sb.from('addresses').select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    oops(error);
    return (data || []).map(addrToApp);
  },

  async get(id){
    const { data, error } = await sb.from('addresses').select('*').eq('id', id).maybeSingle();
    oops(error);
    return data ? addrToApp(data) : null;
  },

  async save(a){
    let row;
    if (a.id){
      const { data, error } = await sb.from('addresses')
        .update({ ...addrToRow(a), is_default: !!a.isDefault })
        .eq('id', a.id).select().single();
      oops(error);
      row = data;
    } else {
      const first = (await places.list()).length === 0;
      const { data, error } = await sb.from('addresses')
        // The first address saved is the default: there is nothing to
        // choose between when there is one.
        .insert({ ...addrToRow(a), is_default: first || !!a.isDefault })
        .select().single();
      oops(error);
      row = data;
    }
    if (row.is_default){
      // Exactly one default. RLS already limits this to the caller's
      // own rows, so no user_id filter is needed -- but a row that
      // isn't theirs could not be updated even if one were asked for.
      const { error } = await sb.from('addresses')
        .update({ is_default: false }).neq('id', row.id);
      oops(error);
    }
    return addrToApp(row);
  },

  async remove(id){
    const { error } = await sb.from('addresses').delete().eq('id', id);
    oops(error);
    // Deleting the default promotes the next one, rather than leaving
    // the book with nothing chosen.
    const rest = await places.list();
    if (rest.length && !rest.some((a) => a.isDefault)) await places.setDefault(rest[0].id);
  },

  async setDefault(id){
    let { error } = await sb.from('addresses').update({ is_default: false }).neq('id', id);
    oops(error);
    ({ error } = await sb.from('addresses').update({ is_default: true }).eq('id', id));
    oops(error);
  },
};

// ---------------------------------------------------------------------
//  runs -- derived from the timetable, then overlaid
//
//  Identical arithmetic to the local backend, because it is the same
//  functions out of domain.js. The only difference is where the
//  overlay comes from.
// ---------------------------------------------------------------------
let runsGen = null;
const bustRuns = () => { runsGen = null; };

async function runOverlay(){
  if (!runsGen) runsGen = (async () => {
    const { data, error } = await sb.from('runs').select('*');
    oops(error);
    const m = {};
    for (const r of data || []){
      m[r.id] = {};
      if (r.enabled !== null) m[r.id].enabled = r.enabled;
      if (r.status) m[r.id].status = r.status;
      if (r.note) m[r.id].note = r.note;
    }
    return m;
  })().catch((e) => { runsGen = null; throw e; });
  return runsGen;
}

export const runs = {
  async forDate(date){
    const d = await DATA;
    const stored = await runOverlay();
    return d.slots.map((s) =>
      ({ ...deriveRun(date, s), ...(stored['run-' + date + '-' + s.id] || {}) }));
  },

  async byId(id){
    const m = /^run-(\d{4}-\d{2}-\d{2})-(\w+)$/.exec(id || '');
    if (!m) return null;
    return (await runs.forDate(m[1])).find((r) => r.id === id) || null;
  },

  async bookable(){
    const now = new Date();
    const today = istDate(now), m = istMins(now);
    const out = [];
    for (const date of [today, addDays(today, 1)]){
      for (const r of await runs.forDate(date)){
        if (!r.enabled) continue;
        const open = isBookable(r, today, m);
        if (date === today && !open) continue;
        const n = (await runs.ordersOf(r.id)).length;
        out.push({ ...r, taken: n, left: r.cap - n, full: n >= r.cap });
      }
    }
    return out;
  },

  async today(){
    const now = new Date();
    const today = istDate(now), m = istMins(now);
    const out = [];
    for (const r of await runs.forDate(today)){
      out.push({ ...r, state: runState(r, today, m), ...(await runs.counts(r.id)) });
    }
    return out;
  },

  async ordersOf(runId){
    const all = await allOrders();
    return clone(all.filter((o) => o.runId === runId && o.status !== 'cancelled'));
  },

  async setStatus(runId, to){
    const r = await runs.byId(runId);
    if (!r) throw new Error('NO_SUCH_RUN');
    const from = runState(r, istDate(), istMins());
    if (!canAdvanceRun(from, to)) throw new Error('BAD_RUN_STATE:' + from + '>' + to);
    return runs.patch(runId, { status: to });
  },

  async patch(runId, patch){
    const row = { id: runId, updated_at: new Date().toISOString() };
    if ('enabled' in patch) row.enabled = patch.enabled;
    if ('status'  in patch) row.status  = patch.status;
    if ('note'    in patch) row.note    = patch.note;
    const { data, error } = await sb.from('runs')
      .upsert(row, { onConflict: 'id' }).select().single();
    oops(error);
    bustRuns();
    fire('runs');
    return clone(data);
  },

  async load(runId){ return localLoad(await runs.ordersOf(runId)); },

  async counts(runId){
    const list = await runs.ordersOf(runId);
    let items = 0, cash = 0, paidTotal = 0, paidCount = 0;
    let saidTotal = 0, saidCount = 0;
    const byStatus = {};
    for (const o of list){
      for (const l of o.lines) items += l.qty;
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      // Same rule as the local backend, and for the same reason: a
      // customer's "I have paid" is a claim, so it stays in `cash`
      // until the shop has verified it.
      const ps = payState(o);
      if (ps === 'verified'){ paidTotal += o.grand; paidCount += 1; }
      else cash += o.grand;
      if (ps === 'said'){ saidTotal += o.grand; saidCount += 1; }
    }
    return {
      orders: list.length, items, cash, paidTotal, paidCount,
      saidTotal, saidCount, byStatus,
    };
  },
};

// What to load: every product summed across every order on the run.
// The one piece of arithmetic in this app a human cannot check by eye.
async function localLoad(list){
  const d = await DATA;
  const sum = new Map();
  for (const o of list){
    if (o.status === 'cancelled') continue;
    for (const l of o.lines){
      const cur = sum.get(l.pid) || { pid: l.pid, nameEn: l.nameEn, pack: l.pack, qty: 0 };
      cur.qty += l.qty;
      sum.set(l.pid, cur);
    }
  }
  const rows = [...sum.values()].map((r) => {
    const p = d.byId[r.pid];
    return { ...r, cat: p ? p.cat : 'other', tile: p ? p.tile : 'box' };
  });
  rows.sort((a, b) => String(a.cat).localeCompare(String(b.cat))
    || String(a.nameEn).localeCompare(String(b.nameEn)));
  return rows;
}

// ---------------------------------------------------------------------
//  orders
// ---------------------------------------------------------------------
export const orders = {
  async all(){ return clone(await allOrders()); },

  // The customer's own list. The shop's board uses all() -- and on
  // the shopkeeper's phone RLS hands back everybody's orders, so
  // this filter is doing real work rather than restating the rule.
  async mine(){
    const me = (await sb.auth.getUser()).data.user;
    const all = await allOrders();
    const mine = me ? all.filter((o) => o.userId === me.id) : [];
    return clone(mine.slice().reverse());
  },

  async byId(id){ return clone((await allOrders()).find((o) => o.id === id) || null); },

  async forRun(runId){ return runs.ordersOf(runId); },

  // Newest first, each product once. A history, not a score: the
  // most recent thing is the most likely thing.
  async againItems(limit){
    const d = await DATA;
    const inCart = new Set((await local.cart.lines()).map((l) => l.pid));
    const seen = new Set();
    const out = [];
    for (const o of await orders.mine()){
      for (const l of o.lines){
        if (seen.has(l.pid) || inCart.has(l.pid)) continue;
        seen.add(l.pid);
        const p = d.byId[l.pid];
        if (p && p.stock) out.push(clone(p));
        if (out.length >= (limit || 8)) return out;
      }
    }
    return out;
  },

  // The cut-off is enforced HERE and never in the picker. A customer
  // can sit on the address screen across it, and a generic failure at
  // this moment loses the order.
  async place(draft){
    const d = await DATA;
    const run = await runs.byId(draft.runId);
    if (!run) throw new Error('NO_SUCH_RUN');
    if (!run.enabled) throw new Error('RUN_CLOSED');
    if (!isBookable(run, istDate(), istMins())) throw new Error('RUN_CLOSED');
    if ((await runs.ordersOf(run.id)).length >= run.cap) throw new Error('RUN_FULL');

    const raw = await local.cart.lines();
    if (!raw.length) throw new Error('CART_EMPTY');

    // Snapshot: the one moment a price must freeze.
    const lines = [];
    const b2g1 = new Set((d.offers && d.offers.b2g1) || []);
    for (const l of raw){
      const p = d.byId[l.pid];
      if (!p) continue;
      lines.push({
        pid: p.id,
        name_en: (p.brand && p.brand !== 'Shop'
                  && p.name.en.toLowerCase().indexOf(p.brand.toLowerCase()) !== 0)
                 ? p.brand + ' ' + p.name.en : p.name.en,
        pack: { ...p.pack },
        qty: l.qty,
        unit_price: p.price, unit_mrp: p.mrp,
        // NET of the offer, and from the SAME freeUnits() the basket
        // total uses. A line total that does its own arithmetic is
        // how a receipt ends up disagreeing with the figure printed
        // underneath it -- three packets at 20 listed as 60, over a
        // total of 40 -- and once an order is stored with both
        // numbers in it there is no way to say which was right.
        line_total: p.price * (l.qty - (b2g1.has(p.id) ? freeUnits(l.qty) : 0)),
      });
    }
    if (!lines.length) throw new Error('CART_EMPTY');

    // Re-matched at placement, never trusted from the cart: a code
    // withdrawn between adding it and ordering must not still apply.
    const coupon = matchCoupon(await local.cart.coupon(), d.coupons);
    const t = calcTotals(raw, d.byId, d.delivery, coupon, d.offers);
    if (t.short > 0) throw new Error('BELOW_MIN');

    const now = new Date().toISOString();
    const { data: row, error } = await sb.from('orders').insert({
      run_id: run.id,
      cust_name: draft.name, cust_phone: draft.phone,
      flat: draft.flat, society: draft.society, area: draft.area,
      landmark: draft.landmark || null, ll: draft.ll || null,
      items_total: t.items, mrp_total: t.mrp, saved: t.saved,
      coupon: t.coupon || null, coupon_pct: t.couponPercent || 0,
      discount: t.discount, fee: t.fee, grand: t.grand,
      history: [{ at: now, to: 'placed' }],
      note: draft.note || null,
    }).select().single();
    oops(error);

    const { error: le } = await sb.from('order_lines')
      .insert(lines.map((l) => ({ ...l, order_id: row.id })));
    if (le){
      // A headless order with no lines is worse than no order: the
      // board would show a ghost with a total and nothing to pack.
      await sb.from('orders').delete().eq('id', row.id);
      throw new Error(le.message);
    }

    await local.cart.clear();
    await local.profile.save({ name: draft.name, phone: draft.phone });
    bust();
    fire('orders');
    return toApp({ ...row, order_lines: lines });
  },

  // Invalid transitions THROW. A silent no-op is a button that looks
  // like it worked. The table lives in domain.js and nowhere else --
  // deliberately NOT copied into SQL, which would be a second source
  // of truth for the one thing that must have only one.
  // Re-priced here for the same reason the local one re-prices: the
  // figures are computed from the catalogue, not taken from the
  // screen. edit_order() does trust them, exactly as ord_insert
  // trusts the ones place() sends -- see db/order-edit.sql for what
  // the server DOES guarantee, which is ownership and status.
  async edit(id, lines){
    const d = await DATA;
    const o = await orders.byId(id);
    if (!o) throw new Error('NO_SUCH_ORDER');
    const b2g1 = new Set((d.offers && d.offers.b2g1) || []);
    const keep = [];
    for (const w of (lines || [])){
      if (!(w.qty > 0)) continue;
      const was = o.lines.find((l) => l.pid === w.pid);
      const p = d.byId[w.pid];
      if (!was || !p) continue;
      const free = b2g1.has(w.pid) ? freeUnits(w.qty) : 0;
      keep.push({
        pid: w.pid, name_en: was.nameEn, pack: was.pack, qty: w.qty,
        unit_price: p.price, unit_mrp: p.mrp,
        line_total: p.price * (w.qty - free),
      });
    }
    if (!keep.length) throw new Error('EMPTY');
    const coupon = matchCoupon(o.coupon, d.coupons);
    const t = calcTotals(keep.map((l) => ({ pid: l.pid, qty: l.qty })),
      d.byId, d.delivery, coupon, d.offers);
    const { error } = await sb.rpc('edit_order', {
      oid: id, newlines: keep,
      t: { items_total: t.items, mrp_total: t.mrp, saved: t.saved,
           discount: t.discount, fee: t.fee, grand: t.grand },
    });
    oops(error);
    bust(); fire('orders');
    return orders.byId(id);
  },

  async advance(id, to, note){
    const o = await orders.byId(id);
    if (!o) throw new Error('NO_SUCH_ORDER');
    if (!canAdvance(o.status, to)) throw new Error('BAD_STATE:' + o.status + '>' + to);
    const { data, error } = await sb.from('orders').update({
      status: to,
      history: o.history.concat([{ at: new Date().toISOString(), to, note: note || '' }]),
    }).eq('id', id).select('*, order_lines(*)').single();
    oops(error);
    bust();
    fire('orders');
    return toApp(data);
  },

  async cancel(id, reason){ return orders.advance(id, 'cancelled', reason); },

  async setPayMethod(id, method){
    const { data, error } = await sb.from('orders')
      .update({ pay_method: method }).eq('id', id).select('*, order_lines(*)').single();
    // A customer has no UPDATE on orders at all -- see schema.sql --
    // so their "I will pay by UPI" goes through the same function
    // that records the payment itself.
    if (error){
      const { error: re } = await sb.rpc('mark_method', { oid: id, method });
      oops(re);
      bust(); fire('orders');
      return orders.byId(id);
    }
    bust(); fire('orders');
    return toApp(data);
  },

  async setPaid(id, paid, via){
    const { data, error } = await sb.from('orders').update({
      paid: !!paid,
      paid_at: paid ? new Date().toISOString() : null,
      paid_via: paid ? (via || 'upi') : null,
    }).eq('id', id).select('*, order_lines(*)').single();
    if (error){
      // The customer's one write to their own order, and it can do
      // this and nothing else.
      const { error: re } = await sb.rpc('mark_paid', { oid: id, method: via || 'upi' });
      oops(re);
      bust(); fire('orders');
      return orders.byId(id);
    }
    bust(); fire('orders');
    return toApp(data);
  },

  async sequence(runId, orderIds){
    for (let i = 0; i < orderIds.length; i++){
      const { error } = await sb.from('orders')
        .update({ stop_seq: i + 1 }).eq('id', orderIds[i]);
      oops(error);
    }
    bust(); fire('orders');
    return runs.ordersOf(runId);
  },
};
