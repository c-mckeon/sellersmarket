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
    demandWeight: 0.3,       // how hard unmet needs push prices up (0 = ignore needs)
  },

  // Production
  extractOutput: 1,        // multiplies what every mine, farm and well makes (1 = as listed on the Territories tab)
  overflowSale: 0,         // anything that doesn't fit in your stockpile is sold off at this share of the price (0 = it's lost)

  // Building
  buildCostScale: 1.5,     // multiplies every build cost
  ownedCostStep: 0.3,      // each business you already own makes your next one this much dearer (0.15 = +15%)

  // Running costs: paid overnight for each business, as a share of its base build cost, × the territory's
  // cost level × inflation. A business whose wages can't be paid sits idle the next midday.
  wageRate: 0.04,

  // Business value counted in net worth, as a share of what it cost to build
  businessValue: 0.6,
};
