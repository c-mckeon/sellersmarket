// Sellers Market game engine: contracts, the only way to score.
//
// There are always settings.contracts.open contracts on the board, the same for everyone:
// "deliver these goods, get these points". It's a race: the first player to deliver a whole contract
// gets its points. (Two or more delivering the same one in the same round split the points, rounded up.)
//   deliver   { contract }   any time you order: the goods leave your stockpile (goods on offer don't count)
// At night, delivered contracts pay out and are replaced, and so is any nobody has filled in
// settings.contracts.life rounds.
//
// A contract asks for 3 or 4 different goods, a few of each (about settings.contracts.units in all).
// Some goods can be raw materials (settings.contracts.rawShare), so mines and farms have buyers too.
//   points = raw-material units in it × pointsPerUnit × (1 + tierBonus × average processing steps),
//   so made goods pay more than raw ones

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
  G.distanceOf = (id, from) => {
    const d = G.distances(from);
    return Math.max(0, ...G.rawsOf(id).map(raw => { const src = sourcesOf(raw); return src.length ? Math.min(...src.map(t => d[t] ?? 99)) : 0; }));
  };
  // Goods that can't be made at all on this map (a raw material with no source) never appear
  G.contractGoods = () => C.goods.filter(id => G.rawsOf(id).every(raw => { const s = sourcesOf(raw); return s.length; }));

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

  G.newContract = st => {
    // Goods already on the board are less likely, so the contracts ask for different things
    const onBoard = new Set((st.contracts || []).flatMap(k => Object.keys(k.goods)));
    const weight = id => onBoard.has(id) ? 0.3 : 1;
    let pool = G.contractGoods(), raws = C.rawShare ? G.contractRaws() : [];
    const [lo, hi] = C.goodsPerContract;
    const n = lo + Math.floor(G.rand(st) * (hi - lo + 1));
    const goods = {};
    for (let i = 0; i < n && pool.length; i++) {
      // Each good on the contract is a raw one with chance settings.contracts.rawShare
      const from = raws.length && G.rand(st) < C.rawShare ? raws : pool;
      const total = from.reduce((s, id) => s + weight(id), 0);
      let r = G.rand(st) * total, pick = from[0];
      for (const id of from) { r -= weight(id); if (r <= 0) { pick = id; break; } }
      // A few of each: about units ÷ goods, give or take one
      goods[pick] = Math.max(2, Math.round(C.units / n + (G.rand(st) - 0.5) * 2));
      pool = pool.filter(x => x !== pick); raws = raws.filter(x => x !== pick);
    }
    const ids = Object.keys(goods);
    const raw = ids.reduce((s, id) => s + goods[id] * G.rawUnits(id), 0), avgT = ids.reduce((s, id) => s + G.tier(id), 0) / ids.length;
    st.nextContractId = (st.nextContractId || 0) + 1;
    return { id: st.nextContractId, goods, points: Math.max(1, Math.round(raw * C.pointsPerUnit * (1 + (C.tierBonus || 0) * avgT))), drawn: st.round, takers: [] };
  };

  // Night: pay out delivered contracts, retire stale ones, and fill the board back up
  const refill = st => {
    st.contracts ||= [];
    st.contracts.filter(k => k.takers.length).forEach(k => {
      const each = Math.ceil(k.points / k.takers.length), item = G.contractItem(k);
      k.takers.forEach(pid => {
        const p = G.player(st, pid);
        p.points += each; p.delivered = (p.delivered || 0) + 1;
        (p.made ||= []).push({ ...item, points: each, round: st.round }); // the shelf of things you've made (display only)
        st.stats.delivered = (st.stats.delivered || 0) + 1;
        G.log(st, `produced ${/^[AEIOU]/.test(item.name) ? "an" : "a"} ${item.name.toLowerCase()} ${item.icon} for ${each} points${k.takers.length > 1 ? ` (shared with ${k.takers.length - 1} other${k.takers.length > 2 ? "s" : ""})` : ""}`, pid);
      });
    });
    const stale = st.contracts.filter(k => !k.takers.length && st.round - k.drawn + 1 >= C.life);
    if (stale.length) G.log(st, `Nobody delivered the ${stale.map(k => G.contractItem(k).name.toLowerCase()).join(", ")}: ${stale.length === 1 ? "it's" : "they're"} off the board.`);
    st.contracts = st.contracts.filter(k => !k.takers.length && !stale.includes(k));
    while (st.contracts.length < C.open) { const k = G.newContract(st); st.contracts.push(k); }
  };
  G.onSetup.push(st => { st.players.forEach(p => p.home = p.pos); refill(st); });
  G.refillContracts = refill;

  // What a contract makes: a name and emoji for the thing its goods could build. Cosmetic only: the main
  // good (most processed, then biggest) picks the thing, the next one says what it's made of, and the
  // contract's id picks among the options, so a contract always keeps its name.
  const ITEMS = {
    steel:     ["Steel",       [["bridge", "🌉"], ["locomotive", "🚂"], ["steamship", "🚢"], ["crane", "🏗️"]]],
    iron:      ["Cast-iron",   [["stove", "🔥"], ["anvil", "⚒️"], ["railway", "🛤️"], ["bell", "🔔"]]],
    cement:    ["Concrete",    [["dam", "🌊"], ["lighthouse", "🗼"], ["harbour wall", "⚓"], ["stadium", "🏟️"]]],
    paper:     ["Paper",       [["atlas", "🗺️"], ["newspaper", "📰"], ["kite", "🪁"], ["library", "📚"]]],
    bread:     ["Harvest",     [["banquet", "🍽️"], ["bakery", "🥖"], ["picnic", "🧺"]]],
    glass:     ["Glass",       [["greenhouse", "🪴"], ["lantern", "🏮"], ["telescope", "🔭"], ["chandelier", "💡"]]],
    ceramic:   ["Porcelain",   [["tea set", "🫖"], ["vase", "🏺"], ["bathhouse", "🛁"]]],
    lumber:    ["Timber",      [["barn", "🛖"], ["sailing ship", "⛵"], ["cabin", "🏡"], ["windmill", "🌬️"]]],
    flour:     ["Baker's",     [["cake", "🎂"], ["pastry shop", "🥐"], ["noodle bar", "🍜"]]],
    wood:      ["Wooden",      [["rowing boat", "🛶"], ["toy box", "🧸"], ["cart", "🛒"]]],
    sand:      ["Sand-cast",   [["hourglass", "⏳"], ["sandcastle", "🏰"]]],
    clay:      ["Terracotta",  [["brick oven", "🧱"], ["pottery", "🏺"]]],
    limestone: ["Limestone",   [["cathedral", "⛪"], ["monument", "🗿"]]],
    coal:      ["Coal-fired",  [["forge", "🔥"], ["steam engine", "🚂"]]],
    iron_ore:  ["Ironstone",   [["foundry", "🏭"], ["mine cart", "⛏️"]]],
    wheat:     ["Wheat",       [["haystack", "🌾"], ["granary", "🏚️"]]],
    water:     ["Spring",      [["fountain", "⛲"], ["well", "🪣"]]],
  };
  const FOOD = new Set(["flour", "bread", "wheat"]);
  G.contractItem = k => {
    // Food only names the thing when the contract is all food (no "baker's lighthouse")
    const keys = Object.keys(k.goods), solid = keys.filter(c => !FOOD.has(c));
    const ids = (solid.length ? solid : keys).sort((a, b) => G.tier(b) - G.tier(a) || k.goods[b] * G.rawUnits(b) - k.goods[a] * G.rawUnits(a) || a.localeCompare(b));
    const main = ITEMS[ids[0]], things = main ? main[1] : [["works", "📦"]];
    const [thing, icon] = things[k.id % things.length];
    const by = ids.slice(1).map(c => ITEMS[c]?.[0]).find(Boolean); // what it is made of, from the other goods
    const name = by ? `${by} ${thing}` : thing;
    return { name: name[0].toUpperCase() + name.slice(1), icon };
  };

  const open = st => G.need(st.phase === "day", "Not right now.");
  G.canDeliver = (st, p, k) => Object.entries(k.goods).every(([c, q]) => G.have(st, p, c) >= q);
  // How many open contracts ask for a good (public: everyone sees the board)
  G.demand = (st, id) => (st.contracts || []).filter(k => !k.takers.length && k.goods[id]).length;

  G.actions.deliver = (st, p, { contract }) => {
    open(st);
    const k = (st.contracts || []).find(x => x.id === contract);
    G.need(k, "That contract isn't on the board.");
    G.need(!k.takers.includes(p.id), "You've already delivered it.");
    const short = Object.entries(k.goods).filter(([c, q]) => G.have(st, p, c) < q);
    G.need(!short.length, `You're short of ${short.map(([c, q]) => `${q - G.have(st, p, c)} ${G.COM[c].name}`).join(", ")} (goods on offer don't count).`);
    Object.entries(k.goods).forEach(([c, q]) => G.take(st, p, c, q));
    k.takers.push(p.id); // paid tonight (shared if someone else delivers it this round too)
    { const d = (st.stats.deliveredGoods ||= {})[p.id] ||= {}; Object.entries(k.goods).forEach(([c, q]) => d[c] = (d[c] || 0) + q); } // for the simulator
    return `delivered the ${G.contractItem(k).name.toLowerCase()} ${G.contractItem(k).icon}`;
  };
})();
