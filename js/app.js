// ---------- Routing ----------
function route() {
  const parts = (location.hash || "#/game").slice(2).split("/");
  const tab = parts[0] === "game" ? "game" : "mechanics";
  const sub = tab === "mechanics" ? (["gameplay", "commodities", "territories", "market", "broker", "cards", "database"].includes(parts[1]) ? parts[1] : "commodities") : null;
  document.querySelectorAll("#mainTabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  document.querySelectorAll("#subTabs a").forEach(a => a.classList.toggle("on", a.dataset.sub === sub));
  document.getElementById("subTabs").hidden = tab !== "mechanics";
  const show = tab === "game" ? "game" : sub;
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v.id === "view-" + show));
  if (sub === "commodities" && parts[2] && BY_ID[parts[2]] && parts[2] !== selected) select(parts[2]);
}
window.addEventListener("hashchange", route);

// ---------- Build the network model ----------
const BY_ID = Object.fromEntries(COMMODITIES.map(c => [c.id, c]));
const producer = {};   // main product id -> recipe
const byproductOf = {}; // waste id -> recipes that give it off
const usedIn = {};      // id -> recipes that consume it
COMMODITIES.forEach(c => { usedIn[c.id] = []; byproductOf[c.id] = []; });

RECIPES.forEach(r => {
  const outs = Object.keys(r.out);
  r.main = outs[0];
  r.extras = outs.slice(1);
  producer[r.main] = r;
  r.extras.forEach(w => byproductOf[w].push(r));
  Object.keys(r.in).forEach(i => usedIn[i].push(r));
});

function kindOf(id) {
  const c = BY_ID[id];
  if (c.type === "raw") return "raw";
  if (c.type === "waste") return "waste";
  return usedIn[id].length ? "mid" : "fin";
}
const KIND_NAME = { raw: "Raw resource", mid: "Intermediate", fin: "Finished good", waste: "Waste / by-product" };
const KIND_VAR = { raw: "--raw", mid: "--mid", fin: "--fin", waste: "--waste" };

// Tier: raw = 0, a made good is one step past its deepest input,
// a by-product sits at the tier of the earliest recipe that gives it off.
const tierMemo = {};
function recipeTier(r) { return 1 + Math.max(...Object.keys(r.in).map(tier)); }
function tier(id) {
  if (id in tierMemo) return tierMemo[id];
  tierMemo[id] = 0; // guard against loops
  const k = BY_ID[id].type;
  let t = 0;
  if (k === "made") t = recipeTier(producer[id]);
  else if (k === "waste") t = Math.min(...byproductOf[id].map(recipeTier));
  return (tierMemo[id] = t);
}
COMMODITIES.forEach(c => tier(c.id));

// Raw materials (and recycled waste) needed for one unit, plus waste given off.
function bill(id) {
  const raw = {}, wasteIn = {}, wasteOut = {};
  let steps = 0;
  (function need(x, qty) {
    const k = BY_ID[x].type;
    if (k === "raw") { raw[x] = (raw[x] || 0) + qty; return; }
    if (k === "waste") { wasteIn[x] = (wasteIn[x] || 0) + qty; return; }
    const r = producer[x];
    const runs = qty / r.out[x];
    steps++;
    for (const [i, q] of Object.entries(r.in)) need(i, q * runs);
    r.extras.forEach(w => { wasteOut[w] = (wasteOut[w] || 0) + r.out[w] * runs; });
  })(id, 1);
  return { raw, wasteIn, wasteOut, steps };
}

// ---------- Layout ----------
const NW = 126, NH = 32, STEP = 142, HALF = 71, SUB = 44, ZIG = 7, GAP = 92, PAD = 36;
const TIER_TITLES = ["Raw resources", "Processed materials", "Components & basic goods", "Assemblies", "Advanced goods"];

function layout() {
  const mainIds = COMMODITIES.filter(c => c.type !== "waste").map(c => c.id);
  const wasteIds = COMMODITIES.filter(c => c.type === "waste").map(c => c.id);
  const maxT = Math.max(...mainIds.map(tier));
  const rows = [];
  for (let t = 0; t <= maxT; t++) rows.push(mainIds.filter(id => tier(id) === t));

  // Reorder each row to cut down crossing lines (barycentre sweeps).
  const pos = {};
  const setPos = () => rows.forEach(row => row.forEach((id, i) => pos[id] = (i + .5) / row.length));
  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  setPos();
  for (let it = 0; it < 6; it++) {
    for (let t = 1; t <= maxT; t++) {
      const b = id => avg(Object.keys(producer[id].in).filter(i => i in pos).map(i => pos[i]));
      rows[t].sort((x, y) => (b(x) ?? pos[x]) - (b(y) ?? pos[y]));
      setPos();
    }
    for (let t = maxT - 1; t >= 0; t--) {
      const b = id => avg(usedIn[id].map(r => r.main).filter(o => o in pos).map(o => pos[o]));
      rows[t].sort((x, y) => (b(x) ?? pos[x]) - (b(y) ?? pos[y]));
      setPos();
    }
  }

  // Place nodes. Long rows zigzag over two lines so they stay narrow.
  const width = Math.max(...rows.map(r => r.length > ZIG ? (r.length - 1) * HALF : (r.length - 1) * STEP)) + NW;
  const cx = PAD + width / 2;
  const xy = {}, bands = [];
  let y = PAD + 22;
  rows.forEach((row, t) => {
    const zig = row.length > ZIG;
    const top = y;
    row.forEach((id, i) => {
      const off = i - (row.length - 1) / 2;
      xy[id] = zig ? { x: cx + off * HALF, y: y + NH / 2 + (i % 2 ? SUB : 0) }
                   : { x: cx + off * STEP, y: y + NH / 2 };
    });
    const h = NH + (zig ? SUB : 0);
    bands.push({ t, y: top, h });
    y += h + GAP;
  });
  const height = y - GAP + PAD;

  // By-products go in their own column on the right, near the recipes that make them.
  const wx = PAD + width + 110 + NW / 2;
  const want = wasteIds.map(id => ({ id, y: avg(byproductOf[id].map(r => xy[r.main].y)) }));
  want.sort((a, b) => a.y - b.y);
  let last = -Infinity;
  want.forEach(w => { w.y = Math.max(w.y, last + NH + 26); last = w.y; xy[w.id] = { x: wx, y: w.y }; });

  return { xy, bands, width: wx + NW / 2 + PAD, height: Math.max(height, last + NH + PAD), cx, wasteX: wx };
}

// ---------- Draw ----------
const SVGNS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

let svg, nodeEls = {}, edgeEls = [], selected = null;

function draw() {
  const L = layout();
  svg = el("svg", { viewBox: `0 0 ${L.width} ${L.height}`, role: "img", "aria-label": "Commodity production network" });
  const defs = el("defs", {}, svg);
  [["arr", "var(--edge)"], ["arrW", "var(--waste)"], ["arrR", "var(--raw)"]].forEach(([id, col]) => {
    const m = el("marker", { id, viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
    el("path", { d: "M0,0 L8,4 L0,8 z", fill: col }, m);
  });

  // tier bands and labels
  L.bands.forEach(b => {
    el("rect", { class: "band", x: 8, y: b.y - 26, width: L.wasteX - NW / 2 - 60, height: b.h + 34, rx: 10 }, svg);
    const t = el("text", { class: "tier-label", x: 22, y: b.y - 10 }, svg);
    t.textContent = `Tier ${b.t} · ${TIER_TITLES[b.t] || ""}`;
  });
  const wl = el("text", { class: "tier-label", x: L.wasteX - NW / 2, y: PAD + 8 }, svg);
  wl.textContent = "By-products";

  const edgeLayer = el("g", {}, svg);
  const nodeLayer = el("g", {}, svg);
  const P = L.xy;

  function addEdge(from, to, kind, recipe) {
    const a = P[from], b = P[to];
    let d, marker = "arr";
    if (kind === "waste") {
      const sx = a.x + NW / 2, ex = b.x - NW / 2;
      d = `M${sx},${a.y} C${sx + 70},${a.y} ${ex - 70},${b.y} ${ex},${b.y}`;
      marker = "arrW";
    } else if (kind === "recycle") {
      const sx = a.x - NW / 2, ty = b.y - NH / 2;
      d = `M${sx},${a.y} C${sx - 90},${a.y} ${b.x},${ty - 70} ${b.x},${ty}`;
      marker = "arrR";
    } else {
      const sy = a.y + NH / 2, ty = b.y - NH / 2, k = Math.max(30, (ty - sy) / 2);
      d = `M${a.x},${sy} C${a.x},${sy + k} ${b.x},${ty - k} ${b.x},${ty}`;
    }
    const p = el("path", { class: "edge " + (kind === "normal" ? "" : kind), d, "marker-end": `url(#${marker})` }, edgeLayer);
    edgeEls.push({ el: p, from, to, kind, recipe });
  }

  RECIPES.forEach(r => {
    Object.keys(r.in).forEach(i => addEdge(i, r.main, BY_ID[i].type === "waste" ? "recycle" : "normal", r));
    r.extras.forEach(w => addEdge(r.main, w, "waste", r));
  });

  COMMODITIES.forEach(c => {
    const { x, y } = P[c.id];
    const g = el("g", { class: "node " + kindOf(c.id), transform: `translate(${x - NW / 2},${y - NH / 2})`, tabindex: 0, role: "button", "aria-label": c.name }, nodeLayer);
    el("rect", { class: "box", width: NW, height: NH, rx: 7 }, g);
    el("rect", { class: "bar", x: 0, y: 0, width: 5, height: NH, rx: 2 }, g);
    const t = el("text", { x: NW / 2 + 2, y: NH / 2 + 4.5, "text-anchor": "middle" }, g);
    t.textContent = c.name;
    g.addEventListener("click", e => { e.stopPropagation(); select(selected === c.id ? null : c.id); });
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(c.id); } });
    nodeEls[c.id] = g;
  });
  svg.addEventListener("click", () => select(null));

  document.getElementById("graph").appendChild(svg);
}

// ---------- Selection ----------
function upstream(id, set = new Set()) {
  set.add(id);
  if (BY_ID[id].type === "made") Object.keys(producer[id].in).forEach(i => { if (!set.has(i)) upstream(i, set); });
  return set;
}

function select(id) {
  selected = id;
  svg.classList.toggle("focus", !!id);
  Object.values(nodeEls).forEach(n => n.classList.remove("hl", "sel"));
  edgeEls.forEach(e => e.el.classList.remove("hl", "down"));
  if (id) {
    const up = upstream(id);
    const down = new Set(usedIn[id].map(r => r.main));
    const ownWaste = BY_ID[id].type === "made" ? producer[id].extras : [];
    const madeFrom = BY_ID[id].type === "waste" ? byproductOf[id].map(r => r.main) : [];
    [...up, ...down, ...ownWaste, ...madeFrom].forEach(n => nodeEls[n].classList.add("hl"));
    nodeEls[id].classList.add("sel");
    edgeEls.forEach(e => {
      const isUp = up.has(e.to) && up.has(e.from) && e.kind !== "waste" && producer[e.to] === e.recipe;
      const isDown = e.from === id && down.has(e.to);
      const isWaste = e.kind === "waste" && ((e.from === id && ownWaste.includes(e.to)) || e.to === id);
      if (isUp || isDown || isWaste) e.el.classList.add("hl");
      if (isDown) e.el.classList.add("down");
    });
  }
  renderPanel(id);
}

// ---------- Side panel ----------
const fmt = n => (Math.round(n * 100) / 100).toString();
function chip(id, qty) {
  return `<span class="chip ${kindOf(id)}" data-go="${id}">${qty != null ? `<b>${fmt(qty)}</b>` : ""}${BY_ID[id].name}</span>`;
}
function equation(r) {
  const side = o => Object.entries(o).map(([k, q]) => chip(k, q)).join('<span class="op">+</span>');
  return `<div class="eq"><span class="at">${r.at}</span>${side(r.in)}<span class="op">→</span>${side(r.out)}</div>`;
}
function list(obj) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  return e.length ? `<ul>${e.map(([k, q]) => `<li>${chip(k, q)}</li>`).join("")}</ul>` : `<p class="none">None</p>`;
}

function renderPanel(id) {
  const panel = document.getElementById("panel");
  if (!id) {
    panel.innerHTML = `<h3>Pick a commodity</h3>
      <p class="hint">Click any box to trace everything that goes into it, what it gets used for, and the waste it leaves behind.</p>
      <p class="hint">Raw resources sit at the top. Each tier down takes more steps to make, so the most complex goods are at the bottom. Dashed red lines lead to waste; dotted green lines show waste being recycled into something useful.</p>`;
    return;
  }
  const c = BY_ID[id], k = kindOf(id);
  let h = `<h3>${c.name}</h3>
    <span class="kind" style="background:var(${KIND_VAR[k]})">${KIND_NAME[k]} · Tier ${tier(id)}</span>
    <p class="desc">${c.desc}</p>`;

  if (c.type === "made") {
    h += `<h4>Recipe</h4>${equation(producer[id])}`;
  } else if (c.type === "waste") {
    h += `<h4>Given off by</h4>${byproductOf[id].map(equation).join("")}`;
  }

  h += `<h4>Used to make</h4>`;
  h += usedIn[id].length
    ? `<ul>${usedIn[id].map(r => `<li>${chip(r.main)}</li>`).join("")}</ul>`
    : `<p class="none">${c.type === "waste" ? "Nothing. It has to be stored or disposed of." : "Nothing. This is sold to customers."}</p>`;

  if (c.type === "made") {
    const b = bill(id);
    h += `<h4>Raw resources for 1 ${c.name.toLowerCase()}</h4>${list(b.raw)}`;
    if (Object.keys(b.wasteIn).length) h += `<h4>Recycled waste it uses</h4>${list(b.wasteIn)}`;
    h += `<h4>Waste left over per unit</h4>${list(b.wasteOut)}`;
    h += `<p class="hint">${b.steps} production step${b.steps > 1 ? "s" : ""} from the ground up.</p>`;
  }
  panel.innerHTML = h;
}

document.addEventListener("click", e => {
  const go = e.target.closest("[data-go]");
  if (go) { select(go.dataset.go); nodeEls[go.dataset.go].scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" }); }
});

// ---------- Legend, summary and table ----------
function renderMeta() {
  const counts = { raw: 0, mid: 0, fin: 0, waste: 0 };
  COMMODITIES.forEach(c => counts[kindOf(c.id)]++);
  document.getElementById("summary").textContent =
    `${COMMODITIES.length} commodities linked by ${RECIPES.length} recipes. ` +
    `${counts.raw} raw resources feed ${counts.mid} intermediates and ${counts.fin} finished goods, ` +
    `and ${counts.waste} kinds of waste fall out along the way.`;
  document.getElementById("legend").innerHTML =
    ["raw", "mid", "fin", "waste"].map(k => `<span><i style="background:var(${KIND_VAR[k]})"></i>${KIND_NAME[k]}</span>`).join("") +
    `<span><i class="dash"></i>Gives off waste</span>`;

  const rows = [...COMMODITIES].sort((a, b) => tier(a.id) - tier(b.id) || a.name.localeCompare(b.name));
  const recText = r => `${Object.entries(r.in).map(([k, q]) => `${q} ${BY_ID[k].name}`).join(" + ")} → ${Object.entries(r.out).map(([k, q]) => `${q} ${BY_ID[k].name}`).join(" + ")}`;
  document.getElementById("table").innerHTML =
    `<thead><tr><th>Commodity</th><th>Tier</th><th>Kind</th><th>How it's made</th><th>Used to make</th></tr></thead><tbody>` +
    rows.map(c => {
      const k = kindOf(c.id);
      const how = c.type === "made" ? `<b>${producer[c.id].at}:</b> ${recText(producer[c.id])}`
                : c.type === "waste" ? `By-product of ${byproductOf[c.id].map(r => r.at).join(", ")}` : "Extracted or grown";
      const uses = usedIn[c.id].map(r => BY_ID[r.main].name).join(", ") || "—";
      return `<tr data-id="${c.id}" data-text="${(c.name + " " + KIND_NAME[k] + " " + how + " " + uses).toLowerCase().replace(/<[^>]+>/g, "")}">
        <td class="name"><span class="dot" style="background:var(${KIND_VAR[k]})"></span>${c.name}</td>
        <td>${tier(c.id)}</td><td>${KIND_NAME[k]}</td><td class="rec">${how}</td><td>${uses}</td></tr>`;
    }).join("") + `</tbody>`;

  document.querySelectorAll("#table tbody tr").forEach(tr => tr.addEventListener("click", () => {
    select(tr.dataset.id);
    document.getElementById("graph").scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  document.getElementById("search").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll("#table tbody tr").forEach(tr => tr.hidden = q && !tr.dataset.text.includes(q));
    svg.classList.toggle("filter", !!q);
    COMMODITIES.forEach(c => nodeEls[c.id].classList.toggle("match", !!q && document.querySelector(`#table tr[data-id="${c.id}"]`).hidden === false));
  });
}

draw();
renderMeta();
renderPanel(null);
route();
