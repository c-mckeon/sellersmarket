// Run Sellers Market games with computer players only, and summarise how the market behaves.
//   node tools/sim.js [--games 20] [--players 4] [--seed 1] [--starts spread|random] [--set '{"contracts.size":20}'] [--json] [--prices]
// --starts: spread (default) gives each player a different regional raw material (G.spreadStarts);
//           random picks any territory and its best mine.
// Uses exactly the same engine files as the website. --set overrides game/settings.js values
// (nested ones with dots).
//
// Besides the totals it checks every night for:
//   stuck     a round where nobody traded, built or delivered anything
//   cornered  one player holds at least 80% of a good (stock + on offer) while someone else bids for it,
//             and holds more than it needs itself, but doesn't offer that surplus at up to twice the best bid
//             (bots never do this on purpose, so this mainly checks the measure; people might)
//   outlet    for each business, whether some other player could use what it makes: one of their
//             businesses takes it (as an input or a stand-in), one of their contracts asks for it, or it's
//             a building material. Doesn't depend on how well the bots play.
//   short     someone bids for a good but no other player has any to spare beyond their own needs
const engine = require("./engine");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const games = +arg("games", 20), players = +arg("players", 4), seed = +arg("seed", 1), starts = arg("starts", "spread");
const overrides = JSON.parse(arg("set", "{}"));
const E = engine(overrides), G = E.G, COMMODITIES = E.COMMODITIES;
const land = E.run("TERRITORIES").filter(t => !t.sea).map(t => t.id);

// The nightly check, run after the afternoon auction
const watch = st => {
  const m = st.mon ||= { outRaw: 0, nRaw: 0, outAll: 0, nAll: 0, short: 0, shortGoods: {}, dead: 0, rounds: 0, firstDelivery: null, cornered: 0, contested: 0, corneredGoods: {}, lastDelivered: 0, lastBiz: st.businesses.length };
  m.rounds++;
  const usesOf = b => new Set([...Object.keys(b.inputs), ...Object.keys(b.inputs).flatMap(c => G.substitutesFor(b, c).map(([x]) => x))]);
  st.businesses.forEach(biz => {
    const g = G.BIZ_BY[biz.type].makes, raw = G.BIZ_BY[biz.type].kind === "extract";
    const ok = G.isMaterial(g) || st.businesses.some(x => x.owner !== biz.owner && usesOf(G.BIZ_BY[x.type]).has(g))
      || st.players.some(p => p.id !== biz.owner && p.contracts.some(k => k.goods[g]));
    m.nAll++; m.outAll += ok; if (raw && g !== "water") { m.nRaw++; m.outRaw += ok; } // water: anyone can make it anywhere
  });
  const traded = st.history.slice(-2).some(h => Object.keys(h.trades).length);
  const delivered = (st.stats.delivered || 0) > m.lastDelivered, built = st.businesses.length > m.lastBiz;
  if (!traded && !delivered && !built) m.dead++;
  if (delivered && m.firstDelivery == null) m.firstDelivery = st.round;
  m.lastDelivered = st.stats.delivered || 0; m.lastBiz = st.businesses.length;
  COMMODITIES.forEach(c => {
    const held = st.players.map(p => (p.stock[c.id] || 0) + st.book.filter(o => o.pid === p.id && o.good === c.id && o.side === "sell").reduce((s, o) => s + o.qty, 0));
    const total = held.reduce((s, x) => s + x, 0);
    if (total < 3) return;
    const top = held.indexOf(Math.max(...held)), holder = st.players[top];
    const bids = st.book.filter(o => o.good === c.id && o.side === "buy" && o.pid !== holder.id);
    if (!bids.length) return;
    m.contested++;
    const spare = st.players.filter(p => bids.some(o => o.pid !== p.id)).some(p => (p.stock[c.id] || 0) + st.book.filter(o => o.pid === p.id && o.good === c.id && o.side === "sell").reduce((s, o) => s + o.qty, 0) > (G.botWants(st, p)[c.id] || 0));
    if (!spare) { m.short++; m.shortGoods[c.id] = (m.shortGoods[c.id] || 0) + 1; }
    const bid = Math.max(...bids.map(o => o.price));
    const surplus = held[top] - (G.botWants(st, holder)[c.id] || 0);
    const offeredNear = st.book.filter(o => o.good === c.id && o.side === "sell" && o.pid === holder.id && o.price <= 2 * bid).reduce((s, o) => s + o.qty, 0);
    if (held[top] / total >= 0.8 && surplus > 0 && offeredNear < surplus) { m.cornered++; m.corneredGoods[c.id] = (m.corneredGoods[c.id] || 0) + 1; }
  });
};
G.steps.overnight.push(watch);

const out = [];
for (let g = 0; g < games; g++) {
  const rng = { seed: seed * 1000 + g * 7919 };
  const ps = [];
  if (starts === "spread") G.spreadStarts(players, rng).forEach((x, i) => ps.push({ name: "Bot " + (i + 1), bot: true, ...x }));
  else for (let i = 0; i < players; i++) {
    const start = G.pick(rng, land);
    const opts = G.BIZ.filter(b => G.canBuildAt(b, start) && b.kind === "extract").sort((a, b) => G.richness(b, start) * G.rawUnits(b.makes) * b.outputs[b.makes] - G.richness(a, start) * G.rawUnits(a.makes) * a.outputs[a.makes]);
    ps.push({ name: "Bot " + (i + 1), bot: true, start, business: opts[0].id });
  }
  const st = G.newGame({ players: ps, seed: seed * 1000 + g });
  const traded = {}, vol = {};
  st.history.forEach(h => Object.entries(h.trades).forEach(([id, t]) => { traded[id] = (traded[id] || 0) + 1; vol[id] = (vol[id] || 0) + t.qty; }));
  out.push({
    points: st.players.map(p => p.points), delivered: st.players.map(p => p.delivered || 0),
    cash: st.players.map(p => G.totalCash(st, p)),
    biz: st.players.map(p => G.myBusinesses(st, p.id).length),
    stats: st.stats, auctions: st.history.length, traded, vol, mon: st.mon,
    twoSided: COMMODITIES.filter(c => G.bestBid(st, c.id) && G.bestAsk(st, c.id)).length,
    // Spread after every auction, for every good that had both a bid and an ask
    spreads: st.history.flatMap(h => Object.values(h.quotes || {}).filter(q => q.bid && q.ask).map(q => q.ask / q.bid - 1)),
    last: Object.fromEntries(Object.entries(st.lastTrade).map(([id, t]) => [id, t.price])),
    path: process.argv.includes("--prices") && g === 0 ? st.history.map(h => h.trades) : null,
  });
}

const res = out;
const flat = k => res.flatMap(r => r[k]);
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const f = (x, d = 0) => x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const goodsTraded = {}, lastPx = {}, corneredGoods = {}, shortGoods = {};
res.forEach(r => {
  Object.entries(r.traded).forEach(([id, n]) => goodsTraded[id] = (goodsTraded[id] || 0) + n / r.auctions);
  Object.entries(r.last).forEach(([id, p]) => (lastPx[id] ||= []).push(p));
  Object.entries(r.mon.corneredGoods).forEach(([id, n]) => corneredGoods[id] = (corneredGoods[id] || 0) + n);
  Object.entries(r.mon.shortGoods).forEach(([id, n]) => shortGoods[id] = (shortGoods[id] || 0) + n);
});
const liquid = Object.entries(goodsTraded).map(([id, x]) => [id, x / res.length]).sort((a, b) => b[1] - a[1]);
const mons = res.map(r => r.mon);
const summary = {
  settings: overrides, games, players,
  "points per player (median / 10th / 90th pct)": `${q(flat("points"), .5)} / ${q(flat("points"), .1)} / ${q(flat("points"), .9)}`,
  "winner's points (median)": q(res.map(r => Math.max(...r.points)), .5),
  "contracts delivered per player (median / max)": `${q(flat("delivered"), .5)} / ${Math.max(...flat("delivered"))}`,
  "players who never delivered": f(100 * flat("delivered").filter(x => !x).length / flat("delivered").length) + "%",
  "round of the first delivery (median; – = none)": (() => { const a = mons.map(m => m.firstDelivery ?? Infinity); const x = q(a, .5); return x === Infinity ? "–" : x; })(),
  "has a possible buyer: mines etc. (not water) / all": `${f(100 * mons.reduce((s, m) => s + m.outRaw, 0) / mons.reduce((s, m) => s + m.nRaw, 0))}% / ${f(100 * mons.reduce((s, m) => s + m.outAll, 0) / mons.reduce((s, m) => s + m.nAll, 0))}%`,
  // Of the goods delivered on contracts, how many the deliverer could have bought rather than made
  // (per player and good: min(bought, delivered)); the higher, the more progress depends on trade
  "delivered goods that were bought (not self-made)": f(100 * (() => { let b = 0, d = 0; res.forEach(r => Object.entries(r.stats.deliveredGoods || {}).forEach(([pid, goods]) => Object.entries(goods).forEach(([g, q]) => { d += q; b += Math.min(q, r.stats.bought?.[pid]?.[g] || 0); }))); return d ? b / d : 0; })()) + "%",
  "stuck rounds: no trade, build or delivery": f(100 * avg(mons.map(m => m.dead / m.rounds))) + "%",
  "cornered (share of goods someone else wants)": f(100 * mons.reduce((s, m) => s + m.cornered, 0) / Math.max(1, mons.reduce((s, m) => s + m.contested, 0))) + "%",
  "most often cornered": Object.entries(corneredGoods).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => `${id} ${n}`).join(", ") || "–",
  "short supply (share of goods someone else wants)": f(100 * mons.reduce((s, m) => s + m.short, 0) / Math.max(1, mons.reduce((s, m) => s + m.contested, 0))) + "%",
  "most often short": Object.entries(shortGoods).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => `${id} ${n}`).join(", ") || "–",
  "cash at end (10th / median / 90th pct)": `${f(q(flat("cash"), .1))} / ${f(q(flat("cash"), .5))} / ${f(q(flat("cash"), .9))}`,
  "businesses per player (median / max)": `${q(flat("biz"), .5)} / ${Math.max(...flat("biz"))}`,
  "businesses idle (share of runs)": f(100 * avg(res.map(r => r.stats.idle / Math.max(1, r.stats.runs)))) + "%",
  "goods thrown away (overflow) per game": f(avg(res.map(r => r.stats.overflow))),
  "goods gone off (depreciation) per game": f(avg(res.map(r => r.stats.spoiled || 0))),
  "goods trading per auction (average)": f(avg(res.map(r => (r.stats.trades || 0) / r.auctions)), 1),
  "goods that ever traded in a game (median of 50)": q(res.map(r => Object.keys(r.traded).length), .5),
  "goods with both a bid and an ask at the end (median)": q(res.map(r => r.twoSided), .5),
  "bid/ask spread after each auction (median)": f(100 * q(res.flatMap(r => r.spreads), .5)) + "%",
  "most liquid (share of auctions it traded in)": liquid.slice(0, 8).map(([id, x]) => `${id} ${f(100 * x)}%`).join(", "),
  "least liquid (of those that traded)": liquid.slice(-6).map(([id, x]) => `${id} ${f(100 * x)}%`).join(", "),
  "last prices (median across games)": Object.entries(lastPx).sort((a, b) => q(b[1], .5) - q(a[1], .5)).slice(0, 14).map(([id, a]) => `${id} ${f(q(a, .5), 1)}`).join(", "),
};
if (process.argv.includes("--json")) console.log(JSON.stringify(summary));
else Object.entries(summary).forEach(([k, v]) => console.log(k.padEnd(56), typeof v === "object" ? JSON.stringify(v) : v));
if (process.argv.includes("--prices")) {
  const p = res[0].path, ids = [...new Set(p.flatMap(t => Object.keys(t)))];
  console.log("\nGame 1 prices by auction (blank = no trade):");
  ids.forEach(id => console.log(id.padEnd(14), p.map(t => t[id] ? f(t[id].price, 1).padStart(6) : "      ").join("")));
}
