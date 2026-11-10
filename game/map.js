// Sellers Market game engine: the map. Moving and building.
//
// Each round, alongside their trades, each player may do ONE of these:
//   - move their pawn to a neighbouring territory (land or sea)
//   - build a business in the territory they're standing in
// Building is free, but each territory only allows the businesses listed for it (js/territories.js).

(() => {
  const G = SMG;

  G.canBuildAt = (b, tid) => (TERRITORY_INFO[tid]?.biz || []).includes(b.id);
  G.bizTier = b => b.kind === "extract" ? 0 : G.tier(b.makes);
  // The businesses that can go in a territory
  G.buildable = tid => G.BIZ.filter(b => G.canBuildAt(b, tid));
  // Where raw material `raw` can be dug up or grown
  const srcMemo = {};
  G.sourcesOf = raw => srcMemo[raw] ??= TERRITORIES.filter(t => G.BIZ.some(b => b.kind === "extract" && b.makes === raw && G.canBuildAt(b, t.id))).map(t => t.id);

  const oneAction = (st, p) => {
    G.need(st.phase === "day", "Not right now.");
    G.need(!p.acted, "You've already moved or built this round.");
  };

  G.actions.move = (st, p, { to }) => {
    oneAction(st, p);
    G.need(G.neighbours(p.pos).includes(to), `${G.TERR[to].name} isn't next to ${G.TERR[p.pos].name}.`);
    p.pos = to; p.acted = true;
    return `moved to ${G.TERR[to].name}`;
  };

  G.actions.build = (st, p, { type }) => {
    oneAction(st, p);
    const b = G.BIZ_BY[type];
    G.need(b, "Unknown business.");
    G.need(G.canBuildAt(b, p.pos), `A ${b.name.toLowerCase()} can't be built in ${G.TERR[p.pos].name}.`);
    p.acted = true;
    st.businesses.push({ id: st.nextBizId++, owner: p.id, type: b.id, territory: p.pos, built: st.round });
    return `built a ${b.name.toLowerCase()} in ${G.TERR[p.pos].name}`;
  };
})();
