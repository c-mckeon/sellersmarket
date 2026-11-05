// Checks the simultaneous-orders rules:  node tools/test-simultaneous.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const FILES = ["js/commodities.js", "js/market.js", "js/broker.js", "js/cards.js", "js/map.js", "maps/europe.js", "js/territories.js", "js/businesses.js",
  "game/settings.js", "game/core.js", "game/market.js", "game/production.js", "game/map.js", "game/cards.js", "game/bots.js", "game/pipeline.js"];
const ctx = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Set, Map, Infinity, Error });
FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx));
const r = vm.runInContext(`(() => {
  const G = SMG, out = [];
  const human = (name, start) => ({ name, bot: false, start, business: "farm" });
  // Ukraine and Warsaw both border Galicia
  let st = G.newGame({ players: [human("A", "ukraine"), human("B", "warsaw"), human("C", "prussia")], seed: 1 });
  [1, 2, 3].forEach(id => G.submit(st, id, []));                       // morning: no trades
  out.push("phase " + st.phase);
  G.submit(st, 1, [{ name: "move", args: { to: "galicia" } }]);
  G.submit(st, 2, [{ name: "move", args: { to: "galicia" } }]);
  G.submit(st, 3, [{ name: "move", args: { to: "warsaw" } }]);         // C moves into the square B is leaving: fine
  out.push("A at " + st.players[0].pos + ", B at " + st.players[1].pos + ", C at " + st.players[2].pos);
  out.push(st.log.filter(l => /Nobody got in/.test(l.msg)).map(l => l.msg).join(""));
  // Two players building in the same place on the same afternoon pay the same price
  [1, 2, 3].forEach(id => G.submit(st, id, []));
  st.players.forEach(p => p.cash = 2000);
  const cost = G.buildCost(st, G.BIZ_BY.water_works, "warsaw", 2);
  G.submit(st, 1, []);
  G.submit(st, 2, [{ name: "build", args: { type: "water_works" } }]);
  G.submit(st, 3, [{ name: "build", args: { type: "water_works" } }]);
  const built = st.businesses.filter(b => b.territory === "warsaw").map(b => b.cost);
  out.push("price at start of afternoon " + cost + " (B) ; paid " + built.join(", "));
  // Orders are checked when submitted
  [1, 2, 3].forEach(id => G.submit(st, id, []));
  out.push("bad order: " + JSON.stringify(G.submit(st, 1, [{ name: "move", args: { to: "spain" } }])));
  return out.join("\\n");
})()`, ctx);
console.log(r);
