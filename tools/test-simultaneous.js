// Checks the simultaneous-orders rules:  node tools/test-simultaneous.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const FILES = ["js/commodities.js", "js/market.js", "js/broker.js", "js/cards.js", "js/map.js", "maps/europe.js", "js/territories.js", "js/businesses.js",
  "game/settings.js", "game/core.js", "game/market.js", "game/production.js", "game/depreciation.js", "game/map.js", "game/contracts.js", "game/cards.js", "game/finance.js", "game/bots.js", "game/pipeline.js"];
const ctx = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Set, Map, Infinity, Error });
FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx));
const r = vm.runInContext(`(() => {
  const G = SMG, out = [];
  const human = (name, start) => ({ name, bot: false, start, business: "farm" });
  // Ukraine and Warsaw both border Galicia
  let st = G.newGame({ players: [human("A", "ukraine"), human("B", "warsaw"), human("C", "prussia")], seed: 1 });
  out.push("round " + st.round + ", " + st.phase);
  G.submit(st, 1, [{ name: "move", args: { to: "galicia" } }]);
  G.submit(st, 2, [{ name: "move", args: { to: "galicia" } }]);
  G.submit(st, 3, [{ name: "move", args: { to: "warsaw" } }]);         // C moves into the square B is leaving: fine
  out.push("round " + st.round + ": A at " + st.players[0].pos + ", B at " + st.players[1].pos + ", C at " + st.players[2].pos);
  out.push(st.log.filter(l => /Nobody got in/.test(l.msg)).map(l => l.msg).join(""));
  // Building is free, and two players can build the same thing in the same place in the same round
  G.submit(st, 1, []);
  G.submit(st, 2, [{ name: "build", args: { type: "kiln" } }]);
  G.submit(st, 3, [{ name: "build", args: { type: "kiln" } }]);
  out.push("kilns in Warsaw: " + st.businesses.filter(b => b.territory === "warsaw" && b.type === "kiln").length + ", cash " + st.players.map(p => p.cash).join("/"));
  // Only the businesses a territory allows
  out.push("steelworks in Warsaw: " + JSON.stringify(G.submit(st, 2, [{ name: "build", args: { type: "steelworks" } }])));
  // One move or build a round
  out.push("build twice: " + JSON.stringify(G.submit(st, 2, [{ name: "build", args: { type: "kiln" } }, { name: "build", args: { type: "farm" } }])));
  // Orders are checked when submitted
  out.push("bad order: " + JSON.stringify(G.submit(st, 1, [{ name: "move", args: { to: "spain" } }])));
  return out.join("\\n");
})()`, ctx);
console.log(r);
