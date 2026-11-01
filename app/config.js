// =====================================================================
//  config.js -- technical plumbing only.
//
//  Anything the SHOPKEEPER owns -- name, address, phone, where the shop
//  is, what delivery costs -- lives in data/shop.json instead, so that
//  changing it needs no knowledge of JavaScript and the Perl checks can
//  read it too.
//
//  Nothing secret lives here yet. When the Supabase swap happens, the
//  URL and key go in a separate gitignored `secrets.js`, not here.
// =====================================================================

// OpenStreetMap's own tiles are fine for a prototype and are what the
// map uses today. The policy warns that access to commercial services
// may be withdrawn, so going live means a free-tier key from a
// commercial OSM provider -- which is this one line, and nothing else.
// Turning a phone's coordinates into a street name, for the "use my
// location" button on the address screen.
//
// NOT Nominatim, which is the obvious choice and does not work here:
// it sends no `Access-Control-Allow-Origin`, so a browser call to it
// is blocked before it starts. Measured, not assumed -- its reverse
// endpoint answers 200 to curl and the header is simply absent.
//
// Photon is the same OpenStreetMap data, allows CORS, needs no key and
// costs nothing. It was picked over BigDataCloud on the only thing
// that matters for filling in a form: for the shop's own coordinates
// Photon returns "Devidas Road ... 400103" and BigDataCloud returns
// "Mumbai" with an empty postcode.
//
// Free and keyless means rate-limited and unsupported. One lookup per
// button press is well inside acceptable use; an autocomplete that
// fires per keystroke would not be, which is why this is on a button.
export const GEO = {
  reverseUrl: 'https://photon.komoot.io/reverse?lat={lat}&lon={lon}',
  attribution: 'OpenStreetMap contributors (ODbL), via photon.komoot.io',
  timeoutMs: 12000,
};

export const MAP = {
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  leafletJs:  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  leafletCss: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  sriJs:  'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  sriCss: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
