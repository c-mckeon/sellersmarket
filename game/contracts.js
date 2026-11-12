// Sellers Market game engine: contracts, the way to earn money. The first to the goal (settings.goal, €5000) wins.
//
// Contracts arrive on a board, the same for everyone: settings.contracts.start at first, then 0 to 2 new ones
// a night (settings.contracts.perRound), up to settings.contracts.open at once. Each says:
// "deliver these goods". Players bid what they'd want to be paid for it; bids are sealed until the
// night, when the lowest bid so far is shown (not who made it).
//   bid       { contract, amount }   any time you order; a new bid must be lower than your last one
//   deliver   { contract }           a contract you've won: the goods leave your stockpile and you're paid your bid
// After settings.contracts.bidRounds rounds the lowest bid wins (a tie: the earlier bid). A player can hold
// settings.contracts.maxHeld contracts at once; one who's full is skipped. No bids: it's replaced.
// The winner has settings.contracts.deliverRounds rounds to deliver. If they don't, they pay legal fees:
// failFee.base + failFee.share × their bid, and the contract is gone.
//
// A contract is for a real job (js/projects.js) and asks for its goods, a few of each: some are simple,
// some complex, and bidding sets what each is worth. The client pays at most a cap (shown on the board), from what's in it:
//   cap = raw-material units × capPerRawUnit × (1 + tierBonus × average processing steps)

(() => {
  const G = SMG, S = GAME_SETTINGS, C = S.contracts;

  // Raw-material units in one unit of a good (water counts a third, a by-product half)
  const rawMemo = {};
  G.rawUnits = id => {
    if (id in rawMemo) return rawMemo[id];
    const c = G.COM[id];
    if (c.type === "raw") return (rawMemo[id] = id === "water" ? 1 / 3 : 1);
    if (c.type === "waste") return (rawMemo[id] = 0.5);
    const r = RECIPES.find(x => Object.keys(x.out)[0] === id);
    return (rawMemo[id] = Object.entries(r.in).reduce((s, [i, q]) => s + q * G.rawUnits(i), 0) / r.out[id]);
  };

  // The raw materials a good needs, all the way down
  const rawsMemo = {};
  G.rawsOf = id => {
    if (rawsMemo[id]) return rawsMemo[id];
    const c = G.COM[id];
    if (c.type === "raw") return (rawsMemo[id] = [id]);
    const r = RECIPES.find(x => Object.keys(x.out)[0] === id || (c.type === "waste" && x.out[id]));
    return (rawsMemo[id] = [...new Set(Object.keys(r.in).flatMap(G.rawsOf))]);
  };

  // Steps between territories (land and sea both count)
  const distMemo = {};
  G.distances = from => {
    if (distMemo[from]) return distMemo[from];
    const d = { [from]: 0 }, q = [from];
    while (q.length) { const t = q.shift(); G.neighbours(t).forEach(n => { if (!(n in d)) { d[n] = d[t] + 1; q.push(n); } }); }
    return (distMemo[from] = d);
  };
  // Where each raw material can be produced
  const sourcesOf = G.sourcesOf;

  // Raw goods a contract can ask for: any with a source on the map (only settings.contracts.raws, if set)
  G.contractRaws = () => COMMODITIES.filter(c => c.type === "raw" && sourcesOf(c.id).length && (!C.raws || C.raws.includes(c.id))).map(c => c.id);

  // Starting places for n players, spread across the map so the economy has its raw materials:
  // each player gets a different regional raw material (from the ones contracts ask for), starts in
  // a territory that has it (never next to another player, if it can be helped) and begins with
  // that mine. rng: { seed } for G.rand. Returns [{ start, business }].
  G.spreadStarts = (n, rng) => {
    const raws = [...(S.contracts.raws || G.contractRaws())];
    const picks = [], taken = new Set();
    for (let i = 0; i < n; i++) {
      const pool = raws.filter(r => !picks.some(x => x.raw === r));
      const raw = pool.length ? pool[Math.floor(G.rand(rng) * pool.length)] : raws[Math.floor(G.rand(rng) * raws.length)];
      const mine = G.BIZ.find(b => b.kind === "extract" && b.makes === raw);
      const spots = TERRITORIES.filter(t => !t.sea && mine && G.canBuildAt(mine, t.id) && !taken.has(t.id));
      const free = spots.filter(t => !G.neighbours(t.id).some(x => taken.has(x)));
      const list = (free.length ? free : spots).map(t => t.id);
      const start = list.length ? list[Math.floor(G.rand(rng) * list.length)] : G.pick(rng, TERRITORIES.filter(t => !t.sea).map(t => t.id));
      taken.add(start);
      picks.push({ raw, start, business: mine && G.canBuildAt(mine, start) ? mine.id : G.buildable(start)[0]?.id });
    }
    return picks.map(({ start, business }) => ({ start, business }));
  };

  // The jobs that can be done on this map (every good has a source), by how many goods they ask for
  const doable = () => PROJECTS.filter(([, , goods]) => goods.every(id => G.rawsOf(id).every(raw => sourcesOf(raw).length)));
  G.newContract = st => {
    // How many different goods: from settings.contracts.goodsPerContract, then a job with that many
    // (a job already on the board is much less likely, so the board has variety)
    const [lo, hi] = C.goodsPerContract, [qlo, qhi] = C.unitsPerGood, jobs = doable();
    const n = lo + Math.floor(G.rand(st) * (hi - lo + 1));
    const onBoard = new Set((st.contracts || []).map(k => k.name));
    const pool = jobs.filter(j => j[2].length === n).length ? jobs.filter(j => j[2].length === n) : jobs;
    const weight = j => onBoard.has(j[0]) ? 0.1 : 1, total = pool.reduce((s, j) => s + weight(j), 0);
    let r = G.rand(st) * total, job = pool[0];
    for (const j of pool) { r -= weight(j); if (r <= 0) { job = j; break; } }
    const [name, icon, list] = job, goods = {};
    list.forEach(id => goods[id] = qlo + Math.floor(G.rand(st) * (qhi - qlo + 1)));
    const raw = list.reduce((s, id) => s + goods[id] * G.rawUnits(id), 0), avgT = list.reduce((s, id) => s + G.tier(id), 0) / list.length;
    st.nextContractId = (st.nextContractId || 0) + 1;
    return { id: st.nextContractId, name, icon, goods, cap: Math.max(10, Math.round(raw * C.capPerRawUnit * (1 + (C.tierBonus || 0) * avgT))), drawn: st.round, bids: [] };
  };

  // Contracts coming next, drawn ahead of time (st.upcoming) so the "inside line" card can show them exactly.
  // G.nextContract takes the next one (stamped with the round it goes on the board).
  G.upcoming = (st, n) => { st.upcoming ||= []; while (st.upcoming.length < n) st.upcoming.push(G.newContract(st)); return st.upcoming.slice(0, n); };
  G.nextContract = st => { G.upcoming(st, 1); const k = st.upcoming.shift(); k.drawn = st.round; k.bids = []; return k; };

  // The lowest bid on a board contract so far (public once the night has passed), or null
  G.lowestBid = k => k.bids.reduce((m, b) => !m || b.amount < m.amount || (b.amount === m.amount && b.round < m.round) ? b : m, null);
  // Rounds of bidding left on a board contract, counting this one
  G.bidRoundsLeft = (st, k) => C.bidRounds - (st.round - k.drawn);
  // Legal fees for not delivering a contract won at `price`
  G.failFee = price => Math.round((C.failFee.base || 0) + (C.failFee.share || 0) * price);

  // Night: settle deadlines, award contracts whose bidding has closed, and fill the board back up
  const night = st => {
    st.contracts ||= [];
    // Not delivered in time: legal fees
    st.players.forEach(p => (p.contracts ||= []).filter(k => st.round >= k.due).forEach(k => {
      const fee = k.noFee ? 0 : G.failFee(k.price), item = G.contractItem(k); // (good lawyers: no fee)
      p.cash -= fee; p.failed = (p.failed || 0) + 1; p.fees = (p.fees || 0) + fee;
      st.stats.failed = (st.stats.failed || 0) + 1;
      p.contracts = p.contracts.filter(x => x !== k);
      G.log(st, `didn't deliver ${item.icon} ${item.name} in time: paid ${G.money(fee)} in legal fees`, p.id);
    }));
    // Bidding closed: the lowest bid from someone with room wins (a tie: the earlier bid); no bids, it's replaced
    st.contracts.filter(k => G.bidRoundsLeft(st, k) <= 1).forEach(k => {
      const item = G.contractItem(k);
      const order = [...k.bids].sort((a, b) => a.amount - b.amount || a.round - b.round || a.seq - b.seq);
      const win = order.find(b => (G.player(st, b.pid).contracts || []).length < C.maxHeld);
      st.contracts = st.contracts.filter(x => x !== k);
      if (!win) { G.log(st, `Nobody ${k.bids.length ? "with room " : ""}bid for ${item.icon} ${item.name}: it's off the board.`); return; }
      const p = G.player(st, win.pid);
      (p.contracts ||= []).push({ id: k.id, name: k.name, icon: k.icon, goods: k.goods, cap: k.cap, price: win.amount, won: st.round, due: st.round + C.deliverRounds });
      st.stats.won = (st.stats.won || 0) + 1;
      (st.stats.winning ||= []).push({ price: win.amount, cap: k.cap, bids: k.bids.length, goods: k.goods, round: st.round }); // for the simulator
      G.log(st, `${p.name} won ${item.icon} ${item.name} for ${G.money(win.amount)} (${k.bids.length} bid${k.bids.length === 1 ? "" : "s"})`);
    });
    // New contracts: a few at the start, then 0 to 2 a night, up to the most the board holds
    const [lo, hi] = C.perRound || [1, 1];
    const n = st.round === 1 && st.phase !== "night" ? C.start ?? C.open : lo + Math.floor(G.rand(st) * (hi - lo + 1));
    for (let i = 0; i < n && st.contracts.length < C.open; i++) st.contracts.push(G.nextContract(st));
    G.upcoming(st, 2); // the next ones are drawn ahead, so a card can show them
  };
  G.onSetup.push(night);
  G.refillContracts = night;

  // What a contract is for: its job's name and icon (js/projects.js)
  G.contractItem = k => ({ name: k.name || "Order", icon: k.icon || "📦" });

  const open = st => G.need(st.phase === "day", "Not right now.");
  G.canDeliver = (st, p, k) => Object.entries(k.goods).every(([c, q]) => G.have(st, p, c) >= q);
  // How many contracts ask for a good: on the board and held by anyone (public)
  G.demand = (st, id) => (st.contracts || []).filter(k => k.goods[id]).length + st.players.reduce((n, p) => n + (p.contracts || []).filter(k => k.goods[id]).length, 0);

  G.actions.bid = (st, p, { contract, amount }) => {
    open(st);
    const k = (st.contracts || []).find(x => x.id === contract);
    G.need(k, "That contract isn't on the board any more.");
    amount = Math.round(+amount);
    G.need(amount >= 1 && amount <= k.cap, `Bid a whole number from 1 to ${G.money(k.cap)} (the most the client will pay).`);
    G.need((p.contracts || []).length < C.maxHeld, `You already hold ${C.maxHeld} contracts: deliver one before bidding again.`);
    const mine = k.bids.find(b => b.pid === p.id);
    G.need(!mine || amount < mine.amount, `You've bid ${G.money(mine?.amount)} already: a new bid has to be lower.`);
    st.bidSeq = (st.bidSeq || 0) + 1;
    k.bids = k.bids.filter(b => b.pid !== p.id).concat({ pid: p.id, amount, round: st.round, seq: st.bidSeq });
    return null; // sealed until the night
  };

  G.actions.deliver = (st, p, { contract }) => {
    open(st);
    const k = (p.contracts || []).find(x => x.id === contract);
    G.need(k, "That isn't one of your contracts.");
    const short = Object.entries(k.goods).filter(([c, q]) => G.have(st, p, c) < q);
    G.need(!short.length, `You're short of ${short.map(([c, q]) => `${q - G.have(st, p, c)} ${G.COM[c].name}`).join(", ")} (goods on offer don't count).`);
    Object.entries(k.goods).forEach(([c, q]) => G.take(st, p, c, q));
    p.contracts = p.contracts.filter(x => x !== k);
    p.cash += k.price; p.delivered = (p.delivered || 0) + 1; p.earned = (p.earned || 0) + k.price;
    st.stats.delivered = (st.stats.delivered || 0) + 1;
    { const d = (st.stats.deliveredGoods ||= {})[p.id] ||= {}; Object.entries(k.goods).forEach(([c, q]) => d[c] = (d[c] || 0) + q); } // for the simulator
    const item = G.contractItem(k);
    (p.made ||= []).push({ ...item, price: k.price, round: st.round }); // the shelf of things you've made (display only)
    const card = G.drawCard ? G.drawCard(st, p) : null;
    return `delivered ${item.icon} ${item.name} and was paid ${G.money(k.price)}${card ? `, and drew a card` : ""}`;
  };
})();
