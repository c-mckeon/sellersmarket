// Sellers Market game engine: the map. Moving and building.
//
// Afternoon: each player may do ONE of these:
//   - move their pawn to a neighbouring territory (land or sea)
//   - build a business in the territory they're standing in
// Building is paid in goods, not cash (settings.build):
//   crates = base cost × territory cost level × (1 + 25% × businesses already there)
//            × (1 + 15% × businesses you own) ÷ value per crate
//   paid in any building materials (settings.build.materials: lumber, iron, ceramic, cement, glass…);
//   big factories need half of it in heavy ones (steel, glass, concrete, aluminium).
//   The game picks which of your materials to use: see G.payFor.

(() => {
  const G = SMG, S = GAME_SETTINGS;

  G.canBuildAt = (b, tid) => {
    const info = TERRITORY_INFO[tid];
    if (b.where === "sea") return G.isSea(tid) && !!info.res[b.makes];
    if (G.isSea(tid)) return false;
    if (b.where === "res") return !!info.res[b.makes];
    if (b.where === "oil") return G.coastal(tid) || !!info.res.crude_oil;
    return true;
  };
  // pid: the player building (their own businesses add settings.build.ownedCostStep each)
  // Returns the goods it takes: { lumber: 3, iron: 2 }
  G.bizTier = b => b.kind === "extract" ? 0 : G.tier(b.makes);
  // Businesses per territory and per owner, remembered until the list grows
  const countMemo = new WeakMap();
  const counts = list => {
    let c = countMemo.get(list);
    if (c && c.len === list.length) return c;
    c = { len: list.length, here: {}, owns: {} };
    list.forEach(x => { c.here[x.territory] = (c.here[x.territory] || 0) + 1; c.owns[x.owner] = (c.owns[x.owner] || 0) + 1; });
    countMemo.set(list, c);
    return c;
  };
  // What a business costs: { crates, heavy } — crates of any building material, of which at least
  // `heavy` must be heavy materials (big factories only)
  G.buildCost = (st, b, tid, pid) => {
    const list = st.costBasis || st.businesses; // while orders resolve, costs are as at the start of the afternoon
    const { here, owns } = counts(list);
    const n = here[tid] || 0;
    const owned = pid ? owns[pid] || 0 : 0;
    const crates = Math.max(1, Math.round(b.base * (TERRITORY_INFO[tid].cost ?? 1) * (1 + BUILD.crowding * n) * (1 + S.build.ownedCostStep * owned) / S.build.valuePerCrate));
    const H = S.build.heavy;
    return { crates, heavy: G.bizTier(b) >= H.fromTier ? Math.ceil(crates * H.share) : 0 };
  };
  G.MATERIALS = Object.keys(S.build.materials);
  G.isMaterial = c => c in S.build.materials;
  G.needText = need => `${need.crates} crate${need.crates === 1 ? "" : "s"} of building materials${need.heavy ? ` (${need.heavy} heavy)` : ""}`;
  G.costText = cost => Object.entries(cost).map(([c, q]) => `${q} ${G.COM[c].name}`).join(" + ");

  // Which of the player's materials would pay for `need`. Uses up, in this order: materials none of their
  // contracts ask for, then the cheapest per crate at the last traded price (never traded counts as free),
  // then whatever they hold most of. Heavy crates are covered first, from heavy materials.
  // Returns { pay: { good: qty }, short, heavyShort } (short: crates still uncovered).
  G.payFor = (st, p, need) => {
    const M = S.build.materials, inContract = new Set(p.contracts.flatMap(k => Object.keys(k.goods)));
    const left = { ...p.stock }, pay = {};
    const order = list => list.filter(c => left[c] > 0).sort((a, b) => inContract.has(a) - inContract.has(b)
      || (st.prices[a] || 0) / M[a] - (st.prices[b] || 0) / M[b] || left[b] - left[a]);
    const take = (list, crates) => {
      for (const c of order(list)) {
        if (crates <= 1e-9) break;
        const n = Math.min(left[c], Math.ceil(crates / M[c] - 1e-9));
        left[c] -= n; pay[c] = (pay[c] || 0) + n; crates -= n * M[c];
      }
      return Math.max(0, crates);
    };
    const heavyShort = take(S.build.heavy.goods, need.heavy);
    const paid = Object.entries(pay).reduce((s, [c, q]) => s + q * M[c], 0);
    const rest = take(G.MATERIALS, Math.max(0, need.crates - paid - heavyShort)); // heavy shortfall can't be covered by others
    return { pay, short: Math.ceil(rest + heavyShort - 1e-9), heavyShort: Math.ceil(heavyShort - 1e-9) };
  };
  G.canPay = (st, p, need) => G.payFor(st, p, need).short === 0;
  G.buildable = (st, tid, pid) => G.BIZ.filter(b => G.canBuildAt(b, tid)).map(b => ({ b, cost: G.buildCost(st, b, tid, pid) }));

  const afternoon = (st, p) => {
    G.need(st.phase === "afternoon", "You can only move or build in the afternoon.");
    G.need(!p.acted, "You've already moved or built this afternoon.");
  };

  G.actions.move = (st, p, { to }) => {
    afternoon(st, p);
    G.need(G.neighbours(p.pos).includes(to), `${G.TERR[to].name} isn't next to ${G.TERR[p.pos].name}.`);
    p.pos = to; p.acted = true;
    return `moved to ${G.TERR[to].name}`;
  };

  G.actions.build = (st, p, { type }) => {
    afternoon(st, p);
    const b = G.BIZ_BY[type];
    G.need(b, "Unknown business.");
    G.need(G.canBuildAt(b, p.pos), `A ${b.name.toLowerCase()} can't be built in ${G.TERR[p.pos].name}.`);
    const need = G.buildCost(st, b, p.pos, p.id), { pay, short, heavyShort } = G.payFor(st, p, need);
    G.need(!short, `It takes ${G.needText(need)}. You're ${short} crate${short === 1 ? "" : "s"} short${heavyShort ? `, ${heavyShort} of them heavy (${S.build.heavy.goods.map(c => G.COM[c].name.toLowerCase()).join(", ")})` : ""} (goods on offer don't count).`);
    Object.entries(pay).forEach(([c, q]) => G.add(p, c, -q));
    p.acted = true;
    st.businesses.push({ id: st.nextBizId++, owner: p.id, type: b.id, territory: p.pos, built: st.round, cost: pay });
    return `built a ${b.name.toLowerCase()} in ${G.TERR[p.pos].name} from ${G.costText(pay)}`;
  };
})();
