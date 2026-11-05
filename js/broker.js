// Sellers Market: broker and central bank settings.
// All rates are per round (one game day), not per year.

const BROKER = {
  // The central bank sets the base rate: what it costs to borrow from the government.
  //   base = neutral + response × (inflation − target), kept between min and max
  // Inflation above target pushes the rate up (to cool things down); below target pulls it down.
  centralBank: {
    neutral: 0.025,    // 2.5% a round: the rate when inflation is exactly on target
    target: 0.02,      // 2% a round inflation is what the bank aims for
    response: 1.5,     // each 1% of inflation above target adds 1.5% to the rate
    min: 0.0025,       // never below 0.25%
    max: 0.10,         // never above 10%
    reviewEvery: 5,    // the bank only changes the rate every 5 rounds
  },

  // Government loans. Secured against what you own (collateral).
  //   credit limit = Σ collateral value × (1 − haircut)
  //   loan rate    = base + premium, where premium = minPremium + ltvPremium × LTV
  //   overnight payment = interest + repay share × loan
  loans: {
    haircut: { holdings: 0.5, businesses: 0.4, bonds: 0.1 }, // value knocked off each kind of collateral
    minPremium: 0.005,   // +0.5% a round even for the safest borrower
    ltvPremium: 0.03,    // +3% a round more for a fully borrowed-up borrower (LTV 100%)
    repayShare: 0.05,    // 5% of the loan is paid back every overnight (so ~20 rounds to clear)
    forcedSaleDiscount: 0.2, // if you can't meet a margin call, the bank sells your stuff 20% under market
  },

  // Leverage: buy more than you can afford, with the broker lending the rest.
  //   position = own money × leverage, borrowed = position − own money
  //   liquidation price = entry × (leverage − 1) ÷ (leverage × (1 − maintenance))
  leverage: {
    max: 5,             // up to 5× your own money
    spread: 0.02,       // broker charges base + 2% a round on what it lends
    maintenance: 0.25,  // your stake must stay at least 25% of the position, or it's sold
  },

  // Futures: agree today on a price to buy or sell on a later round. Cash-settled.
  //   futures price = spot × (1 + base + storage) ^ rounds
  futures: {
    storage: 0.005,       // 0.5% a round: the cost of keeping goods in a warehouse
    initialMargin: 0.10,  // put down 10% of the contract value up front
    maintenanceMargin: 0.075, // top up if your margin falls below 7.5%
    maxRounds: 10,        // contracts run for up to 10 rounds
  },

  // Government bonds: lend to the government for a fixed number of rounds.
  //   coupon = yield on the day it's issued, paid every overnight
  //   yield  = base + termPremium × rounds left
  //   price  = coupons left + face value, each discounted at today's yield
  bonds: {
    face: 100,            // each bond pays back 100 at the end
    maturities: [5, 10, 20],
    termPremium: 0.0005,  // +0.05% a round for every round of lending
  },
};
