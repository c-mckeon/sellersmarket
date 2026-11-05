// ---------- Gameplay sketches: board and player dashboard ----------
// Everything here is example data to show the layout. Nothing is wired to a real game yet.

// ----- Board -----
const DISTRICT = {
  food:         { label: "Farmland",       fill: "#8fbf5a" },
  forestry:     { label: "Forest",         fill: "#3f8f5a" },
  mining:       { label: "Mines",          fill: "#9a8a78" },
  metals:       { label: "Steel town",     fill: "#7d8fa3" },
  energy:       { label: "Refinery coast", fill: "#d9a21b" },
  construction: { label: "Building yards", fill: "#c98a5a" },
  electronics:  { label: "Tech park",      fill: "#5a7fd4" },
  machinery:    { label: "Factory row",    fill: "#a06ad4" },
};
const BOARD = [
  ["food", "food", "food", "forestry", "forestry"],
  ["mining", "metals", "metals", "energy", "forestry"],
  ["mining", "metals", "centre", "energy", "energy"],
  ["mining", "construction", "electronics", "electronics", "electronics"],
  ["construction", "construction", "machinery", "machinery", "machinery"],
];
const PLAYERS = {
  you:  { name: "You",  color: "#d4682a" },
  ana:  { name: "Ana",  color: "#2f6db5" },
  ben:  { name: "Ben",  color: "#8a4fc0" },
  cleo: { name: "Cleo", color: "#3f8f5a" },
};
// Businesses on the board: [row, col, owner, business]
const PLOTS = [
  [0, 0, "you", "Flour mill"], [0, 1, "you", "Bakery"], [0, 3, "you", "Sawmill"],
  [1, 1, "ana", "Blast furnace"], [1, 2, "ana", "Steelworks"], [1, 3, "ben", "Oil refinery"],
  [2, 4, "ben", "Plastics plant"], [3, 2, "cleo", "Chip fab"], [3, 3, "cleo", "Battery plant"],
  [4, 0, "ana", "Cement kiln"], [4, 3, "ben", "Motor factory"], [2, 0, "cleo", "Copper smelter"],
];
// Where each player's pawn stands: [row, col]
const PAWNS = { you: [0, 2], ana: [1, 1], ben: [2, 3], cleo: [3, 2] };

function drawBoard() {
  const T = 118, G = 6, PAD = 10, N = 5, W = PAD * 2 + N * T + (N - 1) * G;
  const xy = (r, c) => [PAD + c * (T + G), PAD + r * (T + G)];
  let s = `<svg class="board" viewBox="0 0 ${W} ${W}" role="img" aria-label="Sketch of the game board">`;
  BOARD.forEach((row, r) => row.forEach((d, c) => {
    if (d === "centre") return;
    const [x, y] = xy(r, c), D = DISTRICT[d];
    s += `<rect x="${x}" y="${y}" width="${T}" height="${T}" rx="10" fill="${D.fill}" fill-opacity=".22" stroke="${D.fill}" stroke-width="1.5"/>`;
    s += `<text class="bd-lbl" x="${x + 8}" y="${y + 17}" fill="${D.fill}" font-size="11" font-weight="800">${D.label.toUpperCase()}</text>`;
  }));
  // Centre: market and bank
  const [mx, my] = xy(2, 2);
  s += `<rect x="${mx}" y="${my}" width="${T}" height="${T}" rx="10" fill="#1d1d1b" class="bd-centre"/>`;
  s += `<text x="${mx + T / 2}" y="${my + 48}" text-anchor="middle" fill="#fff" font-size="15" font-weight="800">Market</text>`;
  s += `<text x="${mx + T / 2}" y="${my + 68}" text-anchor="middle" fill="#fff" font-size="12" opacity=".75">&amp; central bank</text>`;
  s += `<text x="${mx + T / 2}" y="${my + 90}" text-anchor="middle" fill="#e0954f" font-size="11" font-weight="700">BROKER · ETFs</text>`;
  // Businesses
  PLOTS.forEach(([r, c, who, biz]) => {
    const [x, y] = xy(r, c), P = PLAYERS[who];
    s += `<rect x="${x + 8}" y="${y + 30}" width="${T - 16}" height="30" rx="6" fill="#fff" stroke="${P.color}" stroke-width="2.5" class="bd-biz"/>`;
    s += `<text x="${x + T / 2 + 3}" y="${y + 49}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1d1d1b" class="bd-biz-t">${biz}</text>`;
    s += `<rect x="${x + 8}" y="${y + 30}" width="6" height="30" rx="2" fill="${P.color}"/>`;
  });
  // Pawns
  Object.entries(PAWNS).forEach(([who, [r, c]], i) => {
    const [x, y] = xy(r, c), P = PLAYERS[who];
    const py = y + T - 22;
    s += `<circle cx="${x + T - 24}" cy="${py}" r="14" fill="${P.color}" stroke="#fff" stroke-width="2.5"/>`;
    s += `<text x="${x + T - 24}" y="${py + 4.5}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">${P.name[0]}</text>`;
  });
  s += `</svg>`;
  const legend = Object.values(PLAYERS).map(p => `<span><i style="background:${p.color}"></i>${p.name}</span>`).join("");
  document.getElementById("board").innerHTML = s + `<div class="bd-legend">${legend}<span class="muted">Box = a business · circle = where a player is standing</span></div>`;
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
