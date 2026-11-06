// Run Sellers Market games with computer players only, and summarise how the market behaves.
//   node tools/sim.js [--games 20] [--players 4] [--seed 1] [--set '{"contracts.size":20}'] [--json] [--prices]
// Uses exactly the same engine files as the website. --set overrides game/settings.js values
// (nested ones with dots).
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const FILES = ["js/commodities.js", "js/market.js", "js/broker.js", "js/cards.js", "js/map.js", "maps/europe.js", "js/territories.js", "js/businesses.js",
  "game/settings.js", "game/core.js", "game/market.js", "game/production.js", "game/map.js", "game/contracts.js", "game/cards.js", "game/finance.js", "game/bots.js", "game/pipeline.js"];

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const games = +arg("games", 20), players = +arg("players", 4), seed = +arg("seed", 1);
const overrides = JSON.parse(arg("set", "{}"));

function runAll() {
  const ctx = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Set, Map, Infinity, Error });
  FILES.forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
    if (f === "game/settings.js") vm.runInContext(`(o => { for (const [k, v] of Object.entries(o)) { const ks = k.split("."); let t = GAME_SETTINGS; ks.slice(0, -1).forEach(x => t = t[x]); t[ks.at(-1)] = v; } })(${JSON.stringify(overrides)})`, ctx);
  });
  return JSON.parse(vm.runInContext(`(() => {
    const G = SMG, land = TERRITORIES.filter(t => !t.sea).map(t => t.id), out = [];
    for (let g = 0; g < ${games}; g++) {
      const rng = { seed: ${seed} * 1000 + g * 7919 };
      const ps = [];
      for (let i = 0; i < ${players}; i++) {
        const start = G.pick(rng, land);
        const opts = G.BIZ.filter(b => G.canBuildAt(b, start) && b.kind === "extract").sort((a, b) => G.richness(b, start) * G.rawUnits(b.makes) * b.outputs[b.makes] - G.richness(a, start) * G.rawUnits(a.makes) * a.outputs[a.makes]);
        ps.push({ name: "Bot " + (i + 1), bot: true, start, business: opts[0].id });
      }
      const st = G.newGame({ players: ps, seed: ${seed} * 1000 + g });
      const traded = {}, vol = {};
      st.history.forEach(h => Object.entries(h.trades).forEach(([id, t]) => { traded[id] = (traded[id] || 0) + 1; vol[id] = (vol[id] || 0) + t.qty; }));
      out.push({
        points: st.players.map(p => p.points), delivered: st.players.map(p => p.delivered || 0),
        cash: st.players.map(p => G.totalCash(st, p)),
        biz: st.players.map(p => G.myBusinesses(st, p.id).length),
        stats: st.stats, auctions: st.history.length, traded, vol,
        twoSided: COMMODITIES.filter(c => G.bestBid(st, c.id) && G.bestAsk(st, c.id)).length,
        spreads: COMMODITIES.filter(c => G.bestBid(st, c.id) && G.bestAsk(st, c.id)).map(c => G.bestAsk(st, c.id).price / G.bestBid(st, c.id).price - 1),
        last: Object.fromEntries(Object.entries(st.lastTrade).map(([id, t]) => [id, t.price])),
        path: ${process.argv.includes("--prices") ? "g === 0 ? st.history.map(h => h.trades) : null" : "null"},
      });
    }
    return JSON.stringify(out);
  })()`, ctx));
}

const res = runAll();
const flat = k => res.flatMap(r => r[k]);
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const f = (x, d = 0) => x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const goodsTraded = {}, goodsVol = {}, lastPx = {};
res.forEach(r => { Object.entries(r.traded).forEach(([id, n]) => goodsTraded[id] = (goodsTraded[id] || 0) + n / r.auctions);
  Object.entries(r.vol).forEach(([id, n]) => goodsVol[id] = (goodsVol[id] || 0) + n);
  Object.entries(r.last).forEach(([id, p]) => (lastPx[id] ||= []).push(p)); });
const liquid = Object.entries(goodsTraded).map(([id, x]) => [id, x / res.length]).sort((a, b) => b[1] - a[1]);
const summary = {
  settings: overrides, games, players,
  "points per player (median / 10th / 90th pct)": `${q(flat("points"), .5)} / ${q(flat("points"), .1)} / ${q(flat("points"), .9)}`,
  "winner's points (median)": q(res.map(r => Math.max(...r.points)), .5),
  "contracts delivered per player (median / max)": `${q(flat("delivered"), .5)} / ${Math.max(...flat("delivered"))}`,
  "players who never delivered": f(100 * flat("delivered").filter(x => !x).length / flat("delivered").length) + "%",
  "cash at end (10th / median / 90th pct)": `${f(q(flat("cash"), .1))} / ${f(q(flat("cash"), .5))} / ${f(q(flat("cash"), .9))}`,
  "businesses per player (median / max)": `${q(flat("biz"), .5)} / ${Math.max(...flat("biz"))}`,
  "businesses idle (share of runs)": f(100 * avg(res.map(r => r.stats.idle / Math.max(1, r.stats.runs)))) + "%",
  "goods thrown away (overflow) per game": f(avg(res.map(r => r.stats.overflow))),
  "goods trading per auction (average)": f(avg(res.map(r => (r.stats.trades || 0) / r.auctions)), 1),
  "auctions where nothing traded": f(100 * avg(res.map(r => 1 - Object.values(r.traded).length / 50 >= 0 ? 0 : 0))) + "%",
  "goods that ever traded in a game (median of 50)": q(res.map(r => Object.keys(r.traded).length), .5),
  "goods with both a bid and an ask at the end (median)": q(res.map(r => r.twoSided), .5),
  "bid/ask spread at the end (median)": f(100 * q(res.flatMap(r => r.spreads), .5)) + "%",
  "most liquid (share of auctions it traded in)": liquid.slice(0, 8).map(([id, x]) => `${id} ${f(100 * x)}%`).join(", "),
  "least liquid (of those that traded)": liquid.slice(-6).map(([id, x]) => `${id} ${f(100 * x)}%`).join(", "),
  "last prices (median across games)": Object.entries(lastPx).sort((a, b) => q(b[1], .5) - q(a[1], .5)).slice(0, 14).map(([id, a]) => `${id} ${f(q(a, .5), 1)}`).join(", "),
};
delete summary["auctions where nothing traded"];
if (process.argv.includes("--json")) console.log(JSON.stringify(summary));
else Object.entries(summary).forEach(([k, v]) => console.log(k.padEnd(56), typeof v === "object" ? JSON.stringify(v) : v));
if (process.argv.includes("--prices")) {
  const p = res[0].path, ids = [...new Set(p.flatMap(t => Object.keys(t)))];
  console.log("\nGame 1 prices by auction (blank = no trade):");
  ids.forEach(id => console.log(id.padEnd(14), p.map(t => t[id] ? f(t[id].price, 1).padStart(6) : "      ").join("")));
}
