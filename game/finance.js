// Sellers Market game engine: the broker, the central bank and the government.
//
// Morning actions:  borrow, repay, buyBond, sellBond, openFuture, closeFuture, buyEtf, sellEtf
// Overnight steps (order set in pipeline.js):
//   centralBank    every 5 rounds: base rate = measured inflation + 0.5%;
//                  the government loosens or tightens how much you can borrow
//   payLoans       interest (base + 1% + any card premium) + 5% of the loan
//   payBonds       coupons, and 100 back when a bond ends
//   settleFutures  contracts due tonight pay out the price difference
//   marginCalls    loans above the borrowing limit: the bank sells your stock (then businesses) under market
//
// Rates are per round. Settings: js/broker.js (BROKER) plus game/settings.js (GAME_SETTINGS.finance).

(() => {
  const G = SMG, S = GAME_SETTINGS, F = S.finance, CB = BROKER.centralBank, LN = BROKER.loans, FU = BROKER.futures, EF = BROKER.etfs;
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

  G.onSetup.push(st => {
    st.baseRate = clamp(S.inflationPerRound + CB.above, CB.min, CB.max);
    st.borrowShare = LN.borrowShare;
    st.priceIndexHistory = [];
    st.players.forEach(p => { p.loan = 0; p.bonds = []; p.futures = []; p.etf = {}; p.premium = 0; p.counters = {}; });
    st.nextFinId = 1;
  });

  // ---------- Prices of financial things ----------
  const fx = st => (G.financeMods ? G.financeMods(st) : {});
  G.loanRate = (st, p) => st.baseRate + LN.extra + (p.premium || 0) + (fx(st).premium?.[p.id] || 0);
  G.borrowLimitShare = st => clamp(st.borrowShare + (fx(st).haircut || 0), 0, 1);
  G.bondRateNow = st => st.baseRate + (fx(st).termPrem || 0);
  G.bondValue = (st, b) => Math.max(0, BROKER.bonds.face + (b.rate - G.bondRateNow(st)) * BROKER.bonds.face * b.left);
  G.futuresPrice = (st, cid, rounds) => st.prices[cid] * (1 + st.baseRate * rounds);
  G.etfPrice = (st, sec) => {
    const ids = SECTORS[sec].items.filter(id => G.COM[id].type !== "waste");
    return EF.start * ids.reduce((s, id) => s + st.prices[id] / G.basePrice(id), 0) / ids.length;
  };
  G.futureValue = (st, f) => (f.side === "long" ? 1 : -1) * (G.futuresPrice(st, f.cid, Math.max(0, f.settle - st.round)) - f.price) * f.qty + f.deposit;
  G.bizValue = (st, b) => b.cost * S.businessValue * (b.valueMul || 1);

  // Everything a player owns and owes, valued at today's prices
  G.balanceSheet = (st, p) => {
    const stock = Object.entries(p.stock).reduce((s, [c, q]) => s + q * st.prices[c], 0);
    const businesses = G.myBusinesses(st, p.id).reduce((s, b) => s + G.bizValue(st, b), 0);
    const bonds = p.bonds.reduce((s, b) => s + b.count * G.bondValue(st, b), 0);
    const etfs = Object.entries(p.etf).reduce((s, [k, u]) => s + u * G.etfPrice(st, k), 0);
    const futures = p.futures.reduce((s, f) => s + G.futureValue(st, f), 0);
    const worth = p.cash + stock + businesses + bonds + etfs + futures - p.loan;
    return { cash: p.cash, stock, businesses, bonds, etfs, futures, loan: p.loan, worth };
  };

  // What the bank lends against: stockpile, businesses, bonds and ETFs
  G.collateral = (st, p) => Math.max(0, Object.entries(p.stock).reduce((s, [c, q]) => s + q * Math.max(0, st.prices[c]), 0))
    + G.myBusinesses(st, p.id).reduce((s, b) => s + G.bizValue(st, b), 0)
    + p.bonds.reduce((s, b) => s + b.count * G.bondValue(st, b), 0)
    + Object.entries(p.etf).reduce((s, [k, u]) => s + u * G.etfPrice(st, k), 0);
  G.borrowLimit = (st, p) => G.collateral(st, p) * G.borrowLimitShare(st);

  // ---------- Morning actions ----------
  const morning = st => G.need(st.phase === "morning" || st.phase === "afternoon", "The broker is closed right now.");
  const amt = x => { x = Math.round(+x * 100) / 100; G.need(x > 0, "Enter an amount."); return x; };

  G.actions.borrow = (st, p, { amount }) => {
    morning(st); amount = amt(amount);
    const room = G.borrowLimit(st, p) - p.loan;
    G.need(amount <= room + 1e-6, `You can borrow up to ${G.money(Math.max(0, room))} more.`);
    p.loan += amount; p.cash += amount; G.book(st, p, "Loan taken", amount);
    return `borrowed ${G.money(amount)} at ${(G.loanRate(st, p) * 100).toFixed(2)}% a round`;
  };
  G.actions.repay = (st, p, { amount }) => {
    morning(st); amount = Math.min(amt(amount), p.loan);
    G.need(p.loan > 0, "You have no loan."); G.need(p.cash >= amount, "Not enough cash.");
    p.loan -= amount; p.cash -= amount; G.book(st, p, "Loan repaid", -amount);
    return `repaid ${G.money(amount)} of their loan`;
  };
  G.actions.buyBond = (st, p, { length, count = 1 }) => {
    morning(st); count = Math.floor(count);
    G.need(BROKER.bonds.lengths.includes(+length), "Bonds last 5, 10 or 20 rounds."); G.need(count > 0, "Buy at least one.");
    const cost = BROKER.bonds.face * count;
    G.need(p.cash >= cost, `${count} bond${count > 1 ? "s" : ""} cost ${cost}.`);
    p.cash -= cost; G.book(st, p, "Bonds bought", -cost);
    const rate = G.bondRateNow(st);
    p.bonds.push({ id: st.nextFinId++, count, length: +length, left: +length, rate });
    return `bought ${count} ${length}-round bond${count > 1 ? "s" : ""} paying ${(rate * 100).toFixed(2)}%`;
  };
  G.actions.sellBond = (st, p, { id }) => {
    morning(st);
    const i = p.bonds.findIndex(b => b.id === +id); G.need(i >= 0, "No such bond.");
    const b = p.bonds[i], v = b.count * G.bondValue(st, b);
    p.cash += v; p.bonds.splice(i, 1); G.book(st, p, "Bonds sold", v);
    return `sold ${b.count} bond${b.count > 1 ? "s" : ""} for ${G.money(v)}`;
  };
  G.actions.openFuture = (st, p, { cid, side, qty, rounds }) => {
    morning(st); qty = Math.floor(qty); rounds = Math.floor(rounds);
    G.need(G.COM[cid] && st.prices[cid] > 0, "Pick a commodity."); G.need(side === "long" || side === "short", "Long or short?");
    G.need(qty > 0, "Enter a quantity."); G.need(rounds >= 1 && rounds <= FU.maxRounds, `1 to ${FU.maxRounds} rounds.`);
    const price = G.futuresPrice(st, cid, rounds);
    const deposit = price * qty * FU.deposit * (fx(st).futMargin || 1);
    G.need(p.cash >= deposit, `The deposit is ${G.money(deposit)}.`);
    p.cash -= deposit; G.book(st, p, "Futures", -deposit);
    p.futures.push({ id: st.nextFinId++, cid, side, qty, price, settle: st.round + rounds, deposit });
    return `${side === "long" ? "agreed to buy" : "agreed to sell"} ${qty} ${G.COM[cid].name} at ${G.money(price)} in ${rounds} round${rounds > 1 ? "s" : ""}`;
  };
  G.actions.closeFuture = (st, p, { id }) => {
    morning(st);
    const i = p.futures.findIndex(f => f.id === +id); G.need(i >= 0, "No such contract.");
    const v = G.futureValue(st, p.futures[i]);
    settleCash(st, p, v, "Futures"); p.futures.splice(i, 1);
    return `closed a futures contract early: ${v >= 0 ? "got back" : "paid"} ${G.money(Math.abs(v))}`;
  };
  G.actions.buyEtf = (st, p, { sector, units }) => {
    morning(st); units = Math.floor(units); G.need(SECTORS[sector] && units > 0, "Pick a fund and a number of units.");
    const cost = G.etfPrice(st, sector) * units * (1 + EF.fee);
    G.need(p.cash >= cost, `That costs ${G.money(cost)}.`);
    p.cash -= cost; p.etf[sector] = (p.etf[sector] || 0) + units; G.book(st, p, "ETFs bought", -cost);
    return `bought ${units} ${EF.tickers[sector]} for ${G.money(cost)}`;
  };
  G.actions.sellEtf = (st, p, { sector, units }) => {
    morning(st); units = Math.floor(units); G.need((p.etf[sector] || 0) >= units && units > 0, "You don't hold that many.");
    const v = G.etfPrice(st, sector) * units;
    p.cash += v; p.etf[sector] -= units; if (!p.etf[sector]) delete p.etf[sector]; G.book(st, p, "ETFs sold", v);
    return `sold ${units} ${EF.tickers[sector]} for ${G.money(v)}`;
  };

  // Money in; money out, and anything you can't pay is added to your loan
  function settleCash(st, p, v, cat = "Other") {
    p.cash += v; G.book(st, p, cat, v);
    if (p.cash < 0) { p.loan += -p.cash; G.log(st, `couldn't cover ${G.money(-p.cash)}; it was added to their loan`, p.id); p.cash = 0; }
  }
  G.settleCash = settleCash;

  // Sell stock under market until `amount` is raised (used when a loan is called in)
  G.raiseCash = (st, p, amount) => {
    const disc = fx(st).fireSale ?? LN.forcedSaleDiscount;
    Object.entries(p.stock).filter(([c]) => st.prices[c] > 0).sort((a, b) => st.prices[b[0]] - st.prices[a[0]]).forEach(([c, q]) => {
      if (amount <= 0) return;
      const each = st.prices[c] * (1 - disc), n = Math.min(q, Math.ceil(amount / each));
      G.add(p, c, -n); p.loan = Math.max(0, p.loan - n * each); amount -= n * each;
    });
    G.log(st, `had to sell stock under market to repay a called-in loan`, p.id);
  };

  // ---------- Overnight ----------
  // Average real price movement: geometric mean of price ÷ base across all non-waste goods
  const priceIndex = st => {
    const ids = COMMODITIES.filter(c => c.type !== "waste").map(c => c.id);
    return Math.exp(ids.reduce((s, id) => s + Math.log(Math.max(1e-6, st.prices[id] / G.basePrice(id))), 0) / ids.length);
  };

  G.centralBank = st => {
    st.priceIndexHistory.push(priceIndex(st));
    const h = st.priceIndexHistory, n = CB.reviewEvery;
    if (st.round % n !== 0 || h.length <= n) return;
    const measured = Math.pow(h.at(-1) / h.at(-1 - n), 1 / n) - 1;
    const old = st.baseRate;
    st.baseRate = clamp(measured + CB.above, CB.min, CB.max);
    // The government tightens lending when prices run hot, and loosens it when they're flat or falling
    const oldShare = st.borrowShare;
    if (measured > F.tightenAbove) st.borrowShare = Math.max(F.borrowShareMin, st.borrowShare - F.borrowShareStep);
    else if (measured < F.loosenBelow) st.borrowShare = Math.min(F.borrowShareMax, st.borrowShare + F.borrowShareStep);
    G.log(st, `Central bank review: prices rose ${(measured * 100).toFixed(1)}% a round, so the base rate ${st.baseRate > old + 1e-6 ? "goes up" : st.baseRate < old - 1e-6 ? "comes down" : "stays"} at ${(st.baseRate * 100).toFixed(2)}%.` +
      (st.borrowShare !== oldShare ? ` The government ${st.borrowShare > oldShare ? "loosens" : "tightens"} lending: you can now borrow ${Math.round(st.borrowShare * 100)}% of what you own.` : ""));
  };

  G.payLoans = st => st.players.forEach(p => {
    if (p.loan <= 0.005) { p.loan = 0; return; }
    const rate = G.loanRate(st, p), interest = p.loan * rate, principal = Math.min(p.loan, p.loan * LN.repayShare);
    const due = interest + principal;
    if (p.cash >= due) { p.cash -= due; p.loan -= principal; G.book(st, p, "Loan interest", -interest); G.book(st, p, "Loan repaid", -principal); G.log(st, `paid ${G.money(due)} on their loan (${G.money(interest)} interest)`, p.id); }
    else { const short = due - p.cash; G.book(st, p, "Loan interest", -p.cash); p.loan += short - principal; p.cash = 0; G.log(st, `couldn't make a loan payment; ${G.money(short)} was added to the loan`, p.id); }
  });

  G.payBonds = st => st.players.forEach(p => {
    p.bonds.forEach(b => { p.cash += b.count * BROKER.bonds.face * b.rate; G.book(st, p, "Bond interest", b.count * BROKER.bonds.face * b.rate); b.left--; });
    p.bonds.filter(b => b.left <= 0).forEach(b => { p.cash += b.count * BROKER.bonds.face; G.book(st, p, "Bonds repaid", b.count * BROKER.bonds.face); G.log(st, `${b.count} bond${b.count > 1 ? "s" : ""} ended: ${b.count * BROKER.bonds.face} back`, p.id); });
    p.bonds = p.bonds.filter(b => b.left > 0);
  });

  G.settleFutures = st => st.players.forEach(p => {
    const cancelled = fx(st).futuresCancel || [];
    p.futures.filter(f => f.settle <= st.round + 1 || cancelled.includes(f.cid)).forEach(f => {
      if (cancelled.includes(f.cid)) { p.cash += f.deposit; G.book(st, p, "Futures", f.deposit); G.log(st, `${G.COM[f.cid].name} futures contract torn up; ${G.money(f.deposit)} deposit returned`, p.id); return; }
      const pay = (f.side === "long" ? 1 : -1) * (st.prices[f.cid] - f.price) * f.qty;
      settleCash(st, p, f.deposit + pay, "Futures");
      G.log(st, `${G.COM[f.cid].name} futures settled: ${pay >= 0 ? "made" : "lost"} ${G.money(Math.abs(pay))}`, p.id);
    });
    p.futures = p.futures.filter(f => !(f.settle <= st.round + 1 || cancelled.includes(f.cid)));
  });

  G.marginCalls = st => st.players.forEach(p => {
    const limit = G.borrowLimit(st, p);
    if (p.loan <= limit + 0.01) return;
    if (p.counters?.bailout) { p.counters.bailout--; G.log(st, `${p.name}'s margin call was covered by a government bailout`); return; }
    const disc = fx(st).fireSale ?? LN.forcedSaleDiscount;
    let short = p.loan - limit;
    const before = short;
    // Sell stock, dearest first, under market
    Object.entries(p.stock).filter(([c]) => st.prices[c] > 0).sort((a, b) => st.prices[b[0]] - st.prices[a[0]]).forEach(([c, q]) => {
      if (short <= 0) return;
      const each = st.prices[c] * (1 - disc), n = Math.min(q, Math.ceil(short / each));
      G.add(p, c, -n); p.loan = Math.max(0, p.loan - n * each); short -= n * each;
    });
    // Then businesses, newest first
    while (short > 0.01) {
      const b = G.myBusinesses(st, p.id).at(-1); if (!b) break;
      const v = G.bizValue(st, b) * (1 - disc);
      st.businesses = st.businesses.filter(x => x !== b);
      p.loan = Math.max(0, p.loan - v); short -= v;
      G.log(st, `${p.name}'s ${G.BIZ_BY[b.type].name.toLowerCase()} in ${G.TERR[b.territory].name} was seized and sold`);
      short = p.loan - G.borrowLimit(st, p);
    }
    G.log(st, `Margin call on ${p.name}: the bank sold ${G.money(Math.min(before, before - Math.max(0, short)))} of their things ${Math.round(disc * 100)}% under market`);
  });
})();
