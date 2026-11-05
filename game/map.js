// Sellers Market game engine: the map. Moving and building.
//
// Afternoon: each player may do ONE of these:
//   - move their pawn to a neighbouring territory (land or sea)
//   - build a business in the territory they're standing in
// Build cost = base cost × territory cost level × (1 + 25% × businesses already there)

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
  // pid: the player building (their own businesses add S.ownedCostStep each)
  G.buildCost = (st, b, tid, pid) => {
    const list = st.costBasis || st.businesses; // while orders resolve, prices are as at the start of the afternoon
    const n = list.filter(x => x.territory === tid).length;
    const owned = pid ? list.filter(x => x.owner === pid).length : 0;
    return Math.round(b.base * S.buildCostScale * (TERRITORY_INFO[tid].cost ?? 1) * (1 + BUILD.crowding * n) * (1 + S.ownedCostStep * owned));
  };
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
    const cost = G.buildCost(st, b, p.pos, p.id);
    G.need(p.cash >= cost, `It costs ${cost}; you have ${G.money(p.cash)}.`);
    p.cash -= cost; p.acted = true; G.book(st, p, "Building", -cost);
    st.businesses.push({ id: st.nextBizId++, owner: p.id, type: b.id, territory: p.pos, built: st.round, cost });
    return `built a ${b.name.toLowerCase()} in ${G.TERR[p.pos].name} for ${cost}`;
  };
})();
