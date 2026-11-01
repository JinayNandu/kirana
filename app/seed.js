// =====================================================================
//  seed.js -- the demo world.
//
//  A fresh device has no orders, so the Store board and the load list
//  -- the two screens that actually sell this -- open empty. That is
//  the wrong first impression for a prototype someone is being shown.
//
//  So on a device that has NEVER been used, this drops four plausible
//  orders onto the next bookable run. Three rules keep it honest:
//
//   1. It runs ONLY when there are zero orders. The moment anyone
//      places a real one, this never fires again.
//   2. It goes through the ordinary public API -- cart, then place --
//      so a seeded order is not a special kind of order and cannot
//      drift from a real one.
//   3. It leaves no profile behind, so the viewer is not quietly
//      logged in as somebody made up.
//
//  THESE PEOPLE ARE INVENTED. The names, flats and phone numbers are
//  not real and the phones do not dial. That is fine in a prototype
//  nobody has shipped, and it is exactly the kind of thing that must
//  not survive contact with a real customer -- so:
//
//      SET demo:false IN app/data/shop.json BEFORE ANYONE REAL USES IT.
// =====================================================================

import { ready, cart, orders, runs, profile } from './store.js';

const PEOPLE = [
  { name: 'Rohit Kulkarni', phone: '9820000001',
    flat: 'A-12', society: 'Hill View CHS', area: 'I.C. Colony',
    landmark: 'Near the church',
    items: [['p-atta-aash5', 1], ['p-amultaaza500', 3], ['p-parleg250', 2],
            ['p-colgate200', 1], ['p-onion1', 1]] },

  { name: 'Farida Shaikh', phone: '9820000002',
    flat: 'Flat 7', society: 'Sai Darshan', area: 'Gorai Road',
    landmark: 'Opposite the MHB bus depot',
    items: [['p-rice-igc1', 2], ['p-oil-fort1', 1], ['p-surf1', 2],
            ['p-bisleri2', 4], ['p-maggi-8', 1]] },

  { name: 'Mehul Shah', phone: '9820000003',
    flat: '3rd floor', society: 'Mehta Niwas', area: 'Shimpoli',
    landmark: 'Above the bakery',
    items: [['p-parleg250', 3], ['p-amulbutter100', 2], ['p-tatatea500', 1],
            ['p-potato1', 2]] },

  { name: 'Sunita Patil', phone: '9820000004',
    flat: '602', society: 'Sai Krupa CHS', area: 'Vazira Naka',
    landmark: 'Next to the medical store',
    items: [['p-dal-toor1', 1], ['p-ghee-amul500', 1], ['p-bread-ww', 1],
            ['p-eggs12', 1], ['p-tomato1', 2]] },
];

export async function seedIfEmpty(){
  const d = await ready();
  if (!d.shop.demo) return { seeded: 0, why: 'demo is off in shop.json' };

  const existing = await orders.all();
  if (existing.length) return { seeded: 0, why: 'this device already has orders' };

  const open = (await runs.bookable()).filter((r) => !r.full);
  if (!open.length) return { seeded: 0, why: 'no run is taking orders' };
  const run = open[0];

  let made = 0;
  for (const p of PEOPLE){
    try {
      await cart.clear();
      for (const [pid, n] of p.items) await cart.add(pid, n);
      await orders.place({ runId: run.id, ...p });
      made++;
    } catch (e) {
      console.warn('seed skipped ' + p.name, e.message);
    }
  }

  // place() remembers the customer, which is right for a real order and
  // wrong for an invented one -- the viewer would open the app already
  // addressed as Sunita Patil.
  await cart.clear();
  try { localStorage.removeItem('kirana.profile'); } catch {}

  return { seeded: made, run: run.id };
}
