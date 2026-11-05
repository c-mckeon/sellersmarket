// Sellers Market: game settings. Every number the game engine uses lives here.
// Change these freely. Tuned with tools/sim.js on 2026-11-05 (see the commit message for the numbers).

const GAME_SETTINGS = {
  rounds: 30,              // the game ends after this many rounds; highest net worth wins
  startCash: 300,
  startSpace: 10,          // stockpile crates at the start; 1 unit of anything = 1 crate

  // Buying more stockpile space (mornings only)
  spaceUpgrade: { crates: 5, firstCost: 50, costStep: 25 }, // 50, then 75, then 100…

  // Cards
  cardsPerRound: 2,        // drawn at the end of every round
  handMax: 5,
  cardsPerAfternoon: 1,
  rarityWeight: { common: 6, uncommon: 3, rare: 1 },

  // Afternoon: each player may move to one neighbouring territory OR build one business
  afternoonActions: 1,

  // Pricing (see game/pricing.js)
  inflationPerRound: 0.01,
  pricing: {
    background: 5,           // an imaginary "rest of the economy" stock, in a balanced mix, as big as
                             // all players' stockpile space added together (5 = five times the size).
                             // Keeps prices at base when stockpiles are empty, and stops one crate
                             // swinging prices wildly.
    shareRange: 5,           // shares count as no more than 5× above or below balance
    demandWeight: 1,         // how hard supply and demand move prices (0 = ignore them):
                             //   Demand = ((need + normal) ÷ (can make + normal)) ^ demandWeight
    normalDemand: 1.5,       // outside demand for each good: this many ordinary businesses' output, per player,
                             // per round. Bigger = gentler on producers.
    demandRange: 4,          // the supply-and-demand factor stays between ÷4 and ×4
    capacityWeight: 0,       // (older approach) count production capacity as stock too. 0 = off; supply and
                             // demand now handles it.
    floors: { gold: 0.8 },   // these never sell below this many times base (gold is a store of value)
    spread: 0.05,            // the market buys from you this much under the price, and sells this much over it
                             // (0.05 = 5%). Makes it pay to supply your own inputs.     // these never sell below this many times base (gold is a store of value)
  },

  // Production
  extractOutput: 1.2,      // multiplies what every mine, farm and well makes (1 = as listed on the Territories tab)
  overflowSale: 0,         // anything that doesn't fit in your stockpile is sold off at this share of the price (0 = it's lost)

  // Building
  buildCostScale: 1.5,     // multiplies every build cost
  ownedCostStep: 0.3,      // each business you already own makes your next one this much dearer (0.15 = +15%)

  // Running costs: paid overnight for each business, as a share of its base build cost, × the territory's
  // cost level × inflation. A business whose wages can't be paid sits idle the next midday.
  wageRate: 0.03,

  // Finance: the government tightens or loosens lending at each central bank review
  finance: {
    tightenAbove: 0.03,      // prices rising faster than 3% a round: you can borrow 5 points less of what you own
    loosenBelow: 0.005,      // slower than 0.5%: 5 points more
    borrowShareStep: 0.05, borrowShareMin: 0.3, borrowShareMax: 0.6,
  },

  // Business value counted in net worth, as a share of what it cost to build
  businessValue: 0.6,
};
