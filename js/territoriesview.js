// ---------- Territories tab ----------
const T_BY_ID = Object.fromEntries(TERRITORIES.map(t => [t.id, t]));
const isSea = tid => !!T_BY_ID[tid].sea;
const coastal = tid => !isSea(tid) && (TERRITORY_NEIGHBOURS[tid] || []).some(isSea);

const bizSlug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Every business type in one list. Every business makes 2 of its product a round, and building is free.
const BIZ = [
  ...EXTRACTORS.map(([name, makes, out]) => ({ id: bizSlug(name), name, makes, out, kind: "extract" })),
  ...RECIPES.map(r => ({ id: bizSlug(r.at), name: r.at, makes: r.main, out: r.out[r.main], kind: "factory", recipe: r })),
];

// Only the businesses listed for a territory can go there (TERRITORY_INFO[tid].biz)
const canBuild = (b, tid) => (TERRITORY_INFO[tid].biz || []).includes(b.id);
const makesText = b => `${b.out} ${BY_ID[b.makes].name.toLowerCase()}`;
const inputsText = b => b.recipe ? Object.entries(b.recipe.in).map(([c, q]) => `${q} ${BY_ID[c].name.toLowerCase()}`).join(" + ") : "nothing";

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

// Colour the map: normal, or by where the chosen business can go.
function paintMap() {
  const b = BIZ.find(x => x.name === tFilter);
  document.querySelectorAll("#tmap .terr").forEach(g => {
    const tid = g.dataset.t;
    let fill = g.dataset.c, dim = false;
    if (b) {
      if (canBuild(b, tid)) fill = b.kind === "extract" ? "#c2621c" : "#e59a4a";
      else dim = true;
    }
    g.classList.toggle("dim", dim);
    g.classList.toggle("sel", tid === tSel);
    g.querySelectorAll("path").forEach(p => { p.setAttribute("fill", fill); p.setAttribute("stroke", fill); });
  });
  // The selected territory's outline, drawn on top so neighbours can't cover it
  const hl = document.querySelector("#tmap .hl");
  if (hl) hl.innerHTML = tSel ? mapHighlightSVG("tOutlineTerr", tSel, "here") : "";
  const leg = document.getElementById("tlegend");
  leg.innerHTML = !b ? `Click a territory to see what it's like and what you can build there.`
    : `<b>${b.name}</b> (makes ${makesText(b)} a round from ${inputsText(b)}): ${BIZ_COUNT(b)} territories.`;
}
const BIZ_COUNT = b => TERRITORIES.filter(t => canBuild(b, t.id)).length;

function renderTerritory() {
  const tid = tSel, t = T_BY_ID[tid], info = TERRITORY_INFO[tid];
  const options = BIZ.filter(b => canBuild(b, tid));
  const ext = options.filter(b => b.kind === "extract"), fac = options.filter(b => b.kind === "factory");
  const tags = isSea(tid) ? ["Sea"] : ["Land", coastal(tid) ? "Coastal" : "Inland"];
  const exampleHere = PLOTS.filter(p => p[0] === tid).map(p => `${p[1] === "you" ? "your" : PLAYERS[p[1]].name + "'s"} ${p[2].toLowerCase()}`);
  const row = b => `<tr><td>${b.name}</td><td class="n">${makesText(b)}</td><td class="muted small">${inputsText(b)}</td></tr>`;
  const table = list => `<table class="ht"><thead><tr><th>Business</th><th class="n">Makes a round</th><th>Uses</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table>`;

  document.getElementById("tpanel").innerHTML = `
    <h3>${t.name}</h3>
    <div class="ttags">${tags.map(x => `<span>${x}</span>`).join("")}</div>
    <p class="desc">${info.note}</p>
    ${ext.length ? `<h4>Mines, pits and farms</h4>${table(ext)}` : ""}
    ${fac.length ? `<h4>Factories</h4>${table(fac)}` : ""}
    ${!options.length ? `<p class="none">Nothing can be built here.${isSea(tid) ? " It's a shipping lane." : ""}</p>` : ""}
    ${exampleHere.length ? `<p class="hint">In the example game: ${exampleHere.join(", ")}.</p>` : ""}`;
}

function renderTerritoryTables() {
  const land = TERRITORIES.filter(t => !t.sea);
  const names = (tid, kind) => BIZ.filter(b => b.kind === kind && canBuild(b, tid)).map(b => b.name).join(", ");
  document.getElementById("ttable").innerHTML =
    `<thead><tr><th>Territory</th><th>Coast</th><th>Mines, pits and farms</th><th>Factories</th></tr></thead><tbody>` +
    land.map(t => `<tr data-t="${t.id}"><td class="name">${t.name}</td><td>${coastal(t.id) ? "Coastal" : "Inland"}</td><td>${names(t.id, "extract") || "–"}</td><td>${names(t.id, "factory") || "–"}</td></tr>`).join("") + `</tbody>`;
  document.getElementById("btable").innerHTML =
    `<thead><tr><th>Business</th><th>Makes a round</th><th>Uses</th><th class="n">Territories</th></tr></thead><tbody>` +
    BIZ.map(b => `<tr data-b="${b.name}"><td class="name">${b.name}</td><td>${makesText(b)}</td><td>${inputsText(b)}</td><td class="n">${BIZ_COUNT(b) || "none"}</td></tr>`).join("") + `</tbody>`;
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
