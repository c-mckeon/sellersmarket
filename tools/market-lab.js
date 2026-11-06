// Market lab: tests the order book and auction on their own, away from the rest of the game.
//   node tools/market-lab.js [--traders 4] [--periods 40] [--runs 200] [--units 3]
//
// Uses the real placeOrder and auction code. Each period every trader is given, privately, either
// goods to sell (with a cost per unit) or a need to buy (with a value per unit), just as a contract
// gives a player a private value. Because the values are known, we know the right answer:
//   - the competitive price, where supply meets demand
//   - the most value trade could create (efficiency 100%)
// Then we see how close the auction gets, for a few ways of placing orders:
//   truthful  bids its value, asks its cost
//   shade     bids 20% under its value, asks 20% over its cost (holding out for a better price)
//   random    any price between its limit and halfway to the edge of the range (Gode & Sunder's "zero intelligence")
//   learn     starts like shade, then moves toward the last traded price and the book (simple price-taker)
// The "right answer" is only a yardstick for this test. Nothing in the game uses it: game prices come
// only from players' orders.
const E = require("./engine")();
const G = E.G;
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? +process.argv[i + 1] : d; };
const N = arg("traders", 4), PERIODS = arg("periods", 40), RUNS = arg("runs", 200), UNITS = arg("units", 3);
const LO = 2, HI = 20, GOOD = "wood";

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const f = (x, d = 0) => isNaN(x) ? "–" : x.toFixed(d);

function run(strategy, seed) {
  const r = { seed }, rnd = () => G.rand(r);
  const st = G.newGame({ seed, players: Array.from({ length: N }, (_, i) => ({ name: "T" + i, start: "warsaw", business: "water_works" })) });
  st.players.forEach(p => { p.cash = 100000; p.stock = {}; p.space = 1e9; });
  const out = { eff: [], dev: [], traded: 0, spreads: [], qty: [] };
  for (let t = 0; t < PERIODS; t++) {
    // Private roles: half the traders (rounded at random) sell, the rest buy
    const roles = st.players.map(p => {
      const sellSide = rnd() < 0.5, v = Math.round((LO + rnd() * (HI - LO)) * 100) / 100;
      return { p, side: sellSide ? "sell" : "buy", v, q: 1 + Math.floor(rnd() * UNITS) };
    });
    // The right answer: competitive price and the most surplus possible
    const D = roles.filter(x => x.side === "buy").flatMap(x => Array(x.q).fill(x.v)).sort((a, b) => b - a);
    const Sp = roles.filter(x => x.side === "sell").flatMap(x => Array(x.q).fill(x.v)).sort((a, b) => a - b);
    let maxSurplus = 0, qStar = 0;
    while (qStar < D.length && qStar < Sp.length && D[qStar] > Sp[qStar]) { maxSurplus += D[qStar] - Sp[qStar]; qStar++; }
    const pStar = qStar ? (Math.min(D[qStar - 1], Sp[qStar] ?? Infinity) + Math.max(Sp[qStar - 1], D[qStar] ?? -Infinity)) / 2 : null;

    roles.forEach(x => { if (x.side === "sell") G.add(x.p, GOOD, x.q); });
    // Goods held, counting those on offer
    const held = p => (p.stock[GOOD] || 0) + st.book.filter(o => o.pid === p.id && o.good === GOOD && o.side === "sell").reduce((s, o) => s + o.qty, 0);
    const before = st.players.map(p => ({ held: held(p), cash: G.totalCash(st, p) }));
    const last = st.lastTrade[GOOD]?.price;
    roles.forEach(x => {
      let price;
      if (strategy === "truthful") price = x.v;
      else if (strategy === "shade") price = x.side === "buy" ? x.v * 0.8 : x.v * 1.2;
      else if (strategy === "random") price = x.side === "buy" ? x.v - rnd() * (x.v - LO) / 2 : x.v + rnd() * (HI - x.v) / 2;
      else if (strategy === "learn") {
        const ref = last ?? (x.side === "buy" ? x.v * 0.8 : x.v * 1.2);
        price = x.side === "buy" ? Math.min(x.v, ref * 1.02) : Math.max(x.v, ref * 0.98);
      }
      if (x.side === "sell") G.act(st, x.p.id, "placeOrder", { id: GOOD, side: "sell", price: Math.max(1, Math.round(price)), qty: x.p.stock[GOOD] || 0 });
      else G.act(st, x.p.id, "placeOrder", { id: GOOD, side: "buy", price: Math.max(1, Math.round(price)), qty: x.q });
    });
    G.auction(st);
    const tr = st.history.at(-1).trades[GOOD];
    // Surplus actually made: each trader's units in or out, at their private value
    let surplus = 0;
    roles.forEach((x, i) => {
      const got = held(x.p) - before[i].held, paid = before[i].cash - G.totalCash(st, x.p);
      surplus += got * x.v - paid; // bought: value − price paid; sold: price received − cost
    });
    if (maxSurplus > 0) out.eff.push(Math.max(0, surplus) / maxSurplus);
    if (tr && pStar) { out.dev.push(Math.abs(tr.price - pStar) / pStar); out.traded++; }
    out.qty.push(qStar ? (tr?.qty || 0) / qStar : NaN);
    const q = G.quote(st, GOOD);
    if (q.spread != null) out.spreads.push(q.spread);
    // Each period starts clean: unfilled orders are cancelled and unsold goods used up
    st.players.forEach(p => { G.act(st, p.id, "cancelAll", {}); delete p.stock[GOOD]; });
  }
  return out;
}

console.log(`${N} traders, ${PERIODS} periods × ${RUNS} runs, up to ${UNITS} units each, values ${LO}–${HI}\n`);
console.log("strategy   efficiency (median / 10th pct)   price off the right one (median)   units traded vs right amount   spread left on book");
for (const s of ["truthful", "shade", "random", "learn"]) {
  const all = Array.from({ length: RUNS }, (_, i) => run(s, 1000 + i));
  const eff = all.flatMap(x => x.eff), dev = all.flatMap(x => x.dev), qty = all.flatMap(x => x.qty).filter(x => !isNaN(x)), sp = all.flatMap(x => x.spreads);
  console.log(s.padEnd(10), `${f(100 * pct(eff, .5))}% / ${f(100 * pct(eff, .1))}%`.padEnd(33), `${f(100 * pct(dev, .5), 1)}%`.padEnd(35), `${f(100 * avg(qty))}%`.padEnd(30), sp.length ? `${f(100 * pct(sp, .5))}% (in ${f(100 * sp.length / (RUNS * PERIODS))}% of periods)` : "none");
}
