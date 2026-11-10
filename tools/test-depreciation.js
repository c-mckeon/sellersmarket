// Checks depreciation (game/depreciation.js):  node tools/test-depreciation.js
// Goods go off after their life, oldest first, wherever they are, and keep their age when traded.
const E = require("./engine")({ "depreciation.goods.wood": 3, "depreciation.goods.steel": 0 });
const G = E.G;
let fails = 0, passes = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) passes++; else { fails++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } };
const fresh = () => {
  const st = G.newGame({ seed: 1, players: [1, 2].map(i => ({ name: "P" + i, start: "warsaw", business: "water_works" })) });
  st.players.forEach(p => { p.stock = {}; p.lots = {}; p.cash = 1000; });
  st.businesses.forEach(b => { b.stock = {}; b.lots = {}; });
  return st;
};
const night = (st, round) => { st.round = round; G.clock = round; G.expire(st); };

{ // Wood lasts 3 rounds: made in round 1, usable through round 3, gone overnight in round 3
  const st = fresh(), p = st.players[0];
  G.clock = 1; G.add(p, "wood", 4);
  G.clock = 2; G.add(p, "wood", 2);
  night(st, 2); eq("nothing goes off early", p.stock.wood, 6);
  eq("going off tonight (round 3)", (st.round = 3, G.goingOff(st, p, "wood")), 4);
  night(st, 3); eq("the oldest go off at the end of their life", p.stock.wood, 2);
  night(st, 4); eq("then the next lot", p.stock.wood, undefined);
}
{ // Using goods takes the oldest first, so the fresh ones are kept
  const st = fresh(), p = st.players[0];
  G.clock = 1; G.add(p, "wood", 3); G.clock = 2; G.add(p, "wood", 3);
  G.clock = 2; G.take(st, p, "wood", 3);
  night(st, 3); eq("used the oldest first: nothing left to go off", p.stock.wood, 3);
}
{ // On the book, goods keep ageing; a buyer gets them with their age
  const st = fresh(), [a, b] = st.players;
  G.clock = 1; G.add(a, "wood", 5); st.round = 2; st.phase = "day";
  G.act(st, a.id, "placeOrder", { id: "wood", side: "sell", price: 5, qty: 5 });
  night(st, 3); eq("goods on offer go off too (the order shrinks)", st.book.length, 0);
  G.clock = 3; st.round = 3; G.add(a, "wood", 4, 2); // made in round 2: goes off at the end of round 4
  G.act(st, a.id, "placeOrder", { id: "wood", side: "sell", price: 5, qty: 4 });
  G.act(st, b.id, "placeOrder", { id: "wood", side: "buy", price: 5, qty: 4 });
  G.auction(st);
  eq("buyer gets the goods with their age", b.lots.wood, [[4, 2]]);
  night(st, 4); eq("and they go off on time", b.stock.wood, undefined);
}
{ // Cancelling gives goods back with their age
  const st = fresh(), a = st.players[0];
  G.clock = 1; G.add(a, "wood", 2); st.round = 2; st.phase = "day";
  G.act(st, a.id, "placeOrder", { id: "wood", side: "sell", price: 9, qty: 2 });
  G.act(st, a.id, "cancelAll", {});
  eq("cancel keeps the age", a.lots.wood, [[2, 1]]);
}
{ // Goods that never go off
  const st = fresh(), p = st.players[0];
  G.clock = 1; G.add(p, "steel", 2); night(st, 50);
  eq("a good with life 0 never goes off", p.stock.steel, 2);
}
console.log(fails ? `${fails} failed, ${passes} passed` : `all ${passes} passed`);
process.exit(fails ? 1 : 0);
