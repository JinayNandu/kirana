// =====================================================================
//  Icons
//
//  Stroked line art on a 24x24 grid, never filled glyphs and never a
//  little scene. Everything inherits currentColor, so a glyph is
//  coloured by whatever token its container sets and both themes come
//  out right with no second definition.
//
//  Product tiles use the PACK SHAPE, not the food. There is no
//  photograph anywhere in this app and there never will be: a generic
//  bottle plus a two-letter brand monogram reads as Amul instantly,
//  weighs nothing, and can never render as a broken image.
// =====================================================================

const P = {
  // ---- pack shapes, used by product tiles ----------------------------
  bottle:  '<path d="M10 2h4v3l1.6 2.6A4 4 0 0 1 16 9.7V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9.7a4 4 0 0 1 .4-2.1L10 5z"/><path d="M8 13h8"/>',
  carton:  '<path d="M6 8.5 12 2l6 6.5V21a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="M6 8.5h12"/><path d="M12 2v6.5"/>',
  can:     '<path d="M6 5.5C6 3.6 8.7 2 12 2s6 1.6 6 3.5v13C18 20.4 15.3 22 12 22s-6-1.6-6-3.5z"/><path d="M6 5.5C6 7.4 8.7 9 12 9s6-1.6 6-3.5"/>',
  packet:  '<path d="M6 6h12v15a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="m6 6 1.8-2.4a1 1 0 0 1 .8-.4h6.8a1 1 0 0 1 .8.4L18 6"/><path d="M9 11h6"/>',
  pouch:   '<path d="M6.5 6h11l1 11.5a4.5 4.5 0 0 1-4.5 4.5h-4A4.5 4.5 0 0 1 5.5 17.5z"/><path d="M6.5 6 8 3h8l1.5 3"/>',
  sack:    '<path d="M8 7h8c1.6 2 2.5 4.6 2.5 7.4V19a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3v-4.6C5.5 11.6 6.4 9 8 7Z"/><path d="M8 7c0-1.4.6-2.7 1.7-3.6M16 7c0-1.4-.6-2.7-1.7-3.6"/><path d="M9 14h6"/>',
  // A rounded square with docking holes on a symmetric grid. The first
  // attempt was a circle with five scattered dots and it read
  // unmistakably as a sad face at 26px -- two eyes, a nose and a
  // downturned mouth. Symmetry is what stops a pattern of dots turning
  // into a face.
  biscuit: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="9" cy="9" r=".75"/><circle cx="15" cy="9" r=".75"/><circle cx="12" cy="12" r=".75"/><circle cx="9" cy="15" r=".75"/><circle cx="15" cy="15" r=".75"/>',
  box:     '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  jar:     '<path d="M7 9h10v10a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 6h6l1 3H8z"/>',
  tin:     '<rect x="5" y="6" width="14" height="15" rx="1.5"/><path d="M5 10h14"/><path d="M9 3h6v3H9z"/>',
  tube:    '<path d="M8 8h8v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/><path d="M8 8c0-1.6 1-3 2-3h4c1 0 2 1.4 2 3"/><rect x="10" y="2" width="4" height="3" rx="1"/>',
  soap:    '<rect x="3" y="8" width="18" height="10" rx="4"/><path d="M8 11.5c1.5-1 3-1 4.5 0"/>',
  spray:   '<path d="M9 9h7v13H9z" /><path d="M9 9V6h4V4h4"/><path d="M20 6h.01M20 9h.01M22 7.5h.01"/>',
  loaf:    '<path d="M4 12a4 4 0 0 1 4-4h8a4 4 0 0 1 0 8v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M8 8c0-1.5 1-2.5 2-2.5M12 8c0-1.5 1-2.5 2-2.5"/>',
  leaf:    '<path d="M20 4c0 8-5 13-12 13H4c0-8 5-13 12-13z"/><path d="M4 21c2-5 5-8 10-10"/>',
  fruit:   '<path d="M12 7c-4 0-6 3-6 7s2.5 7 6 7 6-3 6-7-2-7-6-7z"/><path d="M12 7V4M12 4c2 0 3-1 3-2.5"/>',
  egg:     '<path d="M12 2c3.5 0 6.5 5.8 6.5 10.5A6.5 6.5 0 0 1 5.5 12.5C5.5 7.8 8.5 2 12 2z"/>',
  grain:   '<path d="M12 21V11"/><path d="M12 11c0-3 1.6-5.5 4-6.5 0 3-1.6 5.5-4 6.5z"/><path d="M12 11c0-3-1.6-5.5-4-6.5 0 3 1.6 5.5 4 6.5z"/><path d="M12 17c0-2.5 1.4-4.5 3.5-5.3 0 2.5-1.4 4.5-3.5 5.3z"/><path d="M12 17c0-2.5-1.4-4.5-3.5-5.3 0 2.5 1.4 4.5 3.5 5.3z"/>',
  roll:    '<rect x="4" y="5" width="16" height="14" rx="3"/><ellipse cx="8" cy="12" rx="2.4" ry="4.6"/>',

  // ---- interface -----------------------------------------------------
  store:   '<path d="M3 9.5 4.6 4.3A1.5 1.5 0 0 1 6 3.2h12a1.5 1.5 0 0 1 1.4 1.1L21 9.5"/><path d="M4 9.5h16V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M9.5 21v-5h5v5"/>',
  cart:    '<circle cx="9.5" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2 3h2.4l2.5 12.1a1.5 1.5 0 0 0 1.5 1.2h8.9a1.5 1.5 0 0 0 1.5-1.2L21 7H5.3"/>',
  receipt: '<path d="M5 2.5 7 4l2-1.5L11 4l2-1.5L15 4l2-1.5L19 4v16.5L17 19l-2 1.5L13 19l-2 1.5L9 19l-2 1.5L5 19z"/><path d="M9 9h6M9 13h4"/>',
  truck:   '<path d="M2 7h11v10H2z"/><path d="M13 10h4.6a2 2 0 0 1 1.7 1l1.7 3v3H13z"/><circle cx="7" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>',
  grid:    '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  search:  '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  minus:   '<path d="M5 12h14"/>',
  check:   '<path d="m4 12.5 5 5L20 6.5"/>',
  phone:   '<path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3z"/>',
  pin:     '<path d="M12 22s7-6.4 7-12A7 7 0 0 0 5 10c0 5.6 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/>',
  user:    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  x:       '<path d="M6 6l12 12M18 6 6 18"/>',
  chev:    '<path d="m9 6 6 6-6 6"/>',
  globe:   '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.5 3.6 5.6 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.6-3.6-9S9.6 5.5 12 3z"/>',
  bag:     '<path d="M5 8h14l-1 12.2a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  home:    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"/>',
  lock:    '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3"/>',
};

// The 18 pack shapes a product tile may name. data.pl checks every
// catalogue row against this list, so a typo cannot ship a blank tile.
export const TILES = ['bottle','carton','can','packet','pouch','sack','biscuit',
  'box','jar','tin','tube','soap','spray','loaf','leaf','fruit','egg','grain',
  'roll','bag'];

export function icon(name, cls){
  const body = P[name] || P.box;
  return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
}

export function hasIcon(name){ return Object.prototype.hasOwnProperty.call(P, name); }
