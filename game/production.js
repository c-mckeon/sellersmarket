// Sellers Market game engine: midday production.
//
// Each business runs once, in the order it was built:
//   - Extraction (mines, farms, wells): makes its output × the territory's richness bonus. No inputs.
//   - Factories: if the owner's stockpile holds every input, they're used up and the outputs made.
//     Short of an input? A stand-in from settings.substitutes can take its place (wood burned as charcoal
//     instead of coal…), so most raw goods have more than one use. See G.inputsFor.
// Card effects on "output" multiply what comes out (rounded down).
// Anything that doesn't fit in the stockpile is thrown away (goods on offer still take up space).

(() => {
  const G = SMG, S = GAME_SETTINGS;

  G.richness = (b, territory) => BUILD.richness[(TERRITORY_INFO[territory].res || {})[b.makes] || 1];

  // Stand-ins a factory can use when it's short of an input (settings.substitutes):
  // [[good, units of it per unit of the input], …]
  G.substitutesFor = (b, input) => (S.substitutes || []).filter(r => r.for === input && (!r.at || r.at.includes(b.id))).map(r => [r.use, r.ratio]);

  // What one run of factory `b` would take from player p's stockpile.
  // Each input comes from the real thing first; any shortfall from its stand-ins, in the listed order.
  // Goods one of your contracts asks for are never used as stand-ins.
  // Returns { use: { good: qty }, missing: [[input, qty short]] }.
  G.inputsFor = (p, b) => {
    const left = { ...p.stock }, use = {}, missing = [];
    const keep = new Set(p.contracts.flatMap(k => Object.keys(k.goods)));
    Object.entries(b.inputs).forEach(([c, q]) => {
      const own = Math.min(q, left[c] || 0);
      if (own) { use[c] = (use[c] || 0) + own; left[c] -= own; }
      let short = q - own;
      for (const [s, r] of G.substitutesFor(b, c)) {
        if (!short || keep.has(s)) continue;
        const n = Math.min(short, Math.floor((left[s] || 0) / r));
        if (n) { use[s] = (use[s] || 0) + n * r; left[s] -= n * r; short -= n; }
      }
      if (short) missing.push([c, short]);
    });
    return { use, missing };
  };

  G.produce = st => {
    const yieldMod = G.businessYield ? G.businessYield(st) : {};
    const report = {};
    st.businesses.forEach(biz => {
      const p = G.player(st, biz.owner), b = G.BIZ_BY[biz.type];
      const say = m => (report[p.id] ||= []).push(m);
      const mult = yieldMod[biz.id] ?? 1;
      st.stats.runs++;
      if (mult === 0) { st.stats.idle++; say(`${b.name} in ${G.TERR[biz.territory].name} was shut`); return; }
      let run = G.inputsFor(p, b);
      if (run.missing.length) { st.stats.idle++; say(`${b.name} idle: needs ${run.missing.map(([c, n]) => `${n} more ${G.COM[c].name}`).join(", ")}`); return; }
      // A factory runs again while it has the inputs, up to settings.factoryRuns times a round
      const made = {};
      let runs = 0;
      do {
        Object.entries(run.use).forEach(([c, q]) => { G.add(p, c, -q); biz.spent = (biz.spent || 0) + q * st.prices[c]; });
        Object.entries(run.use).filter(([c]) => !(c in b.inputs)).forEach(([c, q]) => (made.subs ||= {})[c] = (made.subs?.[c] || 0) + q);
        Object.entries(b.outputs).forEach(([c, q]) => {
          const n = Math.floor(q * mult * (b.kind === "extract" ? G.richness(b, biz.territory) * S.extractOutput : 1) + 1e-9);
          if (n > 0) { G.add(p, c, n); made[c] = (made[c] || 0) + n; biz.earned = (biz.earned || 0) + n * st.prices[c]; }
        });
        runs++;
      } while (b.kind === "factory" && runs < (S.factoryRuns || 1) && !(run = G.inputsFor(p, b)).missing.length);
      biz.runs = (biz.runs || 0) + runs;
      const subs = made.subs; delete made.subs;
      say(`${b.name} made ${Object.entries(made).map(([c, n]) => `${n} ${G.COM[c].name}`).join(" + ")}${runs > 1 ? ` (ran ${runs} times)` : ""}${subs ? `, using ${Object.entries(subs).map(([c, n]) => `${n} ${G.COM[c].name}`).join(" + ")} instead` : ""}`);
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
