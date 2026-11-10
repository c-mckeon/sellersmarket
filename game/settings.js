// Sellers Market: game settings. Every number the game engine uses lives here.
// Change these freely, then check them with tools/sim.js.

const GAME_SETTINGS = {
  rounds: 30,              // the game ends after this many rounds; most points wins, cash breaks ties
  startCash: 1000,         // the only money there will ever be. It's used for trading and nothing else.
  startBusinesses: 2,      // the business you pick, plus the one that goes with it (a farm and a flour mill…)
  startSpace: 20,          // your stockpile: 20 rows, one unit of anything in each
  unlimitedSpace: false,
  fifo: true,              // the stockpile is first in, first out: when it overflows, the oldest units are pushed out
  businessStock: false,    // false: what your businesses make goes straight into your stockpile
  businessSpace: 10,       // (only with businessStock: how many units each business holds)

  // Starting goods, on top of one round's output of your free business
  startGoods: {},

  // Each round, besides trading, each player may move to one neighbouring territory OR build one business.
  // Building is free; each territory allows only certain businesses (js/territories.js). Every business
  // makes 2 of its product a round (js/businesses.js, js/commodities.js).

  // ---------- The market (game/market.js) ----------
  // One sealed auction a round, at night. Every good clears at a single price set by the players' own bids and asks.
  market: {
    maxPrice: 10000,       // no order may be priced above this
    bookRounds: 30,        // how many rounds of full order books to keep, for the order book replay
    // No prices are set by the game: raw goods have none until they trade, and a made good's "cost basis"
    // (G.costBasis) is just its raw materials at their last traded prices.
  },

  // ---------- Contracts (game/contracts.js) ----------
  contracts: {
    hand: 3,               // contracts each player holds; refilled overnight
    goodsPerContract: [2, 3], // fewest and most different goods a contract asks for
    size: 10,              // how big a contract is, in raw-material units (see G.rawUnits)
    maxUnits: 12,          // …but never more than this many units in all (the stockpile has 20 rows)
    pointsPerUnit: 0.5,    // points per raw-material unit delivered
    distanceBonus: 0.15,   // +15% points for every step the goods' nearest source is away from you
    distancePower: 2,      // how strongly contracts lean to faraway goods: chance ∝ (1 + distance) ^ this
    // The goods that contracts ask for: 9 made goods from 6 regional raw materials, plus wheat and water
    // from anywhere. (Concrete is left out: it's a building material.) Waste and raw goods never go in
    // this list (rawShare and raws below cover raw ones).
    // Simulations: 13 made + 8 raw → 9 + 6 took players who never deliver from 75% to 42%.
    rawShare: 0.5,         // chance that each good on a contract is a raw one (wood, clay, coal…) instead: raw goods come
                           // from one faraway region, so these usually have to be bought from whoever mines them
    tierBonus: 0.25,        // +this share of points per processing step (raw 0, lumber 1, steel 2…)
    goods: ["flour", "lumber", "glass", "ceramic", "iron",   // level 1
            "bread", "paper", "cement", "steel"],          // level 2
    // The raw materials contracts can ask for (and that spread-out starts hand out: G.spreadStarts)
    raws: ["wood", "sand", "clay", "limestone", "coal", "iron_ore"],
  },

  // ---------- Depreciation (game/depreciation.js) ----------
  // How many rounds a good lasts before it goes off. Its own entry first, then its kind, then life.
  // 0 = never. Lifetimes need to be longer than it takes to gather a contract or a big build.
  depreciation: {
    on: true,
    life: 8,
    byType: { raw: 8, made: 8, waste: 4 },
    goods: {
      wheat: 4, water: 3, flour: 4, bread: 2,               // food and water spoil quickly
      iron: 12, steel: 15,                                  // metals keep
      glass: 12, ceramic: 12, concrete: 12,
    },
  },

  // Production
  factoryRuns: 1,          // a factory runs up to this many times a round, while it has the inputs
  // Stand-ins: a factory short of an input can use another good instead, at `ratio` units of it per unit
  // missing (`at`: only these factories). The real input is always used first. This gives most raw
  // goods more than one use, so there's usually someone who could buy what you make.
  substitutes: [
    { for: "coal",      use: "wood",       ratio: 2 },                          // charcoal, in any furnace or kiln
    { for: "sawdust",   use: "wood",       ratio: 1, at: ["paper_mill"] },      // pulp from logs
    { for: "flour",     use: "wheat",      ratio: 2, at: ["bakery"] },          // wholegrain, milled on site
    { for: "sawdust",   use: "wheat",      ratio: 2, at: ["paper_mill"] },      // straw pulp
    { for: "limestone", use: "clay",       ratio: 1, at: ["cement_kiln"] },     // clay cement
    { for: "iron",      use: "iron_ore",   ratio: 3, at: ["steelworks"] },      // direct reduction
  ],

  // ---------- Switched off for now ----------
  // Cards, wages, inflation and the broker (loans, bonds, futures, ETFs) are kept in the code but not
  // used while the market is player-only. Their old settings stay so the code still loads.
  cardsPerRound: 0, handMax: 5, cardsPerAfternoon: 0,
  rarityWeight: { common: 6, uncommon: 3, rare: 1 },
  wageRate: 0,
  inflationPerRound: 0,
  overflowSale: 0,
  businessValue: 0,
  finance: { tightenAbove: 0.03, loosenBelow: 0.005, borrowShareStep: 0.05, borrowShareMin: 0.3, borrowShareMax: 0.6 },
};
