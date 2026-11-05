// Sellers Market game engine: simple computer players.
// Deliberately basic: enough to test the rules and run simulations.
// Each bot has a strategy for what to build:
//   best        whatever earns most for its cost
//   diversify   prefers sectors it doesn't own yet
//   specialist  sticks to the sectors it already owns
//   integrate   builds supply chains: businesses that use what it makes, or make what it needs

(() => {
  const G = SMG, S = GAME_SETTINGS;
  const sectorOf = {};
  Object.entries(SECTORS).forEach(([k, s]) => s.items.forEach(i => sectorOf[i] = k));
  G.sectorOfBiz = b => sectorOf[b.makes];

  // Profit per round of a business at today's prices (outputs minus inputs and wages)
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

  // How much a bot likes an option, by strategy
  const appeal = (st, p, o, tid) => {
    const roi = G.bizProfit(st, o.b, tid) / o.cost;
    const mine = new Set(G.myBusinesses(st, p.id).map(x => G.sectorOfBiz(G.BIZ_BY[x.type])));
    const sec = G.sectorOfBiz(o.b);
    if (p.strategy === "diversify") return roi * (mine.has(sec) ? 0.6 : 1.5);
    if (p.strategy === "specialist") return mine.size && !mine.has(sec) ? roi * 0.3 : roi * 1.3;
    if (p.strategy === "integrate") {
      // Likes businesses that use what it makes, or make what it needs
      const makes = new Set(), needs = new Set();
      G.myBusinesses(st, p.id).forEach(x => { const t = G.BIZ_BY[x.type]; Object.keys(t.outputs).forEach(c => makes.add(c)); Object.keys(t.inputs).forEach(c => needs.add(c)); });
      const fits = Object.keys(o.b.inputs).some(c => makes.has(c)) || Object.keys(o.b.outputs).some(c => needs.has(c));
      return roi * (fits ? 1.6 : 0.8);
    }
    return roi;
  };

  // ---------- Card sense ----------
  // How much a player stands to gain or lose per round from each commodity: what their businesses
  // can make, plus what they hold.
  const exposure = (st, pid) => {
    const x = {};
    G.myBusinesses(st, pid).forEach(biz => { const b = G.BIZ_BY[biz.type];
      Object.entries(b.outputs).forEach(([c, q], i) => { if (i === 0) x[c] = (x[c] || 0) + q * st.prices[c] * (b.kind === "extract" ? G.richness(b, biz.territory) : 1); }); });
    const p = G.player(st, pid);
    Object.entries(p.stock).forEach(([c, q]) => x[c] = (x[c] || 0) + q * st.prices[c] * 0.3);
    return x;
  };
  const commoditiesOf = (target, chosen) => G.COM[target] ? [target] : target.startsWith("sector:") ? SECTORS[target.slice(7)].items
    : target === "all" ? COMMODITIES.map(c => c.id) : (target === "chosen commodity" || target === "shorts on it") ? [chosen] : [];

  // Score a card for player p: (our gain) − (leader's gain). Returns the best way to play it.
  G.bestCard = (st, p) => {
    const rivals = st.players.filter(x => x.id !== p.id);
    if (!p.hand.length || !rivals.length) return null;
    const leader = rivals.reduce((a, b) => G.netWorth(st, a) >= G.netWorth(st, b) ? a : b);
    const me = exposure(st, p.id), them = exposure(st, leader.id);
    const myBiz = G.myBusinesses(st, p.id), theirBiz = G.myBusinesses(st, leader.id);
    const bizValue = biz => { const b = G.BIZ_BY[biz.type]; return G.bizProfit(st, b, biz.territory) + 1; };
    let best = null;
    p.hand.forEach(id => {
      const card = G.CARD[id], needs = G.cardNeeds(card);
      const chosenOpts = needs.commodity ? COMMODITIES.filter(c => c.type !== "waste").map(c => c.id) : [null];
      chosenOpts.forEach(chosen => {
        let score = 0;
        const args = { card: id };
        if (chosen) args.commodity = chosen;
        card.fx.forEach(([hook, target, op, v]) => {
          const mult = hook === "demand" ? v : hook === "supply" ? 1 / v : hook === "stock" ? v : null;
          if (mult != null) commoditiesOf(target, chosen).forEach(c => score += ((me[c] || 0) - (them[c] || 0)) * (mult - 1) * (hook === "stock" ? 0.3 : 1));
          if (hook === "yield") {
            if (target === "your business" && myBiz.length) { const b = myBiz.reduce((a, c) => bizValue(a) > bizValue(c) ? a : c); args.ownBusiness = b.id; score += bizValue(b) * (v - 1); }
            if (target === "target business" && theirBiz.length) { const b = theirBiz.reduce((a, c) => bizValue(a) > bizValue(c) ? a : c); args.targetBusiness = b.id; score -= bizValue(b) * (v - 1); }
          }
          if (hook === "value" && theirBiz.length) { const b = theirBiz.at(-1); args.targetBusiness = b.id; score += b.cost * (1 - v) * 0.2; }
          if ((hook === "premium" || hook === "loan") && leader.loan > 0) { args.targetPlayer = leader.id; score += leader.loan * 0.05; }
          if (hook === "wages" && myBiz.length) { args.ownBusiness = myBiz[0].id; score += 5; }
          if (hook === "contract" && myBiz.length) { args.ownBusiness = myBiz[0].id; score += 10; }
          if (hook === "counter") score += 3;
        });
        const n = G.cardNeeds(card);
        if ((n.ownBusiness && !args.ownBusiness) || (n.targetBusiness && !args.targetBusiness) || (n.targetPlayer && !args.targetPlayer)) return;
        const full = p.hand.length >= GAME_SETTINGS.handMax;
        if ((score > 0.5 || (full && score >= 0)) && (!best || score > best.score)) best = { score, args };
      });
    });
    return best ? best.args : null;
  };

  G.bots.morning = (st, p) => {
    const need = myNeeds(st, p);
    // Sell everything not needed as an input; pay to get rid of waste
    Object.entries({ ...p.stock }).forEach(([c, q]) => {
      const extra = q - (need[c] || 0);
      if (extra <= 0) return;
      if (st.prices[c] > 0 || p.cash > -st.prices[c] * extra + 50) G.act(st, p.id, "sell", { id: c, qty: extra });
    });
    // Collect matured thinking: repay the loan when comfortably off
    if (p.loan > 0 && p.cash > 400) G.act(st, p.id, "repay", { amount: Math.min(p.loan, p.cash - 300) });
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
    // Borrow if something here would pay for itself quickly and we're short
    const best = G.buildable(st, p.pos, p.id).map(o => ({ ...o, profit: G.bizProfit(st, o.b, p.pos) }))
      .filter(o => o.profit > 0 && o.cost / o.profit <= 8).sort((a, b) => a.cost / a.profit - b.cost / b.profit)[0];
    if (best && p.cash < best.cost + 50) {
      const want = best.cost + 50 - p.cash, room = G.borrowLimit(st, p) - p.loan;
      if (room > want) G.act(st, p.id, "borrow", { amount: Math.ceil(want) });
    }
    // Park spare cash in bonds
    if (!best && p.cash > 600) G.act(st, p.id, "buyBond", { length: 5, count: Math.floor((p.cash - 400) / 100) });
  };

  G.bots.afternoon = (st, p) => {
    // Build here if something pays for itself within 12 rounds
    const opts = G.buildable(st, p.pos, p.id)
      .map(o => ({ ...o, profit: G.bizProfit(st, o.b, p.pos) }))
      .filter(o => o.profit > 0 && o.cost <= p.cash - 50 && o.cost / o.profit <= 12
        && Object.values(o.b.inputs).reduce((x, y) => x + y, 0) <= p.space)
      .sort((a, b) => appeal(st, p, b, p.pos) - appeal(st, p, a, p.pos));
    if (opts.length) G.act(st, p.id, "build", { type: opts[0].b.id });
    else {
      // Otherwise wander towards somewhere promising
      const score = tid => Math.max(0, ...G.buildable(st, tid, p.id).map(o => appeal(st, p, o, tid)));
      const next = G.neighbours(p.pos).map(t => ({ t, s: score(t) + G.rand(st) * 0.02 })).sort((a, b) => b.s - a.s)[0];
      if (next) G.act(st, p.id, "move", { to: next.t });
    }
    // Cards: play the one that helps us most relative to the leader (or hurts the leader most)
    const choice = G.bestCard(st, p);
    if (choice) G.act(st, p.id, "playCard", choice);
  };
})();
