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
    boot();
    // Name the shop in the header once its data is in. After boot, so
    // the app is on screen rather than waiting on a fetch.
    try { const d = await ready(); setShop(d.shop); }
    catch (e) { console.warn('shop name unavailable', e); }
  });
