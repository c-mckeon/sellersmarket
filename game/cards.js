// Sellers Market game engine: action cards.
//
// - Every player draws 2 cards at the end of each round, up to a hand of 5.
// - In the afternoon a player may play 1 card. Cards are revealed and take effect overnight.
// - Each card is a list of effects on "hooks" (see js/cards.js). Effects either happen once,
//   overnight, or stay active for a number of rounds (or until repealed).
// - Counter cards (Insurance payout, Bailout) can't be played in reaction, because everyone plays
//   at once. Instead you play them in advance: they protect you from the next hit.

(() => {
  const G = SMG, S = GAME_SETTINGS;
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

  // ---------- Which cards the engine can play ----------
  const COMMODITY_T = t => !!G.COM[t] || t.startsWith("sector:") || t === "all" || t === "chosen commodity";
  const READY = {
    stock: COMMODITY_T, supply: COMMODITY_T, demand: COMMODITY_T, e: COMMODITY_T, cap: COMMODITY_T, inflation: t => t === "all",
    yield: t => ["your business", "target business", "all businesses"].includes(t),
    wages: t => t === "your business", value: t => t === "target business", contract: t => t === "your business",
    baseRate: () => true, premium: t => t === "target player", haircut: () => true, loan: t => t === "target player",
    termPrem: () => true, fireSale: () => true, futures: t => t === "chosen commodity", futMargin: () => true, maxLev: () => true,
    tax: t => ["coal used by businesses", "every trade", "big winners"].includes(t), wasteFee: COMMODITY_T,
    counter: t => ["a business card on you", "a margin call on you"].includes(t),
  };
  const ready = f => READY[f[0]] && READY[f[0]](f[1]);

  G.CARD = Object.fromEntries(CARDS.map((c, i) => [i + 1, { ...c, id: i + 1 }]));
  G.DECK = Object.values(G.CARD).filter(c => c.fx.every(ready));
  G.cardNeeds = card => ({
    commodity: card.fx.some(f => f[1] === "chosen commodity" || f[1] === "shorts on it"),
    ownBusiness: card.fx.some(f => f[1] === "your business"),
    targetBusiness: card.fx.some(f => f[1] === "target business"),
    targetPlayer: card.fx.some(f => f[1] === "target player"),
  });

  // How an effect reads in plain words
  G.fxText = ([hook, target, op, v, rounds]) => {
    const H = HOOKS[hook] ? HOOKS[hook].name : hook;
    const on = G.COM[target] ? G.COM[target].name : target.startsWith("sector:") ? (SECTORS[target.slice(7)]?.name ?? target.slice(7)) : target === "all" ? "everything" : target;
    const amount = op === "×" ? `×${v}` : op === "+" ? (Math.abs(v) < 1 && hook !== "e" && hook !== "tax" ? `${v > 0 ? "+" : "−"}${+(Math.abs(v) * 100).toFixed(2)}%` : `${v > 0 ? "+" : "−"}${Math.abs(v)}`)
      : op === "%" ? `${+(v * 100).toFixed(1)}%` : op === "=" ? (v < 1 ? `set to ${v * 100}%` : `set to ${v}`) : op === "×base" ? `max ${v}× base`
      : op === "repay" ? `repay ${v * 100}%` : op === "units" ? `${v} units a round` : op === "cancel" ? "cancelled" : `${op} ${v}`;
    const dur = rounds === 0 ? "once" : rounds == null ? "until repealed" : `${rounds} round${rounds > 1 ? "s" : ""}`;
    return { hook: H, on, amount, dur };
  };

  // ---------- Drawing ----------
  G.draw = (st, p, n) => {
    const total = G.DECK.reduce((s, c) => s + S.rarityWeight[c.rarity], 0);
    for (let k = 0; k < n && p.hand.length < S.handMax; k++) {
      let r = G.rand(st) * total;
      p.hand.push((G.DECK.find(c => (r -= S.rarityWeight[c.rarity]) < 0) || G.DECK[0]).id);
    }
  };
  G.onSetup.push(st => st.players.forEach(p => G.draw(st, p, S.cardsPerRound)));
  G.drawCards = st => st.players.forEach(p => G.draw(st, p, S.cardsPerRound));

  // ---------- Playing (afternoon) ----------
  G.actions.playCard = (st, p, { card, commodity, ownBusiness, targetBusiness, targetPlayer }) => {
    G.need(st.phase === "day", "Not right now.");
    G.need(p.cardsPlayed < S.cardsPerAfternoon, "You've already played a card this round.");
    const i = p.hand.indexOf(+card); G.need(i >= 0, "That card isn't in your hand.");
    const c = G.CARD[+card], needs = G.cardNeeds(c);
    if (needs.commodity) G.need(G.COM[commodity], "Choose a commodity.");
    if (needs.ownBusiness) G.need(st.businesses.some(b => b.id === +ownBusiness && b.owner === p.id), "Choose one of your businesses.");
    if (needs.targetBusiness) G.need(st.businesses.some(b => b.id === +targetBusiness), "Choose a business to target.");
    if (needs.targetPlayer) G.need(st.players.some(x => x.id === +targetPlayer), "Choose a player to target.");
    p.hand.splice(i, 1); p.cardsPlayed++;
    st.pending.push({ card: +card, by: p.id, commodity, ownBusiness: +ownBusiness || null, targetBusiness: +targetBusiness || null, targetPlayer: +targetPlayer || null });
    return `played a card face down`;
  };

  // ---------- Overnight: reveal and apply ----------
  const commoditiesFor = (t, pl) => G.COM[t] ? [t] : t.startsWith("sector:") ? (SECTORS[t.slice(7)]?.items || [])
    : t === "all" ? COMMODITIES.map(c => c.id) : (t === "chosen commodity" || t === "shorts on it") ? [pl.commodity] : [];
  const businessesFor = (st, t, pl) => t === "your business" ? [pl.ownBusiness] : t === "target business" ? [pl.targetBusiness]
    : t === "all businesses" ? st.businesses.map(b => b.id) : [];

  G.resolveCards = st => {
    st.pending.forEach(pl => {
      const c = G.CARD[pl.card], who = G.player(st, pl.by);
      const tgtBiz = pl.targetBusiness && st.businesses.find(b => b.id === pl.targetBusiness);
      const tgtPlayer = pl.targetPlayer && G.player(st, pl.targetPlayer);
      let extra = "";
      if (tgtBiz) extra = ` (on ${G.player(st, tgtBiz.owner).name}'s ${G.BIZ_BY[tgtBiz.type].name.toLowerCase()} in ${G.TERR[tgtBiz.territory].name})`;
      if (tgtPlayer) extra = ` (on ${tgtPlayer.name})`;
      if (pl.commodity && !tgtBiz && !tgtPlayer) extra = ` (on ${G.COM[pl.commodity].name})`;
      // Insurance: a business card aimed at someone holding cover is cancelled
      if (tgtBiz && c.cat === "business") {
        const owner = G.player(st, tgtBiz.owner);
        if (owner.id !== pl.by && owner.counters.insurance > 0) {
          owner.counters.insurance--;
          G.log(st, `${who.name} played ${c.name}${extra}, but ${owner.name}'s insurance cancelled it.`);
          return;
        }
      }
      G.log(st, `${who.name} played ${c.name}${extra}: ${c.text}`);
      c.fx.forEach(([hook, target, op, v, rounds]) => {
        const last = rounds == null ? Infinity : st.round + Math.max(1, rounds);
        const effect = targets => st.effects.push({ card: c.id, by: pl.by, hook, target, targets, op, v, from: st.round + 1, until: last });
        switch (hook) {
          case "stock": // destroy (or add) a share of everyone's stock now
            commoditiesFor(target, pl).forEach(id => st.players.forEach(p => { if (p.stock[id]) G.add(p, id, Math.floor(p.stock[id] * v) - p.stock[id]); }));
            break;
          case "baseRate":
            st.baseRate = clamp(st.baseRate + v, BROKER.centralBank.min, BROKER.centralBank.max);
            break;
          case "loan": { // repay a share of the loan now; anything you can't pay is raised by selling stock
            const p = tgtPlayer; if (!p || p.loan <= 0) break;
            let due = p.loan * v; const pay = Math.min(due, p.cash); p.cash -= pay; p.loan -= pay; due -= pay; G.book(st, p, "Loan repaid", -pay);
            if (due > 0) G.raiseCash(st, p, due);
            break;
          }
          case "futures": // contracts on the chosen commodity are torn up, deposits returned
            st.players.forEach(p => { p.futures.filter(f => f.cid === pl.commodity).forEach(f => { p.cash += f.deposit; G.book(st, p, "Futures", f.deposit); }); p.futures = p.futures.filter(f => f.cid !== pl.commodity); });
            break;
          case "futMargin":
            if (target === "shorts on it") st.players.forEach(p => p.futures.filter(f => f.cid === pl.commodity && f.side === "short").forEach(f => { G.settleCash(st, p, -f.deposit, "Futures"); f.deposit *= 2; }));
            else effect([]);
            break;
          case "tax":
            if (target === "big winners") st.players.forEach(p => {
              const before = st.lastWorth?.[p.id], now = G.netWorth(st, p);
              if (before > 0 && now > before * 1.2) { const tax = (now - before * 1.2) * v; G.settleCash(st, p, -tax, "Taxes"); G.log(st, `paid ${G.money(tax)} in windfall tax`, p.id); }
            });
            else effect([]);
            break;
          case "value": businessesFor(st, target, pl).forEach(id => { const b = st.businesses.find(x => x.id === id); if (b) b.valueMul = (b.valueMul || 1) * v; }); break;
          case "wages": businessesFor(st, target, pl).forEach(id => { const b = st.businesses.find(x => x.id === id); if (b) b.wageMul = (b.wageMul || 1) * v; }); break;
          case "counter": who.counters[target.includes("margin") ? "bailout" : "insurance"] = (who.counters[target.includes("margin") ? "bailout" : "insurance"] || 0) + 1; break;
          case "maxLev": break; // no leverage in the game yet
          case "yield": case "contract": effect(businessesFor(st, target, pl)); break;
          case "premium": effect([pl.targetPlayer]); break;
          default: effect(commoditiesFor(target, pl)); // supply, demand, e, cap, inflation, wasteFee, haircut, termPrem, fireSale
        }
      });
    });
    st.pending = [];
  };

  // Effects are active from the round after they're played to `until` inclusive.
  // Overnight we're setting up the next round, so count from that one.
  G.activeEffects = st => { const r = st.round + (st.phase === "night" ? 1 : 0); return st.effects.filter(e => e.from <= r && r <= e.until); };
  G.expireEffects = st => { st.effects = st.effects.filter(e => e.until > st.round); };

  // Price modifiers by commodity
  G.modifiers = st => {
    const m = {};
    G.activeEffects(st).forEach(e => {
      if (!["supply", "demand", "e", "cap", "wasteFee"].includes(e.hook)) return;
      e.targets.forEach(id => {
        const x = m[id] ||= {};
        if (e.hook === "demand") x.demand = (x.demand || 1) * e.v;
        if (e.hook === "supply") x.supply = (x.supply || 1) * e.v;
        if (e.hook === "wasteFee") x.wasteFee = (x.wasteFee || 1) * e.v;
        if (e.hook === "e") { if (e.op === "×") x.eMul = (x.eMul || 1) * e.v; else x.eAdd = (x.eAdd || 0) + e.v; }
        if (e.hook === "cap") x.cap = Math.min(x.cap ?? Infinity, e.v);
      });
    });
    return m;
  };
  G.inflationBoost = st => G.activeEffects(st).filter(e => e.hook === "inflation").reduce((s, e) => s + e.v, 0);
  G.businessYield = st => {
    const y = {};
    G.activeEffects(st).filter(e => e.hook === "yield").forEach(e => e.targets.forEach(id => y[id] = (y[id] ?? 1) * e.v));
    return y;
  };
  // Finance and tax modifiers
  G.financeMods = st => {
    const f = { premium: {} };
    G.activeEffects(st).forEach(e => {
      if (e.hook === "premium") e.targets.forEach(pid => f.premium[pid] = (f.premium[pid] || 0) + e.v);
      if (e.hook === "haircut") f.haircut = (f.haircut || 0) + e.v;
      if (e.hook === "termPrem") f.termPrem = (f.termPrem || 0) + e.v;
      if (e.hook === "fireSale") f.fireSale = e.v;
      if (e.hook === "futMargin") f.futMargin = (f.futMargin || 1) * e.v;
      if (e.hook === "tax" && e.target === "every trade") f.tradeTax = (f.tradeTax || 0) + e.v;
      if (e.hook === "tax" && e.target === "coal used by businesses") f.coalTax = (f.coalTax || 0) + e.v;
    });
    return f;
  };

  // Government contracts: the state buys some of your output each overnight at base + 20%
  G.governmentContracts = st => G.activeEffects(st).filter(e => e.hook === "contract").forEach(e => e.targets.forEach(id => {
    const biz = st.businesses.find(b => b.id === id); if (!biz) return;
    const p = G.player(st, biz.owner), cid = G.BIZ_BY[biz.type].makes, n = Math.min(e.v, p.stock[cid] || 0);
    if (!n) return;
    const price = G.basePrice(cid) * 1.2 * st.priceLevel;
    G.add(p, cid, -n); p.cash += n * price; G.book(st, p, "Government contract", n * price);
    G.log(st, `sold ${n} ${G.COM[cid].name} to the government for ${G.money(n * price)}`, p.id);
  }));

  // Remember everyone's net worth each night (for the windfall tax)
  // Each night: remember everyone's net worth (windfall tax) and a balance sheet (the dashboard)
  G.rememberWorth = st => {
    st.lastWorth = Object.fromEntries(st.players.map(p => [p.id, G.netWorth(st, p)]));
    st.players.forEach(p => {
      const sheet = G.balanceSheet(st, p);
      (p.sheets ||= []).push({ round: st.round, ...sheet });
      if (p.sheets.length > 6) p.sheets.shift();
    });
  };
})();
