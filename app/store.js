// =====================================================================
//  store.js -- the data-layer facade.
//
//  The UI imports THIS and never a backend directly.
//
//  The swap used to be a commented import line. It is now not even
//  that: app/config.js either names a Supabase project or does not,
//  and this file picks accordingly. With no project the app runs
//  entirely in one browser, which is what keeps it demoable on a
//  laptop with nothing set up; with one, a customer's order on their
//  phone lands on the shopkeeper's counter.
//
//  Both backends obey the same four rules -- every method async,
//  returns deep-cloned, ids minted by the backend, live.subscribe
//  returning an unsubscribe function -- which is what makes a choice
//  made at load time safe for every call site.
// =====================================================================

import * as local from './backend-local.js';
import { SUPABASE } from './config.js';

// BOTH, not just the url. A config with one filled in and the other
// blank is a real state -- it is what this file looks like halfway
// through setting the project up -- and switching on the url alone
// would hand every screen a client that cannot authenticate. Falling
// back to one-browser mode until both are present means a half-done
// setup is a working app rather than a broken one.
const backend = (SUPABASE.url && SUPABASE.key)
  ? await import('./backend-supabase.js')
  : local;

export const {
  ready, catalog, cart, runs, orders, profile, places, session, live,
} = backend;

// True when there is a database behind this and orders travel between
// devices. The UI uses it to tell the truth about what it can promise
// -- "your order is with the shop" means something different when the
// only copy is in this browser.
export const shared = () => !!(SUPABASE.url && SUPABASE.key);

// Gets a session before the first query. A no-op on the local backend,
// where there is nobody to be.
export const begin = backend.begin || (async () => null);
