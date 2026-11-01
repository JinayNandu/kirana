// =====================================================================
//  map.js -- Leaflet, lazily.
//
//  The map is reassurance; the stop list underneath it is the
//  information. So every failure path here ends in a readable list,
//  never a blank grey box.
// =====================================================================

import { esc, $ } from './ui.js';
import { t, getLang } from './i18n.js';
import { MAP } from './config.js';

let loading = null;
let paths = null;

// Road geometry lives in its own file and is fetched only when a map
// screen first opens. routes.json is loaded at boot because every
// screen needs leg times for the arrival windows; the shape of the
// road is wanted on three screens out of seventeen.
//
// A failure here is not fatal -- the caller falls back to straight
// lines between the stops, drawn dashed to say so.
function loadPaths(){
  if (paths) return paths;
  paths = fetch('./data/paths.json')
    .then((r) => { if (!r.ok) throw new Error('paths ' + r.status); return r.json(); })
    .then((j) => j.paths || {})
    .catch((e) => { console.warn('road geometry unavailable', e); return {}; });
  return paths;
}

// Loaded on first entry to a map screen, not in <head>: the map is on
// three screens of seventeen and Leaflet is ~42 KB gzipped plus CSS.
export function loadLeaflet(){
  if (loading) return loading;
  if (window.L) return (loading = Promise.resolve(window.L));

  loading = new Promise((ok, no) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = MAP.leafletCss;
    css.integrity = MAP.sriCss;
    // Required, not optional: without crossorigin the browser cannot
    // verify SRI on a cross-origin file and refuses to use it at all.
    css.crossOrigin = '';
    document.head.appendChild(css);

    const js = document.createElement('script');
    js.src = MAP.leafletJs;
    js.integrity = MAP.sriJs;
    js.crossOrigin = '';
    js.onload = () => (window.L ? ok(window.L) : no(new Error('leaflet-missing')));
    js.onerror = () => no(new Error('leaflet-cdn'));
    document.head.appendChild(js);
  });
  return loading;
}

const lname = (o) => (o && o.name) ? (o.name[getLang()] || o.name.en) : '';

// The stop list. Rendered always -- the map is drawn on top of it,
// and when the map cannot load this is what is left.
export function stopList(route, youLocalityId, times){
  const c = t();
  const stops = route.stops.filter((s) => s.kind === 'stop');
  return '<ol class="rlist">' + stops.map((s, i) => {
    const you = s.localityId === youLocalityId;
    return '<li class="rstop' + (you ? ' you' : '') + '">'
      + '<span class="rnum mono">' + esc(String(i + 1)) + '</span>'
      + '<span class="rbody"><span class="rname">' + esc(lname(s)) + '</span>'
      + (you ? '<span class="pill spice">' + esc(c.yourStop) + '</span>' : '')
      + '</span>'
      + (times && times[s.id] ? '<span class="rtime mono">' + esc(times[s.id]) + '</span>' : '')
      + '</li>';
  }).join('') + '</ol>';
}

// `host` is the id of a container that is ALREADY VISIBLE. Leaflet
// measures the container inside L.map(), and a hidden section is 0x0,
// so a map built there computes a zero-tile viewport and never loads
// a single tile -- the classic grey box. Screens here are shown and
// hidden rather than routed, so this is the likeliest bug in the app
// and the reason this function takes a visible host and nothing else.
export async function drawRoute(host, { route, store, youLocalityId, bounds }){
  const el = typeof host === 'string' ? $(host) : host;
  if (!el) return;

  // Both fetches start together. Leaflet comes from a CDN and the road
  // geometry from our own origin, so waiting for one before asking for
  // the other would just add a round trip.
  const pathsP = route.hasPath ? loadPaths() : null;

  let L;
  try { L = await loadLeaflet(); }
  catch {
    el.innerHTML = '<p class="hint maperr">' + esc(t().mapUnavailable) + '</p>';
    return;
  }
  if (!el.isConnected) return;        // screen changed while we waited

  if (el._map){ el._map.remove(); el._map = null; }
  el.innerHTML = '';

  const map = L.map(el, {
    zoomControl: true,
    attributionControl: true,
    // A delivery map has no business panning to Delhi. Good manners
    // toward the tile server, and better for the reader.
    maxBounds: L.latLngBounds(bounds).pad(0.35),
    maxBoundsViscosity: 1.0,
  });
  el._map = map;

  L.tileLayer(MAP.tileUrl, {
    attribution: MAP.attribution,   // required, and never shrunk or hidden
    maxZoom: MAP.maxZoom,
    minZoom: 12,
  }).addTo(map);

  const stops = route.stops.filter((s) => s.kind === 'stop');

  // className, never the `color` option. L.polyline's colour takes a
  // literal string and cannot read a CSS variable, and snapshotting it
  // with getComputedStyle freezes it -- so the line would keep its
  // light-mode colour when the phone flips to dark at 7pm, which is
  // exactly the evening-run scenario. An SVG stroke in CSS re-evaluates
  // on theme change with no listener at all.
  let road = route.path;
  if (!road && pathsP){
    road = (await pathsP)[route.id];
    if (!el.isConnected || el._map !== map) return;   // screen changed while we waited
  }
  // When there is no road geometry the same code draws straight lines
  // between the stops, DASHED. The dash is not decoration -- it is the
  // honest signal that the line is a sketch rather than a road.
  const pts = (road && road.length) ? road
    : [store.ll, ...stops.map((s) => s.ll), store.ll];

  // A casing under the line. Borivali West has Sanjay Gandhi National
  // Park along one edge, and a green route over green parkland is
  // invisible -- this is the ordinary cartographic answer, and it
  // works in both themes because the casing is a token too.
  L.polyline(pts, { className: 'route-casing', weight: 8, opacity: 1 }).addTo(map);
  L.polyline(pts, {
    className: 'route-line' + ((road && road.length) ? '' : ' is-dashed'),
    weight: 4, opacity: 1,
  }).addTo(map);

  // divIcon's default className is "leaflet-div-icon", a white box with
  // a border. Pass '' and supply our own markup, which is then styled
  // by tokens and immune to the dark-mode tile filter.
  const pin = (html, cls) => L.divIcon({
    className: '', html: '<span class="pin ' + cls + '">' + html + '</span>',
    iconSize: [26, 26], iconAnchor: [13, 13],
  });

  L.marker(store.ll, { icon: pin('&#8962;', 'is-shop'), keyboard: false })
    .addTo(map).bindPopup(esc(lname(store)));

  stops.forEach((s, i) => {
    const you = s.localityId === youLocalityId;
    const m = L.marker(s.ll, {
      icon: pin(String(i + 1), you ? 'is-you' : ''),
      zIndexOffset: you ? 1000 : 0,
    }).addTo(map);
    m.bindPopup(esc(lname(s)));
    if (you){
      m.bindTooltip(esc(t().yourStop), { permanent: true, direction: 'top', offset: [0, -14] });
      // "The tempo comes to this area" is the honest claim. It is not
      // a door-to-door ETA and the circle says so without words.
      L.circle(s.ll, { radius: 260, className: 'you-halo', weight: 1 }).addTo(map);
    }
  });

  // Seeing the WHOLE loop is the point -- it is the proof that a real
  // tempo runs a real route. Never setView to the customer's own pin.
  map.fitBounds(L.latLngBounds(bounds), { padding: [22, 22] });

  // After layout has settled, not setTimeout(0). The container may
  // have been sized by a parent that only just became visible.
  requestAnimationFrame(() => {
    if (el._map === map) map.invalidateSize();
  });
  return map;
}

export function teardownMap(host){
  const el = typeof host === 'string' ? $(host) : host;
  if (el && el._map){ el._map.remove(); el._map = null; }
}
