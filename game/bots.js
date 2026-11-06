// Sellers Market game engine: simple computer players.
// Deliberately basic: enough to test the rules and run simulations.
//
// Every phase a bot:
//   1. cancels its old orders and delivers any contract it can
//   2. works out what it wants (contract goods, its factories' inputs, materials for its next build)
//      and what it can spare (everything else)
//   3. bids for wants and asks for spares, around its own guess of what each good is worth:
//        guess = last traded price, or (never traded) raw-material units × settings.bots.perRawUnit
//      Bids creep up each phase a want goes unfilled; asks creep down each phase a spare goes unsold.
// In the afternoon it also builds (or heads somewhere it can build) something that feeds its contracts.

(() => {
  const G = SMG, S = GAME_SETTINGS;
  const B = S.bots || (S.bots = {
    perRawUnit: 3,         // what a bot guesses a raw-material unit is worth, before anything has traded
    bidStart: 0.8,         // first bid: 80% of its guess…
    bidStep: 0.15,         // …+15% of the guess for every phase it goes unfilled…
    bidMax: 3,             // …up to 3× the guess
    askStart: 1.3,         // first ask: 130% of its guess…
    askStep: 0.1,          // …−10% for every phase it goes unsold…
    askMin: 0.4,           // …down to 40%
    cashPerPhase: 0.6,     // spend at most this share of cash in one auction
    reserve: { lumber: 4, iron: 2 }, // building materials a bot always keeps
  });

  // A bot's private guess of what a good is worth
  G.guess = (st, id) => st.lastTrade[id]?.price ?? Math.max(0.5, G.rawUnits(id) * B.perRawUnit * (1 + 0.15 * G.tier(id)));

  // Every good in the making of `id` (including itself)
  const treeMemo = {};
  const treeOf = id => {
    if (treeMemo[id]) return treeMemo[id];
    const r = RECIPES.find(x => Object.keys(x.out)[0] === id);
    return (treeMemo[id] = new Set([id, ...(r ? Object.keys(r.in).flatMap(i => [...treeOf(i)]) : [])]));
  };

  const addTo = (m, c, q) => { if (q > 0) m[c] = (m[c] || 0) + q; };

  // What a bot wants to have in its stockpile right now
  const wantsOf = (st, p) => {
    const want = {};
    // Contracts, the closest to done first: the two best
    const progress = k => Object.entries(k.goods).reduce((s, [c, q]) => s + Math.min(q, p.stock[c] || 0) * G.rawUnits(c), 0)
      / Object.entries(k.goods).reduce((s, [c, q]) => s + q * G.rawUnits(c), 0);
    [...p.contracts].sort((a, b) => progress(b) + b.points / 50 - progress(a) - a.points / 50).slice(0, 2)
      .forEach(k => Object.entries(k.goods).forEach(([c, q]) => addTo(want, c, q)));
    // One run of every factory
    G.myBusinesses(st, p.id).forEach(b => Object.entries(G.BIZ_BY[b.type].inputs).forEach(([c, q]) => addTo(want, c, q)));
    // The next build, or at least a small reserve of building materials
    if (p.plan) Object.entries(p.plan.cost).forEach(([c, q]) => addTo(want, c, q));
    Object.entries(B.reserve).forEach(([c, q]) => { if ((want[c] || 0) < q) want[c] = q; });
    return want;
  };

  const trade = (st, p) => {
    p.mem ||= { bid: {}, ask: {} };
    G.act(st, p.id, "cancelAll", {});
    // Deliver whatever we can, best first
    [...p.contracts].sort((a, b) => b.points - a.points).forEach(k => { if (G.canDeliver(p, k)) G.act(st, p.id, "deliver", { contract: k.id }); });
    // Throw away a contract that's gone nowhere for a long time
    const stale = p.contracts.find(k => st.round - k.drawn >= 8 && !Object.keys(k.goods).some(c => p.stock[c]));
    if (stale && p.discardRound !== st.round) G.act(st, p.id, "discardContract", { contract: stale.id });

    const want = wantsOf(st, p);
    const end = st.round >= st.rounds - 2;
    // Make room for what we want: throw away the cheapest spares
    let short = Object.entries(want).reduce((s, [c, q]) => s + Math.max(0, q - (p.stock[c] || 0)), 0);
    let over = G.used(p) + short - p.space;
    Object.keys(p.stock).filter(c => p.stock[c] > (want[c] || 0)).sort((a, b) => G.guess(st, a) - G.guess(st, b)).forEach(c => {
      if (over <= 0) return;
      const n = Math.min(over, p.stock[c] - (want[c] || 0));
      G.act(st, p.id, "dump", { id: c, qty: n }); over -= n;
    });
    // Sell spares
    Object.entries({ ...p.stock }).forEach(([c, q]) => {
      const spare = q - (want[c] || 0);
      if (spare <= 0) { delete p.mem.ask[c]; return; }
      if (G.COM[c].type === "waste" && !RECIPES.some(r => r.in[c])) { G.act(st, p.id, "dump", { id: c, qty: spare }); return; }
      const age = p.mem.ask[c] = (p.mem.ask[c] ?? -1) + 1;
      const price = G.guess(st, c) * Math.max(end ? 0.1 : B.askMin, B.askStart - B.askStep * age);
      G.act(st, p.id, "placeOrder", { id: c, side: "sell", price: Math.max(0.01, price), qty: spare });
    });
    // Short of space? Dump waste
    if (G.spaceLeft(st, p) < 3) Object.keys(p.stock).filter(c => G.COM[c].type === "waste").forEach(c => G.act(st, p.id, "dump", { id: c, qty: p.stock[c] }));
    // Buy wants, most valuable first
    let budget = p.cash * B.cashPerPhase;
    Object.entries(want).map(([c, q]) => [c, q - (p.stock[c] || 0)]).filter(([, n]) => n > 0)
      .sort((a, b) => G.rawUnits(b[0]) - G.rawUnits(a[0]))
      .forEach(([c, n]) => {
        const age = p.mem.bid[c] = (p.mem.bid[c] ?? -1) + 1;
        const price = Math.round(G.guess(st, c) * Math.min(B.bidMax, B.bidStart + B.bidStep * age) * 100) / 100;
        n = Math.min(n, Math.max(0, G.spaceLeft(st, p)), Math.floor(budget / price));
        if (n > 0 && G.act(st, p.id, "placeOrder", { id: c, side: "buy", price, qty: n }).ok) budget -= price * n;
      });
    Object.keys(p.mem.bid).forEach(c => { if (!want[c] || (p.stock[c] || 0) >= want[c]) delete p.mem.bid[c]; });
  };

  // ---------- Building ----------
  // How useful a business would be to this bot
  // Reads the market: goods others are bidding for are worth making, and a factory needs inputs it
  // makes itself or can see on offer.
  // The missing links behind a bot's two best contracts: goods nobody (including the bot) supplies,
  // with how deep in the chain they are. Building the deepest missing link first gets a chain going.
  const missingLinks = (st, p) => {
    const mine = new Set(G.myBusinesses(st, p.id).flatMap(x => Object.keys(G.BIZ_BY[x.type].outputs)));
    const links = {};
    const walk = (c, depth) => {
      if (mine.has(c) || G.bestAsk(st, c) || (depth > 0 && st.lastTrade[c]?.round >= st.round - 2) || G.COM[c].type === "waste") return;
      if (!(c in links) || links[c] < depth) links[c] = depth;
      const r = RECIPES.find(x => Object.keys(x.out)[0] === c);
      if (r) Object.keys(r.in).forEach(i => walk(i, depth + 1));
    };
    [...p.contracts].sort((a, b) => b.points - a.points).slice(0, 2).forEach(k => Object.keys(k.goods).forEach(c => walk(c, 0)));
    // Building materials we're short of are missing links too
    Object.entries(p.plan?.cost || B.reserve).forEach(([c, q]) => { if ((p.stock[c] || 0) < q) walk(c, 1); });
    return links;
  };

  // How useful a business would be: fills a missing link, or makes something others are bidding for
  const usefulness = (st, p, b, tid, links) => {
    const out = b.makes;
    let s = out in links ? 2 + links[out] : 0.3;
    if (G.bestBid(st, out)) s += 1.5;                                                     // someone wants it now
    if (b.kind === "extract") s *= G.richness(b, tid);
    else {
      const mine = new Set(G.myBusinesses(st, p.id).flatMap(x => Object.keys(G.BIZ_BY[x.type].outputs)));
      Object.keys(b.inputs).forEach(c => { if (!mine.has(c) && !p.stock[c] && !G.bestAsk(st, c) && !(c in links) && !st.lastTrade[c]) s *= 0.4; });
    }
    const same = G.myBusinesses(st, p.id).filter(x => x.type === b.id).length;
    return s * Math.pow(0.5, same);
  };
  const bestHere = (st, p, tid, links = missingLinks(st, p)) => G.buildable(st, tid, p.id)
    .map(o => ({ ...o, s: usefulness(st, p, o.b, tid, links) / (1 + Object.values(o.cost).reduce((a, b) => a + b, 0) / 10) }))
    .sort((a, b) => b.s - a.s)[0];

  const afternoon = (st, p) => {
    const links = missingLinks(st, p);
    const here = bestHere(st, p, p.pos, links);
    if (here && here.s > 0.5 && G.canAfford(p, here.cost)) { G.act(st, p.id, "build", { type: here.b.id }); p.plan = null; return; }
    // Somewhere within reach with something better? Head there; meanwhile save up materials for it.
    const d = G.distances(p.pos);
    let target = { tid: p.pos, o: here, s: here ? here.s : 0 };
    Object.entries(d).filter(([t, n]) => n > 0 && n <= 4 && !G.isSea(t)).forEach(([t, n]) => {
      const o = bestHere(st, p, t, links); if (o && o.s / (1 + 0.25 * n) > target.s) target = { tid: t, o, s: o.s / (1 + 0.25 * n) };
    });
    p.plan = target.o ? { type: target.o.b.id, tid: target.tid, cost: target.o.cost } : null;
    if (target.tid !== p.pos) {
      // One step along a shortest path
      const dt = G.distances(target.tid);
      const next = G.neighbours(p.pos).sort((a, b) => (dt[a] ?? 99) - (dt[b] ?? 99) || G.rand(st) - 0.5)[0];
      if (next) G.act(st, p.id, "move", { to: next });
    }
  };

  G.bots.morning = (st, p) => trade(st, p);
  G.bots.afternoon = (st, p) => { afternoon(st, p); trade(st, p); };
})();
