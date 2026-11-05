// ---------- Gameplay sketches: board and player dashboard ----------
// Everything here is example data to show the layout. Nothing is wired to a real game yet.

// ----- Board: a map of Europe -----
const PLAYERS = {
  you:  { name: "You",  color: "#d4682a" },
  ana:  { name: "Ana",  color: "#2f6db5" },
  ben:  { name: "Ben",  color: "#8a4fc0" },
  cleo: { name: "Cleo", color: "#2e8b57" },
};
// Example businesses: [territory, owner, business]
const PLOTS = [
  ["ukraine", "you", "Flour mill"], ["paris", "you", "Bakery"], ["sweden", "you", "Sawmill"],
  ["ruhr", "ana", "Blast furnace"], ["berlin", "ana", "Steelworks"], ["bohemia", "ana", "Cement kiln"],
  ["danube", "ben", "Oil refinery"], ["lowlands", "ben", "Plastics plant"], ["munich", "ben", "Motor factory"],
  ["spain", "cleo", "Copper smelter"], ["london", "cleo", "Chip fab"], ["finland", "cleo", "Battery plant"],
];
// Where each player's pawn stands
const PAWNS = { you: "paris", ana: "ruhr", ben: "danube", cleo: "spain" };

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

  let s = `<svg class="board" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of Europe split into ${TERRITORIES.length} territories">
    <defs><filter id="${fid}" x="-5%" y="-5%" width="110%" height="110%">
      <feMorphology in="SourceAlpha" operator="erode" radius="2.2" result="in"/>
      <feComposite in="SourceAlpha" in2="in" operator="out" result="ring"/>
      <feFlood flood-color="#5d5543" flood-opacity=".75"/>
      <feComposite in2="ring" operator="in" result="edge"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="edge"/></feMerge>
    </filter></defs>
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
    const fs = Math.max(12, Math.min(t.sea ? 22 : 20, room / 3.2));
    const words = t.name.split(" ");
    const lines = t.name.length > 11 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [t.name];
    below[t.id] = y + ((lines.length - 1) / 2) * fs * 1.05 + fs * .35;
    lines.forEach((ln, i) => {
      s += `<text x="${x}" y="${y + (i - (lines.length - 1) / 2) * fs * 1.05 + fs * .35}" text-anchor="middle" font-size="${fs.toFixed(1)}" class="tname${t.sea ? " sea" : ""}" fill="${t.sea ? "#3d6a8f" : "#4a4232"}" ${t.sea ? 'font-style="italic"' : 'font-weight="700"'} paint-order="stroke" stroke="${colour[t.id]}" stroke-width="3">${ln}</text>`;
    });
  });

  return { svg: s + "</svg>", below };
}

function drawBoard() {
  let { svg: s, below } = europeMapSVG("tOutlineBoard");
  s = s.replace(/<\/svg>$/, "");
  // Markers: one row under each name, businesses (squares) then pawns (circles)
  const marks = {};
  PLOTS.forEach(([tid, who, biz]) => (marks[tid] ||= []).push({ kind: "biz", who, biz }));
  Object.entries(PAWNS).forEach(([who, tid]) => (marks[tid] ||= []).push({ kind: "pawn", who }));
  Object.entries(marks).forEach(([tid, list]) => {
    const [x] = TERRITORY_LABELS[tid], y = below[tid] + 20, step = 30;
    list.forEach((m, i) => {
      const cx = x + (i - (list.length - 1) / 2) * step, P = PLAYERS[m.who];
      s += m.kind === "biz"
        ? `<g><title>${P.name}: ${m.biz}</title><rect x="${cx - 12}" y="${y - 12}" width="24" height="24" rx="5" fill="${P.color}" stroke="#fff" stroke-width="2.5"/><text x="${cx}" y="${y + 5}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">${m.biz[0]}</text></g>`
        : `<g><title>${P.name} is here</title><circle cx="${cx}" cy="${y}" r="14" fill="${P.color}" stroke="#fff" stroke-width="3"/><circle cx="${cx}" cy="${y}" r="5" fill="#fff"/></g>`;
    });
  });
  s += `</svg>`;

  const legend = Object.values(PLAYERS).map(p => `<span><i style="background:${p.color}"></i>${p.name}</span>`).join("");
  document.getElementById("board").innerHTML = `<div class="bd-scroll">${s}</div>` +
    `<div class="bd-legend">${legend}<span class="muted">Square = a business (its first letter; hover for the name) · ring = where a player is standing</span></div>
     <p class="bd-credit">Map outlines: Diplicity's classic Europe map, from <a href="https://github.com/zond/godip" rel="noopener">godip</a> (GPL-3.0). A placeholder until we draw our own.</p>`;
}

// ----- Dashboard -----
// A made-up market for the sketch: every stockpile somewhere between half and double its balanced share.
function sketchMarket() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const share = {};
  COMMODITIES.forEach(c => share[c.id] = PR[c.id].s0 * Math.exp((rnd() - 0.5) * 1.4));
  return id => priceOf(id, share[id], 1);
}

const ME = {
  round: 7, cash: 320, space: 40,
  stock: { wheat: 2, water: 5, flour: 1, wood: 4, bread: 6, sawdust: 3, lumber: 2 },
  businesses: [
    { at: "Flour mill", value: 150 },
    { at: "Bakery", value: 180 },
    { at: "Sawmill", value: 110 },
  ],
  loans: [{ what: "Government loan", balance: 250 }],
  bonds: [{ count: 1, length: 10, rate: 0.025, left: 4 }],
  futures: [{ id: "crude_oil", side: "long", qty: 50, price: 8.5, left: 3 }],
};

function drawHud() {
  const price = sketchMarket();
  const inflation = 0.02, base = baseRate(inflation);
  const recipeAt = Object.fromEntries(RECIPES.map(r => [r.at, r]));
  const m = n => M(n);

  // What my businesses need this round, against what I hold
  const need = {};
  ME.businesses.forEach(b => Object.entries(recipeAt[b.at].in).forEach(([id, q]) => need[id] = (need[id] || 0) + q));
  const short = Object.entries(need).map(([id, q]) => ({ id, q, have: ME.stock[id] || 0, buy: Math.max(0, q - (ME.stock[id] || 0)) }));
  const buyCost = short.reduce((s, x) => s + x.buy * price(x.id), 0);

  // Money
  const stockVal = Object.entries(ME.stock).reduce((s, [id, q]) => s + q * price(id), 0);
  const bizVal = ME.businesses.reduce((s, b) => s + b.value, 0);
  const bondVal = ME.bonds.reduce((s, b) => s + b.count * bondSellPrice(b.rate, base, b.left), 0);
  const futPL = ME.futures.reduce((s, f) => s + (f.side === "long" ? 1 : -1) * (futuresPrice(price(f.id), f.left, base) - f.price) * f.qty, 0);
  const loanBal = ME.loans.reduce((s, l) => s + l.balance, 0);
  const net = ME.cash + stockVal + bizVal + bondVal + futPL - loanBal;
  const used = Object.values(ME.stock).reduce((a, b) => a + b, 0);
  const limit = (stockVal + bizVal + bondVal) * LN.borrowShare;

  const parts = [["Cash", ME.cash, "--accent"], ["Stockpile", stockVal, "--raw"], ["Businesses", bizVal, "--mid"], ["Bonds", bondVal, "--fin"], ["Futures", Math.max(0, futPL), "--night"]];
  const gross = parts.reduce((s, p) => s + p[1], 0);
  const bar = parts.map(p => `<span style="width:${(p[1] / gross * 100).toFixed(1)}%;background:var(${p[2]})" title="${p[0]} ${m(p[1])}"></span>`).join("");

  const money = `
    <section class="hp"><h4>My money</h4>
      <div class="networth"><span>Net worth</span><b>${m(net)}</b></div>
      <div class="wbar">${bar}</div>
      <div class="wbar neg"><span style="width:${(loanBal / gross * 100).toFixed(1)}%"></span></div>
      ${parts.map(p => `<div class="hr"><span><i style="background:var(${p[2]})"></i>${p[0]}</span><b>${m(p[1])}</b></div>`).join("")}
      <div class="hr neg"><span><i></i>Loans owed</span><b>−${m(loanBal)}</b></div>
    </section>
    <section class="hp"><h4>Loans, bonds &amp; futures</h4>
      ${ME.loans.map(l => `<div class="pos"><b>${l.what}</b><span>${m(l.balance)} owed at ${P(base + LN.extra)} a round</span><span>Tonight: ${m(l.balance * (base + LN.extra) + l.balance * LN.repayShare)} (interest + 5%)</span><span>Borrowing limit ${m(limit)}, ${m(limit - loanBal)} spare</span></div>`).join("")}
      ${ME.bonds.map(b => `<div class="pos"><b>${b.count} × ${b.length}-round bond${b.count > 1 ? "s" : ""} at ${P(b.rate)}</b><span>Pays ${m(b.count * 100 * b.rate)} tonight · ${b.left} rounds left</span><span>Sell now for ${m(bondSellPrice(b.rate, base, b.left))} each</span></div>`).join("")}
      ${ME.futures.map(f => { const now = futuresPrice(price(f.id), f.left, base), pl = (f.side === "long" ? 1 : -1) * (now - f.price) * f.qty; return `<div class="pos"><b>${f.side === "long" ? "Long" : "Short"} ${f.qty} ${BY_ID[f.id].name} at ${m(f.price)}</b><span>Settles in ${f.left} rounds · now ${m(now)}</span><span class="${pl >= 0 ? "up" : "dn"}">${pl >= 0 ? "+" : ""}${m(pl)} so far</span></div>`; }).join("")}
    </section>`;

  const stock = `
    <section class="hp"><h4>My stockpile <em>${used} / ${ME.space} crates</em></h4>
      <div class="space"><span style="width:${used / ME.space * 100}%"></span></div>
      <table class="ht"><thead><tr><th>Have</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Value</th></tr></thead><tbody>
      ${Object.entries(ME.stock).map(([id, q]) => `<tr><td><span class="dot" style="background:var(${KIND_VAR[kindOf(id)]})"></span>${BY_ID[id].name}</td><td class="n">${q}</td><td class="n">${m(price(id))}</td><td class="n">${m(q * price(id))}</td></tr>`).join("")}
      </tbody></table>
    </section>
    <section class="hp"><h4>My businesses need today</h4>
      ${ME.businesses.map(b => { const r = recipeAt[b.at]; return `<div class="biz"><b>${b.at}</b><span>${Object.entries(r.in).map(([id, q]) => `${q} ${BY_ID[id].name}`).join(" + ")} → ${Object.entries(r.out).map(([id, q]) => `${q} ${BY_ID[id].name}`).join(" + ")}</span></div>`; }).join("")}
      <table class="ht"><thead><tr><th>Input</th><th class="n">Need</th><th class="n">Have</th><th class="n">Buy</th><th class="n">Cost</th></tr></thead><tbody>
      ${short.map(x => `<tr class="${x.buy ? "short" : ""}"><td>${BY_ID[x.id].name}</td><td class="n">${x.q}</td><td class="n">${x.have}</td><td class="n">${x.buy || "✓"}</td><td class="n">${x.buy ? m(x.buy * price(x.id)) : ""}</td></tr>`).join("")}
      </tbody></table>
      <div class="hr total"><span>To buy before midday</span><b>${m(buyCost)}</b></div>
      <button class="hbtn" disabled>Buy everything missing</button>
    </section>`;

  const tick = COMMODITIES.filter(c => c.type !== "waste").map(c => { const p = price(c.id), ch = p / basePrice(c.id) - 1; return `<tr><td>${c.name}</td><td class="n">${m(p)}</td><td class="n ${ch > 0.005 ? "up" : ch < -0.005 ? "dn" : ""}">${ch > 0.005 ? "▲" : ch < -0.005 ? "▼" : ""} ${P(Math.abs(ch), 0)}</td></tr>`; }).join("");
  const market = `
    <section class="hp"><h4>Market prices <em>vs base</em></h4>
      <div class="tick"><table class="ht"><tbody>${tick}</tbody></table></div>
    </section>
    <section class="hp"><h4>Broker</h4>
      <div class="hr"><span>Base rate</span><b>${P(base)}</b></div>
      <div class="hr"><span>Loan rate</span><b>${P(base + LN.extra)}</b></div>
      <div class="hr"><span>New bonds pay</span><b>${P(base)} a round</b></div>
      <div class="hr"><span>Wheat futures, 5 rounds</span><b>${m(futuresPrice(price("wheat"), 5, base))}</b></div>
      <div class="hr"><span>Crude oil futures, 3 rounds</span><b>${m(futuresPrice(price("crude_oil"), 3, base))}</b></div>
      <div class="etfmini">${Object.keys(SECTORS).map(k => { const ids = etfMembers(k); const v = 100 * ids.reduce((s, id) => s + price(id) / basePrice(id), 0) / ids.length; return `<span><b>${EF.tickers[k]}</b>${v.toFixed(1)}</span>`; }).join("")}</div>
    </section>`;

  document.getElementById("hud").innerHTML = `
    <div class="hudbar">
      <span class="phasepill">Round ${ME.round} · Morning</span>
      <span class="muted">Trading is open. Businesses produce at midday.</span>
      <span class="hb"><em>Cash</em><b>${m(ME.cash)}</b></span>
      <span class="hb"><em>Net worth</em><b>${m(net)}</b></span>
    </div>
    <div class="hudgrid">
      <div class="hcol">${money}</div>
      <div class="hcol">${stock}</div>
      <div class="hcol">${market}</div>
    </div>`;
}

drawBoard();
drawHud();
