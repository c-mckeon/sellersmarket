// ---------- Territories tab ----------
const T_BY_ID = Object.fromEntries(TERRITORIES.map(t => [t.id, t]));
const isSea = tid => !!T_BY_ID[tid].sea;
const coastal = tid => !isSea(tid) && (TERRITORY_NEIGHBOURS[tid] || []).some(isSea);
const stars = n => "★".repeat(n) + `<span class="off">${"★".repeat(3 - n)}</span>`;

// Every business type in one list.
const BIZ = [
  ...EXTRACTORS.map(([name, makes, out, base, where]) => ({ name, makes, out, base, where, kind: "extract" })),
  ...RECIPES.map(r => ({ name: r.at, makes: r.main, base: BUILD.factoryCost[tier(r.main)], where: NEEDS_OIL_ACCESS.includes(r.at) ? "oil" : "land", kind: "factory", recipe: r })),
];

function canBuild(b, tid) {
  const info = TERRITORY_INFO[tid];
  if (b.where === "sea") return isSea(tid) && !!info.res[b.makes];
  if (isSea(tid)) return false;
  if (b.where === "res") return !!info.res[b.makes];
  if (b.where === "oil") return coastal(tid) || !!info.res.crude_oil;
  return true;
}
const territoryCost = tid => TERRITORY_INFO[tid].cost ?? 1;
const buildCost = (b, tid, n) => b.base * territoryCost(tid) * (1 + BUILD.crowding * n);
const outputAt = (b, tid) => b.kind === "extract" ? b.out * BUILD.richness[TERRITORY_INFO[tid].res[b.makes] || 1] : null;
const whereText = b => b.where === "res" ? `Only where there's ${BY_ID[b.makes].name.toLowerCase()}`
  : b.where === "sea" ? "Only at sea, over an oil field"
  : b.where === "oil" ? "On the coast, or by an oil field" : "Any land";

// How many businesses are already in each territory. Starts from the example game; editable.
const here = {};
TERRITORIES.forEach(t => here[t.id] = 0);
PLOTS.forEach(([tid]) => here[tid]++);

let tSel = "sweden", tFilter = "";

function drawTerritoryMap() {
  const box = document.getElementById("tmap");
  box.innerHTML = `<div class="bd-scroll">${europeMapSVG("tOutlineTerr").svg}</div>`;
  box.querySelector("svg").addEventListener("click", e => {
    const g = e.target.closest(".terr"); if (!g) return;
    tSel = g.dataset.t; paintMap(); renderTerritory();
  });
  paintMap();
}

// Colour the map: normal, or by where the chosen business can go (darker = richer).
function paintMap() {
  const b = BIZ.find(x => x.name === tFilter);
  const RICH = { 1: "#f3c98b", 2: "#e59a4a", 3: "#c2621c" };
  document.querySelectorAll("#tmap .terr").forEach(g => {
    const tid = g.dataset.t;
    let fill = g.dataset.c, dim = false;
    if (b) {
      if (canBuild(b, tid)) fill = b.kind === "extract" ? RICH[TERRITORY_INFO[tid].res[b.makes] || 1] : "#e59a4a";
      else dim = true;
    }
    g.classList.toggle("dim", dim);
    g.classList.toggle("sel", tid === tSel);
    g.querySelectorAll("path").forEach(p => { p.setAttribute("fill", fill); p.setAttribute("stroke", fill); });
  });
  const leg = document.getElementById("tlegend");
  leg.innerHTML = !b ? `Click a territory to see what it's like and what you can build there.`
    : b.kind === "extract" ? `<b>${b.name}</b>: ${whereText(b)}. <span class="sw" style="background:${RICH[1]}"></span>small <span class="sw" style="background:${RICH[2]}"></span>good <span class="sw" style="background:${RICH[3]}"></span>world-class deposit. ${BIZ_COUNT(b)} territories.`
    : `<b>${b.name}</b>: ${whereText(b)}. ${BIZ_COUNT(b)} territories.`;
}
const BIZ_COUNT = b => TERRITORIES.filter(t => canBuild(b, t.id)).length;

function renderTerritory() {
  const tid = tSel, t = T_BY_ID[tid], info = TERRITORY_INFO[tid];
  const n = here[tid];
  const res = Object.entries(info.res).sort((a, b) => b[1] - a[1]);
  const options = BIZ.filter(b => canBuild(b, tid)).map(b => ({ b, cost: buildCost(b, tid, n), out: outputAt(b, tid) }));
  const ext = options.filter(o => o.b.kind === "extract").sort((a, b) => a.cost - b.cost);
  const fac = options.filter(o => o.b.kind === "factory").sort((a, b) => a.cost - b.cost);
  const tags = isSea(tid) ? ["Sea"] : ["Land", coastal(tid) ? "Coastal" : "Inland", `Cost level ×${info.cost}`];
  const exampleHere = PLOTS.filter(p => p[0] === tid).map(p => `${p[1] === "you" ? "your" : PLAYERS[p[1]].name + "'s"} ${p[2].toLowerCase()}`);
  const row = o => `<tr><td>${o.b.name}</td><td class="n">${o.out != null ? `${+o.out.toFixed(1)} ${BY_ID[o.b.makes].name.toLowerCase()}` : ""}</td><td class="n"><b>${Math.round(o.cost).toLocaleString()}</b></td></tr>`;

  document.getElementById("tpanel").innerHTML = `
    <h3>${t.name}</h3>
    <div class="ttags">${tags.map(x => `<span>${x}</span>`).join("")}</div>
    <p class="desc">${info.note}</p>
    <h4>Natural resources</h4>
    ${res.length ? `<ul class="tres">${res.map(([id, r]) => `<li><span>${BY_ID[id].name}</span><span class="stars">${stars(r)}</span></li>`).join("")}</ul>` : `<p class="none">None</p>`}
    ${isSea(tid) && !res.length ? "" : `
    <h4>Businesses already here</h4>
    <div class="herectl"><input type="number" id="hereN" min="0" max="30" step="1" value="${n}"> <span class="muted">${exampleHere.length ? "In the example game: " + exampleHere.join(", ") : "None in the example game"}</span></div>
    <p class="hint">Each one makes the next ${Math.round(BUILD.crowding * 100)}% dearer: ×${(1 + BUILD.crowding * n).toFixed(2)} right now.</p>`}
    ${ext.length ? `<h4>Extraction you can build</h4><table class="ht"><thead><tr><th>Business</th><th class="n">Makes a round</th><th class="n">Cost</th></tr></thead><tbody>${ext.map(row).join("")}</tbody></table>` : ""}
    ${fac.length ? `<h4>Factories you can build <em>${fac.length}</em></h4><details class="facs"><summary>Show all ${fac.length}</summary><table class="ht"><thead><tr><th>Business</th><th></th><th class="n">Cost</th></tr></thead><tbody>${fac.map(row).join("")}</tbody></table></details>` : ""}
    ${!options.length ? `<p class="none">Nothing can be built here. It's a shipping lane.</p>` : ""}
    ${options.length ? `<p class="hint">Example: a ${options[0].b.name.toLowerCase()} here costs ${options[0].b.base} base × ${territoryCost(tid)} cost level × ${(1 + BUILD.crowding * n).toFixed(2)} crowding = <b>${Math.round(options[0].cost).toLocaleString()}</b>.</p>` : ""}`;
  const inp = document.getElementById("hereN");
  if (inp) inp.addEventListener("input", () => { const v = parseInt(inp.value, 10); if (v >= 0 && v <= 30) { here[tid] = v; renderTerritory(); const again = document.getElementById("hereN"); again.focus(); again.setSelectionRange?.(9, 9); } });
}

function renderTerritoryTables() {
  const land = TERRITORIES.filter(t => !t.sea);
  document.getElementById("ttable").innerHTML =
    `<thead><tr><th>Territory</th><th>Coast</th><th class="n">Cost level</th><th>Resources</th></tr></thead><tbody>` +
    land.map(t => { const i = TERRITORY_INFO[t.id]; return `<tr data-t="${t.id}"><td class="name">${t.name}</td><td>${coastal(t.id) ? "Coastal" : "Inland"}</td><td class="n">×${i.cost}</td><td>${Object.entries(i.res).sort((a, b) => b[1] - a[1]).map(([id, r]) => `${BY_ID[id].name} <span class="stars sm">${stars(r)}</span>`).join(", ")}</td></tr>`; }).join("") + `</tbody>`;
  document.getElementById("btable").innerHTML =
    `<thead><tr><th>Business</th><th>Makes</th><th>Where it can go</th><th class="n">Territories</th><th class="n">Base cost</th></tr></thead><tbody>` +
    BIZ.map(b => `<tr data-b="${b.name}"><td class="name">${b.name}</td><td>${b.kind === "extract" ? `${b.out} ${BY_ID[b.makes].name.toLowerCase()} a round` : BY_ID[b.makes].name}</td><td>${whereText(b)}</td><td class="n">${BIZ_COUNT(b) || "none (import only)"}</td><td class="n">${b.base}</td></tr>`).join("") + `</tbody>`;
  document.querySelectorAll("#ttable tbody tr").forEach(tr => tr.addEventListener("click", () => { tSel = tr.dataset.t; paintMap(); renderTerritory(); document.getElementById("tmap").scrollIntoView({ behavior: "smooth", block: "start" }); }));
  document.querySelectorAll("#btable tbody tr").forEach(tr => tr.addEventListener("click", () => { tFilter = tr.dataset.b; document.getElementById("tfilter").value = tFilter; paintMap(); document.getElementById("tmap").scrollIntoView({ behavior: "smooth", block: "start" }); }));
}

function initTerritories() {
  const sel = document.getElementById("tfilter");
  sel.innerHTML = `<option value="">Everything (normal map)</option>` +
    `<optgroup label="Extraction">${BIZ.filter(b => b.kind === "extract").map(b => `<option>${b.name}</option>`).join("")}</optgroup>` +
    `<optgroup label="Factories">${BIZ.filter(b => b.kind === "factory").map(b => `<option>${b.name}</option>`).join("")}</optgroup>`;
  sel.addEventListener("change", () => { tFilter = sel.value; paintMap(); });
  drawTerritoryMap();
  renderTerritory();
  renderTerritoryTables();
}
initTerritories();
