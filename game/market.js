// Sellers Market game engine: prices and trading.
//
// The market has an endless supply of everything, at the posted price.
// Prices depend only on what the players hold and what their businesses need:
//
//   Price = Base × Scarcity × Demand × Inflation × card effects
//
//   Scarcity = (s₀ ÷ s)^e, as on the Market dynamics tab, where
//     s = share of all goods held, counting a balanced "background" stock
//         = (held + background × s₀) ÷ (everything held + background)
//     background = all players' stockpile space added together × settings.pricing.background
//     With empty stockpiles s = s₀, so every price starts at base.
//   Demand = 1 + weight × unmet need ÷ (need + held + background × s₀)
//     unmet need = what all businesses need for one run, minus what players hold.
//   Card effects = card demand ÷ card supply, held between ×0.25 and ×4.
//
// Prices are set at midday and overnight, and stay fixed while players trade,
// so the order players take their turns in doesn't matter.

(() => {
  const G = SMG, S = GAME_SETTINGS, PS = S.pricing, PR = MARKET.pricing;

  // Base price: set by hand for raw goods and wastes, from the recipe for made goods.
  const memo = {};
  const tierOf = id => G.tier(id);
  G.basePrice = id => {
    if (id in memo) return memo[id];
    if (PR[id].base != null) return (memo[id] = PR[id].base);
    const r = RECIPES.find(x => Object.keys(x.out)[0] === id);
    let cost = 0;
    for (const [i, q] of Object.entries(r.in)) cost += q * G.basePrice(i);
    Object.keys(r.out).slice(1).forEach(w => cost -= r.out[w] * G.basePrice(w));
    return (memo[id] = (cost + MARKET.valueAdded * BUILD.factoryCost[tierOf(id)]) / r.out[id]);
  };

  // What all businesses need for one run, by commodity.
  G.needs = st => {
    const need = {};
    st.businesses.forEach(b => Object.entries(G.BIZ_BY[b.type].inputs).forEach(([c, q]) => need[c] = (need[c] || 0) + q));
    return need;
  };

  // What all businesses could make in one run (ignoring whether they have their inputs)
  G.capacity = st => {
    const cap = {};
    st.businesses.forEach(biz => {
      const b = G.BIZ_BY[biz.type];
      Object.entries(b.outputs).forEach(([c, q], i) => { if (i === 0) cap[c] = (cap[c] || 0) + q * (b.kind === "extract" ? G.richness(b, biz.territory) * S.extractOutput : 1); });
    });
    return cap;
  };

  G.reprice = st => {
    const held = {}; let total = 0;
    st.players.forEach(p => Object.entries(p.stock).forEach(([c, q]) => { held[c] = (held[c] || 0) + q; total += q; }));
    const need = G.needs(st), cap = G.capacity(st);
    Object.entries(cap).forEach(([c, q]) => { held[c] = (held[c] || 0) + PS.capacityWeight * q; total += PS.capacityWeight * q; });
    const bg = PS.background * st.players.reduce((s, p) => s + p.space, 0);
    const mods = G.modifiers ? G.modifiers(st) : {};
    st.lastPrices = { ...st.prices };
    COMMODITIES.forEach(c => {
      const id = c.id, s0 = PR[id].s0 / 100, base = G.basePrice(id), m = mods[id] || {};
      const h = held[id] || 0;
      const e = (PR[id].e + (m.eAdd || 0)) * (m.eMul || 1);
      let s = (h + bg * s0) / (total + bg);
      s = Math.min(Math.max(s, s0 / PS.shareRange), s0 * PS.shareRange);
      let price;
      if (base < 0) {
        price = base * Math.pow(s / s0, e) * st.priceLevel * (m.wasteFee || 1); // a disposal fee grows as waste piles up
      } else {
        const n = need[id] || 0, unmet = Math.max(0, n - h);
        const demand = 1 + PS.demandWeight * unmet / (n + h + bg * s0);
        // Card effects: demand ×, and supply cuts push the price up (×0.5 supply = ×2 price). Held to ×0.25–×4.
        const cards = Math.min(4, Math.max(0.25, (m.demand || 1) / (m.supply || 1)));
        price = base * Math.pow(s0 / s, e) * demand * cards * st.priceLevel;
        if (m.cap) price = Math.min(price, m.cap * base * st.priceLevel);
        if (PS.floors[id]) price = Math.max(price, PS.floors[id] * base * st.priceLevel);
      }
      st.prices[id] = Math.round(price * 100) / 100;
    });
  };

  // ---------- Player actions (morning only) ----------
  const tax = st => (G.financeMods ? G.financeMods(st).tradeTax || 0 : 0);
  const morningOnly = st => G.need(st.phase === "morning", "You can only trade in the morning.");

  G.actions.buy = (st, p, { id, qty = 1 }) => {
    morningOnly(st);
    qty = Math.floor(qty); G.need(qty > 0, "Buy at least 1.");
    const price = st.prices[id];
    G.need(price > 0, `${G.COM[id].name} can't be bought.`);
    G.need(G.free(p) >= qty, `Not enough stockpile space (${G.free(p)} free).`);
    const cost = price * (1 + PS.spread) * qty * (1 + tax(st));
    G.need(p.cash >= cost, `Not enough cash: ${qty} ${G.COM[id].name} costs ${G.money(cost)}.`);
    p.cash -= cost; G.add(p, id, qty);
    return `bought ${qty} ${G.COM[id].name} for ${G.money(cost)}`;
  };

  G.actions.sell = (st, p, { id, qty = 1 }) => {
    morningOnly(st);
    qty = Math.floor(qty); G.need(qty > 0, "Sell at least 1.");
    G.need((p.stock[id] || 0) >= qty, `You only have ${p.stock[id] || 0} ${G.COM[id].name}.`);
    const price = st.prices[id] * (st.prices[id] > 0 ? (1 - PS.spread) * (1 - tax(st)) : 1);
    if (price < 0) G.need(p.cash >= -price * qty, `Getting rid of it costs ${G.money(-price * qty)} and you don't have enough cash.`);
    p.cash += price * qty; G.add(p, id, -qty);
    return price >= 0 ? `sold ${qty} ${G.COM[id].name} for ${G.money(price * qty)}` : `paid ${G.money(-price * qty)} to dispose of ${qty} ${G.COM[id].name}`;
  };

  G.spaceUpgradeCost = p => S.spaceUpgrade.firstCost + S.spaceUpgrade.costStep * p.upgrades;
  G.actions.upgradeSpace = (st, p) => {
    morningOnly(st);
    const cost = G.spaceUpgradeCost(p);
    G.need(p.cash >= cost, `More space costs ${cost}.`);
    p.cash -= cost; p.space += S.spaceUpgrade.crates; p.upgrades++;
    return `bought ${S.spaceUpgrade.crates} more crates of space for ${cost}`;
  };

  // ---------- Automatic steps (their order is set in pipeline.js) ----------
  G.inflate = st => { st.priceLevel *= 1 + S.inflationPerRound + (G.inflationBoost ? G.inflationBoost(st) : 0); };
  G.repriceStep = st => { G.reprice(st); st.history.push({ round: st.round, phase: st.phase, prices: { ...st.prices } }); };
})();
