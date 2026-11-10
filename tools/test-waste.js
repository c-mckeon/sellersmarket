// Checks waste (a negative good: the one getting rid of it pays) and selling a business:  node tools/test-waste.js
const E = require("./engine")();
const G = E.G;
let fails = 0, passes = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) passes++; else { fails++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } };
const fresh = () => {
  const st = G.newGame({ seed: 1, players: [1, 2, 3].map(i => ({ name: "P" + i, start: "warsaw", business: "clay_pit" })) });
  st.players.forEach(p => { p.stock = {}; p.lots = {}; p.cash = 1000; });
  st.businesses.forEach(b => { b.stock = {}; b.lots = {}; });
  return st;
};
const order = (st, pid, side, price, qty, id = "slag") => G.act(st, pid, "placeOrder", { id, side, price, qty });

{ // Getting rid of waste costs the one getting rid of it; the one taking it gets paid
  const st = fresh(), [a, b] = st.players;
  G.clock = st.round; G.add(a, "slag", 5);
  eq("dispose order accepted", order(st, 1, "sell", 4, 5).ok, true);
  eq("the fee is locked", a.cash, 1000 - 20);
  eq("take order accepted", order(st, 2, "buy", 2, 5).ok, true);
  eq("taking locks no cash", b.cash, 1000);
  G.auction(st);
  eq("trades at one fee in between", st.lastTrade.slag, { price: 3, qty: 5, round: st.round });
  eq("the one getting rid of it pays 3 each", a.cash, 1000 - 15);
  eq("the one taking it gets 3 each", b.cash, 1000 + 15);
  eq("the waste moves", [a.stock.slag || 0, b.stock.slag || 0], [0, 5]);
}
{ // No trade when nobody will pay what the taker asks
  const st = fresh(), [a] = st.players;
  G.clock = st.round; G.add(a, "slag", 2);
  order(st, 1, "sell", 2, 2); order(st, 2, "buy", 5, 2);
  G.auction(st);
  eq("no trade", st.lastTrade.slag, undefined);
  eq("best take fee is the lowest", G.bestBid(st, "slag").price, 5);
  eq("best dispose fee is the highest", G.bestAsk(st, "slag").price, 2);
}
{ // Cancelling gives back the waste and the fee; waste can't be dumped
  const st = fresh(), [a] = st.players;
  G.clock = st.round; G.add(a, "slag", 3);
  order(st, 1, "sell", 5, 3);
  G.act(st, 1, "cancelAll", {});
  eq("cancel returns the fee and the waste", [a.cash, a.stock.slag], [1000, 3]);
  eq("can't dump waste", G.act(st, 1, "dump", { id: "slag", qty: 1 }).ok, false);
  eq("can still dump other goods", (G.add(a, "clay", 2), G.act(st, 1, "dump", { id: "clay", qty: 1 }).ok), true);
}
{ // Waste that goes off while on offer needs no fee: the lock comes back
  const st = fresh(), [a] = st.players;
  G.clock = 1; G.add(a, "slag", 2);
  order(st, 1, "sell", 4, 2);
  st.round = 3; G.clock = 3; G.expire(st);
  eq("gone off, fee unlocked", [a.cash, st.book.length], [1000, 0]);
}
{ // Selling a business: it disappears, you get its cost price
  const st = fresh(), [a] = st.players;
  const biz = st.businesses.find(b => b.owner === a.id), cost = G.BIZ_BY[biz.type].cost;
  eq("sell it", G.act(st, 1, "sellBusiness", { biz: biz.id }).ok, true);
  eq("gone", st.businesses.some(b => b.id === biz.id), false);
  eq("paid its cost", a.cash, 1000 + cost);
  eq("not someone else's", G.act(st, 1, "sellBusiness", { biz: st.businesses.find(b => b.owner === 2).id }).ok, false);
}
console.log(fails ? `${fails} failed, ${passes} passed` : `all ${passes} passed`);
process.exit(fails ? 1 : 0);
