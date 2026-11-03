// =====================================================================
//  lock.js -- the code that opens the Store view.
//
//  PURE, like domain.js. No DOM, no ui.js import, no screen drawing.
//  ui.js owns the gate screen and calls in here to ask whether it has
//  to draw one. That keeps the import graph a tree: ui.js -> lock.js
//  and never back.
//
//  ---------------------------------------------------------------
//  WHAT THIS IS, AND WHAT IT IS NOT
//
//  It is a lock on a door. It stops a customer who taps "Store" from
//  landing on the picking lists and the money tally. That is the
//  thing that actually happens, and it is worth stopping.
//
//  It is NOT a safe, and nothing here pretends otherwise:
//
//   - The app is a static page. Every line of this file is served to
//     whoever opens it, so the MECHANISM is public by construction.
//     What is not public is the code itself -- see below.
//   - Orders live in this browser's localStorage. Anyone who can open
//     a developer console on a device can read them straight out of
//     storage without going near this gate. Today that is only ever
//     that device's OWN orders, so there is nothing of anyone else's
//     to reach.
//   - The day the Supabase swap happens, the board shows EVERY
//     customer's address and phone, and at that point a check running
//     in the browser is the wrong place for it entirely. The server
//     must refuse to send a stranger the orders at all. This gate
//     then becomes the UI in front of that, not the thing holding
//     the door.
//
//  ---------------------------------------------------------------
//  WHY THE CODE IS NOT IN shop.json IN PLAIN TEXT
//
//  shop.json is fetched by the page, so it is readable by anyone
//  with the URL. A plain code in it would be a code written on the
//  door. What is published instead is PBKDF2-SHA256 of the code --
//  a one-way derivation that is deliberately slow, so that trying
//  all million six-digit codes costs real hours rather than the
//  blink of an eye a bare SHA-256 would cost.
//
//  One derivation produces 64 bytes and both halves get used:
//
//    first 32  `proof`  published. Verifies a typed code.
//    last  32  `token`  NEVER published. Kept on the device that
//                       unlocked, as the thing that says it did.
//
//  shop.json carries SHA-256 of the token as `seal`, which is what
//  a later visit checks the stored token against. That is the whole
//  reason for splitting the derivation: if the unlock flag were a
//  boolean, or anything derivable from the published file, it could
//  be forged by typing one line into a console. This way the only
//  road to a valid token is the code.
// =====================================================================

const KEY = 'kirana.storeopen';   // the token, on a device that is past the gate
const TRY = 'kirana.storetries';  // wrong attempts, for the cool-off

const te = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)]
  .map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array((s.match(/../g) || []).map((h) => parseInt(h, 16)));

// crypto.subtle exists only in a SECURE CONTEXT -- https, or
// localhost. Over plain http on a LAN it is simply undefined, and
// there is then no way to check a code at all.
export const canHash = () => !!(globalThis.crypto && globalThis.crypto.subtle);

const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', te.encode(s)));

async function derive(code, saltHex, iterations){
  const key = await crypto.subtle.importKey(
    'raw', te.encode(String(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations }, key, 512);
  const all = hex(bits);
  return { proof: all.slice(0, 64), token: all.slice(64) };
}

// ---------------------------------------------------------------------
//  State, decided once at boot
//
//  `open` is cached rather than read per call, because checking it
//  means a hash and setRole() cannot be async -- the role switch is a
//  button press and must act in the same tick.
// ---------------------------------------------------------------------
let staff = null;     // the block from shop.json, or null when there is none
let open  = false;

export async function prime(shop){
  staff = (shop && shop.staff && shop.staff.proof) ? shop.staff : null;
  open = false;
  if (!staff) return;                       // no code set: the view is not gated
  if (!canHash()) return;                   // cannot verify, so stays shut -- see gated()
  let held = null;
  try { held = localStorage.getItem(KEY); } catch {}
  if (!held) return;
  try { open = (await sha256(held)) === staff.seal; } catch {}
  if (!open) forget();
}

// Is the Store view behind a code at all? False when shop.json names
// no code, which is how anyone taking this app and not setting one
// gets the app as it was.
export const gated = () => !!staff;

// May this device in. True when nothing is gated, or when this device
// has been through the gate.
export const passed = () => !staff || open;

// Configured but unverifiable -- served over plain http, where
// crypto.subtle does not exist. It fails SHUT rather than open, and
// says which it is, because "the code box does nothing" is otherwise
// unanswerable.
export const stuck = () => !!staff && !canHash();

export function forget(){
  open = false;
  try { localStorage.removeItem(KEY); } catch {}
}

// ---------------------------------------------------------------------
//  Trying a code
//
//  Five wrong in a row costs a minute. Each derivation already takes
//  a beat, so this is not about compute -- it is about somebody
//  standing at the counter with the shopkeeper's phone working
//  through 1234, 0000, 1111.
// ---------------------------------------------------------------------
const WRONG_BEFORE_WAIT = 5;
const WAIT_MS = 60000;

function tries(){
  try { return JSON.parse(localStorage.getItem(TRY) || '{}') || {}; }
  catch { return {}; }
}
function setTries(v){ try { localStorage.setItem(TRY, JSON.stringify(v)); } catch {} }

// Milliseconds still to wait, or 0.
export function waiting(){
  const t = tries();
  const left = (t.until || 0) - Date.now();
  return left > 0 ? left : 0;
}

// Whitespace off each end, and down to lowercase. A phone
// capitalises the first letter of a word on its own, and a code
// refused because the keyboard helped is indistinguishable, from
// the counter, from a code that is simply wrong.
export const tidy = (s) => String(s == null ? '' : s).trim().toLowerCase();

// Resolves 'ok' | 'wrong' | 'wait' | 'stuck'.
export async function tryCode(code){
  if (!staff) return 'ok';
  if (!canHash()) return 'stuck';
  if (waiting()) return 'wait';

  let got;
  // tidy() here and `lc` plus a trim in tools/setpin.pl, and they
  // must stay the same thing. Nothing in this project can compare a
  // Perl script with a WebCrypto call; typing the code into a
  // browser is the only proof, and it is in CLAUDE.md as such.
  try { got = await derive(tidy(code), staff.salt, staff.iterations); }
  catch { return 'stuck'; }

  if (got.proof !== staff.proof){
    const t = tries();
    t.n = (t.n || 0) + 1;
    if (t.n >= WRONG_BEFORE_WAIT){ t.n = 0; t.until = Date.now() + WAIT_MS; }
    setTries(t);
    return waiting() ? 'wait' : 'wrong';
  }

  open = true;
  setTries({});
  try { localStorage.setItem(KEY, got.token); } catch {}
  return 'ok';
}
