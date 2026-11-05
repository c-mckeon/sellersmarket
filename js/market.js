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
// Worked example, wheat: base 6, s0 = 4.09%, e = 1
//   4.09% of all stock → 6 × (4.09 / 4.09) = 6
//   0.82%             → 6 × (4.09 / 0.82) = 30

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
    wheat:          { base: 6,   s0: 4.09,   e: 1.0 },
    water:          { base: 2,   s0: 12.28,  e: 1.0 },
    coal:           { base: 5,   s0: 4.91,  e: 1.0 },
    sand:           { base: 2,   s0: 12.28,  e: 1.0 },
    wood:           { base: 4,   s0: 6.14,  e: 1.0 },
    iron_ore:       { base: 6,   s0: 4.09,  e: 1.0 },
    crude_oil:      { base: 10,  s0: 2.46,  e: 1.0 },
    limestone:      { base: 3,   s0: 8.19,  e: 1.0 },
    clay:           { base: 2,   s0: 12.28,  e: 1.0 },
    copper_ore:     { base: 8,   s0: 3.07,  e: 1.0 },
    bauxite:        { base: 6,   s0: 4.09,  e: 1.0 },
    latex:          { base: 7,   s0: 3.51,  e: 1.0 },
    lithium_brine:  { base: 8,   s0: 3.07,  e: 1.4 },
    gold_ore:       { base: 20,  s0: 1.23,  e: 1.4 },
    rare_earth_ore: { base: 15,  s0: 1.64,  e: 1.4 },

    // Wastes: recyclable ones are worth a little; the rest cost money to get rid of
    slag:           { base: 1,   s0: 0.8,  e: 1.0 },
    fly_ash:        { base: 1,   s0: 0.8,  e: 1.0 },
    sawdust:        { base: 1.5, s0: 0.8,  e: 1.0 },
    tailings:       { base: -2,  s0: 0.8,  e: 1.0 },
    chemical_waste: { base: -5,  s0: 0.8,  e: 1.0 },

    // Processed materials
    flour:          { s0: 0.98,  e: 1.0 },
    lumber:         { s0: 0.67,  e: 1.0 },
    iron:           { s0: 0.53,  e: 1.2 },
    fuel:           { s0: 0.43,  e: 1.0 },
    glass:          { s0: 1.33,  e: 1.2 },
    plastic:        { s0: 0.82,  e: 1.2 },
    copper:         { s0: 0.39,  e: 1.2 },
    aluminium:      { s0: 0.33,  e: 1.2 },
    ceramic:        { s0: 0.65,  e: 1.2 },
    rubber:         { s0: 0.51,  e: 1.2 },
    silicon:        { s0: 0.57,  e: 1.2 },
    lithium:        { s0: 0.35,  e: 1.4 },
    gold:           { s0: 0.17,  e: 1.4 },
    rare_earths:    { s0: 0.24,  e: 1.4 },

    // Components and basic goods
    bread:          { s0: 0.72,  e: 1.0 },
    steel:          { s0: 0.25,  e: 1.2 },
    cement:         { s0: 0.86,  e: 1.0 },
    paper:          { s0: 0.43,  e: 1.0 },
    wire:           { s0: 0.34,  e: 1.2 },
    magnets:        { s0: 0.2,  e: 1.4 },
    battery:        { s0: 0.09,  e: 1.4 },
    solar_panel:    { s0: 0.14,  e: 1.4 },
    chips:          { s0: 0.39,  e: 1.4 },

    // Assemblies
    concrete:       { s0: 0.85,  e: 1.0 },
    tyres:          { s0: 0.18,  e: 1.2 },
    motor:          { s0: 0.05, e: 1.6 },
    circuit_board:  { s0: 0.1, e: 1.6 },

    // Advanced goods
    smartphone:     { s0: 0.04,  e: 1.6 },
    electric_car:   { s0: 0.01,  e: 1.6 },
    wind_turbine:   { s0: 0.01,  e: 1.6 },
  },
};
