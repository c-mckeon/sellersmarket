// Sellers Market game engine: midday production.
//
// Each business runs once, in the order it was built:
//   - Extraction (mines, farms, wells): makes its output × the territory's richness bonus. No inputs.
//   - Factories: if the owner's stockpile holds every input, they're used up and the outputs made.
// Card effects on "output" multiply what comes out (rounded down).
// Anything that doesn't fit in the stockpile is thrown away (goods on offer still take up space).

(() => {
  const G = SMG, S = GAME_SETTINGS;

  G.richness = (b, territory) => BUILD.richness[(TERRITORY_INFO[territory].res || {})[b.makes] || 1];

  G.produce = st => {
    const yieldMod = G.businessYield ? G.businessYield(st) : {};
    const report = {};
    st.businesses.forEach(biz => {
      const p = G.player(st, biz.owner), b = G.BIZ_BY[biz.type];
      const say = m => (report[p.id] ||= []).push(m);
      const mult = yieldMod[biz.id] ?? 1;
      st.stats.runs++;
      if (mult === 0) { st.stats.idle++; say(`${b.name} in ${G.TERR[biz.territory].name} was shut`); return; }
      const missing = Object.entries(b.inputs).filter(([c, q]) => (p.stock[c] || 0) < q);
      if (missing.length) { st.stats.idle++; say(`${b.name} idle: needs ${missing.map(([c, q]) => `${q - (p.stock[c] || 0)} more ${G.COM[c].name}`).join(", ")}`); return; }
      Object.entries(b.inputs).forEach(([c, q]) => { G.add(p, c, -q); biz.spent = (biz.spent || 0) + q * st.prices[c]; });
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
    // Then waste, then the cheapest (last traded price × amount held: the biggest pile of a never-traded good goes first)
    const rest = Object.keys(p.stock).filter(c => !mine.includes(c)).sort((a, b) => (G.COM[b].type === "waste") - (G.COM[a].type === "waste")
      || (st.prices[a] || 0) - (st.prices[b] || 0) || p.stock[b] - p.stock[a]);
    return [...mine, ...rest];
  };
  G.makeRoom = (st, p) => {
    const lost = [];
    let over = G.used(p) + G.offered(st, p) - p.space;
    for (const c of G.discardOrder(st, p)) {
      if (over <= 0) break;
      const n = Math.min(over, p.stock[c]);
      G.add(p, c, -n); over -= n; st.stats.overflow += n; lost.push([c, n]);
    }
    return lost;
  };

  // Set your "throw away first" list (any time)
  G.actions.setDiscard = (st, p, { list }) => {
    G.need(Array.isArray(list) && list.every(c => G.COM[c]), "Pick commodities.");
    p.discard = list.slice(0, 50);
    return null; // private: not logged
  };

})();
