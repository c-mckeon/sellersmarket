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
//
// Prices are set at midday and overnight, and stay fixed while players trade,
// so the order players take their turns in doesn't matter.

(() => {
  const G = SMG, S = GAME_SETTINGS, PS = S.pricing, PR = MARKET.pricing;

  // Base price: set by hand for raw goods and wastes, from the recipe for made goods.
  const memo = {};
  G.basePrice = id => {
    if (id in memo) return memo[id];
    if (PR[id].base != null) return (memo[id] = PR[id].base);
    const r = RECIPES.find(x => Object.keys(x.out)[0] === id);
    let cost = 0;
    for (const [i, q] of Object.entries(r.in)) cost += q * G.basePrice(i);
    Object.keys(r.out).slice(1).forEach(w => cost -= r.out[w] * G.basePrice(w));
    return (memo[id] = cost * MARKET.markup / r.out[id]);
  };

  // What all businesses need for one run, by commodity.
  G.needs = st => {
    const need = {};
    st.businesses.forEach(b => Object.entries(G.BIZ_BY[b.type].inputs).forEach(([c, q]) => need[c] = (need[c] || 0) + q));
    return need;
  };

  G.reprice = st => {
    const held = {}; let total = 0;
    st.players.forEach(p => Object.entries(p.stock).forEach(([c, q]) => { held[c] = (held[c] || 0) + q; total += q; }));
    const need = G.needs(st);
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
        price = base * Math.pow(s / s0, e) * st.priceLevel; // a disposal fee grows as waste piles up
      } else {
        const n = need[id] || 0, unmet = Math.max(0, n - h);
        const demand = (1 + PS.demandWeight * unmet / (n + h + bg * s0)) * (m.demand || 1);
        price = base * Math.pow(s0 / s, e) * demand * st.priceLevel * Math.pow(1 / (m.supply || 1), e);
        if (m.cap) price = Math.min(price, m.cap * base * st.priceLevel);
      }
      st.prices[id] = Math.round(price * 100) / 100;
    });
  };

  // ---------- Player actions (morning only) ----------
  const morningOnly = st => G.need(st.phase === "morning", "You can only trade in the morning.");

  G.actions.buy = (st, p, { id, qty = 1 }) => {
    morningOnly(st);
    qty = Math.floor(qty); G.need(qty > 0, "Buy at least 1.");
    const price = st.prices[id];
    G.need(price > 0, `${G.COM[id].name} can't be bought.`);
    G.need(G.free(p) >= qty, `Not enough stockpile space (${G.free(p)} free).`);
    G.need(p.cash >= price * qty, `Not enough cash: ${qty} ${G.COM[id].name} costs ${G.money(price * qty)}.`);
    p.cash -= price * qty; G.add(p, id, qty);
    return `bought ${qty} ${G.COM[id].name} for ${G.money(price * qty)}`;
  };

  G.actions.sell = (st, p, { id, qty = 1 }) => {
    morningOnly(st);
    qty = Math.floor(qty); G.need(qty > 0, "Sell at least 1.");
    G.need((p.stock[id] || 0) >= qty, `You only have ${p.stock[id] || 0} ${G.COM[id].name}.`);
    const price = st.prices[id];
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
