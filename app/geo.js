// =====================================================================
//  geo.js -- "use my location", and knowing when not to offer it.
//
//  There was a location button here before and it was REMOVED, because
//  it failed far more often than it worked: the browser blocks
//  geolocation inside an embedded page unless the host explicitly
//  allows it, and this app is shown as one. A control that reliably
//  fails is worse than no control.
//
//  What makes it worth having back is `available()`. The embedding
//  permissions policy can be ASKED whether geolocation is permitted,
//  before anything is drawn -- so the button appears only where it can
//  actually work, and nowhere else. The failure mode that got it
//  deleted is now a button that was never rendered.
//
//  Everything here throws a CODE, never a sentence, because the
//  sentences live in i18n.js in three languages.
// =====================================================================
import { GEO } from './config.js';

// WHY this runtime can or cannot do it -- a reason, not a boolean.
//
// A boolean was enough to hide the button and not enough to explain
// it. Hiding turned out to be the wrong call anyway: the first person
// to look for the feature asked why it was missing, which is exactly
// what a silently absent control does to somebody who expected it.
// A button that says what is stopping it beats one that is not there.
export function why(){
  if (!('geolocation' in navigator)) return 'nosupport';

  // Geolocation is a secure-context feature. Over plain http on
  // anything but localhost the API exists and always fails.
  if (!window.isSecureContext) return 'insecure';

  // The embedding page decides, and `allowsFeature` answers for the
  // frame this code is actually running in -- the only answer that
  // matters. A permission PROMPT state would still say "maybe" in a
  // frame whose policy has already said no.
  const pp = document.permissionsPolicy || document.featurePolicy;
  if (pp && typeof pp.allowsFeature === 'function'
      && !pp.allowsFeature('geolocation')) return 'blocked';

  return 'ok';
}

// Kept for callers that only need the yes/no.
export const available = () => why() === 'ok';

// For the Settings screen, which says plainly where it stands rather
// than leaving somebody to wonder why a button did nothing.
export function status(){
  return { why: why(), framed: window.top !== window.self,
           secure: window.isSecureContext };
}

const position = () => new Promise((resolve, reject) => {
  navigator.geolocation.getCurrentPosition(
    resolve,
    (err) => {
      // PERMISSION_DENIED 1, POSITION_UNAVAILABLE 2, TIMEOUT 3
      reject(new Error(err.code === 1 ? 'denied'
                     : err.code === 3 ? 'timeout' : 'unavailable'));
    },
    { enableHighAccuracy: true, timeout: GEO.timeoutMs, maximumAge: 60000 },
  );
});

// Coordinates to words. Returns only what it is confident about --
// a missing street comes back undefined rather than as a guess, so the
// caller can leave that field alone instead of filling it with noise.
async function reverse(lat, lon){
  const url = GEO.reverseUrl
    .replace('{lat}', encodeURIComponent(lat))
    .replace('{lon}', encodeURIComponent(lon));

  // The fetch gets its own timeout. A geocoder that never answers
  // would otherwise leave the button spinning forever, which looks
  // exactly like the app having hung.
  const stop = new AbortController();
  const t = setTimeout(() => stop.abort(), GEO.timeoutMs);
  let r;
  try {
    r = await fetch(url, { signal: stop.signal, headers: { Accept: 'application/json' } });
  } catch (e){
    throw new Error('lookup');
  } finally {
    clearTimeout(t);
  }
  if (!r.ok) throw new Error('lookup');

  const j = await r.json().catch(() => null);
  const p = j && j.features && j.features[0] && j.features[0].properties;
  if (!p) throw new Error('nothing');

  // `name` is a named building or landmark when OSM has one -- "Shiv
  // Temple Borivali" -- which is genuinely the most useful thing a
  // driver can be told, so it is kept separately as a landmark rather
  // than mashed into the street line.
  return {
    street: p.street || p.name || undefined,
    locality: p.suburb || p.locality || p.district || undefined,
    postcode: p.postcode || undefined,
    landmark: (p.name && p.name !== p.street) ? p.name : undefined,
  };
}

// The whole thing. Resolves to { ll, street, locality, postcode,
// landmark }, or throws an Error whose message is one of:
//   denied · unavailable · timeout · lookup · nothing
export async function detect(){
  const pos = await position();
  const { latitude, longitude } = pos.coords;
  const where = await reverse(latitude, longitude);
  return {
    ll: [Number(latitude.toFixed(6)), Number(longitude.toFixed(6))],
    accuracy: Math.round(pos.coords.accuracy || 0),
    ...where,
  };
}
