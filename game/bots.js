// Sellers Market game engine: simple computer players.
// Deliberately simple: enough to play against and to run simulations (tools/sim.js).
//
// Every round a bot:
//   1. cancels its old orders and delivers a contract if it can (the contracts are shared: first come, first paid)
//   2. works out what it wants (goods for the two contracts it's closest to and its factories' inputs)
//      and what it can spare (everything else)
//   3. sells spares: from its guess of the price, falling the longer they go unsold; if a buyer is already
//      bidding near that, at their bid; goods going off tonight or piling up go at the best bid there is
//   4. buys wants, up to what each is worth to it: a contract good is worth its share of the contract's
//      points at the bot's cash value of a point (its cash over the rounds left, so it spends more
//      freely near the end); if someone asks no more than that it pays their ask, otherwise it creeps up
//        guess = last traded price, else the cost basis, else its own rough estimate (never shown)
// It also builds (or heads somewhere it can build) something that feeds its contracts, that others are
// bidding for, or that the open contracts ask for.

(() => {
  const G = SMG, S = GAME_SETTINGS;
  // Defaults; anything in settings.bots overrides them
  const B = S.bots = Object.assign({
    perRawUnit: 30,        // what a bot guesses a raw-material unit is worth, before anything has traded
    bidStart: 0.8,         // first bid: 80% of its guess…
    bidStep: 0.15,         // …+15% of the guess for every round it goes unfilled…
    bidMax: 3,             // …up to 3× the guess
    askStart: 1.3,         // first ask: 130% of its guess…
    askStep: 0.1,          // …−10% for every round it goes unsold…
    askMin: 0.4,           // …down to 40%
    cashPerPhase: 0.6,     // spend at most this share of cash in one auction
    pointsPerRound: 0.7,   // how many points a bot expects to score a round: sets what a point is worth in cash
    inputPremium: 1.5,     // what a factory input is worth: × its going price
    reach: 4,              // how many moves away a bot will travel to build
    outputShare: 0.5,      // stop building once its businesses make this share of its stockpile each round
    demandWeight: 1,       // how much a bot favours building what the open contracts ask for
  }, S.bots || {});

  // A bot's private guess of what a good is worth
  // (never traded: its cost basis if all its raw materials have traded, otherwise its own rough estimate:
  //  raw-material units × perRawUnit, a bit more for each processing step. A private opinion, never shown.)
  G.guess = (st, id) => st.lastTrade[id]?.price ?? ((cb => cb && !cb.missing.length && cb.value ? cb.value : null)(G.costBasis(st, id)) ?? Math.max(1, G.rawUnits(id) * B.perRawUnit * (1 + 0.15 * G.tier(id))));

  // Every good in the making of `id` (including itself)
  const treeMemo = {};
  const treeOf = id => {
    if (treeMemo[id]) return treeMemo[id];
    const r = RECIPES.find(x => Object.keys(x.out)[0] === id);
    return (treeMemo[id] = new Set([id, ...(r ? Object.keys(r.in).flatMap(i => [...treeOf(i)]) : [])]));
  };

  const addTo = (m, c, q) => { if (q > 0) m[c] = (m[c] || 0) + q; };

  // The open contracts (not yet delivered by anyone)
  const open = st => (st.contracts || []).filter(k => !k.takers.length);
  // The two contracts this bot is going for: the ones it's closest to finishing (by raw content), then the best paid
  G.targets = (st, p) => {
    const progress = k => Object.entries(k.goods).reduce((s, [c, q]) => s + Math.min(q, p.stock[c] || 0) * G.rawUnits(c), 0)
      / Object.entries(k.goods).reduce((s, [c, q]) => s + q * G.rawUnits(c), 0);
    return open(st).sort((a, b) => progress(b) + b.points / 50 - progress(a) - a.points / 50).slice(0, 2);
  };

  // What a bot wants to have in its stockpile right now
  const wantsOf = (st, p) => {
    const want = {};
    // The two contracts it's closest to finishing
    G.targets(st, p)
      .forEach(k => Object.entries(k.goods).forEach(([c, q]) => addTo(want, c, q)));
    // Enough for every factory to run as many times as it can in a round
    // (nobody selling an input it lacks, but a stand-in is on offer? want the stand-in instead)
    G.myBusinesses(st, p.id).forEach(biz => { const b = G.BIZ_BY[biz.type]; Object.entries(b.inputs).forEach(([c, q]) => {
      q *= S.factoryRuns || 1;
      const sub = !p.stock[c] && !G.bestAsk(st, c) && G.substitutesFor(b, c).find(([x]) => G.bestAsk(st, x) || p.stock[x]);
      if (sub) addTo(want, sub[0], q * sub[1]); else addTo(want, c, q);
    }); });
    return want;
  };

  // What a good is worth to this bot, per unit. A contract good is worth its share of the contract's points
  // (by raw-material content) at the bot's value of a point: its cash spread over the rounds left, so it
  // spends more freely as the game nears its end (cash left over only breaks ties). Anything else (factory
  // inputs) is worth a bit more than its going price.
  const worthOf = (st, p, c) => {
    const vpp = Math.max(5, (p.cash + G.lockedCash(st, p)) / Math.max(4, (st.rounds - st.round + 1) * B.pointsPerRound));
    let w = G.guess(st, c) * B.inputPremium;
    G.targets(st, p).forEach(k => {
      if (!k.goods[c]) return;
      const raw = Object.entries(k.goods).reduce((s, [g, q]) => s + q * Math.max(0.2, G.rawUnits(g)), 0);
      w = Math.max(w, k.points * vpp * Math.max(0.2, G.rawUnits(c)) / raw);
    });
    return w;
  };
  const trade = (st, p) => {
    p.mem ||= { bid: {}, ask: {} };
    G.act(st, p.id, "cancelAll", {});
    // Deliver whatever we can, best first
    open(st).sort((a, b) => b.points - a.points).forEach(k => { if (G.canDeliver(st, p, k)) G.act(st, p.id, "deliver", { contract: k.id }); });

    const want = wantsOf(st, p);
    const end = st.round >= st.rounds - 2;
    // Sell spares. Floor: its going price (falling the longer it goes unsold). If a buyer is already bidding
    // at least that, sell at their bid. Goods that go off tonight, or would just pile up, go at the best bid.
    Object.entries({ ...p.stock }).forEach(([c, q]) => {
      const spare = q - (want[c] || 0);
      if (spare <= 0) { delete p.mem.ask[c]; return; }
      if (G.COM[c].type === "waste" && !RECIPES.some(r => r.in[c])) { G.act(st, p.id, "dump", { id: c, qty: spare }); return; }
      const age = p.mem.ask[c] = (p.mem.ask[c] ?? -1) + 1;
      const bid = G.bestBid(st, c), urgent = end || (G.goingOff && G.goingOff(st, p, c) > 0) || spare > S.businessSpace;
      let price = G.guess(st, c) * Math.max(end ? 0.1 : B.askMin, B.askStart - B.askStep * age);
      if (bid && bid.price >= price * 0.9) price = bid.price;          // take the bid that's there
      if (urgent) price = bid ? Math.min(price, bid.price) : Math.min(price, G.guess(st, c) * B.askMin);
      G.act(st, p.id, "placeOrder", { id: c, side: "sell", price: Math.max(1, Math.round(price)), qty: spare });
    });
    // Buy wants, the ones closest to finishing a contract first. Bid what it's worth at most: if someone is
    // asking no more than that, bid their ask (it fills); otherwise creep up towards it.
    let budget = (p.cash) * (end ? 1 : B.cashPerPhase);
    Object.entries(want).map(([c, q]) => [c, q - (p.stock[c] || 0)]).filter(([, n]) => n > 0)
      .map(([c, n]) => ({ c, n, w: worthOf(st, p, c) })).sort((a, b) => b.w - a.w)
      .forEach(({ c, n, w }) => {
        const age = p.mem.bid[c] = (p.mem.bid[c] ?? -1) + 1, ask = G.bestAsk(st, c);
        let price = Math.min(w, G.guess(st, c) * (B.bidStart + B.bidStep * age));
        if (ask && ask.price <= w) price = Math.max(price, ask.price);
        price = Math.max(1, Math.round(price));
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
    G.targets(st, p).forEach(k => Object.keys(k.goods).forEach(c => walk(c, 0)));
    return links;
  };

  // How useful a business would be: fills a missing link, or makes something others are bidding for
  const usefulness = (st, p, b, tid, links) => {
    const out = b.makes;
    let s = out in links ? 2 + links[out] : 0.3;
    if (G.bestBid(st, out)) s += 1.5;                                                     // someone wants it now
    s += (B.demandWeight || 0) * G.demand(st, out);                                      // open contracts ask for it
    { const bid = G.bestBid(st, out), cb = G.costBasis(st, out);                            // …and pays more than it costs to make
      if (bid && cb && !cb.missing.length && bid.price > cb.value * 1.1) s += 2 * Math.min(2, bid.price / Math.max(1, cb.value) - 1); }
    if (b.kind === "factory") {
      const mine = new Set(G.myBusinesses(st, p.id).flatMap(x => Object.keys(G.BIZ_BY[x.type].outputs)));
      Object.keys(b.inputs).forEach(c => { if (!mine.has(c) && !p.stock[c] && !G.bestAsk(st, c) && !(c in links) && !st.lastTrade[c]) s *= 0.4; });
    }
    const same = G.myBusinesses(st, p.id).filter(x => x.type === b.id).length;
    return s * Math.pow(0.5, same);
  };
  const bestHere = (st, p, tid, links = missingLinks(st, p)) => G.buildable(tid)
    .map(b => ({ b, s: usefulness(st, p, b, tid, links) }))
    .sort((a, b) => b.s - a.s)[0];

  const moveOrBuild = (st, p) => {
    // Free building fills the stockpile: stop once what its businesses make would crowd out what it buys
    const output = G.myBusinesses(st, p.id).reduce((n, b) => n + G.BIZ_BY[b.type].outputs[G.BIZ_BY[b.type].makes], 0);
    if (!S.unlimitedSpace && output + 2 > (B.outputShare || 0.5) * (p.realSpace || p.space)) { p.plan = null; return; }
    const links = missingLinks(st, p);
    const here = bestHere(st, p, p.pos, links);
    if (here && here.s > 0.5) { G.act(st, p.id, "build", { type: here.b.id }); p.plan = null; return; }
    // Nothing worth building here? Head for the best place within reach.
    const d = G.distances(p.pos);
    let target = { tid: p.pos, o: here, s: here ? here.s : 0 };
    Object.entries(d).filter(([t, n]) => n > 0 && n <= (B.reach || 4) && !G.isSea(t)).forEach(([t, n]) => {
      const o = bestHere(st, p, t, links); if (o && o.s / (1 + 0.25 * n) > target.s) target = { tid: t, o, s: o.s / (1 + 0.25 * n) };
    });
    p.plan = target.o ? { type: target.o.b.id, tid: target.tid } : null;
    if (target.tid !== p.pos) {
      // One step along a shortest path
      const dt = G.distances(target.tid);
      const next = G.neighbours(p.pos).sort((a, b) => (dt[a] ?? 99) - (dt[b] ?? 99) || G.rand(st) - 0.5)[0];
      if (next) G.act(st, p.id, "move", { to: next });
    }
  };

  G.botWants = wantsOf; // what a bot is keeping for itself (used by tools/sim.js)
  G.bots.day = (st, p) => { moveOrBuild(st, p); trade(st, p); };
})();
