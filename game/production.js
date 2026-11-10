// Sellers Market game engine: production, each night after the auction.
//
// Each business runs once, in the order it was built:
//   - Extraction (mines, pits, farms, water works): makes its output (1). No inputs.
//   - Factories: if the owner's stockpile holds every input, they're used up and the outputs made.
//     Short of an input? A stand-in from settings.substitutes can take its place (wood burned as charcoal
//     instead of coal…), so most raw goods have more than one use. See G.inputsFor.
// Then, if a stockpile is over its rows (goods on offer count), the oldest units are pushed out.

(() => {
  const G = SMG, S = GAME_SETTINGS;

  // Stand-ins a factory can use when it's short of an input (settings.substitutes):
  // [[good, units of it per unit of the input], …]
  G.substitutesFor = (b, input) => (S.substitutes || []).filter(r => r.for === input && (!r.at || r.at.includes(b.id))).map(r => [r.use, r.ratio]);

  // What one run of factory `b` would take from everything player p owns (their stockpile and businesses).
  // Each input comes from the real thing first; any shortfall from its stand-ins, in the listed order.
  // Returns { use: { good: qty }, missing: [[input, qty short]] }.
  G.inputsFor = (st, p, b) => {
    const left = G.holdings(st, p), use = {}, missing = [];
    Object.entries(b.inputs).forEach(([c, q]) => {
      const own = Math.min(q, left[c] || 0);
      if (own) { use[c] = (use[c] || 0) + own; left[c] -= own; }
      let short = q - own;
      for (const [s, r] of G.substitutesFor(b, c)) {
        if (!short) continue;
        const n = Math.min(short, Math.floor((left[s] || 0) / r));
        if (n) { use[s] = (use[s] || 0) + n * r; left[s] -= n * r; short -= n; }
      }
      if (short) missing.push([c, short]);
    });
    return { use, missing };
  };

  // Room left in a business's own stock (settings.businessSpace)
  G.bizRoom = biz => S.businessSpace - Object.values(biz.stock || {}).reduce((a, b) => a + b, 0);

  G.produce = st => {
    G.clock = st.round;
    const report = {};
    const own = S.businessStock; // outputs stay at the business, which holds settings.businessSpace units
    st.businesses.forEach(biz => {
      const p = G.player(st, biz.owner), b = G.BIZ_BY[biz.type];
      const say = m => (report[p.id] ||= []).push(m);
      st.stats.runs++;
      const full = own && G.bizRoom(biz) < Math.min(b.outputs[b.makes], S.businessSpace);
      if (full) { st.stats.idle++; biz.idleFor = (biz.idleFor || 0) + 1; say(`${b.name} idle: its stock is full (sell or use some of it)`); return; }
      const run = G.inputsFor(st, p, b);
      if (run.missing.length) { st.stats.idle++; biz.idleFor = (biz.idleFor || 0) + 1; say(`${b.name} idle: needs ${run.missing.map(([c, n]) => `${n} more ${G.COM[c].name}`).join(", ")}`); return; }
      const made = {}, subs = {};
      Object.entries(run.use).forEach(([c, q]) => { G.take(st, p, c, q); if (!(c in b.inputs)) subs[c] = q; });
      Object.entries(b.outputs).forEach(([c, n]) => { if (own) G.addBiz(biz, c, n); else G.add(p, c, n); made[c] = n; });
      biz.runs = (biz.runs || 0) + 1; biz.idleFor = 0;
      say(`${b.name} made ${Object.entries(made).map(([c, n]) => `${n} ${G.COM[c].name}`).join(" + ")}${Object.keys(subs).length ? `, using ${Object.entries(subs).map(([c, n]) => `${n} ${G.COM[c].name}`).join(" + ")} instead` : ""}`);
    });
    // Over the limit? The oldest units are pushed out
    st.players.forEach(p => {
      const lost = G.makeRoom(st, p);
      if (lost.length) (report[p.id] ||= []).push(`stockpile full: pushed out the oldest ${lost.map(([c, n]) => `${n} ${G.COM[c].name}`).join(", ")}`);
    });
    Object.entries(report).forEach(([pid, msgs]) => msgs.forEach(m => G.log(st, m, +pid)));
  };

  // First in, first out: when the stockpile (counting goods on offer) is over its rows, the oldest
  // units are pushed out, whatever they are. Returns what went: [[good, qty], …]
  G.makeRoom = (st, p) => {
    let over = G.used(p) + G.offered(st, p) - p.space;
    if (over <= 0) return [];
    const units = Object.entries(p.stock).flatMap(([c, q]) => {
      const lots = p.lots?.[c] || [], n = lots.reduce((s, l) => s + l[0], 0);
      return [...lots, ...(n < q ? [[q - n, st.round]] : [])].flatMap(([k, made]) => Array(k).fill([c, made]));
    }).sort((a, b) => a[1] - b[1]);
    const out = {};
    for (const [c] of units) { if (over <= 0) break; out[c] = (out[c] || 0) + 1; over--; }
    Object.entries(out).forEach(([c, n]) => { G.add(p, c, -n); st.stats.overflow += n; });
    return Object.entries(out);
  };
})();
