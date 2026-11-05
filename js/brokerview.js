// ---------- Broker dynamics: calculators ----------
const CB = BROKER.centralBank, LN = BROKER.loans, LV = BROKER.leverage, FU = BROKER.futures, BD = BROKER.bonds;

const P = (x, d = 2) => { let t = (x * 100).toFixed(d); if (t.includes(".")) t = t.replace(/\.?0+$/, ""); return t + "%"; };
const M = n => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return s + (a >= 1000 ? Math.round(a).toLocaleString() : a >= 100 ? a.toFixed(0) : a.toFixed(2));
};
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

// The maths, one function each, so the page and the game can share them later.
function baseRate(inflation) {
  return clamp(CB.neutral + CB.response * (inflation - CB.target), CB.min, CB.max);
}
function loanTerms({ holdings, businesses, bonds, loan, base }) {
  const H = LN.haircut;
  const value = holdings + businesses + bonds;
  const limit = holdings * (1 - H.holdings) + businesses * (1 - H.businesses) + bonds * (1 - H.bonds);
  const ltv = value ? loan / value : 0;
  const premium = LN.minPremium + LN.ltvPremium * ltv;
  const rate = base + premium;
  const interest = loan * rate;
  const principal = loan * LN.repayShare;
  return { value, limit, ltv, premium, rate, interest, principal, payment: interest + principal, over: loan - limit };
}
function leveraged({ own, lev, entry, exit, rounds, base }) {
  const position = own * lev, borrowed = position - own, qty = position / entry;
  const rate = base + LV.spread;
  const interest = borrowed * rate * rounds;
  const valueNow = qty * exit;
  const equity = valueNow - borrowed - interest;
  const liq = lev > 1 ? entry * (lev - 1) / (lev * (1 - LV.maintenance)) : 0;
  return { position, borrowed, qty, rate, interest, valueNow, equity, profit: equity - own, ret: (equity - own) / own, liq, wiped: lev > 1 && exit <= liq };
}
function futuresPrice(spot, rounds, base) { return spot * Math.pow(1 + base + FU.storage, rounds); }
function bondPrice(coupon, roundsLeft, y) {
  const F = BD.face;
  if (roundsLeft <= 0) return F;
  return y === 0 ? F + coupon * F * roundsLeft
    : coupon * F * (1 - Math.pow(1 + y, -roundsLeft)) / y + F / Math.pow(1 + y, roundsLeft);
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
}
const row = (label, value, cls = "") => `<div class="r ${cls}"><span>${label}</span><b>${value}</b></div>`;
const work = s => `<div class="work">${s}</div>`;
const flag = (ok, good, bad) => `<div class="flag ${ok ? "ok" : "bad"}">${ok ? good : bad}</div>`;

// Line chart: series of [x, y] points.
function lineChart({ series, xlabel, ylabel, xfmt = v => v, yfmt = M, marks = [], zero = false }) {
  const W = 420, H = 220, L = 52, R = 12, T = 12, B = 38;
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
  const raw = CB.neutral + CB.response * (v.infl - CB.target);
  const b = baseRate(v.infl);
  const pts = [];
  for (let i = -2; i <= 8; i += 0.1) pts.push([i, baseRate(i / 100) * 100]);
  return work(`${P(CB.neutral)} + ${CB.response} × (${P(v.infl)} − ${P(CB.target)}) = ${P(raw)}${raw !== b ? ` → held at ${P(b)}` : ""}`)
    + row("Base rate", P(b), "big")
    + row("Real rate (base − inflation)", P(b - v.infl))
    + `<p class="cnote">${b - v.infl > 0 ? "Positive real rate: saving beats holding goods, so borrowing to stockpile is discouraged." : "Negative real rate: money loses value faster than it earns interest, so borrowing to buy goods pays."}</p>`
    + lineChart({ series: [{ pts, cls: "a" }], xlabel: "Inflation per round", xfmt: v => v + "%", yfmt: v => v.toFixed(1) + "%", marks: [{ x: v.infl * 100, y: b * 100, label: `${P(v.infl)} → ${P(b)}` }] });
});

// ---------- 2. Government loans ----------
calc("calcLoan", [
  { k: "holdings", label: "Value of your stockpile", v: 2000, step: 100, min: 0 },
  { k: "businesses", label: "Value of your businesses", v: 5000, step: 100, min: 0 },
  { k: "bonds", label: "Value of your bonds", v: 500, step: 100, min: 0 },
  { k: "loan", label: "Loan you want", v: 3000, step: 100, min: 0 },
  { k: "base", label: "Base rate", v: 2.5, unit: "%", step: 0.25, pct: true },
], v => {
  const t = loanTerms(v), H = LN.haircut;
  return work(`Limit = ${M(v.holdings)} × ${1 - H.holdings} + ${M(v.businesses)} × ${1 - H.businesses} + ${M(v.bonds)} × ${1 - H.bonds} = <b>${M(t.limit)}</b>`)
    + row("Credit limit", M(t.limit), "big")
    + flag(t.over <= 0, `Approved. ${M(-t.over)} of borrowing room left.`, `Over the limit by ${M(t.over)}. That's a margin call: pay it down by next morning, or the bank sells your stockpile ${P(LN.forcedSaleDiscount, 0)} under market, then your businesses.`)
    + row("Loan-to-value (LTV)", `${M(v.loan)} ÷ ${M(t.value)} = ${P(t.ltv, 1)}`)
    + work(`Rate = ${P(v.base)} base + (${P(LN.minPremium)} + ${P(LN.ltvPremium, 0)} × ${P(t.ltv, 1)}) premium = <b>${P(t.rate)}</b> a round`)
    + row("Interest each overnight", M(t.interest))
    + row(`Repayment each overnight (${P(LN.repayShare, 0)} of loan)`, M(t.principal))
    + row("Total charged each overnight", M(t.payment), "strong");
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
  const pts = (lev) => { const a = []; for (let c = -50; c <= 50; c += 1) { const x = leveraged({ ...v, lev, exit: v.entry * (1 + c / 100) }); a.push([c, Math.max(-100, x.ret * 100)]); } return a; };
  const chg = (v.exit / v.entry - 1);
  return work(`Position = ${M(v.own)} × ${v.lev} = ${M(r.position)}, of which ${M(r.borrowed)} is borrowed at ${P(r.rate)} a round`)
    + row("Units bought", r.qty.toFixed(1))
    + row("Interest owed", `${M(r.borrowed)} × ${P(r.rate)} × ${v.rounds} = ${M(r.interest)}`)
    + work(`Your stake = ${r.qty.toFixed(1)} × ${M(v.exit)} − ${M(r.borrowed)} − ${M(r.interest)} = <b>${M(r.equity)}</b>`)
    + row("Profit", M(r.profit), "big " + (r.profit >= 0 ? "pos" : "neg"))
    + row("Return on your money", `${P(r.ret, 1)} (price moved ${P(chg, 1)})`)
    + (v.lev > 1 ? row("Liquidation price", `${M(r.liq)} (${P(r.liq / v.entry - 1, 1)})`) : "")
    + (v.lev > 1 ? flag(!r.wiped, "Position safe.", `Price fell to the liquidation price: the broker sold the position and you lost most of your ${M(v.own)}.`) : "")
    + lineChart({ series: [{ pts: pts(1), cls: "b", name: "1× (no leverage)" }, { pts: pts(v.lev), cls: "a", name: v.lev + "×" }], xlabel: "Price change", xfmt: v => (v > 0 ? "+" : "") + v + "%", yfmt: v => v.toFixed(0) + "%", zero: true, marks: [{ x: clamp(chg * 100, -50, 50), y: Math.max(-100, r.ret * 100), label: "you" }] });
});

// ---------- 4. Futures ----------
calc("calcFut", [
  { k: "spot", label: "Price today (spot)", v: 30, step: 1, min: 0.01 },
  { k: "rounds", label: "Rounds until it settles", v: 5, step: 1, min: 1, max: FU.maxRounds },
  { k: "qty", label: "Units in the contract", v: 100, step: 10, min: 1 },
  { k: "side", label: "Your side", v: "long", options: [["long", "Long (agree to buy)"], ["short", "Short (agree to sell)"]] },
  { k: "settle", label: "Price on settlement day", v: 40, step: 1, min: 0 },
  { k: "base", label: "Base rate", v: 2.5, unit: "%", step: 0.25, pct: true },
], v => {
  const rounds = clamp(Math.round(v.rounds), 1, FU.maxRounds);
  const F = futuresPrice(v.spot, rounds, v.base);
  const value = F * v.qty, margin = value * FU.initialMargin;
  const sign = v.side === "long" ? 1 : -1;
  const pay = sign * (v.settle - F) * v.qty;
  const pts = [], lo = v.spot * 0.4, hi = v.spot * 1.8;
  for (let i = 0; i <= 40; i++) { const s = lo + (hi - lo) * i / 40; pts.push([s, sign * (s - F) * v.qty]); }
  return work(`Futures price = ${M(v.spot)} × (1 + ${P(v.base)} + ${P(FU.storage)})<sup>${rounds}</sup> = <b>${M(F)}</b>`)
    + row("Contract value", `${M(F)} × ${v.qty} = ${M(value)}`)
    + row(`Margin up front (${P(FU.initialMargin, 0)})`, M(margin))
    + row(`Margin call if your margin falls below`, M(value * FU.maintenanceMargin))
    + work(`Payoff = ${sign > 0 ? "" : "−"}(${M(v.settle)} − ${M(F)}) × ${v.qty} = <b>${M(pay)}</b>`)
    + row("Profit at settlement", M(pay), "big " + (pay >= 0 ? "pos" : "neg"))
    + row("Return on your margin", P(pay / margin, 0))
    + lineChart({ series: [{ pts, cls: "a" }], xlabel: "Price on settlement day", xfmt: v => M(v), zero: true, marks: [{ x: v.settle, y: pay, label: M(pay) }, { x: F, y: 0, cls: "b", label: "break-even " + M(F), below: true }] });
});

// ---------- 5. Bonds ----------
calc("calcBond", [
  { k: "n", label: "Bond length", v: 10, options: BD.maturities.map(x => [x, x + " rounds"]) },
  { k: "bIssue", label: "Base rate when bought", v: 2.5, unit: "%", step: 0.25, pct: true },
  { k: "elapsed", label: "Rounds since bought", v: 3, step: 1, min: 0 },
  { k: "bNow", label: "Base rate now", v: 3.5, unit: "%", step: 0.25, pct: true },
  { k: "count", label: "Bonds held", v: 10, step: 1, min: 1 },
], v => {
  const n = v.n, el = clamp(Math.round(v.elapsed), 0, n), left = n - el;
  const coupon = v.bIssue + BD.termPremium * n;
  const y = v.bNow + BD.termPremium * left;
  const price = bondPrice(coupon, left, y);
  const per = coupon * BD.face;
  const pts = []; for (let b = 0; b <= 8.001; b += 0.1) pts.push([b, bondPrice(coupon, left, b / 100 + BD.termPremium * left)]);
  return work(`Coupon = ${P(v.bIssue)} + ${P(BD.termPremium)} × ${n} = <b>${P(coupon)}</b> a round, fixed for life`)
    + row("Paid to you each overnight", `${M(per)} per bond, ${M(per * v.count)} in total`)
    + work(`Yield now = ${P(v.bNow)} + ${P(BD.termPremium)} × ${left} rounds left = ${P(y)}`)
    + row("Price if you sell now", `${M(price)} per bond`, "big")
    + row("Gain or loss vs the 100 you paid", `${M((price - BD.face) * v.count)}`, (price >= BD.face ? "pos" : "neg"))
    + row("Coupons collected so far", M(per * el * v.count))
    + `<p class="cnote">${Math.abs(y - coupon) < 1e-9 ? "Rates haven't moved, so the bond is still worth 100." : y > coupon ? "Rates have risen since you bought. New bonds pay more than yours, so yours is worth less than 100 if you sell early. Hold to the end and you still get 100 back." : "Rates have fallen since you bought. Your bond pays more than new ones, so it's worth more than 100."}</p>`
    + lineChart({ series: [{ pts, cls: "a" }], xlabel: "Base rate now", xfmt: v => v + "%", yfmt: v => v.toFixed(0), marks: [{ x: v.bNow * 100, y: price, label: M(price) }] });
});
