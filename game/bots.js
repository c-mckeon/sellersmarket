// Sellers Market game engine: simple computer players.
// Deliberately basic: enough to test the rules and run simulations. Smarter bots later.

(() => {
  const G = SMG, S = GAME_SETTINGS;

  // Profit per round of a business at today's prices (outputs minus inputs).
  G.bizProfit = (st, b, tid) => {
    const rich = b.kind === "extract" ? G.richness(b, tid) * S.extractOutput : 1;
    const out = Object.entries(b.outputs).reduce((s, [c, q]) => s + Math.floor(q * rich) * st.prices[c], 0);
    const cost = Object.entries(b.inputs).reduce((s, [c, q]) => s + q * st.prices[c], 0);
    const wage = b.base * S.buildCostScale * S.wageRate * (TERRITORY_INFO[tid].cost ?? 1) * st.priceLevel;
    return out - cost - wage;
  };

  const myNeeds = (st, p) => {
    const need = {};
    G.myBusinesses(st, p.id).forEach(b => Object.entries(G.BIZ_BY[b.type].inputs).forEach(([c, q]) => need[c] = (need[c] || 0) + q));
    return need;
  };

  G.bots.morning = (st, p) => {
    const need = myNeeds(st, p);
    // Sell everything not needed as an input; get rid of costly waste if space is tight
    Object.entries({ ...p.stock }).forEach(([c, q]) => {
      const extra = q - (need[c] || 0);
      if (extra <= 0) return;
      if (st.prices[c] > 0) G.act(st, p.id, "sell", { id: c, qty: extra });
      else if (p.cash > -st.prices[c] * extra + 50) G.act(st, p.id, "sell", { id: c, qty: extra }); // pay to get rid of waste
    });
    // More space if inputs plus today's production won't fit
    const totalNeed = Object.values(need).reduce((a, b) => a + b, 0);
    const making = G.myBusinesses(st, p.id).reduce((s, biz) => { const b = G.BIZ_BY[biz.type];
      return s + Object.values(b.outputs).reduce((x, q) => x + Math.floor(q * (b.kind === "extract" ? G.richness(b, biz.territory) * S.extractOutput : 1)), 0); }, 0);
    const missingInputs = Object.entries(need).reduce((s, [c, q]) => s + Math.max(0, q - (p.stock[c] || 0)), 0);
    for (let k = 0; k < 3 && G.free(p) < missingInputs + Math.max(0, making - totalNeed) && p.cash > G.spaceUpgradeCost(p) + 100; k++) G.act(st, p.id, "upgradeSpace");
    // Buy what's missing for one run of each business
    Object.entries(need).forEach(([c, q]) => {
      const missing = q - (p.stock[c] || 0);
      if (missing > 0) G.act(st, p.id, "buy", { id: c, qty: Math.min(missing, G.free(p)) });
    });
  };

  G.bots.afternoon = (st, p) => {
    // Build here if something pays for itself within 12 rounds
    const opts = G.buildable(st, p.pos, p.id)
      .map(o => ({ ...o, profit: G.bizProfit(st, o.b, p.pos) }))
      .filter(o => o.profit > 0 && o.cost <= p.cash - 50 && o.cost / o.profit <= 12
        && Object.values(o.b.inputs).reduce((x, y) => x + y, 0) <= p.space)
      .sort((a, b) => b.profit / b.cost - a.profit / a.cost);
    if (opts.length) G.act(st, p.id, "build", { type: opts[0].b.id });
    else {
      // Otherwise wander towards somewhere promising
      const score = tid => Math.max(0, ...G.buildable(st, tid, p.id).map(o => G.bizProfit(st, o.b, tid) / o.cost));
      const next = G.neighbours(p.pos).map(t => ({ t, s: score(t) + G.rand(st) * 0.02 })).sort((a, b) => b.s - a.s)[0];
      if (next) G.act(st, p.id, "move", { to: next.t });
    }
    // Play a card half the time
    if (p.hand.length && G.rand(st) < 0.5) {
      const card = G.CARD[G.pick(st, p.hand)], needs = G.cardNeeds(card);
      const mine = G.myBusinesses(st, p.id), theirs = st.businesses.filter(b => b.owner !== p.id);
      const args = { card: card.id };
      if (needs.commodity) args.commodity = mine.length ? G.BIZ_BY[mine[0].type].makes : "wheat";
      if (needs.ownBusiness) { if (!mine.length) return; args.ownBusiness = mine[0].id; }
      if (needs.targetBusiness) { if (!theirs.length) return; args.targetBusiness = G.pick(st, theirs).id; }
      G.act(st, p.id, "playCard", args);
    }
  };
})();
