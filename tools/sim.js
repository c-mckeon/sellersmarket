// Run Sellers Market games with computer players only, from the command line.
//   node tools/sim.js [games=1] [players=4] [seed=1]
// Uses exactly the same engine files as the website.
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const FILES = ["js/commodities.js", "js/market.js", "js/broker.js", "js/cards.js", "js/map.js", "maps/europe.js", "js/territories.js", "js/businesses.js",
  "game/settings.js", "game/core.js", "game/market.js", "game/production.js", "game/map.js", "game/cards.js", "game/bots.js", "game/pipeline.js"];
const ctx = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Set, Map, Infinity, Error });
FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f }));
const run = code => vm.runInContext(code, ctx);

const [games = 1, players = 4, seed = 1] = process.argv.slice(2).map(Number);
const out = run(`(() => {
  const G = SMG, results = [];
  const land = TERRITORIES.filter(t => !t.sea).map(t => t.id);
  for (let g = 0; g < ${games}; g++) {
    const rng = { seed: ${seed} + g * 7919 };
    const ps = [];
    for (let i = 0; i < ${players}; i++) {
      // Each bot starts somewhere random with the best-paying thing it can build there
      const start = G.pick(rng, land);
      const opts = G.BIZ.filter(b => G.canBuildAt(b, start) && b.kind === "extract");
      ps.push({ name: "Bot " + (i + 1), bot: true, start, business: G.pick(rng, opts).id });
    }
    const st = G.newGame({ players: ps, seed: ${seed} + g });
    results.push({
      players: st.players.map(p => ({ name: p.name, start: G.TERR[p.pos].name, cash: Math.round(p.cash), worth: Math.round(G.netWorth(st, p)),
        businesses: G.myBusinesses(st, p.id).map(b => G.BIZ_BY[b.type].name + " (" + G.TERR[b.territory].name + ")"), space: p.space })),
      priceLevel: st.priceLevel,
      prices: ["wheat", "coal", "iron", "steel", "bread", "chips", "smartphone"].map(id => [id, G.basePrice(id).toFixed(2), st.history[0].prices[id], st.prices[id]]),
      rounds: st.round, over: st.over, logTail: st.log.slice(-12).map(l => (l.pid ? st.players[l.pid - 1].name + ": " : "") + l.msg),
      cardsPlayed: st.log.filter(l => / played /.test(l.msg)).length, effects: st.effects.length,
    });
  }
  return JSON.stringify(results, null, 1);
})()`);
console.log(out);
