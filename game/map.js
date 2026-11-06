// Sellers Market game engine: the map. Moving and building.
//
// Afternoon: each player may do ONE of these:
//   - move their pawn to a neighbouring territory (land or sea)
//   - build a business in the territory they're standing in
// Building is paid in goods, not cash (settings.build):
//   crates = base cost × territory cost level × (1 + 25% × businesses already there)
//            × (1 + 15% × businesses you own) ÷ value per crate
//   split between materials by the business's tier: mines need lumber; big factories need steel, glass, concrete.

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
  G.buildCost = (st, b, tid, pid) => {
    const list = st.costBasis || st.businesses; // while orders resolve, costs are as at the start of the afternoon
    const n = list.filter(x => x.territory === tid).length;
    const owned = pid ? list.filter(x => x.owner === pid).length : 0;
    const crates = Math.max(1, Math.round(b.base * (TERRITORY_INFO[tid].cost ?? 1) * (1 + BUILD.crowding * n) * (1 + S.build.ownedCostStep * owned) / S.build.valuePerCrate));
    const mix = S.build.materials[Math.min(4, G.bizTier(b))];
    const cost = {};
    let left = crates;
    const entries = Object.entries(mix);
    entries.forEach(([c, share], i) => { const q = i === entries.length - 1 ? left : Math.min(left, Math.round(crates * share)); if (q > 0) cost[c] = q; left -= q; });
    return cost;
  };
  G.costText = cost => Object.entries(cost).map(([c, q]) => `${q} ${G.COM[c].name}`).join(" + ");
  G.canAfford = (p, cost) => Object.entries(cost).every(([c, q]) => (p.stock[c] || 0) >= q);
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
    const short = Object.entries(cost).filter(([c, q]) => (p.stock[c] || 0) < q);
    G.need(!short.length, `It takes ${G.costText(cost)}. You're short of ${short.map(([c, q]) => `${q - (p.stock[c] || 0)} ${G.COM[c].name}`).join(", ")} (goods on offer don't count).`);
    Object.entries(cost).forEach(([c, q]) => G.add(p, c, -q));
    p.acted = true;
    st.businesses.push({ id: st.nextBizId++, owner: p.id, type: b.id, territory: p.pos, built: st.round, cost });
    return `built a ${b.name.toLowerCase()} in ${G.TERR[p.pos].name} from ${G.costText(cost)}`;
  };
})();
