// =====================================================================
//  app.js -- the entry point, and the only module that knows about all
//  three roles.
//
//  ui.js must never import these; they import it. This file exists so
//  that the import graph stays a tree -- a cycle in ES modules hands
//  you `undefined` for something that looks hoisted and throws at
//  render, which no checker can see.
// =====================================================================

import { boot, setShop } from './ui.js';
import { ready, begin, shared } from './store.js';
import { prime } from './lock.js';
import './customer.js';
import './shop.js';
import './settings.js';
import { seedIfEmpty } from './seed.js';

// Demo orders before the first paint, so the Store board is never
// empty on a device being shown to someone. No-ops once anything real
// exists, and once shop.json says demo:false.
seedIfEmpty()
  .then((r) => { if (r.seeded) console.info('seeded ' + r.seeded + ' demo orders'); })
  .catch((e) => console.warn('seed failed', e))
  .finally(async () => {
    // The shop data has to be in BEFORE the header goes live, because
    // it carries the Store code -- a role switch that works for the
    // moment before it lands is a gate with a hole in it. This costs
    // nothing by the time it runs: ready() is memoised and
    // seedIfEmpty() has already awaited it.
    //
    // If it fails outright the gate is off, and that is the right way
    // round: without this data there is no catalogue, no shop name
    // and no orders, so what lies behind the gate is an empty screen.
    let d = null;
    try { d = await ready(); }
    catch (e) { console.warn('shop data unavailable', e); }

    // A session BEFORE the first query. Every visitor gets one
    // anonymously, so auth.uid() is never null and every order and
    // address has an owner -- nobody is asked to sign in to buy
    // groceries. A login wall in front of a shop is how a shop
    // loses the customer at the door.
    //
    // A failure here is NOT fatal and must not be: the app still
    // browses, and saying so beats a blank screen.
    if (shared()){
      try { await begin(); }
      catch (e) { console.error('no session -- running without the database', e); }
    }

    await prime(d && d.shop);
    boot();
    if (d) setShop(d.shop);
  });
