// ---------- Database tab: a simulated SQL database ----------
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const r2 = x => Math.round(x * 100) / 100;

// Fill every table from the site's data and the example game.
function buildDbRows() {
  const R = {};
  const sectorOf = {};
  Object.entries(SECTORS).forEach(([k, s]) => s.items.forEach(i => sectorOf[i] = k));
  const bizId = name => slug(name);

  R.sectors = Object.entries(SECTORS).map(([k, s]) => [k, s.name, EF.tickers[k]]);
  R.commodities = COMMODITIES.map(c => [c.id, c.name, c.type, sectorOf[c.id], r2(basePrice(c.id)), PR[c.id].s0, PR[c.id].e]);
  R.business_types = BIZ.map(b => [bizId(b.name), b.name, b.kind]);
  R.recipe_inputs = [];
  R.recipe_outputs = [];
  BIZ.forEach(b => {
    if (b.kind === "extract") { R.recipe_outputs.push([bizId(b.name), b.makes, b.out, false]); return; }
    Object.entries(b.recipe.in).forEach(([c, q]) => R.recipe_inputs.push([bizId(b.name), c, q]));
    Object.entries(b.recipe.out).forEach(([c, q], i) => R.recipe_outputs.push([bizId(b.name), c, q, i > 0]));
  });
  R.territories = TERRITORIES.map(t => [t.id, t.name, !!t.sea, coastal(t.id), TERRITORY_INFO[t.id].note]);
  R.territory_businesses = [];
  TERRITORIES.forEach(t => (TERRITORY_INFO[t.id].biz || []).forEach(b => R.territory_businesses.push([t.id, b])));
  R.territory_neighbours = [];
  TERRITORIES.forEach(t => (TERRITORY_NEIGHBOURS[t.id] || []).forEach(n => R.territory_neighbours.push([t.id, n])));
  R.cards = CARDS.map((c, i) => [i + 1, c.name, c.cat, c.rarity, c.text]);
  R.card_effects = [];
  const effectIds = {};
  CARDS.forEach((c, i) => c.fx.forEach(f => {
    const id = R.card_effects.length + 1;
    (effectIds[c.name] ||= []).push(id);
    R.card_effects.push([id, i + 1, f[0], f[1], f[2], f[3], f[4] ?? null]);
  }));

  // The example game
  const base = baseRate(0.02);
  R.games = [[1, "Test game", ME.round, "day", 0.02, base]];
  const pid = { you: 1, ana: 2, ben: 3, cleo: 4 };
  const cash = { you: ME.cash, ana: 410, ben: 280, cleo: 515 };
  R.players = Object.entries(PLAYERS).map(([k, p]) => [pid[k], 1, p.name, p.color, cash[k], PAWNS[k], 40]);
  const stock = {
    you: ME.stock,
    ana: { iron_ore: 6, coal: 5, iron: 2, steel: 3, slag: 2, limestone: 3 },
    ben: { sand: 8, limestone: 2, glass: 3, clay: 4, ceramic: 2, concrete: 4 },
    cleo: { iron_ore: 5, coal: 3, iron: 2, steel: 1, sawdust: 2, paper: 2 },
  };
  R.holdings = [];
  Object.entries(stock).forEach(([k, st]) => Object.entries(st).forEach(([c, q]) => R.holdings.push([pid[k], c, q])));
  R.businesses = [];
  PLOTS.forEach(([tid, who, name], i) => R.businesses.push([i + 1, 1, pid[who], bizId(name), tid, 1 + (i % 6)]));
  // Two rounds of price history
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  R.market_prices = [];
  [ME.round - 1, ME.round].forEach(round => COMMODITIES.forEach(c => {
    const s = PR[c.id].s0 * Math.exp((rnd() - 0.5) * 1.2), d = r2(0.8 + rnd() * 0.4);
    R.market_prices.push([1, round, c.id, r2(s), d, r2(priceOf(c.id, s, d))]);
  }));
  const priceNow = id => R.market_prices.find(r => r[1] === ME.round && r[2] === id)[5];
  R.trades = [
    [1, 1, 7, 1, "wheat", "buy", 1, priceNow("wheat")],
    [2, 1, 7, 1, "flour", "buy", 1, priceNow("flour")],
    [3, 1, 7, 1, "bread", "sell", 3, priceNow("bread")],
    [4, 1, 7, 2, "coal", "buy", 4, priceNow("coal")],
    [5, 1, 7, 3, "sand", "buy", 6, priceNow("sand")],
    [6, 1, 7, 4, "paper", "sell", 2, priceNow("paper")],
  ];
  R.loans = [[1, 1, 300, 250, 0.035, 3], [2, 2, 800, 640, 0.035, 2]];
  R.bonds = [[1, 1, 1, 10, 0.025, 3], [2, 4, 2, 5, 0.03, 5]];
  R.futures = [[1, 1, "coal", "long", 50, 5.5, 10, 27.5], [2, 3, "wheat", "short", 30, 7, 9, 21]];
  R.etf_holdings = [[3, "metals", 5, 104.2], [2, "construction", 3, 98.7]];
  const cardId = n => CARDS.findIndex(c => c.name === n) + 1;
  R.player_cards = [
    [1, 1, cardId("Drought"), "hand", 6], [2, 1, cardId("Insurance payout"), "hand", 7],
    [3, 2, cardId("Strike"), "played", 5], [4, 2, cardId("Steel tariff"), "hand", 7],
    [5, 3, cardId("Pipeline sabotage"), "hand", 6], [6, 4, cardId("Drought"), "played", 6],
    [7, 4, cardId("Bank run"), "hand", 7],
  ];
  const bakery = R.businesses.find(b => b[3] === "bakery")[0];
  R.active_effects = [
    ...effectIds["Drought"].map((e, i) => [i + 1, 1, 6, e, null, "water", null, null, 7, 9]),
    [3, 1, 3, effectIds["Strike"][0], null, null, bakery, null, 7, 7],
  ];
  return R;
}

// ---------- Rendering ----------
const DB_ROWS = buildDbRows();
const DB_BY = Object.fromEntries(DB_SCHEMA.map(t => [t.name, t]));
const colInfo = c => ({ n: c[0], t: c[1], pk: (c[2] || "").includes("pk"), fk: ((c[2] || "").match(/fk:(\w+)/) || [])[1], note: c[3] });
let dbTable = "players", dbHighlight = null;

function sqlFor(t) {
  const cols = t.cols.map(colInfo);
  const pks = cols.filter(c => c.pk).map(c => c.n);
  const lines = cols.map(c => `  ${c.n.padEnd(20)} ${c.t.toUpperCase()}${c.fk ? ` REFERENCES ${c.fk}(id)` : ""}${pks.length === 1 && c.pk ? " PRIMARY KEY" : ""}`);
  if (pks.length > 1) lines.push(`  PRIMARY KEY (${pks.join(", ")})`);
  return `CREATE TABLE ${t.name} (\n${lines.join(",\n")}\n);`;
}

function fmtCell(v) {
  if (v === null || v === undefined) return `<span class="null">null</span>`;
  if (typeof v === "boolean") return `<span class="bool">${v}</span>`;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toFixed(4));
  return String(v).replace(/</g, "&lt;");
}

function renderDb() {
  const t = DB_BY[dbTable], cols = t.cols.map(colInfo), rows = DB_ROWS[t.name];
  // Buttons
  const groups = {};
  DB_SCHEMA.forEach(x => (groups[x.group] ||= []).push(x));
  document.getElementById("dbNav").innerHTML = Object.entries(groups).map(([g, ts]) =>
    `<div class="dbgroup"><span>${g}</span>${ts.map(x => `<button data-go="${x.name}" class="${x.name === dbTable ? "on" : ""}">${x.name} <em>${DB_ROWS[x.name].length}</em></button>`).join("")}</div>`).join("");

  // Relationships
  const pointsTo = [...new Set(cols.filter(c => c.fk).map(c => c.fk))];
  const pointedBy = DB_SCHEMA.filter(x => x.cols.some(c => colInfo(c).fk === t.name)).map(x => ({ name: x.name, via: x.cols.map(colInfo).filter(c => c.fk === t.name).map(c => c.n) }));
  const pk = cols.filter(c => c.pk).map(c => c.n);

  const filter = (document.getElementById("dbFilter").value || "").trim().toLowerCase();
  const shown = rows.filter(r => !filter || r.some(v => String(v).toLowerCase().includes(filter)));

  document.getElementById("dbMain").innerHTML = `
    <div class="dbhead">
      <h2>${t.name}</h2>
      <p>${t.desc}</p>
      <div class="dbrel">
        <div><b>Identified by</b> <code>${pk.join(" + ")}</code>${pk.length > 1 ? " together" : ""}</div>
        <div><b>Points to</b> ${pointsTo.length ? pointsTo.map(n => `<button class="tlink" data-go="${n}">${n}</button>`).join(" ") : `<span class="muted">nothing</span>`}</div>
        <div><b>Pointed to by</b> ${pointedBy.length ? pointedBy.map(x => `<button class="tlink" data-go="${x.name}" title="via ${x.via.join(", ")}">${x.name}<small>.${x.via.join(", .")}</small></button>`).join(" ") : `<span class="muted">nothing</span>`}</div>
      </div>
      <details class="sql"><summary>Show the SQL</summary><pre>${sqlFor(t)}</pre></details>
    </div>
    <div class="dbtablewrap" id="dbScroll"><table class="dbt">
      <thead><tr>${cols.map(c => `<th${c.fk ? ` class="fkh" data-go="${c.fk}" title="Go to ${c.fk}"` : ""}>
        <span class="cn">${c.n}</span>
        <span class="ct">${c.t}${c.pk ? ' <b class="pk">PK</b>' : ""}${c.fk ? ` <b class="fk">→ ${c.fk}</b>` : ""}</span>
        ${c.note ? `<span class="cnote">${c.note}</span>` : ""}</th>`).join("")}</tr></thead>
      <tbody>${shown.map(r => {
        const isHl = dbHighlight != null && pk.length === 1 && String(r[cols.findIndex(c => c.pk)]) === String(dbHighlight);
        return `<tr${isHl ? ' class="hl" id="dbHl"' : ""}>${r.map((v, i) => cols[i].fk && v !== null
          ? `<td><button class="fkv" data-go="${cols[i].fk}" data-id="${v}" title="Open ${cols[i].fk} row ${v}">${fmtCell(v)}</button></td>`
          : `<td class="${typeof v === "number" ? "n" : ""}">${fmtCell(v)}</td>`).join("")}</tr>`;
      }).join("")}</tbody>
    </table></div>
    <p class="muted small">${shown.length} of ${rows.length} rows${filter ? ` matching “${filter.replace(/</g, "&lt;")}”` : ""}.</p>`;

  const hl = document.getElementById("dbHl");
  if (hl) { const box = document.getElementById("dbScroll"); box.scrollTop = hl.offsetTop - box.clientHeight / 3; }
}

function initDb() {
  const root = document.getElementById("view-database");
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    dbTable = b.dataset.go;
    dbHighlight = b.dataset.id ?? null;
    document.getElementById("dbFilter").value = "";
    renderDb();
    if (!b.closest("#dbNav")) document.getElementById("dbMain").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("dbFilter").addEventListener("input", () => { dbHighlight = null; renderDb(); });
  renderDb();
}
initDb();
