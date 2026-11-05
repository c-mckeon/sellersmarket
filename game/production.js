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
    const report = {};
    st.businesses.forEach(biz => {
      const p = G.player(st, biz.owner), b = G.BIZ_BY[biz.type];
      const say = m => (report[p.id] ||= []).push(m);
      const mult = yieldMod[biz.id] ?? 1;
      if (mult === 0) { say(`${b.name} in ${G.TERR[biz.territory].name} was shut`); return; }
      const missing = Object.entries(b.inputs).filter(([c, q]) => (p.stock[c] || 0) < q);
      if (missing.length) { say(`${b.name} idle: needs ${missing.map(([c, q]) => `${q - (p.stock[c] || 0)} more ${G.COM[c].name}`).join(", ")}`); return; }
      Object.entries(b.inputs).forEach(([c, q]) => G.add(p, c, -q));
      const made = [];
      Object.entries(b.outputs).forEach(([c, q]) => {
        let n = q * mult * (b.kind === "extract" ? G.richness(b, biz.territory) : 1);
        n = Math.floor(n + 1e-9);
        if (n <= 0) return;
        const fit = Math.min(n, G.free(p)), over = n - fit;
        G.add(p, c, fit);
        if (over > 0) {
          const price = st.prices[c] * (st.prices[c] > 0 ? S.overflowSale : 1);
          p.cash += price * over;
          made.push(`${n} ${G.COM[c].name} (${over} didn't fit: ${price >= 0 ? "sold for" : "disposal cost"} ${G.money(Math.abs(price * over))})`);
        } else made.push(`${n} ${G.COM[c].name}`);
      });
      say(`${b.name} made ${made.join(" + ")}`);
    });
    Object.entries(report).forEach(([pid, msgs]) => msgs.forEach(m => G.log(st, m, +pid)));
  };
})();
