// ---------- Database tab: a simulated SQL database ----------

// Fill every table from the site's data and a short game played by four bots.
function buildDbRows() {
  const G = SMG, R = {};
  R.commodities = COMMODITIES.map(c => [c.id, c.name, c.type, G.lifeOf(c.id)]);
  R.business_types = G.BIZ.map(b => [b.id, b.name, b.kind, b.cost]);
  R.recipe_inputs = [];
  R.recipe_outputs = [];
  G.BIZ.forEach(b => {
    Object.entries(b.inputs).forEach(([c, q]) => R.recipe_inputs.push([b.id, c, q]));
    Object.entries(b.outputs).forEach(([c, q], i) => R.recipe_outputs.push([b.id, c, q, i > 0]));
  });
  R.territories = TERRITORIES.map(t => [t.id, t.name, !!t.sea, G.coastal(t.id), TERRITORY_INFO[t.id].note]);
  R.territory_businesses = [];
  TERRITORIES.forEach(t => (TERRITORY_INFO[t.id].biz || []).forEach(b => R.territory_businesses.push([t.id, b])));
  R.territory_neighbours = [];
  TERRITORIES.forEach(t => G.neighbours(t.id).forEach(n => R.territory_neighbours.push([t.id, n])));

  // The example game: four bots play 8 rounds
  const seed = 11, names = ["Ana", "Ben", "Cleo", "Dev"], colours = ["#2f6db5", "#8a4fc0", "#2e8b57", "#d4682a"];
  const st = G.newGame({ seed, rounds: 8, players: G.spreadStarts(4, { seed }).map((x, i) => ({ name: names[i], colour: colours[i], bot: true, ...x })) });
  R.games = [[1, st.round, st.rounds, st.phase]];
  R.players = st.players.map(p => [p.id, 1, p.name, p.colour, Math.round(p.cash), p.pos]);
  R.stockpile = [];
  st.players.forEach(p => {
    const units = Object.entries(p.lots || {}).flatMap(([c, L]) => L.flatMap(([q, made]) => Array(q).fill([c, made]))).sort((a, b) => a[1] - b[1]);
    units.forEach(([c, made], i) => R.stockpile.push([p.id, i + 1, c, made]));
  });
  R.businesses = st.businesses.map(b => [b.id, 1, b.owner, b.type, b.territory, b.built]);
  const held = st.players.flatMap(p => (p.contracts || []).map(k => ({ ...k, owner: p.id })));
  R.contracts = [...st.contracts.map(k => [k.id, 1, k.cap, k.drawn, null, null, null]), ...held.map(k => [k.id, 1, k.cap, k.won, k.owner, k.price, k.due])];
  R.contract_goods = [...st.contracts, ...held].flatMap(k => Object.entries(k.goods).map(([c, q]) => [k.id, c, q]));
  R.bids = st.contracts.flatMap(k => k.bids.map(b => [k.id, b.pid, b.amount, b.round]));
  R.orders = st.book.map(o => [o.id, o.pid, o.good, o.side, o.price, o.qty]);
  R.trades = st.history.flatMap(h => Object.entries(h.trades).map(([c, t]) => [h.round, c, t.price, t.qty]));
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
