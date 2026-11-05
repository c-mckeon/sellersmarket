// Sellers Market game engine: action cards.
//
// - Every player draws 2 cards at the end of each round, up to a hand of 5.
// - In the afternoon a player may play 1 card. It takes effect overnight.
// - A card is only in the deck if the engine supports all of its effects ("hooks").
//   Cards using hooks we haven't built yet (loans, taxes, counters…) are left out for now.

(() => {
  const G = SMG, S = GAME_SETTINGS;

  // Hooks the engine understands so far, and the targets it can resolve.
  const HOOKS_READY = ["stock", "supply", "demand", "e", "inflation", "cap", "yield"];
  const commodityTarget = t => !!G.COM[t] || t.startsWith("sector:") || t === "all" || t === "chosen commodity";
  const businessTarget = t => ["your business", "target business", "all businesses"].includes(t);
  const ready = f => HOOKS_READY.includes(f[0]) && (f[0] === "yield" ? businessTarget(f[1]) : commodityTarget(f[1]));

  G.DECK = CARDS.map((c, i) => ({ ...c, id: i + 1 })).filter(c => c.fx.every(ready));
  G.CARD = Object.fromEntries(CARDS.map((c, i) => [i + 1, { ...c, id: i + 1 }]));
  // What a player has to choose when playing a card
  G.cardNeeds = card => ({
    commodity: card.fx.some(f => f[1] === "chosen commodity"),
    ownBusiness: card.fx.some(f => f[1] === "your business"),
    targetBusiness: card.fx.some(f => f[1] === "target business"),
  });

  G.draw = (st, p, n) => {
    const total = G.DECK.reduce((s, c) => s + S.rarityWeight[c.rarity], 0);
    for (let k = 0; k < n && p.hand.length < S.handMax; k++) {
      let r = G.rand(st) * total;
      const card = G.DECK.find(c => (r -= S.rarityWeight[c.rarity]) < 0) || G.DECK[0];
      p.hand.push(card.id);
    }
  };
  G.onSetup.push(st => st.players.forEach(p => G.draw(st, p, S.cardsPerRound)));
  G.drawCards = st => st.players.forEach(p => G.draw(st, p, S.cardsPerRound));

  // ---------- Playing a card (afternoon) ----------
  G.actions.playCard = (st, p, { card, commodity, ownBusiness, targetBusiness }) => {
    G.need(st.phase === "afternoon", "Cards are played in the afternoon.");
    G.need(p.cardsPlayed < S.cardsPerAfternoon, "You've already played a card this afternoon.");
    const i = p.hand.indexOf(card);
    G.need(i >= 0, "That card isn't in your hand.");
    const c = G.CARD[card], needs = G.cardNeeds(c);
    if (needs.commodity) G.need(G.COM[commodity], "Choose a commodity.");
    if (needs.ownBusiness) G.need(st.businesses.some(b => b.id === +ownBusiness && b.owner === p.id), "Choose one of your businesses.");
    if (needs.targetBusiness) G.need(st.businesses.some(b => b.id === +targetBusiness), "Choose a business to target.");
    p.hand.splice(i, 1); p.cardsPlayed++;
    st.pending.push({ card, by: p.id, commodity, ownBusiness: +ownBusiness || null, targetBusiness: +targetBusiness || null });
    return `played a card face down`;
  };

  // ---------- Overnight: reveal and apply ----------
  const commoditiesFor = (t, choice) => G.COM[t] ? [t]
    : t.startsWith("sector:") ? SECTORS[t.slice(7)].items
    : t === "all" ? COMMODITIES.map(c => c.id)
    : t === "chosen commodity" ? [choice.commodity] : [];
  const businessesFor = (st, t, choice) => t === "your business" ? [choice.ownBusiness]
    : t === "target business" ? [choice.targetBusiness]
    : t === "all businesses" ? st.businesses.map(b => b.id) : [];

  G.resolveCards = st => {
    st.pending.forEach(pl => {
      const c = G.CARD[pl.card], who = G.player(st, pl.by);
      G.log(st, `${who.name} played ${c.name}: ${c.text}`);
      c.fx.forEach(([hook, target, op, v, rounds]) => {
        if (hook === "stock") {
          // Destroy (or add) a share of everyone's stock, straight away
          commoditiesFor(target, pl).forEach(id => st.players.forEach(p => {
            if (p.stock[id]) { const now = Math.floor(p.stock[id] * v); G.add(p, id, now - p.stock[id]); }
          }));
          return;
        }
        const last = rounds == null ? Infinity : st.round + Math.max(1, rounds);
        const targets = hook === "yield" ? businessesFor(st, target, pl) : commoditiesFor(target, pl);
        st.effects.push({ card: c.id, by: pl.by, hook, targets, op, v, from: st.round + 1, until: last });
      });
    });
    st.pending = [];
  };

  // Effects are active from the round after they're played, to `until` inclusive.
  // Overnight we're setting up the next round, so count from that round.
  const active = st => { const r = st.round + (st.phase === "overnight" ? 1 : 0); return st.effects.filter(e => e.from <= r && r <= e.until); };
  G.expireEffects = st => { st.effects = st.effects.filter(e => e.until > st.round); };

  // Price modifiers by commodity, combined from all active effects.
  G.modifiers = st => {
    const m = {};
    active(st).forEach(e => {
      if (!["supply", "demand", "e", "cap"].includes(e.hook)) return;
      e.targets.forEach(id => {
        const x = m[id] ||= {};
        if (e.hook === "demand") x.demand = (x.demand || 1) * e.v;
        if (e.hook === "supply") x.supply = (x.supply || 1) * e.v;
        if (e.hook === "e") { if (e.op === "×") x.eMul = (x.eMul || 1) * e.v; else x.eAdd = (x.eAdd || 0) + e.v; }
        if (e.hook === "cap") x.cap = Math.min(x.cap ?? Infinity, e.v);
      });
    });
    // Stacking limit: no more than ×4 or less than ×0.25 on any one thing
    Object.values(m).forEach(x => ["demand", "supply"].forEach(k => { if (x[k]) x[k] = Math.min(4, Math.max(0.25, x[k])); }));
    return m;
  };
  G.inflationBoost = st => active(st).filter(e => e.hook === "inflation").reduce((s, e) => s + e.v, 0);
  G.businessYield = st => {
    const y = {};
    active(st).filter(e => e.hook === "yield").forEach(e => e.targets.forEach(id => y[id] = (y[id] ?? 1) * e.v));
    return y;
  };
})();
