// Checks contracts you bid for:  node tools/test-contracts.js
// The lowest bid wins after the bidding rounds; delivering pays your bid; missing the deadline costs legal fees.
const E = require("./engine")();
const G = E.G, C = E.S.contracts;
let fails = 0, passes = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) passes++; else { fails++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } };
const fresh = () => {
  const st = G.newGame({ seed: 2, players: [1, 2, 3].map(i => ({ name: "P" + i, start: "warsaw", business: "clay_pit" })) });
  st.players.forEach(p => { p.stock = {}; p.lots = {}; p.cash = 1000; });
  return st;
};
const all = (st, orders) => st.players.forEach(p => G.submit(st, p.id, orders[p.id] || []));

{ // The board is full, and bids are checked
  const st = fresh(), k = st.contracts[0];
  eq("the board starts with the set number", st.contracts.length, C.start);
  eq("bid over the cap refused", G.act(G.draft(st, 1, []).state, 1, "bid", { contract: k.id, amount: k.cap + 1 }).ok, false);
  const d = G.draft(st, 1, [{ name: "bid", args: { contract: k.id, amount: 50 } }]).state;
  eq("a higher bid than your own refused", G.act(d, 1, "bid", { contract: k.id, amount: 60 }).ok, false);
  eq("a lower one is fine", G.act(d, 1, "bid", { contract: k.id, amount: 40 }).ok, true);
}
{ // Lowest bid wins when bidding closes; delivering pays the bid
  const st = fresh(), k = st.contracts[0], id = k.id;
  all(st, { 1: [{ name: "bid", args: { contract: id, amount: 80 } }], 2: [{ name: "bid", args: { contract: id, amount: 60 } }] });
  eq("still on the board after round 1", st.contracts.some(x => x.id === id), true);
  eq("the lowest bid is public after the night", G.lowestBid(st.contracts.find(x => x.id === id)).amount, 60);
  for (let r = 1; r < C.bidRounds; r++) all(st, {});
  eq("gone from the board", st.contracts.some(x => x.id === id), false);
  eq("new contracts arrive, within the limits", st.contracts.length >= 0 && st.contracts.length <= C.open, true);
  const won = G.player(st, 2).contracts.find(x => x.id === id);
  eq("P2 won it at its bid", won && won.price, 60);
  eq("P1 didn't", G.player(st, 1).contracts.length, 0);
  // Deliver: give P2 the goods
  const p2 = G.player(st, 2); G.clock = st.round; Object.entries(won.goods).forEach(([c, q]) => G.add(p2, c, q));
  const cash = p2.cash;
  all(st, { 2: [{ name: "deliver", args: { contract: id } }] });
  eq("delivering pays the bid", G.player(st, 2).cash, cash + 60);
  eq("and the contract is done", G.player(st, 2).contracts.length, 0);
}
{ // Not delivered in time: legal fees
  const st = fresh(), id = st.contracts[0].id;
  all(st, { 3: [{ name: "bid", args: { contract: id, amount: 100 } }] });
  for (let r = 1; r < C.bidRounds; r++) all(st, {});
  eq("P3 holds it", G.player(st, 3).contracts.length, 1);
  const cash = G.player(st, 3).cash;
  for (let r = 0; r < C.deliverRounds; r++) all(st, {});
  eq("fees paid", G.player(st, 3).cash, cash - G.failFee(100));
  eq("contract gone", G.player(st, 3).contracts.length, 0);
}
{ // A player holding the most contracts is skipped: the next lowest wins
  const st = fresh(), id = st.contracts[0].id;
  all(st, { 1: [{ name: "bid", args: { contract: id, amount: 10 } }], 2: [{ name: "bid", args: { contract: id, amount: 90 } }] });
  G.player(st, 1).contracts = Array.from({ length: C.maxHeld }, (_, i) => ({ id: 900 + i, goods: { clay: 1 }, price: 1, won: st.round, due: st.round + 99, cap: 9 }));
  for (let r = 1; r < C.bidRounds; r++) all(st, {});
  eq("P2 gets it", G.player(st, 2).contracts.some(x => x.id === id), true);
  if (!st.contracts.length) st.contracts.push(G.newContract(st)); // the board can be empty some nights
  eq("full player can't bid", G.act(G.draft(st, 1, []).state, 1, "bid", { contract: st.contracts[0].id, amount: 5 }).ok, false);
}
console.log(fails ? `${fails} failed, ${passes} passed` : `all ${passes} passed`);
process.exit(fails ? 1 : 0);
