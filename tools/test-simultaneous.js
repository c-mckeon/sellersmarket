// Checks the simultaneous-orders rules:  node tools/test-simultaneous.js
const E = require("./engine")();
const r = E.run(`(() => {
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
})()`);
console.log(r);
