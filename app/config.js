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

export const MAP = {
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  leafletJs:  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  leafletCss: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  sriJs:  'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  sriCss: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};

// ---------------------------------------------------------------------
//  Supabase -- the shared database
//
//  BOTH OF THESE ARE PUBLISHABLE and belong in client code. The
//  publishable key (sb_publishable_..., or a legacy anon key on an
//  older project) identifies the project and nothing else; what
//  protects the data is the row-level rules in db/schema.sql, which
//  run on the server where nobody can edit them. A key in a browser
//  is only a secret if the server trusts it, and this one is not
//  trusted.
//
//  LEAVE `url` EMPTY and the whole app runs in this browser on
//  backend-local.js, exactly as it did before -- which is what keeps
//  `perl tools/serve.pl 8110 app` working with no project at all, and
//  what makes going live a two-line edit here rather than a rewrite.
//
//  NEVER put the SECRET key here (sb_secret_..., or the legacy
//  service_role). It carries BYPASSRLS -- it ignores every rule in
//  db/schema.sql -- so in a browser it would hand every customer's
//  address and phone number to anyone who opened developer tools.
//
//  Setup, step by step: db/SETUP.md
// ---------------------------------------------------------------------
// How many digits the sign-in code has.
//
// ⚠️ THIS MUST MATCH THE SUPABASE PROJECT. Authentication -> Sign In /
// Providers -> Email -> Email OTP Length. Supabase ships 6 but allows
// 6 to 10, and a project set to 8 against an app expecting 6 fails in
// the worst way available: the box auto-submits after the sixth digit,
// the server rejects two thirds of a code, and the customer is told
// their code is wrong however carefully they type it.
//
// The wording in i18n.js says "six-digit" in all three languages, so
// changing this means changing those too. Six is the right answer for
// a shop -- it is the length everybody already knows from their bank.
export const OTP_LEN = 6;

export const SUPABASE = {
  url: 'https://pdcvdthlrvhtsnpfggsc.supabase.co',
  key: 'sb_publishable_25_o0iqXbQgrNVcbddAqTw_jl_764GO',
};
