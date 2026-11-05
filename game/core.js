// Sellers Market game engine: core.
// The engine knows nothing about the page. It keeps the whole game in one plain object
// (the "state"), which can be saved as JSON, and changes it only through actions and phase steps.
//
// Other files plug in by adding to SMG:
//   SMG.actions[name] = (state, playerId, args) => message     player actions
//   SMG.steps.midday / SMG.steps.overnight                     automatic steps, run in order
//   SMG.bots.morning / SMG.bots.afternoon                      what computer players do

const SMG = (() => {
  const S = GAME_SETTINGS;
  const G = { actions: {}, steps: { midday: [], overnight: [] }, bots: {}, onSetup: [] };

  // ---------- Catalogue: the rulebook, built from the data files ----------
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  G.slug = slug;
  G.COM = Object.fromEntries(COMMODITIES.map(c => [c.id, c]));
  G.TERR = Object.fromEntries(TERRITORIES.map(t => [t.id, t]));
  G.isSea = tid => !!G.TERR[tid].sea;
  G.coastal = tid => !G.isSea(tid) && (TERRITORY_NEIGHBOURS[tid] || []).some(G.isSea);
  G.neighbours = tid => TERRITORY_NEIGHBOURS[tid] || [];

  // Tier of each commodity (raw = 0), used for factory build costs.
  const producerOf = {};
  RECIPES.forEach(r => producerOf[Object.keys(r.out)[0]] = r);
  const tierMemo = {};
  G.tier = id => {
    if (id in tierMemo) return tierMemo[id];
    tierMemo[id] = 0;
    const c = G.COM[id];
    let t = 0;
    const rt = r => 1 + Math.max(...Object.keys(r.in).map(G.tier));
    if (c.type === "made") t = rt(producerOf[id]);
    else if (c.type === "waste") t = Math.min(...RECIPES.filter(r => Object.keys(r.out).slice(1).includes(id)).map(rt));
    return (tierMemo[id] = t);
  };

  // Every business type: extractors first, then the 30 factories.
  G.BIZ = [
    ...EXTRACTORS.map(([name, makes, out, base, where]) => ({ id: slug(name), name, kind: "extract", where, base, inputs: {}, outputs: { [makes]: out }, makes })),
    ...RECIPES.map(r => ({ id: slug(r.at), name: r.at, kind: "factory", where: NEEDS_OIL_ACCESS.includes(r.at) ? "oil" : "land",
      base: BUILD.factoryCost[G.tier(Object.keys(r.out)[0])], inputs: { ...r.in }, outputs: { ...r.out }, makes: Object.keys(r.out)[0] })),
  ];
  G.BIZ_BY = Object.fromEntries(G.BIZ.map(b => [b.id, b]));

  // ---------- Randomness: seeded, so a game can be replayed exactly ----------
  G.rand = st => {
    let t = (st.seed = (st.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  G.pick = (st, arr) => arr[Math.floor(G.rand(st) * arr.length)];

  // ---------- Helpers ----------
  G.player = (st, pid) => st.players.find(p => p.id === pid);
  G.used = p => Object.values(p.stock).reduce((a, b) => a + b, 0);
  G.free = p => p.space - G.used(p);
  G.add = (p, cid, q) => { p.stock[cid] = (p.stock[cid] || 0) + q; if (p.stock[cid] <= 0) delete p.stock[cid]; };
  G.log = (st, msg, pid = null) => { st.log.push({ round: st.round, phase: st.phase, pid, msg }); if (st.log.length > 400) st.log.shift(); };
  G.money = n => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
  G.myBusinesses = (st, pid) => st.businesses.filter(b => b.owner === pid);
  // Money ledger: every cash movement, by round and category (positive = money in)
  G.book = (st, p, cat, amount) => {
    if (!amount) return;
    const r = (p.book ||= {})[st.round] ||= {};
    r[cat] = (r[cat] || 0) + amount;
    Object.keys(p.book).forEach(k => { if (+k < st.round - 5) delete p.book[k]; });
  };

  // ---------- A new game ----------
  // config.players: [{ name, colour, bot, start: territoryId, business: businessTypeId }]
  G.newGame = config => {
    const st = {
      version: 5, seed: config.seed ?? Math.floor(Math.random() * 1e9),
      round: 1, rounds: config.rounds ?? S.rounds, phase: "morning", over: false,
      orders: {},
      players: [], businesses: [], nextBizId: 1,
      priceLevel: 1, prices: {}, lastPrices: {}, history: [],
      effects: [], pending: [], log: [],
      stats: { runs: 0, idle: 0, overflow: 0 },
    };
    config.players.forEach((c, i) => {
      st.players.push({ id: i + 1, name: c.name, colour: c.colour, bot: !!c.bot, strategy: c.strategy || "best",
        cash: S.startCash, space: S.startSpace, upgrades: 0, pos: c.start, stock: {}, hand: [],
        acted: false, cardsPlayed: 0 });
    });
    // Free starting business, where each player starts
    config.players.forEach((c, i) => {
      const b = G.BIZ_BY[c.business];
      if (b && G.canBuildAt(b, c.start)) st.businesses.push({ id: st.nextBizId++, owner: i + 1, type: b.id, territory: c.start, built: 0, cost: G.buildCost(st, b, c.start, i + 1) });
    });
    G.onSetup.forEach(f => f(st));
    G.reprice(st);
    st.lastPrices = { ...st.prices };
    st.history.push({ round: 0, prices: { ...st.prices } });
    st.startWorth = Object.fromEntries(st.players.map(p => [p.id, G.netWorth(st, p)]));
    G.log(st, `Game started with ${st.players.length} players. Round 1, morning.`);
    G.botOrders(st);
    if (!G.waitingFor(st).length) G.resolve(st); // all computer players: play the whole game
    return st;
  };

  // ---------- Phases: everyone orders, then it all happens at once ----------
  // Morning and afternoon: every player submits a list of orders, privately.
  // Once all have submitted, the orders are carried out together, then the automatic step runs.
  //   - Morning trades only touch the trader's own cash and stockpile, at fixed prices.
  //   - Afternoon moves: if two or more players move into the same territory, none of them gets in.
  //   - Afternoon builds: costs are worked out from the businesses there at the start of the afternoon.
  const clone = x => JSON.parse(JSON.stringify(x));
  G.fail = msg => { throw new Error(msg); };
  G.need = (cond, msg) => { if (!cond) G.fail(msg); };

  // Carry out one action now. Used when resolving orders, and on draft copies of the game.
  G.act = (st, pid, name, args = {}) => {
    if (st.over) return { ok: false, msg: "The game is over." };
    const fn = G.actions[name];
    if (!fn) return { ok: false, msg: `Unknown action: ${name}` };
    try {
      const msg = fn(st, G.player(st, pid), args);
      if (msg) G.log(st, msg, pid);
      if (st.recording) st.recording.push({ name, args });
      return { ok: true, msg };
    } catch (e) { return { ok: false, msg: e.message }; }
  };

  // What the game would look like for one player if their orders went through.
  // Used to check orders as they're entered, and to show the player their projected cash and stock.
  G.draft = (st, pid, orders) => {
    const c = clone(st); c.log = []; c.drafting = true;
    for (const o of orders) { const r = G.act(c, pid, o.name, o.args); if (!r.ok) return { state: c, error: r.msg, at: o }; }
    return { state: c, error: null };
  };

  G.waitingFor = st => st.players.filter(p => !st.orders[p.id]);

  G.submit = (st, pid, orders) => {
    if (st.over) return { ok: false, msg: "The game is over." };
    if (st.orders[pid]) return { ok: false, msg: "You've already submitted." };
    const d = G.draft(st, pid, orders);
    if (d.error) return { ok: false, msg: d.error };
    st.orders[pid] = orders;
    if (!G.waitingFor(st).length) G.resolve(st);
    return { ok: true };
  };

  // Everyone has submitted: carry out the orders, then run the automatic steps.
  G.resolve = st => {
    let guard = 0;
    do {
      if (st.phase === "morning") {
        st.players.forEach(p => (st.orders[p.id] || []).forEach(o => G.act(st, p.id, o.name, o.args)));
        st.orders = {};
        st.phase = "midday"; G.steps.midday.forEach(f => f(st));
        st.phase = "afternoon"; st.players.forEach(p => { p.acted = false; p.cardsPlayed = 0; });
        G.log(st, `Round ${st.round}, afternoon.`);
      } else if (st.phase === "afternoon") {
        // Moves into the same territory bounce
        const moves = {};
        st.players.forEach(p => (st.orders[p.id] || []).filter(o => o.name === "move").forEach(o => (moves[o.args.to] ||= []).push(p)));
        const bounced = new Set();
        Object.entries(moves).forEach(([to, ps]) => {
          if (ps.length < 2) return;
          ps.forEach(p => bounced.add(p.id));
          const names = ps.map(p => p.name), who = names.length === 2 ? `${names[0]} and ${names[1]} both` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} all`;
          G.log(st, `${who} tried to move into ${G.TERR[to].name} at the same time. Nobody got in.`);
        });
        st.costBasis = st.businesses.map(b => ({ territory: b.territory, owner: b.owner })); // build prices as at the start
        st.players.forEach(p => (st.orders[p.id] || []).forEach(o => {
          if (o.name === "move" && bounced.has(p.id)) return;
          G.act(st, p.id, o.name, o.args);
        }));
        delete st.costBasis;
        st.orders = {};
        st.phase = "overnight"; G.steps.overnight.forEach(f => f(st));
        if (st.round >= st.rounds) { st.over = true; st.phase = "over"; G.log(st, "Game over."); return; }
        st.round++; st.phase = "morning";
        st.players.forEach(p => { p.acted = false; p.cardsPlayed = 0; });
        G.log(st, `Round ${st.round}, morning.`);
      }
      if (!st.over) G.botOrders(st);
    } while (!st.over && !G.waitingFor(st).length && guard++ < 10000);
  };

  // Computer players decide on a draft copy of the game; whatever they did there becomes their orders.
  G.botOrders = st => {
    st.players.filter(p => p.bot && !st.orders[p.id]).forEach(p => {
      const c = clone(st); c.log = []; c.recording = []; c.drafting = true;
      const bot = G.bots[st.phase];
      if (bot) bot(c, G.player(c, p.id));
      st.orders[p.id] = c.recording;
    });
  };

  // ---------- Net worth ----------
  G.netWorth = (st, p) => p.cash
    + Object.entries(p.stock).reduce((s, [c, q]) => s + q * st.prices[c], 0)
    + G.myBusinesses(st, p.id).reduce((s, b) => s + (G.bizValue ? G.bizValue(st, b) : b.cost * S.businessValue), 0)
    + (p.bonds || []).reduce((s, b) => s + b.count * G.bondValue(st, b), 0)
    + Object.entries(p.etf || {}).reduce((s, [k, u]) => s + u * G.etfPrice(st, k), 0)
    + (p.futures || []).reduce((s, f) => s + G.futureValue(st, f), 0)
    - (p.loan || 0);

  return G;
})();
