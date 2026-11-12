// Checks the cards:  node tools/test-cards.js
// Every card can be played with a fitting target, and the main effects do what they say.
const E = require("./engine")();
const G = E.G;
let fails = 0, passes = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) passes++; else { fails++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } };
const fresh = () => {
  const st = G.newGame({ seed: 3, players: [
    { name: "A", start: "ukraine", business: "farm" }, { name: "B", start: "ruhr", business: "coal_mine" }, { name: "C", start: "warsaw", business: "clay_pit" }] });
  st.players.forEach(p => { p.cash = 1000; p.hand = []; });
  return st;
};
const all = (st, orders) => st.players.forEach(p => G.submit(st, p.id, orders[p.id] || []));
const give = (st, pid, card) => G.player(st, pid).hand.push(card);
// A fitting target for each kind of card (two-target cards get a list)
const targetFor = (st, p, card) => Array.isArray(card.target) ? card.target.map(t => targetFor(st, p, { target: t })) : ({
  player: st.players.find(x => x.id !== p.id).id, good: "coal", raw: "clay", territory: "ruhr",
  myBusiness: st.businesses.find(b => b.owner === p.id)?.id, theirBusiness: st.businesses.find(b => b.owner !== p.id)?.id,
  myContract: (p.contracts[0] ||= { id: 999, name: "Test", icon: "📦", goods: { coal: 1 }, cap: 99, price: 50, won: st.round, due: st.round + 5 }).id,
  boardContract: (st.contracts[0] ||= G.newContract(st)).id,
}[card.target] ?? null);

{ // Every card plays
  G.CARDS.forEach(card => {
    const st = fresh(), p = st.players[0];
    G.clock = st.round; G.add(st.players[1], "coal", 3);
    give(st, p.id, card.id);
    const r = G.act(st, p.id, "playCard", { card: card.id, target: targetFor(st, p, card) });
    eq(`${card.name} plays`, r.ok, true);
    if (!r.ok) console.log("   ", r.msg);
  });
  eq("there are 34 cards", G.CARDS.length, 34);
}
{ // One a round; you need the card
  const st = fresh(), p = st.players[0];
  give(st, p.id, "windfall"); give(st, p.id, "windfall");
  eq("first card", G.act(st, p.id, "playCard", { card: "windfall" }).ok, true);
  eq("second card same round refused", G.act(st, p.id, "playCard", { card: "windfall" }).ok, false);
  eq("a card you don't hold refused", G.act(st, p.id, "playCard", { card: "theft", target: 2 }).ok, false);
  eq("windfall pays", p.cash, 1150);
}
{ // Drought: farms make nothing tonight
  const st = fresh(); give(st, 2, "drought");
  const before = G.player(st, 1).stock.wheat || 0;
  all(st, { 2: [{ name: "playCard", args: { card: "drought" } }] });
  eq("no wheat tonight", G.player(st, 1).stock.wheat || 0, before);
  all(st, {});
  eq("wheat again the night after", (G.player(st, 1).stock.wheat || 0) > before, true);
}
{ // Export controls: a good doesn't trade; the orders wait
  const st = fresh(); G.clock = st.round; G.add(G.player(st, 2), "coal", 4); give(st, 3, "export_controls");
  all(st, { 1: [{ name: "placeOrder", args: { id: "coal", side: "buy", price: 20, qty: 2 } }], 2: [{ name: "placeOrder", args: { id: "coal", side: "sell", price: 10, qty: 2 } }],
    3: [{ name: "playCard", args: { card: "export_controls", target: "coal" } }] });
  eq("no coal traded", st.history.at(-1).trades.coal, undefined);
  eq("the orders wait", st.book.filter(o => o.good === "coal").length, 2);
}
{ // Tariff: the seller keeps 75%
  const st = fresh(); G.clock = st.round; G.add(G.player(st, 2), "clay", 4); give(st, 3, "tariff");
  const cash = G.player(st, 2).cash;
  all(st, { 1: [{ name: "placeOrder", args: { id: "clay", side: "buy", price: 20, qty: 2 } }], 2: [{ name: "placeOrder", args: { id: "clay", side: "sell", price: 20, qty: 2 } }],
    3: [{ name: "playCard", args: { card: "tariff", target: "clay" } }] });
  eq("seller got 75% of 2 × 20", G.player(st, 2).cash, cash + 30);
}
{ // Fast horses: two moves; building grant: half price; planning objection: no building
  const st = fresh(); give(st, 1, "fast_horses");
  const r = G.submit(st, 1, [{ name: "playCard", args: { card: "fast_horses" } }, { name: "move", args: { to: "galicia" } }, { name: "move", args: { to: "bohemia" } }]);
  eq("two moves with fast horses", r.ok, true);
  const st2 = fresh(); const p = st2.players[0];
  eq("two moves without it refused", G.submit(st2, 1, [{ name: "move", args: { to: "galicia" } }, { name: "move", args: { to: "bohemia" } }]).ok, false);
  give(st2, 1, "grant"); G.act(st2, 1, "playCard", { card: "grant" });
  const cash = p.cash; G.act(st2, 1, "build", { type: "farm" });
  eq("grant halves the cost", p.cash, cash - Math.round(G.BIZ_BY.farm.cost / 2));
  const st3 = fresh(); give(st3, 2, "objection");
  G.act(st3, 2, "playCard", { card: "objection", target: "ukraine" });
  eq("objection stops building", G.act(st3, 1, "build", { type: "farm" }).ok, false);
}
{ // Delivering a contract draws a card
  const st = fresh(), p = st.players[0];
  p.contracts.push({ id: 500, name: "Grain", icon: "🌾", goods: { wheat: 1 }, cap: 99, price: 40, won: st.round, due: st.round + 5 });
  G.clock = st.round; G.add(p, "wheat", 1);
  G.act(st, p.id, "deliver", { contract: 500 });
  eq("drew a card", p.hand.length, 1);
}
{ // Good lawyers: no legal fees
  const st = fresh(), p = st.players[0];
  p.contracts.push({ id: 501, name: "Grain", icon: "🌾", goods: { steel: 9 }, cap: 99, price: 40, won: st.round, due: st.round });
  give(st, 1, "lawyers");
  const cash = p.cash;
  all(st, { 1: [{ name: "playCard", args: { card: "lawyers", target: 501 } }] });
  eq("failed, but no fee", [p.contracts.length, p.cash >= cash], [0, true]);
}
{ // Hostile takeover: their business becomes yours
  const st = fresh(), b = st.businesses.find(x => x.owner === 2); give(st, 1, "takeover");
  G.act(st, 1, "playCard", { card: "takeover", target: b.id });
  eq("the business changes hands", b.owner, 1);
}
{ // Pass the buck and government orders: a contract goes to another player
  const st = fresh(), p = st.players[0];
  p.contracts.push({ id: 700, name: "Dam", icon: "🌊", goods: { steel: 2 }, cap: 400, price: 300, won: st.round, due: st.round + 5 });
  give(st, 1, "pass_buck");
  G.act(st, 1, "playCard", { card: "pass_buck", target: [700, 2] });
  eq("passed on", [p.contracts.length, G.player(st, 2).contracts.map(k => k.id)], [0, [700]]);
  const st2 = fresh(), k = st2.contracts[0]; give(st2, 1, "gov_order");
  G.act(st2, 1, "playCard", { card: "gov_order", target: [k.id, 3] });
  const got = G.player(st2, 3).contracts[0];
  eq("ordered onto P3 at 60% of the cap", [got && got.id, got && got.price, st2.contracts.some(x => x.id === k.id)], [k.id, Math.round(k.cap * 0.6), false]);
  eq("needs both targets", G.act(st2, 1, "playCard", { card: "gov_order", target: k.id }).ok, false);
}
{ // Inside line shows exactly the contracts that come next
  const st = fresh(), p = st.players[0]; give(st, 1, "inside_line");
  G.act(st, 1, "playCard", { card: "inside_line" });
  const shown = st.upcoming.slice(0, 2).map(k => k.name);
  const seen = st.log.filter(l => l.pid === 1 && /the next contracts/.test(l.msg)).at(-1)?.msg || "";
  eq("the tip names the next two", shown.every(n => seen.includes(n)), true);
  const ids = st.upcoming.slice(0, 2).map(k => k.id), arrived = [];
  for (let r = 0; r < 12 && arrived.length < 2; r++) { const before = new Set(st.contracts.map(k => k.id)); all(st, {}); st.contracts.forEach(k => { if (!before.has(k.id)) arrived.push(k.id); }); }
  eq("and they're the ones that arrive", arrived.slice(0, 2), ids);
}
console.log(fails ? `${fails} failed, ${passes} passed` : `all ${passes} passed`);
process.exit(fails ? 1 : 0);
