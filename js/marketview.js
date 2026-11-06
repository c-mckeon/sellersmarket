// ---------- Pricing model ----------
const PR = MARKET.pricing;

// Base price: hand-set for raw goods and wastes, otherwise worked out from the recipe.
const baseMemo = {};
function basePrice(id) {
  if (id in baseMemo) return baseMemo[id];
  if (PR[id].base != null) return (baseMemo[id] = PR[id].base);
  const r = producer[id];
  let cost = 0;
  for (const [i, q] of Object.entries(r.in)) cost += q * basePrice(i);
  for (const w of r.extras) cost -= r.out[w] * basePrice(w); // waste fees add cost; recyclables earn a little back
  return (baseMemo[id] = (cost + MARKET.valueAdded * BUILD.factoryCost[tierOf(id)]) / r.out[id]);
}
const isFee = id => basePrice(id) < 0;
const tierOf = id => tier(id);

function scarcity(id, s) {
  const { s0, e } = PR[id];
  const R = MARKET.shareRange;
  const sc = Math.min(Math.max(s, s0 / R), s0 * R);
  return isFee(id) ? Math.pow(sc / s0, e) : Math.pow(s0 / sc, e);
}

// ---------- State ----------
const mkt = { round: 0, rate: MARKET.inflationPerRound, share: {}, demand: {}, sel: "wheat" };
function resetMarket() {
  COMMODITIES.forEach(c => { mkt.share[c.id] = PR[c.id].s0; mkt.demand[c.id] = 1; });
}
resetMarket();

const inflation = () => Math.pow(1 + mkt.rate, mkt.round);
function priceOf(id, s = mkt.share[id], d = mkt.demand[id]) {
  return basePrice(id) * scarcity(id, s) * (isFee(id) ? 1 : d) * inflation();
}

// ---------- Rendering ----------
const money = n => {
  const a = Math.abs(n), sgn = n < 0 ? "−" : "";
  const v = a >= 1000 ? Math.round(a).toLocaleString() : a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2);
  return sgn + v;
};
const pct = n => (n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$/, "") + "%";

function renderMarketTable() {
  const rows = [...COMMODITIES].sort((a, b) => tier(a.id) - tier(b.id) || basePrice(a.id) - basePrice(b.id));
  const I = inflation();
  let h = `<thead><tr>
    <th>Commodity</th><th class="n">Base</th><th class="n" title="Balanced share">s₀</th><th class="n" title="Elasticity">e</th>
    <th class="n" title="Current share of stockpile space">Share s</th><th class="n">Scarcity</th><th class="n">Demand</th>
    <th class="n">Infl.</th><th class="n">Price</th><th class="n">vs base</th></tr></thead><tbody>`;
  for (const c of rows) {
    const id = c.id, t = tier(id), k = kindOf(id), fee = isFee(id);
    const S = scarcity(id, mkt.share[id]);
    const P = priceOf(id);
    const chg = (P / basePrice(id) - 1) * 100;
    h += `<tr data-id="${id}" class="${mkt.sel === id ? "sel" : ""}">
      <td class="name"><span class="dot" style="background:var(${KIND_VAR[k]})"></span>${c.name}</td>
      <td class="n">${money(basePrice(id))}</td>
      <td class="n">${pct(PR[id].s0)}</td>
      <td class="n">${PR[id].e.toFixed(1)}</td>
      <td class="n"><input type="number" class="sh" min="0.01" max="100" step="any" value="${+mkt.share[id].toFixed(3)}" aria-label="${c.name} current share">%</td>
      <td class="n">×${S.toFixed(2)}</td>
      <td class="n">${fee ? '<span class="muted">n/a</span>' : `×<input type="number" class="dm" min="0" max="10" step="0.1" value="${mkt.demand[id]}" aria-label="${c.name} demand">`}</td>
      <td class="n">×${I.toFixed(2)}</td>
      <td class="n price">${money(P)}</td>
      <td class="n chg ${Math.abs(chg) < 0.5 ? "" : chg > 0 ? "up" : "dn"}">${Math.abs(chg) < 0.5 ? "—" : (chg > 0 ? "+" : "") + chg.toFixed(0) + "%"}</td>
    </tr>`;
  }
  document.getElementById("mtable").innerHTML = h + "</tbody>";
  document.getElementById("mround").textContent = mkt.round;
  document.getElementById("minfl").textContent = "×" + I.toFixed(2);
  const used = Object.values(mkt.share).reduce((a, b) => a + b, 0);
  const u = document.getElementById("mused");
  u.textContent = pct(used);
  u.classList.toggle("over", used > 100.05);
  renderCurve();
}

// Price curve for the selected commodity: price against share, log scale.
function renderCurve() {
  const id = mkt.sel, c = BY_ID[id], { s0, e } = PR[id];
  const W = 400, H = 240, L = 46, Rm = 14, T = 18, B = 40;
  const lo = s0 / MARKET.shareRange, hi = Math.min(100, s0 * MARKET.shareRange);
  const xs = s => L + (Math.log(s) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * (W - L - Rm);
  const pts = [];
  for (let i = 0; i <= 80; i++) { const s = lo * Math.pow(hi / lo, i / 80); pts.push([s, priceOf(id, s)]); }
  const ps = pts.map(p => p[1]);
  const pmin = Math.min(0, ...ps), pmax = Math.max(...ps) * 1.08 || 1;
  const ys = p => T + (pmax - p) / (pmax - pmin) * (H - T - B);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${xs(p[0]).toFixed(1)},${ys(p[1]).toFixed(1)}`).join("");

  const ticks = [];
  for (let k = -3; k <= 2; k++) for (const m of [1, 2, 5]) { const v = m * Math.pow(10, k); if (v >= lo * 0.999 && v <= hi * 1.001) ticks.push(v); }
  const yt = [];
  const step = niceStep((pmax - pmin) / 4);
  for (let v = Math.ceil(pmin / step) * step; v <= pmax; v += step) yt.push(v);

  const cur = Math.min(Math.max(mkt.share[id], lo), hi);
  const pc = priceOf(id), pb = priceOf(id, s0);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Price curve for ${c.name}">`;
  yt.forEach(v => svg += `<line class="grid" x1="${L}" x2="${W - Rm}" y1="${ys(v)}" y2="${ys(v)}"/><text class="ax" x="${L - 8}" y="${ys(v) + 4}" text-anchor="end">${money(v)}</text>`);
  ticks.forEach(v => svg += `<line class="grid" x1="${xs(v)}" x2="${xs(v)}" y1="${T}" y2="${H - B}"/><text class="ax" x="${xs(v)}" y="${H - B + 16}" text-anchor="middle">${pct(v)}</text>`);
  svg += `<text class="ax lbl" x="${(L + W - Rm) / 2}" y="${H - 6}" text-anchor="middle">Share of all stockpile space (log scale)</text>`;
  svg += `<path class="curve" d="${path}"/>`;
  svg += `<line class="mark base" x1="${xs(s0)}" x2="${xs(s0)}" y1="${T}" y2="${H - B}"/><circle class="dotb" cx="${xs(s0)}" cy="${ys(pb)}" r="5"/>`;
  svg += `<text class="note" x="${xs(s0) + 8}" y="${T + 12}">balanced ${pct(s0)}</text>`;
  svg += `<circle class="dotc" cx="${xs(cur)}" cy="${ys(pc)}" r="6"/>`;
  svg += `<text class="note cur" x="${xs(cur) + (xs(cur) > W - 130 ? -10 : 10)}" y="${ys(pc) - 10}" text-anchor="${xs(cur) > W - 130 ? "end" : "start"}">now: ${pct(mkt.share[id])} → ${money(pc)}</text>`;
  svg += `</svg>`;

  const fee = isFee(id);
  const sNow = mkt.share[id];
  const formula = fee
    ? `${money(basePrice(id))} × (${pct(sNow)} ÷ ${pct(s0)})<sup>${e}</sup> × ${inflation().toFixed(2)}`
    : `${money(basePrice(id))} × (${pct(s0)} ÷ ${pct(sNow)})<sup>${e}</sup> × ${mkt.demand[id]} × ${inflation().toFixed(2)}`;
  const r = producer[id];
  const baseHow = PR[id].base != null
    ? `Base price set by hand.`
    : `Base price from its recipe at the ${r.at}: (${Object.entries(r.in).map(([k, q]) => `${q} × ${money(basePrice(k))}`).join(" + ")}${r.extras.length ? r.extras.map(w => ` ${basePrice(w) < 0 ? "+" : "−"} ${r.out[w]} × ${money(Math.abs(basePrice(w)))} ${BY_ID[w].name.toLowerCase()}`).join("") : ""} + ${money(MARKET.valueAdded * BUILD.factoryCost[tier(id)])} value added) ÷ ${r.out[id]} = <b>${money(basePrice(id))}</b>`;

  document.getElementById("mcurve").innerHTML = `
    <h3>${c.name}</h3>
    <p class="formula">Price = ${formula} = <b>${money(pc)}</b></p>
    <p class="muted small">${baseHow}${fee ? " This waste has no use, so its price is a disposal fee that grows as more of it piles up." : ""}</p>
    ${svg}`;
}

function niceStep(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x || 1)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

// ---------- Controls ----------
function initMarket() {
  const tbl = document.getElementById("mtable");
  tbl.addEventListener("input", e => {
    const tr = e.target.closest("tr"); if (!tr) return;
    const v = parseFloat(e.target.value);
    if (!(v >= 0)) return;
    if (e.target.classList.contains("sh")) mkt.share[tr.dataset.id] = Math.max(0.001, Math.min(100, v));
    if (e.target.classList.contains("dm")) mkt.demand[tr.dataset.id] = v;
    mkt.sel = tr.dataset.id;
    updateRow(tr.dataset.id);
  });
  tbl.addEventListener("change", () => renderMarketTable());
  tbl.addEventListener("click", e => {
    if (e.target.tagName === "INPUT") return;
    const tr = e.target.closest("tbody tr"); if (!tr) return;
    mkt.sel = tr.dataset.id;
    tbl.querySelectorAll("tr.sel").forEach(r => r.classList.remove("sel"));
    tr.classList.add("sel");
    renderCurve();
  });

  const rs = document.getElementById("roundSlider");
  rs.addEventListener("input", () => { mkt.round = +rs.value; renderMarketTable(); });
  const ri = document.getElementById("rateInput");
  ri.value = (mkt.rate * 100).toFixed(1);
  ri.addEventListener("input", () => { const v = parseFloat(ri.value); if (v >= -20 && v <= 50) { mkt.rate = v / 100; renderMarketTable(); } });

  document.getElementById("shuffleBtn").addEventListener("click", () => {
    // Swing every stockpile between a fifth and three times its balanced level.
    COMMODITIES.forEach(c => {
      mkt.share[c.id] = +(PR[c.id].s0 * Math.exp(Math.log(0.2) + Math.random() * Math.log(15))).toPrecision(2);
      if (!isFee(c.id)) mkt.demand[c.id] = +(0.6 + Math.random() * 0.9).toFixed(1);
    });
    renderMarketTable();
  });
  document.getElementById("resetBtn").addEventListener("click", () => {
    resetMarket(); mkt.round = 0; rs.value = 0; renderMarketTable();
  });
  renderMarketTable();
}

// Update one row in place while typing, so the input keeps focus.
function updateRow(id) {
  const tr = document.querySelector(`#mtable tr[data-id="${id}"]`);
  const cells = tr.children;
  const P = priceOf(id), chg = (P / basePrice(id) - 1) * 100;
  cells[5].textContent = "×" + scarcity(id, mkt.share[id]).toFixed(2);
  cells[8].textContent = money(P);
  cells[9].textContent = Math.abs(chg) < 0.5 ? "—" : (chg > 0 ? "+" : "") + chg.toFixed(0) + "%";
  cells[9].className = "n chg " + (Math.abs(chg) < 0.5 ? "" : chg > 0 ? "up" : "dn");
  const used = Object.values(mkt.share).reduce((a, b) => a + b, 0);
  const u = document.getElementById("mused");
  u.textContent = pct(used);
  u.classList.toggle("over", used > 100.05);
  document.querySelectorAll("#mtable tr.sel").forEach(r => r.classList.remove("sel"));
  tr.classList.add("sel");
  renderCurve();
}

// The old formula-price calculators: only drawn if their place is still on the page (the Market page now
// describes the player-driven auction). basePrice above is still used by the other design pages.
if (document.getElementById("mtable")) initMarket();
