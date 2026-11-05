// Sellers Market game engine: midday production.
//
// Each business runs once, in the order it was built:
//   - Extraction (mines, farms, wells): makes its output × the territory's richness bonus. No inputs.
//   - Factories: if the owner's stockpile holds every input, they're used up and the outputs made.
// Card effects on "output" multiply what comes out (rounded down).
// Anything that doesn't fit in the stockpile is sold off at 80% of the price (waste costs its fee).

(() => {
  const G = SMG, S = GAME_SETTINGS;

  G.richness = (b, territory) => BUILD.richness[(TERRITORY_INFO[territory].res || {})[b.makes] || 1];

  G.produce = st => {
    const yieldMod = G.businessYield ? G.businessYield(st) : {};
    const coalTax = G.financeMods ? G.financeMods(st).coalTax || 0 : 0;
    const report = {};
    st.businesses.forEach(biz => {
      const p = G.player(st, biz.owner), b = G.BIZ_BY[biz.type];
      const say = m => (report[p.id] ||= []).push(m);
      const mult = yieldMod[biz.id] ?? 1;
      st.stats.runs++;
      if (biz.unpaid) { st.stats.idle++; say(`${b.name} idle: workers weren't paid`); biz.unpaid = false; return; }
      if (mult === 0) { st.stats.idle++; say(`${b.name} in ${G.TERR[biz.territory].name} was shut`); return; }
      const missing = Object.entries(b.inputs).filter(([c, q]) => (p.stock[c] || 0) < q);
      if (missing.length) { st.stats.idle++; say(`${b.name} idle: needs ${missing.map(([c, q]) => `${q - (p.stock[c] || 0)} more ${G.COM[c].name}`).join(", ")}`); return; }
      Object.entries(b.inputs).forEach(([c, q]) => { G.add(p, c, -q); biz.spent = (biz.spent || 0) + q * st.prices[c]; });
      if (coalTax && b.inputs.coal) { const t = b.inputs.coal * coalTax * st.priceLevel; G.settleCash(st, p, -t); say(`paid ${G.money(t)} carbon tax`); }
      const made = [];
      Object.entries(b.outputs).forEach(([c, q]) => {
        const n = Math.floor(q * mult * (b.kind === "extract" ? G.richness(b, biz.territory) * S.extractOutput : 1) + 1e-9);
        if (n > 0) { G.add(p, c, n); made.push(`${n} ${G.COM[c].name}`); biz.earned = (biz.earned || 0) + n * st.prices[c]; }
      });
      biz.runs = (biz.runs || 0) + 1;
      say(`${b.name} made ${made.join(" + ")}`);
    });
    // Over the limit? Throw things away, in the order each player chose
    st.players.forEach(p => {
      const lost = G.makeRoom(st, p);
      if (lost.length) (report[p.id] ||= []).push(`stockpile full: threw away ${lost.map(([c, n]) => `${n} ${G.COM[c].name}`).join(", ")}`);
    });
    Object.entries(report).forEach(([pid, msgs]) => msgs.forEach(m => G.log(st, m, +pid)));
  };

  // Throw away (or sell off, if overflowSale > 0) whatever doesn't fit.
  // Order: the player's own "throw away first" list, then the cheapest goods. Returns what went.
  G.discardOrder = (st, p) => {
    const mine = (p.discard || []).filter(c => p.stock[c]);
    const rest = Object.keys(p.stock).filter(c => !mine.includes(c)).sort((a, b) => st.prices[a] - st.prices[b]);
    return [...mine, ...rest];
  };
  G.makeRoom = (st, p) => {
    const lost = [];
    let over = G.used(p) - p.space;
    for (const c of G.discardOrder(st, p)) {
      if (over <= 0) break;
      const n = Math.min(over, p.stock[c]);
      G.add(p, c, -n); over -= n; st.stats.overflow += n; lost.push([c, n]);
      const price = st.prices[c] * (st.prices[c] > 0 ? S.overflowSale : 1);
      if (price) G.settleCash(st, p, price * n);
    }
    return lost;
  };

  // Set your "throw away first" list (any time)
  G.actions.setDiscard = (st, p, { list }) => {
    G.need(Array.isArray(list) && list.every(c => G.COM[c]), "Pick commodities.");
    p.discard = list.slice(0, 50);
    return null; // private: not logged
  };

  // Overnight: pay each business's running costs, oldest first. Unpaid businesses idle next midday.
  G.wage = (st, biz) => {
    const b = G.BIZ_BY[biz.type];
    return b.base * S.buildCostScale * S.wageRate * (TERRITORY_INFO[biz.territory].cost ?? 1) * st.priceLevel * (biz.wageMul || 1);
  };
  G.payWages = st => {
    if (!S.wageRate) return;
    st.players.forEach(p => {
      let paid = 0, unpaid = 0;
      G.myBusinesses(st, p.id).forEach(biz => {
        const w = G.wage(st, biz);
        if (p.cash >= w) { p.cash -= w; paid += w; biz.wages = (biz.wages || 0) + w; } else { biz.unpaid = true; unpaid++; }
      });
      if (paid) G.log(st, `paid ${G.money(paid)} in wages${unpaid ? `; couldn't pay ${unpaid} business${unpaid > 1 ? "es" : ""}` : ""}`, p.id);
    });
  };
})();
