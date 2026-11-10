// Sellers Market: market pricing settings.
//
//   Price = Base × Scarcity × Demand × Inflation
//
//   Scarcity  = (s0 / s) ^ e
//     s   = share of all players' combined stockpile space holding this commodity right now
//     s0  = "balanced" share: the share at which the price equals the base price
//     e   = elasticity: how sharply the price reacts when stock runs short (or piles up)
//     s is held between s0 / 10 and s0 × 10, so prices can't run off to infinity or zero.
//
//   Demand    = units all factories need ÷ units they normally need (1.0 = normal).
//               Placeholder for now; it will come from the factories in play.
//   Inflation = (1 + rate) ^ round
//
// Wastes nobody can use have a negative base (a disposal fee). For them the
// fee grows as more piles up: Scarcity flips to (s / s0) ^ e.
//
// Worked example, wheat: base 6, s0 = 5.59%, e = 1
//   5.59% of all stock → 6 × (5.59 / 5.59) = 6
//   1.12%             → 6 × (5.59 / 1.12) = 30

const MARKET = {
  inflationPerRound: 0.02, // 2% a round
  valueAdded: 0.3,         // each run of a factory adds value worth 30% of its base build cost (a bit more
                           // than a mine makes, to make up for buying inputs at market prices; so every
                           // business earns about the same share of its cost at base prices)
  shareRange: 10,          // s is clamped to [s0 / 10, s0 × 10]

  // base: set by hand for raw resources and wastes. Made goods leave it out and
  //       get it from their recipe: (inputs at base − by-products at base + value added) ÷ output,
  //       where value added = 20% of the factory's base build cost.
  // s0:   balanced share of all stockpile space, in percent. These add up to 100.
  //       Set so a balanced stockpile holds about the same VALUE of every good: cheap bulk goods
  //       get big shares, expensive finished goods tiny ones.
  // e:    elasticity. 1.0 for bulk staples, higher for specialised goods with no substitutes.
  pricing: {
    // Raw resources
    wheat:          { base: 6,   s0: 5.59, e: 1.0 },
    water:          { base: 2,   s0: 16.79, e: 1.0 },
    coal:           { base: 5,   s0: 6.71, e: 1.0 },
    sand:           { base: 2,   s0: 16.79, e: 1.0 },
    wood:           { base: 4,   s0: 8.40, e: 1.0 },
    iron_ore:       { base: 6,   s0: 5.59, e: 1.0 },
    limestone:      { base: 3,   s0: 11.20, e: 1.0 },
    clay:           { base: 2,   s0: 16.79, e: 1.0 },

    // By-products: both can be recycled, so they're worth a little
    slag:           { base: 1,   s0: 1.09, e: 1.0 },
    sawdust:        { base: 1.5, s0: 1.09, e: 1.0 },

    // Processed materials
    flour:          { s0: 1.34, e: 1.0 },
    lumber:         { s0: 0.92, e: 1.0 },
    iron:           { s0: 0.72, e: 1.2 },
    glass:          { s0: 1.82, e: 1.2 },
    ceramic:        { s0: 0.89, e: 1.2 },

    // Goods and building materials
    bread:          { s0: 0.98, e: 1.0 },
    steel:          { s0: 0.34, e: 1.2 },
    cement:         { s0: 1.18, e: 1.0 },
    paper:          { s0: 0.59, e: 1.0 },
    concrete:       { s0: 1.16, e: 1.0 },
  },
};
