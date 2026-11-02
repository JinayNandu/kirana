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
import { ready } from './store.js';
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

    await prime(d && d.shop);
    boot();
    if (d) setShop(d.shop);
  });
