// Sellers Market: draws the map of Europe as SVG (used by the game and the Territories page).

// Draws the map. Returns the SVG as text plus where each name ends (for markers).
function europeMapSVG(fid) {
  const [W, H] = MAP_SIZE;
  const LAND = ["#eadfb8", "#d8e3b5", "#efd3b1", "#d9d6bd", "#e6cbbf", "#cfe1c6"];
  const SEA = ["#bcd5e9", "#a8c8e2", "#c7dcec"];
  // Give neighbours different colours.
  const colour = {};
  TERRITORIES.forEach(t => {
    const pal = t.sea ? SEA : LAND;
    const taken = new Set((TERRITORY_NEIGHBOURS[t.id] || []).map(n => colour[n]));
    colour[t.id] = pal.find(c => !taken.has(c)) || pal[0];
  });

  // Borders: each territory gets a thin ring just inside its edge (a filter, so territories made of
  // several provinces get one outline, with no lines between their provinces). Two neighbours' rings
  // meet to make one fine border line.
  // Highlights (mapHighlightSVG) use wider rings in their own colour, drawn on top in the .hl layer.
  const ring = (id, r, colour, op, keep) => `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%">
      <feMorphology in="SourceAlpha" operator="erode" radius="${r}" result="in"/>
      <feComposite in="SourceAlpha" in2="in" operator="out" result="ring"/>
      <feFlood flood-color="${colour}" flood-opacity="${op}"/>
      <feComposite in2="ring" operator="in" result="edge"/>
      <feMerge>${keep ? `<feMergeNode in="SourceGraphic"/>` : ""}<feMergeNode in="edge"/></feMerge></filter>`;
  let s = `<svg class="board" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of Europe split into ${TERRITORIES.length} territories">
    <defs>${ring(fid, 0.9, "#5d5543", 0.55, true)}${ring(fid + "-here", 3.2, "#1d1d1b", 0.9, false)}${ring(fid + "-near", 2, "#d4682a", 0.85, false)}${ring(fid + "-sel", 3.2, "#2f6db5", 0.95, false)}</defs>
    <rect width="${W}" height="${H}" fill="#cfc8a6"/>`;
  TERRITORIES.forEach(t => {
    const c = colour[t.id];
    s += `<g class="terr${t.sea ? " sea" : ""}" data-t="${t.id}" filter="url(#${fid})" data-c="${c}"><title>${t.name}</title>` +
      t.provinces.map(p => `<path d="${PROVINCE_PATHS[p]}" fill="${c}" stroke="${c}" stroke-width="1.5"/>`).join("") + `</g>`;
  });

  // Names, sized to fit the room inside each territory
  const below = {};
  TERRITORIES.forEach(t => {
    const [x, y, room] = TERRITORY_LABELS[t.id];
    const fs = 16; // every name the same size (long names wrap onto two lines)
    const words = t.name.split(" ");
    const lines = t.name.length > 11 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [t.name];
    below[t.id] = y + ((lines.length - 1) / 2) * fs * 1.05 + fs * .35;
    lines.forEach((ln, i) => {
      s += `<text x="${x}" y="${y + (i - (lines.length - 1) / 2) * fs * 1.05 + fs * .35}" text-anchor="middle" font-size="${fs.toFixed(1)}" class="tname${t.sea ? " sea" : ""}" fill="${t.sea ? "#3d6a8f" : "#4a4232"}" ${t.sea ? 'font-style="italic"' : 'font-weight="700"'} paint-order="stroke" stroke="${colour[t.id]}" stroke-width="3">${ln}</text>`;
    });
  });

  return { svg: s + `<g class="hl"></g></svg>`, below };
}

// An outline (and for "near", a light tint) over one territory, for the map's top .hl layer.
// kind: "here" (dark ring), "near" (orange ring and tint) or "sel" (blue ring: the one you clicked). fid: the id passed to europeMapSVG.
function mapHighlightSVG(fid, tid, kind) {
  const t = TERRITORIES.find(x => x.id === tid);
  if (!t) return "";
  const d = t.provinces.map(p => PROVINCE_PATHS[p]).join(" ");
  return `${kind === "near" ? `<path d="${d}" fill="#d4682a" fill-opacity=".14"/>` : ""}<g filter="url(#${fid}-${kind})"><path d="${d}" fill="#000"/></g>`;
}
