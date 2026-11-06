// Sellers Market game engine: the market.
//
// There is no price list. Every price comes from what players bid and ask.
//
// Orders
//   placeOrder  { id, side: "buy" | "sell", price, qty }   any phase
//   cancelOrder { order }                                   any phase
//   A buy order locks price × qty of your cash. A sell order locks the goods (they still take up
//   stockpile space). A buy order also reserves stockpile space for what it might bring in.
//   Orders stay on the book until they fill or you cancel them.
//   You can't place an order that would trade with one of your own.
//
// The auction (once at the end of every phase, after everyone's orders are in)
//   Each good clears at one price: the price at which the most units change hands.
//   If several prices tie: the one that leaves the fewest units unmatched; then, if buyers are left
//   over the highest (sellers left over: the lowest); then the one nearest the last traded price.
//   Everyone who trades pays or gets that same price. A buyer who bid more gets the difference back.
//   If one side has more than can be matched, better prices fill first; orders at the clearing price
//   share what's left in proportion to their size (oldest first for the odd unit).
//
// The book is public but anonymous: price levels and quantities, never who.
// The last price a good traded at is "the price" (st.prices), used to value stockpiles.

(() => {
  const G = SMG, S = GAME_SETTINGS, MS = S.market;
  const cents = x => Math.round(x * 100) / 100;

  G.onSetup.push(st => {
    st.book = []; st.nextOrderId = 1;
    st.prices = Object.fromEntries(COMMODITIES.map(c => [c.id, 0])); // last trade price (0 = never traded)
    st.lastTrade = {};                                                // id → { price, qty, round, phase }
    st.history = [];                                                  // one entry per auction
  });

  // ---------- Helpers ----------
  G.myOrders = (st, pid) => st.book.filter(o => o.pid === pid);
  // Goods you have on offer still sit in your stockpile; buy orders reserve space for what they bring
  G.offered = (st, p) => st.book.filter(o => o.pid === p.id && o.side === "sell").reduce((s, o) => s + o.qty, 0);
  G.reserved = (st, p) => st.book.filter(o => o.pid === p.id && o.side === "buy").reduce((s, o) => s + o.qty, 0);
  G.lockedCash = (st, p) => st.book.filter(o => o.pid === p.id && o.side === "buy").reduce((s, o) => s + o.price * o.qty, 0);
  G.spaceLeft = (st, p) => p.space - G.used(p) - G.offered(st, p) - G.reserved(st, p);

  // Price levels for one good: [{ price, qty }], best first
  G.depth = (st, id, side) => {
    const lv = {};
    st.book.filter(o => o.good === id && o.side === side).forEach(o => lv[o.price] = (lv[o.price] || 0) + o.qty);
    return Object.entries(lv).map(([price, qty]) => ({ price: +price, qty })).sort((a, b) => side === "buy" ? b.price - a.price : a.price - b.price);
  };
  // Best price on one side and the quantity at it (null if that side is empty)
  const best = (st, id, side) => {
    let price = null, qty = 0;
    for (const o of st.book) {
      if (o.good !== id || o.side !== side) continue;
      if (price === null || (side === "buy" ? o.price > price : o.price < price)) { price = o.price; qty = o.qty; }
      else if (o.price === price) qty += o.qty;
    }
    return price === null ? null : { price, qty };
  };
  G.bestBid = (st, id) => best(st, id, "buy");
  G.bestAsk = (st, id) => best(st, id, "sell");

  // Everything public about one good, for the Game tab and the tools:
  //   bid, ask (best prices or null), spread (ask ÷ bid − 1, or null), bids/asks (price levels),
  //   last (last trade { price, qty, round, phase } or null), volume (units traded in the last `n` auctions)
  G.quote = (st, id, n = 6) => {
    const bids = G.depth(st, id, "buy"), asks = G.depth(st, id, "sell");
    const bid = bids[0]?.price ?? null, ask = asks[0]?.price ?? null;
    return {
      bid, ask, spread: bid && ask ? ask / bid - 1 : null, bids, asks,
      last: st.lastTrade[id] || null,
      volume: st.history.slice(-n).reduce((s, h) => s + (h.trades[id]?.qty || 0), 0),
    };
  };

  // ---------- Actions ----------
  G.actions.placeOrder = (st, p, { id, side, price, qty }) => {
    G.need(st.phase === "morning" || st.phase === "afternoon", "The market is closed right now.");
    G.need(G.COM[id], "Unknown good.");
    G.need(side === "buy" || side === "sell", "Buy or sell?");
    qty = Math.floor(+qty); price = cents(+price);
    G.need(qty > 0, "Order at least 1.");
    G.need(price > 0 && price <= MS.maxPrice, `Pick a price between 0.01 and ${MS.maxPrice}.`);
    const name = G.COM[id].name;
    const mine = st.book.filter(o => o.pid === p.id && o.good === id);
    if (side === "buy") {
      const ask = mine.filter(o => o.side === "sell").sort((a, b) => a.price - b.price)[0];
      G.need(!ask || price < ask.price, `You're already selling ${name} at ${G.money(ask?.price)}. Bid below that, or cancel it.`);
      G.need(p.cash >= price * qty, `Not enough cash: that order locks ${G.money(price * qty)}.`);
      G.need(G.spaceLeft(st, p) >= qty, `Not enough stockpile space for what it could bring in (${Math.max(0, G.spaceLeft(st, p))} free).`);
      p.cash = cents(p.cash - price * qty);
    } else {
      const bid = mine.filter(o => o.side === "buy").sort((a, b) => b.price - a.price)[0];
      G.need(!bid || price > bid.price, `You're already bidding for ${name} at ${G.money(bid?.price)}. Ask above that, or cancel it.`);
      G.need((p.stock[id] || 0) >= qty, `You only have ${p.stock[id] || 0} ${name} that isn't already on offer.`);
      G.add(p, id, -qty);
    }
    st.book.push({ id: st.nextOrderId++, pid: p.id, good: id, side, price, qty, round: st.round, phase: st.phase });
    return null; // private until the auction
  };

  // Give back what an order locked
  const release = (st, o) => {
    const p = G.player(st, o.pid);
    if (o.side === "buy") p.cash = cents(p.cash + o.price * o.qty); else G.add(p, o.good, o.qty);
  };
  G.actions.cancelOrder = (st, p, { order }) => {
    const o = st.book.find(x => x.id === order && x.pid === p.id);
    G.need(o, "That order isn't on the book any more.");
    release(st, o);
    st.book = st.book.filter(x => x !== o);
    return null;
  };
  G.actions.cancelAll = (st, p, { id } = {}) => {
    st.book.filter(o => o.pid === p.id && (!id || o.good === id)).forEach(o => release(st, o));
    st.book = st.book.filter(o => !(o.pid === p.id && (!id || o.good === id)));
    return null;
  };

  // ---------- The auction ----------
  // Pick the clearing price for one good. Returns null if nothing crosses.
  //   1. the most units traded
  //   2. then the fewest units left unmatched at that price
  //   3. then, if the leftover is all on one side: buyers left over → the top of the range, sellers → the bottom
  //   4. then the last traded price (`ref`), kept inside the range; never traded → the middle of the range
  // Step 4 matters: without it, one bid at the price limit "to be sure of filling" would drag the
  // price halfway to the limit.
  G.clearingPrice = (bids, asks, ref) => {
    if (!bids.length || !asks.length) return null;
    const prices = [...new Set([...bids, ...asks].map(o => o.price))].sort((a, b) => a - b);
    const at = P => {
      const d = bids.filter(o => o.price >= P).reduce((s, o) => s + o.qty, 0);
      const s = asks.filter(o => o.price <= P).reduce((s, o) => s + o.qty, 0);
      return { P, vol: Math.min(d, s), surplus: d - s };
    };
    const opts = prices.map(at).filter(x => x.vol > 0);
    if (!opts.length) return null;
    const vol = Math.max(...opts.map(x => x.vol));
    let best = opts.filter(x => x.vol === vol);
    const gap = Math.min(...best.map(x => Math.abs(x.surplus)));
    best = best.filter(x => Math.abs(x.surplus) === gap);
    const lo = best[0].P, hi = best.at(-1).P;
    if (best.every(x => x.surplus > 0)) return hi;
    if (best.every(x => x.surplus < 0)) return lo;
    return cents(ref ? Math.min(hi, Math.max(lo, ref)) : (lo + hi) / 2);
  };

  // Share `vol` units among orders, best price first, pro rata within a price level.
  // Returns Map(order → units).
  const allocate = (orders, vol, better) => {
    const fill = new Map();
    const levels = [...new Set(orders.map(o => o.price))].sort(better);
    for (const price of levels) {
      if (vol <= 0) break;
      const lv = orders.filter(o => o.price === price).sort((a, b) => a.id - b.id);
      const total = lv.reduce((s, o) => s + o.qty, 0);
      if (total <= vol) { lv.forEach(o => fill.set(o, o.qty)); vol -= total; continue; }
      const share = lv.map(o => ({ o, exact: o.qty * vol / total }));
      share.forEach(x => x.n = Math.floor(x.exact));
      let left = vol - share.reduce((s, x) => s + x.n, 0);
      [...share].sort((a, b) => (b.exact - b.n) - (a.exact - a.n) || a.o.id - b.o.id).forEach(x => { if (left > 0 && x.n < x.o.qty) { x.n++; left--; } });
      share.forEach(x => x.n && fill.set(x.o, x.n));
      vol = 0;
    }
    return fill;
  };

  G.auction = st => {
    const ph = st.phase === "midday" ? "morning" : st.phase === "overnight" ? "afternoon" : st.phase;
    const record = { round: st.round, phase: ph, trades: {} };
    const mine = {}; // pid → messages
    const say = (pid, msg) => (mine[pid] ||= []).push(msg);
    COMMODITIES.forEach(c => {
      const id = c.id;
      const bids = st.book.filter(o => o.good === id && o.side === "buy");
      const asks = st.book.filter(o => o.good === id && o.side === "sell");
      const P = G.clearingPrice(bids, asks, st.lastTrade[id]?.price);
      if (P == null) return;
      const inB = bids.filter(o => o.price >= P), inA = asks.filter(o => o.price <= P);
      const vol = Math.min(inB.reduce((s, o) => s + o.qty, 0), inA.reduce((s, o) => s + o.qty, 0));
      const bf = allocate(inB, vol, (a, b) => b - a), af = allocate(inA, vol, (a, b) => a - b);
      const bought = {}, sold = {};
      bf.forEach((n, o) => {
        const p = G.player(st, o.pid);
        G.add(p, id, n);
        p.cash = cents(p.cash + (o.price - P) * n); // refund what was locked above the clearing price
        G.book(st, p, "Market purchases", -P * n);
        o.qty -= n; bought[p.id] = (bought[p.id] || 0) + n;
      });
      af.forEach((n, o) => {
        const p = G.player(st, o.pid);
        p.cash = cents(p.cash + P * n);
        G.book(st, p, "Market sales", P * n);
        o.qty -= n; sold[p.id] = (sold[p.id] || 0) + n;
      });
      st.book = st.book.filter(o => o.qty > 0);
      Object.entries(bought).forEach(([pid, n]) => say(+pid, `bought ${n} ${c.name} at ${G.money(P)}`));
      Object.entries(sold).forEach(([pid, n]) => say(+pid, `sold ${n} ${c.name} at ${G.money(P)}`));
      st.prices[id] = P;
      st.lastTrade[id] = { price: P, qty: vol, round: st.round, phase: ph };
      record.trades[id] = { price: P, qty: vol };
    });
    // What was left on the book afterwards: best bid and ask for every good with orders
    record.quotes = {};
    new Set(st.book.map(o => o.good)).forEach(id => record.quotes[id] = { bid: G.bestBid(st, id)?.price ?? null, ask: G.bestAsk(st, id)?.price ?? null });
    st.history.push(record);
    if (st.history.length > 120) st.history.shift();
    const n = Object.keys(record.trades).length;
    G.log(st, n ? `Market: ${Object.entries(record.trades).map(([id, t]) => `${t.qty} ${G.COM[id].name} at ${G.money(t.price)}`).join(", ")}.` : "Market: nothing traded.");
    Object.entries(mine).forEach(([pid, msgs]) => msgs.forEach(m => G.log(st, m, +pid)));
    st.stats.auctions = (st.stats.auctions || 0) + 1;
    st.stats.trades = (st.stats.trades || 0) + n;
  };

  // ---------- Stockpile space (any phase), paid in building materials ----------
  G.spaceUpgradeCost = p => ({ crates: S.spaceUpgrade.cost + S.spaceUpgrade.costStep * p.upgrades, heavy: 0 });
  G.actions.upgradeSpace = (st, p) => {
    G.need(st.phase === "morning" || st.phase === "afternoon", "Not right now.");
    const need = G.spaceUpgradeCost(p), { pay, short } = G.payFor(st, p, need);
    G.need(!short, `More space costs ${G.needText(need)}; you're ${short} short.`);
    Object.entries(pay).forEach(([c, q]) => G.add(p, c, -q));
    p.space += S.spaceUpgrade.crates; p.upgrades++;
    return `built ${S.spaceUpgrade.crates} more crates of space from ${G.costText(pay)}`;
  };

  // Throw goods away (any phase): for waste and anything else you don't want
  G.actions.dump = (st, p, { id, qty }) => {
    qty = Math.floor(+qty);
    G.need(qty > 0 && (p.stock[id] || 0) >= qty, `You only have ${p.stock[id] || 0} ${G.COM[id]?.name || id} that isn't on offer.`);
    G.add(p, id, -qty);
    return null;
  };
})();
