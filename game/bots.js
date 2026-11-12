// Sellers Market game engine: simple computer players.
// Deliberately simple: enough to play against and to run simulations (tools/sim.js).
//
// Every round a bot:
//   1. cancels its old orders, delivers any contract it holds and can, and bids for contracts on the
//      board: what it reckons the goods would cost it, plus a margin, undercutting the lowest bid while
//      that still pays
//   2. works out what it wants (goods for the contracts it holds and its factories' inputs) and what it
//      can spare (everything else)
//   3. sells spares: from its guess of the price, falling the longer they go unsold; if a buyer is already
//      bidding near that, at their bid; goods going off tonight or piling up go at the best bid there is
//   4. buys wants, up to what each is worth to it: a contract good is worth its share of what the contract
//      pays plus the legal fees it would save; if someone asks no more than that it pays their ask,
//      otherwise it creeps up
//        guess = last traded price, else the cost basis, else its own rough estimate (never shown)
// It also builds (or heads somewhere it can build) something that feeds its contracts, that others are
// bidding for, or that the contracts ask for.

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
    bidMargin: 0.4,        // a bot's first bid for a contract: what it reckons the goods cost it, +40%…
    bidFloor: 0.1,         // …and it undercuts the lowest bid down to cost +10%
    inputPremium: 1.5,     // what a factory input is worth: × its going price
    reach: 4,              // how many moves away a bot will travel to build
    outputShare: 0.5,      // stop building once its businesses make this share of its stockpile each round
    buildReserve: 250,     // cash a bot keeps for trading: it only builds if this much is left afterwards
    wasteRoom: 4,          // a bot pays to get rid of waste when it has fewer free rows than this (and takes it with twice as many)
    wasteFeeMax: 6,        // the most a bot pays a unit to get rid of waste (and the first fee it asks to take some)
    sellIdle: 4,           // short of cash, a bot sells a factory that has stood idle this many rounds
    feedFactories: true,   // a bot puts its factories' inputs first, and builds what they're missing
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

  // The contracts this bot is working on: the ones it holds, soonest due first
  G.targets = (st, p) => [...(p.contracts || [])].sort((a, b) => a.due - b.due);
  // …and for deciding what to build, also the board contracts it's bidding for
  const aims = (st, p) => [...G.targets(st, p), ...(st.contracts || []).filter(k => k.bids.some(b => b.pid === p.id))];

  // What it reckons a contract's goods would cost it: what it already has costs nothing more, goods its own
  // businesses make at their cost basis (or a bit under the going price), the rest at the going price.
  // Infinity if it neither makes some good nor can see it on sale.
  const costToMake = (st, p, k) => Object.entries(k.goods).reduce((sum, [c, q]) => {
    const need = Math.max(0, q - (p.stock[c] || 0));
    if (!need) return sum;
    const own = G.myBusinesses(st, p.id).some(b => G.BIZ_BY[b.type].outputs[c]);
    // Only goods it makes itself or can see on sale: a contract it can't get the goods for costs legal fees
    if (!own && !G.bestAsk(st, c)) return Infinity;
    const cb = G.costBasis(st, c), each = own ? (cb && !cb.missing.length && cb.value ? cb.value : G.guess(st, c) * 0.7) : G.guess(st, c);
    return sum + need * Math.max(1, each);
  }, 0);
  // Bid for contracts on the board, as many as it has room for
  const bidContracts = (st, p) => {
    const C = S.contracts;
    let room = C.maxHeld - (p.contracts || []).length;
    if (room <= 0) return;
    const options = (st.contracts || [])
      .filter(k => st.round + G.bidRoundsLeft(st, k) + 2 <= st.rounds) // time to deliver before the game ends
      .map(k => ({ k, cost: costToMake(st, p, k) })).filter(o => isFinite(o.cost) && o.cost < o.k.cap)
      .sort((a, b) => (b.k.cap - b.cost) / Math.max(1, b.cost) - (a.k.cap - a.cost) / Math.max(1, a.cost));
    for (const { k, cost } of options) {
      if (room <= 0) break;
      const low = G.lowestBid(k), mine = k.bids.find(b => b.pid === p.id), floor = Math.ceil(cost * (1 + B.bidFloor));
      if (low && low.pid === p.id) { room--; continue; } // already the lowest
      let amount = Math.min(k.cap, Math.round(cost * (1 + B.bidMargin)));
      if (low) amount = Math.min(amount, low.amount - 1);
      if (amount < floor) continue;                      // undercutting wouldn't pay
      if (mine && amount >= mine.amount) { room--; continue; }
      if (G.act(st, p.id, "bid", { contract: k.id, amount }).ok) room--;
    }
  };

  // What a bot wants to have in its stockpile right now
  const wantsOf = (st, p) => {
    const want = {};
    // The contracts it holds
    G.targets(st, p)
      .forEach(k => Object.entries(k.goods).forEach(([c, q]) => addTo(want, c, q)));
    // Enough for every factory to run as many times as it can in a round
    // (nobody selling an input it lacks, but a stand-in is on offer? want the stand-in instead)
    G.myBusinesses(st, p.id).forEach(biz => { const b = G.BIZ_BY[biz.type]; Object.entries(b.inputs).forEach(([c, q]) => {
      const sub = !p.stock[c] && !G.bestAsk(st, c) && G.substitutesFor(b, c).find(([x]) => G.bestAsk(st, x) || p.stock[x]);
      if (sub) addTo(want, sub[0], q * sub[1]); else addTo(want, c, q);
    }); });
    return want;
  };

  // What a good is worth to this bot, per unit. A good for a contract it holds is worth its share (by
  // raw-material content) of what the contract pays plus the legal fees delivering saves. Anything else
  // (factory inputs) is worth a bit more than its going price.
  const worthOf = (st, p, c) => {
    let w = G.guess(st, c) * B.inputPremium;
    // Inputs for its own factories come first: worth what the factory's output is worth
    if (B.feedFactories && G.myBusinesses(st, p.id).some(x => G.BIZ_BY[x.type].inputs[c]))
      w = Math.max(w, G.guess(st, c) * B.inputPremium * 2);
    G.targets(st, p).forEach(k => {
      if (!k.goods[c]) return;
      const raw = Object.entries(k.goods).reduce((s, [g, q]) => s + q * Math.max(0.2, G.rawUnits(g)), 0);
      w = Math.max(w, (k.price + G.failFee(k.price)) * Math.max(0.2, G.rawUnits(c)) / raw);
    });
    return w;
  };
  const trade = (st, p) => {
    p.mem ||= { bid: {}, ask: {} };
    G.act(st, p.id, "cancelAll", {});
    // Deliver whatever it can, best paid first; then bid for more
    [...(p.contracts || [])].sort((a, b) => b.price - a.price).forEach(k => { if (G.canDeliver(st, p, k)) G.act(st, p.id, "deliver", { contract: k.id }); });
    bidContracts(st, p);

    const want = wantsOf(st, p);
    const end = st.round >= st.rounds - 2; // (only near the safety stop: the real end is reaching the goal)
    // Sell spares. Floor: its going price (falling the longer it goes unsold). If a buyer is already bidding
    // at least that, sell at their bid. Goods that go off tonight, or would just pile up, go at the best bid.
    Object.entries({ ...p.stock }).forEach(([c, q]) => {
      if (G.isWaste(c)) return; // waste: see below
      const spare = q - (want[c] || 0);
      if (spare <= 0) { delete p.mem.ask[c]; return; }
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
        n = Math.min(n, S.market.reserveSpace ? Math.max(0, G.spaceLeft(st, p)) : p.space, Math.floor(budget / price));
        if (n > 0 && G.act(st, p.id, "placeOrder", { id: c, side: "buy", price, qty: n }).ok) budget -= price * n;
      });
    Object.keys(p.mem.bid).forEach(c => { if (!want[c] || (p.stock[c] || 0) >= want[c]) delete p.mem.bid[c]; });
    // Waste. Short of room: pay to get rid of it, a fee that rises the longer nobody takes it.
    // Plenty of room: offer to take some for a fee, asking less the longer nobody pays it.
    p.mem.dump ||= {}; p.mem.take ||= {};
    COMMODITIES.filter(c => c.type === "waste").forEach(({ id: c }) => {
      const held = p.stock[c] || 0, room = G.spaceLeft(st, p);
      if (held && (room < B.wasteRoom || end)) {
        const age = p.mem.dump[c] = (p.mem.dump[c] ?? -1) + 1, fee = Math.min(B.wasteFeeMax, 1 + age);
        if (p.cash >= fee * held) G.act(st, p.id, "placeOrder", { id: c, side: "sell", price: fee, qty: held });
      } else delete p.mem.dump[c];
      if (!held && room >= B.wasteRoom * 2 && !end) {
        const age = p.mem.take[c] = (p.mem.take[c] ?? -1) + 1, fee = Math.max(2, B.wasteFeeMax - age);
        G.act(st, p.id, "placeOrder", { id: c, side: "buy", price: fee, qty: Math.min(3, room - B.wasteRoom) });
      } else delete p.mem.take[c];
    });
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
    aims(st, p).forEach(k => Object.keys(k.goods).forEach(c => walk(c, 0)));
    // Inputs its own factories are missing are links too (an idle factory makes nothing for anyone)
    if (B.feedFactories) G.myBusinesses(st, p.id).forEach(x => { const b = G.BIZ_BY[x.type];
      if (b.kind === "factory") G.inputsFor(st, p, b).missing.forEach(([c]) => walk(c, 1)); });
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
    // Short of cash? Sell a factory that's been idle for a while (for its cost price)
    if (p.cash < B.buildReserve) {
      const idle = G.myBusinesses(st, p.id).filter(b => G.BIZ_BY[b.type].kind === "factory" && (b.idleFor || 0) >= B.sellIdle).sort((a, b) => b.idleFor - a.idleFor)[0];
      if (idle) G.act(st, p.id, "sellBusiness", { biz: idle.id });
    }
    // More businesses fill the stockpile: stop once what its businesses make would crowd out what it buys
    const output = G.myBusinesses(st, p.id).reduce((n, b) => n + G.BIZ_BY[b.type].outputs[G.BIZ_BY[b.type].makes], 0);
    if (output + 2 > B.outputShare * p.space) { p.plan = null; return; }
    const links = missingLinks(st, p);
    const here = bestHere(st, p, p.pos, links);
    if (here && here.s > 0.5 && p.cash - here.b.cost >= B.buildReserve) { G.act(st, p.id, "build", { type: here.b.id }); p.plan = null; return; }
    if (p.cash - Math.min(...G.BIZ.map(b => b.cost)) < B.buildReserve) { p.plan = null; return; } // can't afford to build anywhere: stay put
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
  // ---------- Cards ----------
  // A simple use for each card: help itself, or slow down the richest other player. One a round, if any fits.
  const playCard = (st, p) => {
    if (!(p.hand || []).length) return;
    const rivals = st.players.filter(x => x.id !== p.id), leader = rivals.sort((a, b) => G.netWorth(st, b) - G.netWorth(st, a))[0];
    const mine = G.myBusinesses(st, p.id), makes = new Set(mine.map(b => G.BIZ_BY[b.type].makes));
    const leaderBiz = leader ? G.myBusinesses(st, leader.id) : [];
    const leaderLand = leaderBiz.length ? Object.entries(leaderBiz.reduce((m, b) => (m[b.territory] = (m[b.territory] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0][0] : null;
    const leaderGood = leaderBiz.map(b => G.BIZ_BY[b.type].makes).find(c => !makes.has(c) && !G.isWaste(c));
    const ownGood = [...makes].find(c => !G.isWaste(c));
    const atRisk = (p.contracts || []).filter(k => k.due - st.round <= 1 && !G.canDeliver(st, p, k))[0];
    const want = Object.keys(wantsOf(st, p)).find(c => G.COM[c].type === "raw");
    const bidOn = (st.contracts || []).find(k => k.bids.some(b => b.pid === p.id));
    const pick = {
      overtime: () => mine.length ? [null] : null, windfall: () => [null], warehouse: () => [null], cold_store: () => Object.keys(p.stock).length > 5 ? [null] : null,
      grant: () => p.cash > 200 ? [null] : null, rush_order: () => [null], fast_horses: () => p.plan && p.plan.tid !== p.pos ? [null] : null,
      bumper_harvest: () => makes.has("wheat") ? [null] : null,
      rich_seam: () => { const b = mine.find(x => G.BIZ_BY[x.type].kind === "extract"); return b ? [b.id] : null; },
      shipment: () => want ? [want] : ["coal"],
      extension: () => atRisk ? [atRisk.id] : null, lawyers: () => atRisk ? [atRisk.id] : null,
      lobbying: () => bidOn ? [bidOn.id] : null, peek: () => bidOn ? [bidOn.id] : null,
      subsidy: () => ownGood ? [ownGood] : null,
      drought: () => !makes.has("wheat") && !makes.has("water") ? [null] : null,
      miners_strike: () => !makes.has("coal") && !makes.has("iron_ore") ? [null] : null,
      weevils: () => !["wheat", "flour", "bread"].some(c => p.stock[c]) ? [null] : null,
      power_cut: () => leader ? [leader.id] : null, damp: () => leader ? [leader.id] : null, theft: () => leader ? [leader.id] : null,
      embargo: () => leader ? [leader.id] : null, tax_audit: () => leader ? [leader.id] : null, insider_tip: () => leader ? [leader.id] : null,
      tariff: () => leaderGood ? [leaderGood] : null, export_controls: () => leaderGood ? [leaderGood] : null, rumour: () => leaderGood ? [leaderGood] : null,
      mine_collapse: () => leaderLand && !mine.some(b => b.territory === leaderLand) ? [leaderLand] : null,
      flood: () => leaderLand && !mine.some(b => b.territory === leaderLand) ? [leaderLand] : null,
      objection: () => leaderLand ? [leaderLand] : null,
      takeover: () => leaderBiz.length ? [leaderBiz[0].id] : null,
      pass_buck: () => atRisk && leader ? [[atRisk.id, leader.id]] : null,
      gov_order: () => { const k = (st.contracts || []).filter(x => !x.bids.some(b => b.pid === p.id)).sort((a, b) => Object.keys(b.goods).length - Object.keys(a.goods).length)[0]; return k && leader ? [[k.id, leader.id]] : null; },
      inside_line: () => [null],
    };
    for (const card of p.hand) {
      const t = pick[card]?.();
      if (t && G.act(st, p.id, "playCard", { card, target: t[0] }).ok) return;
    }
  };

  G.bots.day = (st, p) => { playCard(st, p); moveOrBuild(st, p); trade(st, p); };
})();
