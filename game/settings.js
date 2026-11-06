// Sellers Market: game settings. Every number the game engine uses lives here.
// Change these freely, then check them with tools/sim.js.

const GAME_SETTINGS = {
  rounds: 30,              // the game ends after this many rounds; most points wins, cash breaks ties
  startCash: 1000,         // the only money there will ever be. It's used for trading and nothing else.
  startBusinesses: 2,      // the business you pick, plus the one that goes with it (a farm and a flour mill…)
  startSpace: 30,          // stockpile crates at the start; 1 unit of anything = 1 crate

  // Starting goods, on top of one round's output of your free business
  startGoods: { lumber: 6, iron: 4 },

  // Buying more stockpile space (any phase): paid in lumber
  spaceUpgrade: { crates: 10, lumber: 4, lumberStep: 2 }, // 4 lumber, then 6, then 8…

  // Afternoon: each player may move to one neighbouring territory OR build one business
  afternoonActions: 1,

  // ---------- The market (game/market.js) ----------
  // One sealed auction per phase. Every good clears at a single price set by the players' own bids and asks.
  market: {
    maxPrice: 10000,       // no order may be priced above this
  },

  // ---------- Contracts (game/contracts.js) ----------
  contracts: {
    hand: 3,               // contracts each player holds; refilled overnight
    goodsPerContract: [2, 3], // fewest and most different goods a contract asks for
    size: 10,              // how big a contract is, in raw-material units (see G.rawUnits)
    pointsPerUnit: 0.5,    // points per raw-material unit delivered
    distanceBonus: 0.15,   // +15% points for every step the goods' nearest source is away from you
    // The goods that contracts ask for. The other goods only matter as steps in making these.
    goods: ["bread", "flour", "lumber", "iron", "glass", "ceramic", "paper", "fuel", "plastic", "copper",
            "aluminium", "cement", "steel", "wire"],
  },

  // ---------- Building (game/map.js) ----------
  // Businesses are paid for in goods, not cash. Each crate of material covers this much of the
  // business's base cost (js/businesses.js), after the territory's cost level and crowding.
  build: {
    valuePerCrate: 40,
    ownedCostStep: 0.15,   // each business you already own makes your next one 15% dearer
    // What each tier of business is built from (shares of the total crates)
    materials: {
      0: { lumber: 1 },                                  // mines, farms, wells
      1: { lumber: 0.5, iron: 0.5 },                     // factories making simple materials
      2: { lumber: 0.3, iron: 0.4, glass: 0.3 },
      3: { steel: 0.5, glass: 0.3, lumber: 0.2 },        // (no concrete: the concrete plant is tier 3)
      4: { steel: 0.4, glass: 0.2, concrete: 0.4 },
    },
  },

  // Production
  extractOutput: 1.2,      // multiplies what every mine, farm and well makes (1 = as listed on the Territories tab)

  // ---------- Switched off for now ----------
  // Cards, wages, inflation and the broker (loans, bonds, futures, ETFs) are kept in the code but not
  // used while the market is player-only. Their old settings stay so the code still loads.
  cardsPerRound: 0, handMax: 5, cardsPerAfternoon: 0,
  rarityWeight: { common: 6, uncommon: 3, rare: 1 },
  wageRate: 0,
  inflationPerRound: 0,
  overflowSale: 0,
  businessValue: 0,
  buildCostScale: 1,
  finance: { tightenAbove: 0.03, loosenBelow: 0.005, borrowShareStep: 0.05, borrowShareMin: 0.3, borrowShareMax: 0.6 },
};
