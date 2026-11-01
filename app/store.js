// =====================================================================
//  store.js -- the data-layer facade.
//
//  The UI imports THIS and never the backend directly. Swapping to
//  Supabase is the one commented line below: no screen file changes,
//  no signature changes, nothing else to touch.
//
//  Note that backend-local.js imports nothing secret, so the app runs
//  with no credentials file present at all and only gains that
//  dependency the day the import flips. That is what makes the swap
//  genuinely one line, rather than one line plus "and now go and
//  create a config file".
// =====================================================================

import * as backend from './backend-local.js';
// import * as backend from './backend-supabase.js';   // <-- the swap

export const {
  ready, catalog, cart, runs, orders, profile, session, live,
} = backend;
