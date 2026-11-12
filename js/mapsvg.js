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
  // Highlights (mapHighlightSVG) are drawn on top in the .hl layer.
  const ring = (id, r, colour, op, keep) => `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%">
      <feMorphology in="SourceAlpha" operator="erode" radius="${r}" result="in"/>
      <feComposite in="SourceAlpha" in2="in" operator="out" result="ring"/>
      <feFlood flood-color="${colour}" flood-opacity="${op}"/>
      <feComposite in2="ring" operator="in" result="edge"/>
      <feMerge>${keep ? `<feMergeNode in="SourceGraphic"/>` : ""}<feMergeNode in="edge"/></feMerge></filter>`;
  let s = `<svg class="board" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of Europe split into ${TERRITORIES.length} territories">
    <defs>${ring(fid, 0.9, "#5d5543", 0.55, true)}</defs>
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

// An outline (and for "near", a light tint) round one territory, for the map's top .hl layer.
// kind: "here" (dark: where you are), "near" (orange: you can move there) or "sel" (blue: the one you clicked).
// The outline is drawn as vector shapes, so it stays smooth at any zoom: the territory, widened by a stroke,
// with its own inside masked out leaves a clean ring just outside its edge (and no lines between the
// provinces a territory is made of).
let hlIds = 0;
function mapHighlightSVG(fid, tid, kind) {
  const t = TERRITORIES.find(x => x.id === tid);
  if (!t) return "";
  const d = t.provinces.map(p => PROVINCE_PATHS[p]).join(" "), [W, H] = MAP_SIZE, id = `${fid}-m${++hlIds}`;
  const style = { here: ["#1d1d1b", 2.6, 0.9], near: ["#d4682a", 1.6, 0.9], sel: ["#2f6db5", 2.6, 0.95] }[kind] || ["#1d1d1b", 2, 0.9];
  const [colour, width, op] = style;
  return `${kind === "near" ? `<path d="${d}" fill="${colour}" fill-opacity=".12"/>` : ""}
    <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><path d="${d}" fill="#000"/></mask>
    <path d="${d}" mask="url(#${id})" fill="${colour}" stroke="${colour}" stroke-width="${width * 2}" stroke-linejoin="round" opacity="${op}"/>`;
}
