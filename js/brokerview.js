// ---------- Broker dynamics: calculators ----------
const CB = BROKER.centralBank, LN = BROKER.loans, LV = BROKER.leverage, FU = BROKER.futures, BD = BROKER.bonds, EF = BROKER.etfs;

const P = (x, d = 2) => { let t = (x * 100).toFixed(d); if (t.includes(".")) t = t.replace(/\.?0+$/, ""); return t + "%"; };
const M = n => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return s + (a >= 1000 ? Math.round(a).toLocaleString() : a >= 100 ? a.toFixed(0) : a.toFixed(2));
};
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

// ---------- The maths ----------
const baseRate = inflation => clamp(inflation + CB.above, CB.min, CB.max);

function loanTerms({ holdings, businesses, bonds, loan, base }) {
  const owned = holdings + businesses + bonds;
  const limit = owned * LN.borrowShare;
  const rate = base + LN.extra;
  const interest = loan * rate, repay = loan * LN.repayShare;
  return { owned, limit, rate, interest, repay, total: interest + repay, over: loan - limit };
}

function leveraged({ own, lev, entry, exit, rounds, base }) {
  const position = own * lev, borrowed = position - own;
  const change = exit / entry - 1;
  const rate = base + LV.extra;
  const gain = position * change, interest = borrowed * rate * rounds;
  const liq = entry * (1 - LV.wipeout / lev);
  const wiped = lev > 1 && exit <= liq;
  const profit = wiped ? -own * LV.wipeout - interest : gain - interest;
  return { position, borrowed, change, rate, gain, interest, profit, ret: profit / own, liq, wiped };
}

const futuresPrice = (spot, rounds, base) => spot * (1 + base * rounds);
const bondSellPrice = (rate, baseNow, left) => Math.max(0, BD.face + (rate - baseNow) * BD.face * left);

// ETF value straight from the live prices on the Market dynamics tab.
const etfMembers = sec => SECTORS[sec].items.filter(id => BY_ID[id].type !== "waste");
function etfValue(sec) {
  const ids = etfMembers(sec);
  const avg = ids.reduce((s, id) => s + priceOf(id) / basePrice(id), 0) / ids.length;
  return EF.start * avg;
}

// ---------- Tiny calculator framework ----------
function calc(rootId, inputs, compute) {
  const root = document.getElementById(rootId);
  const form = document.createElement("div");
  form.className = "cin";
  form.innerHTML = inputs.map(i => i.options
    ? `<label><span>${i.label}</span><select data-k="${i.k}">${i.options.map(o => `<option value="${o[0]}"${o[0] == i.v ? " selected" : ""}>${o[1]}</option>`).join("")}</select></label>`
    : `<label><span>${i.label}</span><span class="iw"><input type="number" data-k="${i.k}" value="${i.v}" step="${i.step || "any"}" min="${i.min ?? ""}" max="${i.max ?? ""}">${i.unit ? `<em>${i.unit}</em>` : ""}</span></label>`).join("");
  const out = document.createElement("div");
  out.className = "cout";
  root.append(form, out);
  const read = () => {
    const v = {};
    form.querySelectorAll("[data-k]").forEach(e => {
      const i = inputs.find(x => x.k === e.dataset.k);
      let x = e.tagName === "SELECT" ? e.value : parseFloat(e.value);
      if (typeof x === "number" && !isFinite(x)) x = 0;
      if (i.pct) x /= 100;
      if (i.options && !isNaN(+x)) x = +x;
      v[i.k] = x;
    });
    return v;
  };
  const run = () => { out.innerHTML = compute(read()); };
  form.addEventListener("input", run);
  run();
  return run;
}
const row = (label, value, cls = "") => `<div class="r ${cls}"><span>${label}</span><b>${value}</b></div>`;
const work = s => `<div class="work">${s}</div>`;
const flag = (ok, good, bad) => `<div class="flag ${ok ? "ok" : "bad"}">${ok ? good : bad}</div>`;

// Line chart: series of [x, y] points.
function lineChart({ series, xlabel, xfmt = v => v, yfmt = M, marks = [], zero = false }) {
  const W = 420, H = 210, L = 52, R = 12, T = 12, B = 38;
  const all = series.flatMap(s => s.pts);
  const x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0]));
  let y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
  if (zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  const pad = (y1 - y0) * 0.08 || 1; y0 -= pad; y1 += pad;
  const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (y1 - y) / (y1 - y0) * (H - T - B);
  const step = niceStep((y1 - y0) / 4), xs = niceStep((x1 - x0) / 5);
  let g = `<svg class="lchart" viewBox="0 0 ${W} ${H}">`;
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) g += `<line class="grid${Math.abs(v) < 1e-9 ? " zero" : ""}" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${yfmt(v)}</text>`;
  for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) g += `<text class="ax" x="${X(v)}" y="${H - B + 15}" text-anchor="middle">${xfmt(v)}</text>`;
  g += `<text class="ax lbl" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${xlabel}</text>`;
  series.forEach(s => g += `<path class="ln ${s.cls || ""}" d="${s.pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("")}"/>`);
  marks.forEach(m => g += `<circle class="mk ${m.cls || ""}" cx="${X(m.x)}" cy="${Y(m.y)}" r="5"/>${m.label ? `<text class="mkl" x="${X(m.x) + (X(m.x) > W - 140 ? -8 : 8)}" y="${Y(m.y) + (m.below ? 18 : -8)}" text-anchor="${X(m.x) > W - 140 ? "end" : "start"}">${m.label}</text>` : ""}`);
  g += `</svg>`;
  const legend = series.filter(s => s.name).map(s => `<span><i class="${s.cls || ""}"></i>${s.name}</span>`).join("");
  return (legend ? `<div class="clegend">${legend}</div>` : "") + g;
}

// ---------- 1. Central bank ----------
calc("calcBase", [
  { k: "infl", label: "Inflation this round", v: 2, unit: "%", step: 0.5, pct: true },
], v => {
  const b = baseRate(v.infl);
  return work(`${P(v.infl)} + ${P(CB.above)} = ${P(v.infl + CB.above)}${Math.abs(b - v.infl - CB.above) > 1e-9 ? ` → held at ${P(b)}` : ""}`)
    + row("Base rate", P(b), "big")
    + `<p class="cnote">Because the base rate is always a little above inflation, cash in the bank slowly beats goods sitting in a warehouse. Borrowing to stockpile only pays if you expect prices to rise faster than inflation.</p>`;
});

// ---------- 2. Government loans ----------
calc("calcLoan", [
  { k: "holdings", label: "Value of your stockpile", v: 2000, step: 100, min: 0 },
  { k: "businesses", label: "Value of your businesses", v: 5000, step: 100, min: 0 },
  { k: "bonds", label: "Value of your bonds", v: 500, step: 100, min: 0 },
  { k: "loan", label: "Loan you want", v: 3000, step: 100, min: 0 },
  { k: "base", label: "Base rate", v: 2.5, unit: "%", step: 0.25, pct: true },
], v => {
  const t = loanTerms(v);
  return work(`Limit = 50% × (${M(v.holdings)} + ${M(v.businesses)} + ${M(v.bonds)}) = <b>${M(t.limit)}</b>`)
    + row("Borrowing limit", M(t.limit), "big")
    + flag(t.over <= 0, `Approved. You could borrow ${M(-t.over)} more.`, `Over the limit by ${M(t.over)}. Margin call: pay it down by next morning, or the bank sells your things ${P(LN.forcedSaleDiscount, 0)} under market.`)
    + work(`Loan rate = ${P(v.base)} + ${P(LN.extra)} = <b>${P(t.rate)}</b> a round`)
    + row("Interest each overnight", `${M(v.loan)} × ${P(t.rate)} = ${M(t.interest)}`)
    + row("Repayment each overnight", `${M(v.loan)} × ${P(LN.repayShare, 0)} = ${M(t.repay)}`)
    + row("Total each overnight", M(t.total), "strong");
});

// ---------- 3. Leverage ----------
calc("calcLev", [
  { k: "own", label: "Your own money", v: 1000, step: 100, min: 1 },
  { k: "lev", label: "Leverage", v: 3, options: [1, 2, 3, 4, 5].map(x => [x, x + "×"]) },
  { k: "entry", label: "Price when you buy", v: 30, step: 1, min: 0.01 },
  { k: "exit", label: "Price when you sell", v: 36, step: 1, min: 0 },
  { k: "rounds", label: "Rounds held", v: 2, step: 1, min: 0 },
  { k: "base", label: "Base rate", v: 2.5, unit: "%", step: 0.25, pct: true },
], v => {
  const r = leveraged(v);
  const pts = lev => { const a = []; for (let c = -40; c <= 40; c += 1) a.push([c, leveraged({ ...v, lev, exit: v.entry * (1 + c / 100) }).ret * 100]); return a; };
  return work(`You buy ${M(v.own)} × ${v.lev} = <b>${M(r.position)}</b> worth. The broker lends ${M(r.borrowed)}.`)
    + row("Price change", P(r.change, 1))
    + row("Gain on the goods", `${M(r.position)} × ${P(r.change, 1)} = ${M(r.gain)}`)
    + row("Interest", `${M(r.borrowed)} × ${P(r.rate)} × ${v.rounds} = ${M(r.interest)}`)
    + row("Profit", M(r.profit), "big " + (r.profit >= 0 ? "pos" : "neg"))
    + row("Return on your money", P(r.ret, 1))
    + (v.lev > 1 ? row("Sold out if price falls to", `${M(r.liq)} (−${P(LV.wipeout / v.lev, 1)})`) : "")
    + (v.lev > 1 ? flag(!r.wiped, "Position safe.", `The price hit ${M(r.liq)}, so the broker sold you out. You lost ${P(LV.wipeout, 0)} of your money.`) : "")
    + lineChart({ series: [{ pts: pts(1), cls: "b", name: "1× (no leverage)" }, { pts: pts(v.lev), cls: "a", name: v.lev + "×" }], xlabel: "Price change", xfmt: v => (v > 0 ? "+" : "") + v + "%", yfmt: v => v.toFixed(0) + "%", zero: true });
});

// ---------- 4. Futures ----------
calc("calcFut", [
  { k: "spot", label: "Price today", v: 30, step: 1, min: 0.01 },
  { k: "rounds", label: "Rounds until it settles", v: 5, step: 1, min: 1, max: FU.maxRounds },
  { k: "qty", label: "Units", v: 100, step: 10, min: 1 },
  { k: "side", label: "Your side", v: "long", options: [["long", "Buy (long)"], ["short", "Sell (short)"]] },
  { k: "settle", label: "Price on the day", v: 40, step: 1, min: 0 },
  { k: "base", label: "Base rate", v: 2.5, unit: "%", step: 0.25, pct: true },
], v => {
  const rounds = clamp(Math.round(v.rounds), 1, FU.maxRounds);
  const F = futuresPrice(v.spot, rounds, v.base);
  const deposit = F * v.qty * FU.deposit;
  const sign = v.side === "long" ? 1 : -1;
  const pay = sign * (v.settle - F) * v.qty;
  return work(`Futures price = ${M(v.spot)} × (1 + ${P(v.base)} × ${rounds}) = <b>${M(F)}</b>`)
    + row(`Deposit (${P(FU.deposit, 0)})`, `${M(F)} × ${v.qty} × ${P(FU.deposit, 0)} = ${M(deposit)}`)
    + work(`Profit = ${sign > 0 ? `(${M(v.settle)} − ${M(F)})` : `(${M(F)} − ${M(v.settle)})`} × ${v.qty} = <b>${M(pay)}</b>`)
    + row("Profit", M(pay), "big " + (pay >= 0 ? "pos" : "neg"))
    + row("Return on your deposit", P(pay / deposit, 0));
});

// ---------- 5. Bonds ----------
calc("calcBond", [
  { k: "n", label: "Bond length", v: 10, options: BD.lengths.map(x => [x, x + " rounds"]) },
  { k: "rate", label: "Base rate when bought", v: 2.5, unit: "%", step: 0.25, pct: true },
  { k: "held", label: "Rounds held so far", v: 3, step: 1, min: 0 },
  { k: "now", label: "Base rate now", v: 3.5, unit: "%", step: 0.25, pct: true },
], v => {
  const held = clamp(Math.round(v.held), 0, v.n), left = v.n - held;
  const coupon = v.rate * BD.face;
  const sell = bondSellPrice(v.rate, v.now, left);
  return row("Paid to you each overnight", `100 × ${P(v.rate)} = ${M(coupon)}`)
    + row("Collected so far", `${M(coupon)} × ${held} = ${M(coupon * held)}`)
    + row("If you hold to the end", `${M(coupon * v.n)} in payments + 100 back`)
    + work(`Sell now = 100 + (${P(v.rate)} − ${P(v.now)}) × 100 × ${left} = <b>${M(sell)}</b>`)
    + row("Sell price today", M(sell), "big " + (sell >= BD.face ? "pos" : "neg"))
    + `<p class="cnote">${Math.abs(v.rate - v.now) < 1e-9 ? "Rates haven't moved, so the bond still sells for 100." : v.now > v.rate ? "Rates have gone up, so new bonds pay more than yours. Yours sells for less than 100, but you still get the full 100 if you wait until the end." : "Rates have gone down, so your bond pays more than new ones and sells for more than 100."}</p>`;
});

// ---------- 6. ETFs ----------
let etfSel = "food";
const etfRun = calc("calcEtf", [
  { k: "sec", label: "Sector ETF", v: "food", options: Object.keys(SECTORS).map(k => [k, `${EF.tickers[k]} · ${SECTORS[k].name}`]) },
  { k: "units", label: "Units to buy", v: 10, step: 1, min: 0 },
], v => {
  etfSel = v.sec;
  const ids = etfMembers(v.sec), val = etfValue(v.sec);
  const cost = val * v.units, fee = cost * EF.fee;
  const rows = ids.map(id => {
    const ratio = priceOf(id) / basePrice(id);
    return `<tr><td>${BY_ID[id].name}</td><td class="n">${M(priceOf(id))}</td><td class="n">${M(basePrice(id))}</td><td class="n ${ratio > 1.005 ? "up" : ratio < 0.995 ? "dn" : ""}">${ratio.toFixed(2)}</td></tr>`;
  }).join("");
  return `<table class="etft"><thead><tr><th>In the fund</th><th class="n">Price</th><th class="n">Base</th><th class="n">Price ÷ base</th></tr></thead><tbody>${rows}</tbody></table>`
    + work(`${EF.tickers[v.sec]} = 100 × average of ${ids.length} ratios = <b>${val.toFixed(1)}</b>`)
    + row(`${EF.tickers[v.sec]} price`, val.toFixed(1), "big")
    + row(`Cost of ${v.units} units`, M(cost))
    + row(`Fee (${P(EF.fee, 1)})`, M(fee))
    + row("Total to pay", M(cost + fee), "strong");
});

function renderEtfBoard() {
  const el = document.getElementById("etfBoard");
  if (!el) return;
  el.innerHTML = Object.keys(SECTORS).map(k => {
    const v = etfValue(k), ch = v / EF.start - 1;
    return `<div class="etf ${k === etfSel ? "on" : ""}"><b>${EF.tickers[k]}</b><span>${SECTORS[k].name}</span><em class="${ch > 0.005 ? "up" : ch < -0.005 ? "dn" : ""}">${v.toFixed(1)}</em></div>`;
  }).join("");
}
renderEtfBoard();
document.getElementById("calcEtf").addEventListener("input", renderEtfBoard);

// Keep ETFs in step with the Market dynamics tab.
const _renderMarketTable = renderMarketTable;
renderMarketTable = function () { _renderMarketTable(); etfRun(); renderEtfBoard(); };
const _updateRow = updateRow;
updateRow = function (id) { _updateRow(id); etfRun(); renderEtfBoard(); };
