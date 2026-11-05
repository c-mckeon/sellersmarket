// Sellers Market: game settings. Every number the game engine uses lives here.
// Change these freely; simulations will help us tune them.

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
  inflationPerRound: 0.02,
  pricing: {
    background: 1,           // an imaginary "rest of the economy" stock, in a balanced mix, as big as
                             // all players' stockpile space added together (1 = the same size).
                             // Keeps prices at base when stockpiles are empty, and stops one crate
                             // swinging prices wildly.
    shareRange: 10,          // shares count as no more than 10× above or below balance
    demandWeight: 1,         // how hard unmet needs push prices up (0 = ignore needs)
  },

  // Production overflow: anything that doesn't fit in your stockpile is sold off at this share of the price
  overflowSale: 0.8,

  // Business value counted in net worth, as a share of what it cost to build
  businessValue: 1.0,
};
