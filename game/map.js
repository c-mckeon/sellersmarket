// Sellers Market game engine: the map. Moving and building.
//
// Each round, alongside their trades, each player may do ONE of these:
//   - move their pawn to a neighbouring territory (land or sea)
//   - build a business in the territory they're standing in
// Building costs cash (js/businesses.js: 120 to 170), and each territory only allows the businesses
// listed for it (js/territories.js). Cash in your buy orders can't be spent on building.
// Any business can be sold back for 60% of its cost at any time: sellBusiness { biz }.

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
  // Moves this round: one, or more with a card (fast horses); building uses up the round
  const movesAllowed = (st, p) => 1 + (G.extraMoves ? G.extraMoves(st, p.id) : 0);

  G.actions.move = (st, p, { to }) => {
    oneAction(st, p);
    G.need(G.neighbours(p.pos).includes(to), `${G.TERR[to].name} isn't next to ${G.TERR[p.pos].name}.`);
    p.pos = to; p.moves = (p.moves || 0) + 1;
    p.acted = p.moves >= movesAllowed(st, p);
    return `moved to ${G.TERR[to].name}`;
  };

  G.actions.build = (st, p, { type }) => {
    oneAction(st, p);
    const b = G.BIZ_BY[type];
    G.need(b, "Unknown business.");
    G.need(G.canBuildAt(b, p.pos), `A ${b.name.toLowerCase()} can't be built in ${G.TERR[p.pos].name}.`);
    G.need(!(G.noBuild && G.noBuild(st, p.pos)), `A planning objection stops any building in ${G.TERR[p.pos].name} for now.`);
    G.need(!p.moves, "You've moved this round: building takes the whole round.");
    const cost = G.buildCostFor(p, b);
    G.need(p.cash >= cost, `A ${b.name.toLowerCase()} costs ${G.money(cost)}; you have ${G.money(p.cash)} free (cash in buy orders doesn't count).`);
    p.cash -= cost; if (p.grant) p.grant = false;
    p.acted = true;
    st.businesses.push({ id: st.nextBizId++, owner: p.id, type: b.id, territory: p.pos, built: st.round });
    return `built a ${b.name.toLowerCase()} in ${G.TERR[p.pos].name} for ${G.money(cost)}`;
  };

  // Sell a business back for settings.businessResale (60%) of its cost (any time you order; it doesn't use
  // your move or build).
  // It disappears; anything in its own stock goes to your stockpile.
  // What a business costs this player (a building grant card halves it)
  G.buildCostFor = (p, b) => p.grant ? Math.round(b.cost / 2) : b.cost;
  G.resale = t => Math.round(t.cost * (GAME_SETTINGS.businessResale ?? 1));
  G.actions.sellBusiness = (st, p, { biz }) => {
    G.need(st.phase === "day", "Not right now.");
    const b = st.businesses.find(x => x.id === biz && x.owner === p.id);
    G.need(b, "That isn't one of your businesses.");
    const t = G.BIZ_BY[b.type];
    Object.entries(b.stock || {}).forEach(([c, q]) => { const lots = G.addBiz(b, c, -q); if (lots.length) lots.forEach(([k, made]) => G.add(p, c, k, made)); else G.add(p, c, q); });
    st.businesses = st.businesses.filter(x => x !== b);
    const price = G.resale(t);
    p.cash += price;
    return `sold a ${t.name.toLowerCase()} in ${G.TERR[b.territory].name} for ${G.money(price)}`;
  };
})();
