// Run Sellers Market games with computer players only, and summarise how the economy behaves.
//   node tools/sim.js [--games 20] [--players 4] [--seed 1] [--set '{"wageRate":0.05}'] [--json]
// Uses exactly the same engine files as the website. --set overrides game/settings.js values
// (nested ones with dots, e.g. {"pricing.demandWeight":0.5}).
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const FILES = ["js/commodities.js", "js/market.js", "js/broker.js", "js/cards.js", "js/map.js", "maps/europe.js", "js/territories.js", "js/businesses.js",
  "game/settings.js", "game/core.js", "game/market.js", "game/production.js", "game/map.js", "game/cards.js", "game/finance.js", "game/bots.js", "game/pipeline.js"];

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const games = +arg("games", 20), players = +arg("players", 4), seed = +arg("seed", 1);
const strategies = arg("strategies", "best").split(",");   // e.g. best,diversify,specialist,best (cycled over players)
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
        ps.push({ name: "Bot " + (i + 1), bot: true, start, business: opts[0].id, strategy: ${JSON.stringify(strategies)}[(i + g) % ${strategies.length}] });
      }
      const st = G.newGame({ players: ps, seed: ${seed} * 1000 + g });
      const start = Object.values(st.startWorth).reduce((a, b) => a + b, 0) / st.players.length;
      const real = COMMODITIES.filter(c => c.type !== "waste").map(c => ({ id: c.id, tier: G.tier(c.id), r: st.prices[c.id] / G.basePrice(c.id) / st.priceLevel }));
      out.push({
        worth: st.players.map(p => G.netWorth(st, p)), cash: st.players.map(p => p.cash),
        biz: st.players.map(p => G.myBusinesses(st, p.id).length), space: st.players.map(p => p.space),
        start, level: st.priceLevel, stats: st.stats, real,
        cards: st.log.filter(l => / played /.test(l.msg)).length,
        strat: st.players.map(p => p.strategy),
        sectors: st.players.map(p => new Set(G.myBusinesses(st, p.id).map(b => G.sectorOfBiz(G.BIZ_BY[b.type]))).size),
        loans: st.players.map(p => p.loan), bonds: st.players.map(p => p.bonds.reduce((s, b) => s + b.count, 0)),
        margin: st.log.filter(l => /Margin call/.test(l.msg)).length, seized: st.log.filter(l => /seized/.test(l.msg)).length,
        rate: st.baseRate, share: st.borrowShare,
        // What each business really earned per round, as a share of its build cost
        bizRoi: st.businesses.filter(b => b.built < st.rounds - 3).map(b => ({ type: G.BIZ_BY[b.type].name, roi: ((b.earned || 0) - (b.spent || 0) - (b.wages || 0)) / Math.max(1, st.rounds - b.built) / b.cost })),
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
// Strategies
const strat = {};
res.forEach(r => { const max = Math.max(...r.worth); r.strat.forEach((k, i) => { const x = strat[k] ||= { worth: [], wins: 0, n: 0 }; x.worth.push(r.worth[i]); x.n++; if (r.worth[i] === max) x.wins++; }); });
summary["strategies (median worth, worst 10%, win rate)"] = Object.entries(strat).map(([k, x]) => `${k}: ${f(q(x.worth, .5))}, ${f(q(x.worth, .1))}, ${f(100 * x.wins / x.n)}%`).join(" · ");
// Diversification: median worth by number of sectors owned
const bySec = {};
res.forEach(r => r.sectors.forEach((n, i) => (bySec[Math.min(n, 5)] ||= []).push(r.worth[i])));
summary["worth by sectors owned (median, players)"] = Object.keys(bySec).sort().map(k => `${k}${k === "5" ? "+" : ""}: ${f(q(bySec[k], .5))} (${bySec[k].length})`).join(" · ");
// Business types
const roi = {};
res.forEach(r => r.bizRoi.forEach(b => (roi[b.type] ||= []).push(b.roi)));
const roiList = Object.entries(roi).filter(([, a]) => a.length >= 3).map(([k, a]) => [k, q(a, .5), a.length]).sort((a, b) => b[1] - a[1]);
summary["best businesses (median profit/round ÷ cost, built)"] = roiList.slice(0, 6).map(([k, v, n]) => `${k} ${f(100 * v, 1)}% (${n})`).join(", ");
summary["worst businesses"] = roiList.slice(-5).map(([k, v, n]) => `${k} ${f(100 * v, 1)}% (${n})`).join(", ");
summary["finance: loans at end / bonds held / margin calls / seizures"] = `${f(avg(flat("loans")))} / ${f(avg(flat("bonds")), 1)} / ${f(avg(res.map(r => r.margin)), 1)} / ${f(avg(res.map(r => r.seized)), 1)} per game`;
summary["base rate / borrow share at end"] = `${f(100 * avg(res.map(r => r.rate)), 2)}% / ${f(100 * avg(res.map(r => r.share)))}%`;
if (process.argv.includes("--roi")) roiList.forEach(([k, v, n]) => console.log("  ", k.padEnd(22), f(100 * v, 1) + "%", n));

if (process.argv.includes("--json")) console.log(JSON.stringify(summary));
else Object.entries(summary).forEach(([k, v]) => console.log(k.padEnd(52), typeof v === "object" ? JSON.stringify(v) : v));
