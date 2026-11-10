// Sellers Market game engine: contracts, the only way to score.
//
// Each player holds a few secret contracts: "deliver these goods, get these points".
//   deliver          { contract }   any phase: the goods leave your stockpile (goods on offer don't count)
//   discardContract  { contract }   once a round
// Delivered and discarded contracts are replaced overnight.
//
// Contracts lean towards goods made far from home, so everyone has to trade. Some goods can be raw
// materials (settings.contracts.rawShare), so mines and farms have buyers from the first round.
//
//   distance of a good = steps from your home territory to the nearest source of the raw material
//                        it needs that's furthest away (water and anything that can be made anywhere = 0)
//   chance of a good   ∝ (1 + distance)²
//   size               = settings.contracts.size raw-material units, split between its goods
//   points             = raw units × pointsPerUnit × (1 + distanceBonus × average distance)
//                        × (1 + tierBonus × average processing steps), so made goods pay more than raw ones

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

  G.newContract = (st, p) => {
    const home = p.home || p.pos;
    let pool = G.contractGoods().map(id => ({ id, d: G.distanceOf(id, home) }));
    let raws = (C.rawShare ? G.contractRaws() : []).map(id => ({ id, d: G.distanceOf(id, home) }));
    const [lo, hi] = C.goodsPerContract;
    const k = lo + Math.floor(G.rand(st) * (hi - lo + 1));
    const chosen = [];
    for (let i = 0; i < k && pool.length; i++) {
      // Each good on the contract is a raw one with chance settings.contracts.rawShare
      const from = raws.length && C.rawShare && G.rand(st) < C.rawShare ? raws : pool;
      const total = from.reduce((s, x) => s + (1 + x.d) ** (C.distancePower ?? 2), 0);
      let r = G.rand(st) * total, pick = from[0];
      for (const x of from) { r -= (1 + x.d) ** (C.distancePower ?? 2); if (r <= 0) { pick = x; break; } }
      chosen.push(pick); pool = pool.filter(x => x !== pick); raws = raws.filter(x => x !== pick);
    }
    const goods = {};
    let raw = 0;
    chosen.forEach(x => goods[x.id] = Math.max(1, Math.round(C.size / chosen.length / G.rawUnits(x.id))));
    // Never more units than settings.contracts.maxUnits in all, so it fits in a stockpile
    const units = Object.values(goods).reduce((s, q) => s + q, 0);
    if (C.maxUnits && units > C.maxUnits) Object.keys(goods).forEach(id => goods[id] = Math.max(1, Math.floor(goods[id] * C.maxUnits / units)));
    chosen.forEach(x => raw += goods[x.id] * G.rawUnits(x.id));
    const avgD = chosen.reduce((s, x) => s + x.d, 0) / chosen.length, avgT = chosen.reduce((s, x) => s + G.tier(x.id), 0) / chosen.length;
    st.nextContractId = (st.nextContractId || 0) + 1;
    return { id: st.nextContractId, goods, points: Math.max(1, Math.round(raw * C.pointsPerUnit * (1 + C.distanceBonus * avgD) * (1 + (C.tierBonus || 0) * avgT))), drawn: st.round };
  };

  const refill = st => st.players.forEach(p => { while (p.contracts.length < C.hand) p.contracts.push(G.newContract(st, p)); });
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
  // Public demand: how many players hold a contract that asks for a good (not who, how many or for what).
  // except: leave this player out (so you see what others want).
  G.demand = (st, id, except = null) => st.players.filter(p => p.id !== except && p.contracts.some(k => k.goods[id])).length;

  G.actions.deliver = (st, p, { contract }) => {
    open(st);
    const k = p.contracts.find(x => x.id === contract);
    G.need(k, "You don't hold that contract.");
    const short = Object.entries(k.goods).filter(([c, q]) => G.have(st, p, c) < q);
    G.need(!short.length, `You're short of ${short.map(([c, q]) => `${q - G.have(st, p, c)} ${G.COM[c].name}`).join(", ")} (goods on offer don't count).`);
    Object.entries(k.goods).forEach(([c, q]) => G.take(st, p, c, q));
    p.points += k.points; p.delivered = (p.delivered || 0) + 1;
    { const d = (st.stats.deliveredGoods ||= {})[p.id] ||= {}; Object.entries(k.goods).forEach(([c, q]) => d[c] = (d[c] || 0) + q); } // for the simulator
    p.contracts = p.contracts.filter(x => x !== k);
    st.stats.delivered = (st.stats.delivered || 0) + 1;
    const item = G.contractItem(k);
    (p.made ||= []).push({ ...item, points: k.points, round: st.round }); // the shelf of things you've made (display only)
    return `produced ${/^[AEIOU]/.test(item.name) ? "an" : "a"} ${item.name.toLowerCase()} ${item.icon} for ${k.points} points`;
  };

  G.actions.discardContract = (st, p, { contract }) => {
    open(st);
    G.need(p.discardRound !== st.round, "You've already thrown a contract away this round.");
    const k = p.contracts.find(x => x.id === contract);
    G.need(k, "You don't hold that contract.");
    p.contracts = p.contracts.filter(x => x !== k);
    p.discardRound = st.round;
    return null;
  };
})();
