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

  // Today's cost basis of a good: what its raw materials are worth at their last traded prices.
  // Nothing here is set by the game: it moves with the market, every auction.
  //   a raw good:  its own last traded price (none until it has traded: the market has to find it)
  //   a made good: the sum of its inputs' cost bases × how many it uses ÷ how many it makes
  //                (by-products and waste count as free)
  // Returns { value, missing }: missing lists raw materials that haven't traded yet (value is then
  // only what the rest add up to), or null if nothing is known.
  G.costBasis = (st, id) => {
    const memo = {};
    const walk = g => {
      if (memo[g]) return memo[g];
      const c = G.COM[g];
      if (c.type === "waste") return (memo[g] = { value: 0, missing: [] });
      if (c.type === "raw") { const t = st.lastTrade[g]; return (memo[g] = t ? { value: t.price, missing: [] } : { value: 0, missing: [g] }); }
      const r = RECIPES.find(x => Object.keys(x.out)[0] === g);
      const parts = Object.entries(r.in).map(([i, q]) => ({ q, ...walk(i) }));
      return (memo[g] = { value: parts.reduce((s, x) => s + x.q * x.value, 0) / r.out[g], missing: [...new Set(parts.flatMap(x => x.missing))] });
    };
    const b = walk(id);
    return b.value || !b.missing.length ? { value: Math.round(b.value), missing: b.missing } : null;
  };
  // ---------- Helpers ----------
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
    G.need(st.phase === "day", "The market is closed right now.");
    G.need(G.COM[id], "Unknown good.");
    G.need(side === "buy" || side === "sell", "Buy or sell?");
    qty = Math.floor(+qty); price = +price;
    G.need(qty > 0, "Order at least 1.");
    G.need(Number.isInteger(price) && price >= 1 && price <= MS.maxPrice, `Prices are whole numbers: pick one from 1 to ${MS.maxPrice}.`);
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
      G.need(G.have(st, p, id) >= qty, `You only have ${G.have(st, p, id)} ${name} that isn't already on offer.`);
    }
    // A sell order takes the goods from your businesses first, then your own stockpile, and remembers where
    const taken = side === "sell" ? G.take(st, p, id, qty) : null;
    st.book.push({ id: st.nextOrderId++, pid: p.id, good: id, side, price, qty, round: st.round, phase: st.phase,
      ...(taken ? { from: taken.from, ...(taken.lots.length ? { lots: taken.lots } : {}) } : {}) });
    return null; // private until the auction
  };

  // Give back what an order locked
  const release = (st, o) => {
    const p = G.player(st, o.pid);
    if (o.side === "buy") p.cash = cents(p.cash + o.price * o.qty); else G.giveBack(st, p, o.good, o.qty, o.from, o.lots);
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
//      (rounded: every price in the game is a whole number)
  // Step 4 matters: without it, one bid at the price limit "to be sure of filling" would drag the
  // price halfway to the limit.
  G.clearingPrice = (bids, asks, ref) => {
    if (!bids.length || !asks.length) return null;
    // Every whole-number price that could matter: each order price and the prices either side of it.
    // (Demand and supply only change at order prices, so these cover every possible outcome; looking
    // just beside the order prices finds e.g. "3: just above the losing bid of 2", not only "5: my bid".)
    const prices = [...new Set([...bids, ...asks].flatMap(o => [o.price - 1, o.price, o.price + 1]).filter(x => x >= 1))].sort((a, b) => a - b);
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
    return Math.round(ref ? Math.min(hi, Math.max(lo, ref)) : (lo + hi) / 2); // whole numbers only (orders are whole, so this stays in the range)
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
    G.clock = st.round;
    const record = { n: st.stats.auctions || 0, round: st.round, trades: {} }; // n: auctions before this one (history keeps the last 120)
    // The book just before it cleared (everyone's new orders in, bids may cross asks), for the replay
    const quotesNow = () => { const q = {}; new Set(st.book.map(o => o.good)).forEach(id => { const b = G.bestBid(st, id), a = G.bestAsk(st, id);
      q[id] = { bid: b?.price ?? null, ask: a?.price ?? null, bq: b?.qty || 0, aq: a?.qty || 0 }; }); return q; };
    record.pre = quotesNow();
    // The whole book (top 10 prices each side) before and after, for the order book replay
    const depthNow = () => { const d = {}; new Set(st.book.map(o => o.good)).forEach(id => d[id] = {
      b: G.depth(st, id, "buy").slice(0, 10).map(x => [x.price, x.qty]), a: G.depth(st, id, "sell").slice(0, 10).map(x => [x.price, x.qty]) }); return d; };
    const before = depthNow();
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
      // The units sold keep their age: sellers part with their oldest first, and buyers get them in that order
      const pool = [];
      af.forEach((n, o) => pool.push(...G.takeLots(o.lots, n)));
      pool.sort((a, b) => a[1] - b[1]);
      bf.forEach((n, o) => {
        const p = G.player(st, o.pid);
        const got = G.takeLots(pool, n), known = got.reduce((s, l) => s + l[0], 0);
        got.forEach(([k, made]) => G.add(p, id, k, made));
        if (n > known) G.add(p, id, n - known);
        p.cash = cents(p.cash + (o.price - P) * n); // refund what was locked above the clearing price
        o.qty -= n; bought[p.id] = (bought[p.id] || 0) + n;
        { const b = (st.stats.bought ||= {})[p.id] ||= {}; b[id] = (b[id] || 0) + n; } // for the simulator: how much was bought
      });
      af.forEach((n, o) => {
        const p = G.player(st, o.pid);
        p.cash = cents(p.cash + P * n);
        o.qty -= n; sold[p.id] = (sold[p.id] || 0) + n;
      });
      st.book = st.book.filter(o => o.qty > 0);
      Object.entries(bought).forEach(([pid, n]) => say(+pid, `bought ${n} ${c.name} at ${G.money(P)}`));
      Object.entries(sold).forEach(([pid, n]) => say(+pid, `sold ${n} ${c.name} at ${G.money(P)}`));
      st.prices[id] = P;
      st.lastTrade[id] = { price: P, qty: vol, round: st.round };
      record.trades[id] = { price: P, qty: vol };
    });
    // What was left on the book afterwards: best bid and ask (and how many at each) for every good with orders
    record.quotes = quotesNow();
    const after = depthNow();
    // Kept apart from the history (st.bookLog, by auction number) so copies of the game can skip it
    const books = {};
    new Set([...Object.keys(before), ...Object.keys(after)]).forEach(id => books[id] = { pre: before[id] || { b: [], a: [] }, post: after[id] || { b: [], a: [] } });
    if (!st.drafting) (st.bookLog ||= {})[record.n] = books;
    st.history.push(record);
    // Full books for the last settings.market.bookRounds rounds (2 auctions a round)
    if (st.bookLog) Object.keys(st.bookLog).forEach(n => { if (+n <= record.n - 2 * (MS.bookRounds || 30)) delete st.bookLog[n]; });
    if (st.history.length > 120) st.history.shift();
    const n = Object.keys(record.trades).length;
    G.log(st, n ? `Market: ${Object.entries(record.trades).map(([id, t]) => `${t.qty} ${G.COM[id].name} at ${G.money(t.price)}`).join(", ")}.` : "Market: nothing traded.");
    Object.entries(mine).forEach(([pid, msgs]) => msgs.forEach(m => G.log(st, m, +pid)));
    st.stats.auctions = (st.stats.auctions || 0) + 1;
    st.stats.trades = (st.stats.trades || 0) + n;
  };

  // Throw goods away (any phase): for waste and anything else you don't want
  G.actions.dump = (st, p, { id, qty }) => {
    qty = Math.floor(+qty);
    G.need(qty > 0 && G.have(st, p, id) >= qty, `You only have ${G.have(st, p, id)} ${G.COM[id]?.name || id} that isn't on offer.`);
    G.take(st, p, id, qty);
    return null;
  };
})();
