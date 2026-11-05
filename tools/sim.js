// Run Sellers Market games with computer players only, and summarise how the economy behaves.
//   node tools/sim.js [--games 20] [--players 4] [--seed 1] [--set '{"wageRate":0.05}'] [--json]
// Uses exactly the same engine files as the website. --set overrides game/settings.js values
// (nested ones with dots, e.g. {"pricing.demandWeight":0.5}).
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const FILES = ["js/commodities.js", "js/market.js", "js/broker.js", "js/cards.js", "js/map.js", "maps/europe.js", "js/territories.js", "js/businesses.js",
  "game/settings.js", "game/core.js", "game/market.js", "game/production.js", "game/map.js", "game/cards.js", "game/bots.js", "game/pipeline.js"];

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
        // Bots start with the most valuable mine/farm/well available where they start
        const value = b => Object.entries(b.outputs).reduce((s, [c, q]) => s + q * G.basePrice(c), 0) * G.richness(b, start);
        const opts = G.BIZ.filter(b => G.canBuildAt(b, start) && b.kind === "extract").sort((a, b) => value(b) - value(a));
        ps.push({ name: "Bot " + (i + 1), bot: true, start, business: opts[0].id });
      }
      const st = G.newGame({ players: ps, seed: ${seed} * 1000 + g });
      const start = Object.values(st.startWorth).reduce((a, b) => a + b, 0) / st.players.length;
      const real = COMMODITIES.filter(c => c.type !== "waste").map(c => ({ id: c.id, tier: G.tier(c.id), r: st.prices[c.id] / G.basePrice(c.id) / st.priceLevel }));
      out.push({
        worth: st.players.map(p => G.netWorth(st, p)), cash: st.players.map(p => p.cash),
        biz: st.players.map(p => G.myBusinesses(st, p.id).length), space: st.players.map(p => p.space),
        start, level: st.priceLevel, stats: st.stats, real,
        cards: st.log.filter(l => / played /.test(l.msg)).length,
      });
    }
    return JSON.stringify(out);
  })()`, ctx));
}

const res = runAll();
const flat = k => res.flatMap(r => r[k]);
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = (x, d = 0) => x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const reals = res.flatMap(r => r.real);
const byId = {};
reals.forEach(x => (byId[x.id] ||= []).push(x.r));
const goods = Object.entries(byId).map(([id, a]) => [id, avg(a)]).sort((a, b) => b[1] - a[1]);
const spread = res.map(r => Math.max(...r.worth) / Math.max(1, Math.min(...r.worth)));
const summary = {
  settings: overrides,
  games, players,
  "start net worth (average)": f(avg(res.map(r => r.start))),
  "end net worth (median / 10th / 90th pct)": `${f(q(flat("worth"), .5))} / ${f(q(flat("worth"), .1))} / ${f(q(flat("worth"), .9))}`,
  "growth (median end ÷ start)": "×" + f(q(flat("worth"), .5) / avg(res.map(r => r.start)), 1),
  "winner ÷ last place (median)": "×" + f(q(spread, .5), 1),
  "businesses per player (median / max)": `${q(flat("biz"), .5)} / ${Math.max(...flat("biz"))}`,
  "stockpile space at end (median)": q(flat("space"), .5),
  "businesses idle (share of runs)": f(100 * avg(res.map(r => r.stats.idle / Math.max(1, r.stats.runs))), 0) + "%",
  "overflow sold per game": f(avg(res.map(r => r.stats.overflow))),
  "price level (inflation) at end": "×" + f(avg(res.map(r => r.level)), 2),
  "real price ÷ base at end (median / 90th pct / max)": `${f(q(reals.map(x => x.r), .5), 2)} / ${f(q(reals.map(x => x.r), .9), 2)} / ${f(Math.max(...reals.map(x => x.r)), 2)}`,
  "dearest goods (avg real price ÷ base)": goods.slice(0, 5).map(([id, r]) => `${id} ×${f(r, 1)}`).join(", "),
  "cheapest goods": goods.slice(-5).map(([id, r]) => `${id} ×${f(r, 2)}`).join(", "),
  "cards played per game": f(avg(res.map(r => r.cards))),
};
if (process.argv.includes("--json")) console.log(JSON.stringify(summary));
else Object.entries(summary).forEach(([k, v]) => console.log(k.padEnd(52), typeof v === "object" ? JSON.stringify(v) : v));
