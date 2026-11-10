// Sellers Market game engine: core.
// The engine knows nothing about the page. It keeps the whole game in one plain object
// (the "state"), which can be saved as JSON, and changes it only through actions and phase steps.
//
// Other files plug in by adding to SMG:
//   SMG.actions[name] = (state, playerId, args) => message     player actions
//   SMG.steps.night                                            automatic steps at the end of a round, in order
//   SMG.bots.day                                               what computer players do

const SMG = (() => {
  const S = GAME_SETTINGS;
  const G = { actions: {}, steps: { night: [] }, bots: {}, onSetup: [] };

  // ---------- Catalogue: the rulebook, built from the data files ----------
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  G.COM = Object.fromEntries(COMMODITIES.map(c => [c.id, c]));
  G.TERR = Object.fromEntries(TERRITORIES.map(t => [t.id, t]));
  G.isSea = tid => !!G.TERR[tid].sea;
  G.coastal = tid => !G.isSea(tid) && (TERRITORY_NEIGHBOURS[tid] || []).some(G.isSea);
  G.neighbours = tid => TERRITORY_NEIGHBOURS[tid] || [];

  // Tier of each commodity (raw = 0): how many processing steps it takes.
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

  // Every business type: extractors first, then the factories. Where each can go: js/territories.js.
  G.BIZ = [
    ...EXTRACTORS.map(([name, makes, out]) => ({ id: slug(name), name, kind: "extract", inputs: {}, outputs: { [makes]: out }, makes })),
    ...RECIPES.map(r => ({ id: slug(r.at), name: r.at, kind: "factory", inputs: { ...r.in }, outputs: { ...r.out }, makes: Object.keys(r.out)[0] })),
  ];
  G.BIZ.forEach(b => b.cost = BUSINESS_COST[b.id] ?? 150);
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
  // ---------- Goods age (settings.depreciation, game/depreciation.js) ----------
  // Each holder (a player, or a business with its own stock) keeps, beside its counts, when its units
  // were made: holder.lots[good] = [[qty, round made], …], oldest first. Goods are always used, sold and
  // delivered oldest first, and keep their age wherever they go (into a sell order, to a buyer, back
  // again). G.clock is the round now; it's set wherever the game runs (actions, steps, a new game).
  G.clock = 0;
  const lotsOn = () => !!S.depreciation?.on;
  // Make the ages match the count (units put in some other way count as made now)
  const syncLots = (h, cid) => {
    h.lots ||= {};
    const L = h.lots[cid] ||= [], n = h.stock[cid] || 0;
    let sum = L.reduce((s, l) => s + l[0], 0);
    if (sum < n) { L.push([n - sum, G.clock]); L.sort((a, b) => a[1] - b[1]); }
    while (sum > n && L.length) { const k = Math.min(L[0][0], sum - n); L[0][0] -= k; sum -= k; if (!L[0][0]) L.shift(); }
    if (!L.length) delete h.lots[cid];
  };
  // Change a holder's count of a good by q. Adding: `made` is when the units were made (default now).
  // Removing: oldest first. Returns the units removed, as lots.
  const change = (h, cid, q, made) => {
    if (lotsOn()) syncLots(h, cid);
    h.stock[cid] = (h.stock[cid] || 0) + q;
    if (h.stock[cid] <= 0) delete h.stock[cid];
    if (!lotsOn()) return [];
    const L = h.lots[cid] ||= [], out = [];
    if (q > 0) { L.push([q, made ?? G.clock]); L.sort((a, b) => a[1] - b[1]); }
    else { let r = -q; while (r > 0 && L.length) { const k = Math.min(L[0][0], r); out.push([k, L[0][1]]); L[0][0] -= k; r -= k; if (!L[0][0]) L.shift(); } }
    if (!L.length) delete h.lots[cid];
    return out;
  };
  // Take n units off the front of a list of lots (oldest first); returns them as lots
  G.takeLots = (lots, n) => {
    const out = [];
    while (n > 0 && lots?.length) { const k = Math.min(lots[0][0], n); out.push([k, lots[0][1]]); lots[0][0] -= k; n -= k; if (!lots[0][0]) lots.shift(); }
    return out;
  };

  G.add = (p, cid, q, made) => change(p, cid, q, made);

  // ---------- Where a player's goods are ----------
  // Your own stockpile (p.stock) holds what you buy. With settings.businessStock, what a business
  // makes stays in that business's own stock (biz.stock) until you sell, deliver or use it.
  // Everything you own counts wherever it is: G.have / G.holdings add it all up, and G.take
  // takes from your businesses first (oldest first), then your own stockpile.
  G.addBiz = (biz, cid, q, made) => { biz.stock ||= {}; return change(biz, cid, q, made); };
  G.have = (st, p, cid) => (p.stock[cid] || 0) + st.businesses.reduce((s, b) => s + (b.owner === p.id && b.stock?.[cid] || 0), 0);
  G.holdings = (st, p) => {
    const h = { ...p.stock };
    st.businesses.forEach(b => { if (b.owner === p.id && b.stock) Object.entries(b.stock).forEach(([c, q]) => h[c] = (h[c] || 0) + q); });
    return h;
  };
  // Take q of a good. Returns where it came from, { [bizId]: n, me: n } ("me" = your own stockpile),
  // and the units taken as lots (when they were made).
  G.take = (st, p, cid, q) => {
    G.need(G.have(st, p, cid) >= q, `You only have ${G.have(st, p, cid)} ${G.COM[cid]?.name || cid}.`);
    const from = {}, lots = [];
    for (const b of st.businesses) {
      if (q <= 0) break;
      if (b.owner !== p.id || !b.stock?.[cid]) continue;
      const n = Math.min(q, b.stock[cid]); lots.push(...G.addBiz(b, cid, -n)); from[b.id] = n; q -= n;
    }
    if (q > 0) { lots.push(...G.add(p, cid, -q)); from.me = q; }
    lots.sort((a, b) => a[1] - b[1]);
    return { from, lots };
  };
  // Put goods back where they came from (a cancelled sell order). What doesn't fit back in its business
  // (or whose business is gone) goes to your own stockpile.
  // `lots`: when the units were made (they keep their age).
  G.giveBack = (st, p, cid, q, from = {}, lots = null) => {
    lots = lots ? lots.map(l => [...l]) : null;
    // Put n units into a holder, with their ages if we know them (any we don't count as made now)
    const put = (h, n, biz) => {
      const add = (k, made) => biz ? G.addBiz(h, cid, k, made) : G.add(h, cid, k, made);
      const got = lots ? G.takeLots(lots, n) : [];
      got.forEach(([k, made]) => add(k, made));
      const rest = n - got.reduce((x, l) => x + l[0], 0);
      if (rest > 0) add(rest);
    };
    for (const [k, n] of Object.entries(from)) {
      if (q <= 0) break;
      const m = Math.min(q, n), b = k !== "me" && st.businesses.find(x => x.id === +k && x.owner === p.id);
      const back = b ? Math.max(0, Math.min(m, G.bizRoom(b))) : 0;
      if (back) put(b, back, true);
      if (m - back) put(p, m - back, false);
      q -= m;
    }
    if (q > 0) put(p, q, false);
  };
  G.log = (st, msg, pid = null) => { if (st.drafting) return; st.log.push({ round: st.round, phase: st.phase, pid, msg }); if (st.log.length > 400) st.log.shift(); };
  const moneyFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }); // one shared formatter: toLocaleString is slow
  G.money = n => moneyFmt.format(Math.round(n * 100) / 100);
  G.myBusinesses = (st, pid) => st.businesses.filter(b => b.owner === pid);

  // The second free business that goes with a starting one, making a two-step chain:
  //   a mine, farm or well → the factory that uses its output most (then the fewest other inputs, then the simplest)
  //   a factory → a mine, farm or well there that makes one of its inputs (the most it needs)
  // Returns null if there's nothing that fits.
  G.starterPartner = (bizId, tid) => {
    const b = G.BIZ_BY[bizId];
    if (!b) return null;
    const share = f => f.inputs[b.makes] / Object.values(f.inputs).reduce((s, q) => s + q, 0);
    const others = f => Object.keys(f.inputs).filter(c => c !== b.makes && c !== "water").length;
    if (b.kind === "extract") return G.BIZ.filter(f => f.kind === "factory" && f.inputs[b.makes] && G.canBuildAt(f, tid))
      .sort((x, y) => share(y) - share(x) || others(x) - others(y) || G.tier(x.makes) - G.tier(y.makes))[0] || null;
    return G.BIZ.filter(e => e.kind === "extract" && b.inputs[e.makes] && G.canBuildAt(e, tid)).sort((x, y) => b.inputs[y.makes] - b.inputs[x.makes])[0] || null;
  };

  // ---------- A new game ----------
  // config.players: [{ name, colour, bot, start: territoryId, business: businessTypeId }]
  G.newGame = config => {
    const st = {
      version: 7, seed: config.seed ?? Math.floor(Math.random() * 1e9),
      round: 1, rounds: config.rounds ?? S.rounds, phase: "day", over: false,
      orders: {}, contracts: [],
      players: [], businesses: [], nextBizId: 1,
      log: [],
      stats: { runs: 0, idle: 0, overflow: 0 },
    };
    G.clock = st.round;
    config.players.forEach((c, i) => {
      st.players.push({ id: i + 1, name: c.name, colour: c.colour, bot: !!c.bot, strategy: c.strategy || "best",
        cash: S.startCash, space: S.startSpace, pos: c.start, stock: { ...S.startGoods },
        points: 0, delivered: 0, acted: false });
    });
    // Free starting businesses, where each player starts: the one they picked plus its partner,
    // so everyone begins with a small chain (see G.starterPartner)
    config.players.forEach((c, i) => {
      const b = G.BIZ_BY[c.business];
      if (!b || !G.canBuildAt(b, c.start)) return;
      const partner = S.startBusinesses > 1 ? G.starterPartner(b.id, c.start) : null;
      [b, partner].filter(Boolean).forEach(x =>
        st.businesses.push({ id: st.nextBizId++, owner: i + 1, type: x.id, territory: c.start, built: 0, cost: {} }));
      // A head start: one round's output of the mine, farm or well (a factory on its own: one run's inputs)
      const p = st.players[i];
      const mine = st.businesses.find(x => x.owner === p.id && x.type === b.id);
      if (b.kind === "extract") Object.entries(b.outputs).forEach(([cid, q]) => {
        const n = q;
        if (S.businessStock) G.addBiz(mine, cid, Math.min(n, S.businessSpace)); else G.add(p, cid, n);
      });
      else Object.entries(b.inputs).forEach(([cid, q]) => G.add(p, cid, q));
    });
    G.onSetup.forEach(f => f(st));
    G.log(st, `Game started with ${st.players.length} players. Round 1.`);
    G.botOrders(st);
    if (!G.waitingFor(st).length) G.resolve(st); // all computer players: play the whole game
    return st;
  };

  // ---------- One round: everyone orders, then it all happens at once ----------
  // Each round every player submits a list of orders, privately: trades, deliveries, and one move or build.
  // Once all have submitted, the orders are carried out together, then the night's automatic steps run
  // (game/pipeline.js: the auction, production, goods going off, new contracts).
  //   - Market orders go on the book; the night's auction matches them (game/market.js).
  //   - Moves: if two or more players move into the same territory, none of them gets in.
  // A copy of the game. The full order books kept for the replay (st.bookLog) are left out: computer
  // players copy the game every time they decide something, and don't need them.
  const clone = x => { const bl = x.bookLog; if (bl) delete x.bookLog; try { return JSON.parse(JSON.stringify(x)); } finally { if (bl) x.bookLog = bl; } };
  G.fail = msg => { throw new Error(msg); };
  G.need = (cond, msg) => { if (!cond) G.fail(msg); };

  // Carry out one action now. Used when resolving orders, and on draft copies of the game.
  G.act = (st, pid, name, args = {}) => {
    G.clock = st.round;
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

  // Everyone has submitted: carry out the orders, then run the automatic steps, and start the next round.
  G.resolve = st => {
    let guard = 0;
    do {
      G.clock = st.round;
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
      st.players.forEach(p => (st.orders[p.id] || []).forEach(o => {
        if (o.name === "move" && bounced.has(p.id)) return;
        G.act(st, p.id, o.name, o.args);
      }));
      st.orders = {};
      st.phase = "night"; G.steps.night.forEach(f => f(st));
      if (st.round >= st.rounds) { st.over = true; st.phase = "over"; G.log(st, "Game over."); return; }
      st.round++; st.phase = "day";
      st.players.forEach(p => { p.acted = false; });
      G.log(st, `Round ${st.round}.`);
      G.botOrders(st);
    } while (!st.over && !G.waitingFor(st).length && guard++ < 10000);
  };

  // Computer players decide on a draft copy of the game; whatever they did there becomes their orders.
  G.botOrders = st => {
    G.clock = st.round;
    st.players.filter(p => p.bot && !st.orders[p.id]).forEach(p => {
      const c = clone(st); c.log = []; c.recording = []; c.drafting = true;
      // Bots think of everything they own as one pile; their orders still work on the real game,
      // where G.take finds the goods wherever they are
      const cp = G.player(c, p.id);
      c.businesses.forEach(b => { if (b.owner === p.id && b.stock) { Object.entries(b.stock).forEach(([g, q]) => G.add(cp, g, q)); b.stock = {}; } });
      const bot = G.bots[st.phase];
      if (bot) bot(c, G.player(c, p.id));
      st.orders[p.id] = c.recording;
      p.mem = cp.mem; p.plan = cp.plan; // the bot's private memory carries over
    });
  };

  // ---------- Score ----------
  // Points win. Cash (including cash locked in buy orders) breaks ties.
  G.totalCash = (st, p) => p.cash + G.lockedCash(st, p);
  G.ranking = st => [...st.players].sort((a, b) => b.points - a.points || G.totalCash(st, b) - G.totalCash(st, a));

  return G;
})();
