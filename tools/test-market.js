// Checks the market rules (game/market.js):  node tools/test-market.js
// Exact cases for each rule, then thousands of random books checked against the invariants.
const E = require("./engine")();
const G = E.G;
let fails = 0, passes = 0;
const check = (name, ok, detail = "") => { if (ok) passes++; else { fails++; console.log("FAIL", name, detail); } };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// A game with 4 human players, nothing on the book. Everyone gets plenty of space.
const fresh = (cash = 1000) => {
  const st = G.newGame({ seed: 1, players: [1, 2, 3, 4].map(i => ({ name: "P" + i, start: "warsaw", business: "water_works" })) });
  st.players.forEach(p => { p.cash = cash; p.stock = {}; p.space = 10000; });
  return st;
};
const buy = (st, pid, id, price, qty) => G.act(st, pid, "placeOrder", { id, side: "buy", price, qty });
const sell = (st, pid, id, price, qty) => { const p = G.player(st, pid); G.add(p, id, qty); return G.act(st, pid, "placeOrder", { id, side: "sell", price, qty }); };
const clear = st => { G.auction(st); return st.history.at(-1).trades; };
const o = (price, qty, id) => ({ price, qty, id: id ?? Math.random() });

// ---------- The clearing price ----------
eq("simple cross: middle of the gap", G.clearingPrice([o(5, 10)], [o(3, 10)]), 4);
eq("no cross", G.clearingPrice([o(3, 10)], [o(5, 10)]), null);
eq("one side empty", G.clearingPrice([o(3, 10)], []), null);
eq("most volume wins", G.clearingPrice([o(8, 5), o(5, 10)], [o(5, 8)]), 5);
// A buyer who bids the maximum to be sure of filling shouldn't drag the price there
eq("extreme bid, with a last price: stays at the last price", G.clearingPrice([o(10000, 1)], [o(5, 1)], 6), 6);
eq("extreme ask, with a last price: stays at the last price", G.clearingPrice([o(7, 1)], [o(1, 1)], 6), 6);
eq("last price outside the range: nearest edge", G.clearingPrice([o(5, 10)], [o(3, 10)], 9), 5);
eq("last price outside the range: nearest edge (low)", G.clearingPrice([o(5, 10)], [o(3, 10)], 1), 3);
// Leftover demand pushes the price up, leftover supply pushes it down
eq("more buyers than sellers: top of the range", G.clearingPrice([o(6, 12)], [o(5, 10)], 5), 6);
eq("more sellers than buyers: bottom of the range", G.clearingPrice([o(6, 10)], [o(5, 12)], 6), 5);

eq("best bid wins and pays just above the losing bid, not its own bid", G.clearingPrice([o(5, 1), o(2, 1)], [o(1, 1)], 2), 3);
eq("middle of an odd gap rounds to a whole number", G.clearingPrice([o(6, 10)], [o(3, 10)]), 5);

// ---------- Fills, through the real game ----------
{
  const st = fresh();
  buy(st, 1, "wood", 8, 5); buy(st, 2, "wood", 5, 10); sell(st, 3, "wood", 5, 8);
  const t = clear(st);
  eq("price priority: trade", t.wood, { price: 5, qty: 8 });
  eq("price priority: high bidder fills first", G.player(st, 1).stock.wood, 5);
  eq("price priority: low bidder gets the rest", G.player(st, 2).stock.wood, 3);
  eq("high bidder pays the clearing price, not their bid", G.player(st, 1).cash, 1000 - 25);
  eq("low bidder's unfilled 7 stay locked on the book", [G.player(st, 2).cash, G.depth(st, "wood", "buy")], [1000 - 50, [{ price: 5, qty: 7 }]]);
  eq("seller paid", G.player(st, 3).cash, 1040);
}
{
  const st = fresh();
  buy(st, 1, "wood", 5, 10); buy(st, 2, "wood", 5, 5); sell(st, 3, "wood", 5, 9);
  clear(st);
  eq("pro rata at the clearing price", [G.player(st, 1).stock.wood, G.player(st, 2).stock.wood], [6, 3]);
}
{
  const st = fresh();
  buy(st, 1, "wood", 5, 1); buy(st, 2, "wood", 5, 1); sell(st, 3, "wood", 5, 1);
  clear(st);
  eq("odd unit goes to the oldest order", [G.player(st, 1).stock.wood, G.player(st, 2).stock.wood], [1, undefined]);
}

// ---------- Locking ----------
{
  const st = fresh(100);
  eq("buy locks cash", [buy(st, 1, "wood", 10, 6).ok, G.player(st, 1).cash], [true, 40]);
  check("can't promise cash twice", !buy(st, 1, "wood", 10, 5).ok);
  G.add(G.player(st, 2), "wood", 5);
  check("sell locks goods", G.act(st, 2, "placeOrder", { id: "wood", side: "sell", price: 20, qty: 5 }).ok && !G.player(st, 2).stock.wood);
  check("can't promise goods twice", !G.act(st, 2, "placeOrder", { id: "wood", side: "sell", price: 20, qty: 1 }).ok);
  check("can't trade with yourself", !buy(st, 2, "wood", 25, 1).ok);
  check("prices must be whole numbers", !buy(st, 3, "wood", 2.5, 1).ok && !buy(st, 3, "wood", 0, 1).ok);
  G.act(st, 1, "cancelAll", {}); G.act(st, 2, "cancelAll", {});
  eq("cancel gives everything back", [G.player(st, 1).cash, G.player(st, 2).stock.wood, st.book.length], [100, 5, 0]);
  clear(st);
  buy(st, 1, "wood", 3, 2);
  clear(st); clear(st);
  eq("unfilled orders stay on the book", G.depth(st, "wood", "buy"), [{ price: 3, qty: 2 }]);
}

// ---------- Random books: the invariants ----------
// Every trade at one price; nobody pays more than their bid or gets less than their ask;
// the volume is the most any single price could match; cash and goods are never created or lost.
{
  const r = { seed: 42 }, rnd = () => G.rand(r), goods = ["wood", "iron", "glass"];
  let crossedAfter = 0, runs = 0;
  for (let n = 0; n < 3000; n++) {
    const st = fresh(500);
    // Sometimes give a good a last price, so the reference rule gets used
    goods.forEach(g => { if (rnd() < 0.5) { const p = 1 + Math.round(rnd() * 20); st.lastTrade[g] = { price: p }; st.prices[g] = p; } });
    const k = 1 + Math.floor(rnd() * 12);
    for (let i = 0; i < k; i++) {
      const pid = 1 + Math.floor(rnd() * 4), g = goods[Math.floor(rnd() * 3)], price = Math.max(1, Math.round(rnd() < 0.05 ? rnd() * 10000 : 2 + rnd() * 18)), qty = 1 + Math.floor(rnd() * 15);
      if (rnd() < 0.5) buy(st, pid, g, price, qty); else sell(st, pid, g, price, qty);
    }
    const orders = JSON.parse(JSON.stringify(st.book));
    const cashBefore = st.players.reduce((s, p) => s + G.totalCash(st, p), 0);
    const goodsBefore = g => st.players.reduce((s, p) => s + (p.stock[g] || 0), 0) + st.book.filter(x => x.good === g && x.side === "sell").reduce((s, x) => s + x.qty, 0);
    const gb = Object.fromEntries(goods.map(g => [g, goodsBefore(g)]));
    const stockBefore = st.players.map(p => ({ ...p.stock }));
    const t = clear(st);
    runs++;
    const cashAfter = st.players.reduce((s, p) => s + G.totalCash(st, p), 0);
    check("cash is conserved", Math.abs(cashAfter - cashBefore) < 1e-6, `${cashBefore} → ${cashAfter}`);
    goods.forEach(g => {
      check("goods are conserved", goodsBefore(g) === gb[g], `${g} ${gb[g]} → ${goodsBefore(g)}`);
      const bids = orders.filter(x => x.good === g && x.side === "buy"), asks = orders.filter(x => x.good === g && x.side === "sell");
      // Most units any single price could match
      const prices = [...new Set(orders.filter(x => x.good === g).map(x => x.price))];
      const maxVol = Math.max(0, ...prices.map(P => Math.min(bids.filter(x => x.price >= P).reduce((s, x) => s + x.qty, 0), asks.filter(x => x.price <= P).reduce((s, x) => s + x.qty, 0))));
      check("volume is the most possible", (t[g]?.qty || 0) === maxVol, `${g} traded ${t[g]?.qty || 0}, could ${maxVol}`);
      if (!t[g]) return;
      const P = t[g].price;
      // Each player's net position change, against their orders' limits
      st.players.forEach((p, i) => {
        const got = (p.stock[g] || 0) - (stockBefore[i][g] || 0);
        const myB = bids.filter(x => x.pid === p.id), myA = asks.filter(x => x.pid === p.id);
        if (got > 0) check("buyer never pays above their bid", myB.some(x => x.price >= P), `${g} P=${P}`);
        const bq = myB.filter(x => x.price >= P).reduce((s, x) => s + x.qty, 0);
        check("nobody gets more than they ordered", got <= bq);
      });
      check("sellers who sold asked at or below the price", orders.filter(x => x.good === g && x.side === "sell").every(x => {
        const left = st.book.find(y => y.id === x.id);
        return (left ? left.qty : 0) === x.qty || x.price <= P;
      }));
      const bb = G.bestBid(st, g), ba = G.bestAsk(st, g);
      if (bb && ba && bb.price >= ba.price) crossedAfter++;
    });
    check("no negative cash", st.players.every(p => p.cash >= -1e-9));
  }
  console.log(`random books: ${runs} auctions, ${crossedAfter} left a crossed book behind`);
}

console.log(fails ? `${fails} failed, ${passes} passed` : `all ${passes} passed`);
process.exit(fails ? 1 : 0);
