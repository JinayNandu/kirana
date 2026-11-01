# Parked: the fixed tempo route

Taken out of the app on the owner's call — *"we don't really need a
specific route, based on the orders the delivery guy can figure out
the route"*. Nothing here is broken; it is simply not wanted yet.

What is in here, and what it did:

| | |
|---|---|
| `map.js` | Leaflet, lazily loaded. Route polyline with a casing, numbered stop pins, "your stop" highlight, dark-mode tile filter, and every Leaflet trap already paid for. |
| `routes.json` | 13 stops per direction with measured leg times |
| `paths.json` | real road geometry baked from OSRM, 540 / 585 points |
| `zones.json` | 13 Borivali West localities in 4 zones, every coordinate checked against OpenStreetMap, plus the four places that sound like Borivali West and are not |
| `mkroute.pl` | rebuilds the stop order from the shop + zones |
| `bakeroute.pl` | one-off: asks OSRM for road geometry and leg times |

## Putting it back

1. Move `map.js` to `app/`, and the three JSON files to `app/data/`.
2. `backend-local.js` — add them to the `grab()` list and rebuild the
   `localities` / `locById` / `routeById` maps it used to expose.
3. `customer.js`, `shop.js` — re-add the `drawRoute` / `stopList` calls
   and their `teardownMap` on leave.
4. `domain.js` — `etaWindow`, `arriveAfter` and `stopIndexOf` were
   removed; they are in this folder's git history if wanted.
5. Re-run `perl parked/mkroute.pl` then `perl parked/bakeroute.pl full`
   if the shop has moved since.

## The one thing worth keeping in mind

The route existed to let the app promise *"the tempo reaches your lane
around 5:25–5:50"*. That promise is now a flat one-hour window for
everyone, which is weaker but true for every address rather than only
the thirteen that were on the list. Do not re-add the route without
also re-adding a reason to trust its timings.
