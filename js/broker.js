// Sellers Market: broker and central bank settings.
// Kept deliberately simple for now. All rates are per round (one game day).

const BROKER = {
  // Base rate = inflation + 0.5%. Reviewed every 5 rounds.
  centralBank: {
    above: 0.005,   // the base rate sits 0.5% above inflation
    min: 0.0025,    // never below 0.25%
    max: 0.10,      // never above 10%
    reviewEvery: 5,
  },

  // Government loans.
  //   borrowing limit = 50% of (stockpile + businesses + bonds)
  //   loan rate = base + 1%
  //   each overnight: interest + 5% of the loan
  loans: {
    borrowShare: 0.5,
    extra: 0.01,
    repayShare: 0.05,
    forcedSaleDiscount: 0.2, // miss a margin call and the bank sells your things 20% under market
  },

  // Leverage: borrow from the broker to buy more.
  //   interest = base + 2% on the borrowed part
  //   the broker sells you out once you've lost 75% of your own money
  leverage: {
    max: 5,
    extra: 0.02,
    wipeout: 0.75,
  },

  // Futures: fix a price now for a later round.
  //   futures price = spot × (1 + base × rounds)
  futures: {
    deposit: 0.10,  // 10% of the contract value up front
    maxRounds: 10,
  },

  // Bonds: lend 100 to the government.
  //   pays the base rate (as it was when you bought) every overnight, and 100 back at the end
  //   sell early for 100 + (your rate − today's base rate) × 100 × rounds left
  bonds: {
    face: 100,
    lengths: [5, 10, 20],
  },

  // ETFs: one fund per sector. Buying a unit is a bet on the whole sector.
  //   ETF price = 100 × average of (price ÷ base price) across the sector's goods
  //   Wastes are left out. Units take no stockpile space.
  etfs: {
    start: 100,
    fee: 0.005, // 0.5% charged when you buy
    tickers: { food: "FOOD", forestry: "TIMB", mining: "MINE", metals: "METL", construction: "BILD" },
  },
};
