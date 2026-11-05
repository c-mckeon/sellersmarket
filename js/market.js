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
// Worked example, wheat: base 6, s0 = 50%, e = 1
//   50% full → 6 × (50 / 50) = 6
//   10% full → 6 × (50 / 10) = 30

const MARKET = {
  inflationPerRound: 0.02, // 2% a round
  markup: 1.3,             // a factory sells at 30% over its input costs at base prices
  shareRange: 10,          // s is clamped to [s0 / 10, s0 × 10]

  // base: set by hand for raw resources and wastes. Made goods leave it out and
  //       get it from their recipe: (inputs at base − by-products at base) × markup ÷ output.
  // s0:   balanced share of all stockpile space, in percent. These add up to 100.
  // e:    elasticity. 1.0 for bulk staples, higher for specialised goods with no substitutes.
  pricing: {
    // Raw resources
    wheat:          { base: 6,   s0: 50,   e: 1.0 },
    water:          { base: 1,   s0: 2.6,  e: 1.0 },
    coal:           { base: 5,   s0: 2.6,  e: 1.0 },
    sand:           { base: 2,   s0: 2.5,  e: 1.0 },
    wood:           { base: 4,   s0: 2.5,  e: 1.0 },
    iron_ore:       { base: 6,   s0: 2.5,  e: 1.0 },
    crude_oil:      { base: 10,  s0: 2.5,  e: 1.0 },
    limestone:      { base: 3,   s0: 2.0,  e: 1.0 },
    clay:           { base: 2,   s0: 2.0,  e: 1.0 },
    copper_ore:     { base: 8,   s0: 1.5,  e: 1.0 },
    bauxite:        { base: 6,   s0: 1.5,  e: 1.0 },
    latex:          { base: 7,   s0: 1.2,  e: 1.0 },
    lithium_brine:  { base: 5,   s0: 1.0,  e: 1.4 },
    gold_ore:       { base: 20,  s0: 0.8,  e: 1.4 },
    rare_earth_ore: { base: 15,  s0: 0.8,  e: 1.4 },

    // Wastes: recyclable ones are worth a little; the rest cost money to get rid of
    slag:           { base: 1,   s0: 1.0,  e: 1.0 },
    fly_ash:        { base: 1,   s0: 1.0,  e: 1.0 },
    sawdust:        { base: 1.5, s0: 1.0,  e: 1.0 },
    tailings:       { base: -2,  s0: 0.8,  e: 1.0 },
    chemical_waste: { base: -5,  s0: 0.6,  e: 1.0 },

    // Processed materials
    flour:          { s0: 1.5,  e: 1.0 },
    lumber:         { s0: 1.5,  e: 1.0 },
    iron:           { s0: 1.2,  e: 1.2 },
    fuel:           { s0: 1.2,  e: 1.0 },
    glass:          { s0: 1.0,  e: 1.2 },
    plastic:        { s0: 1.0,  e: 1.2 },
    copper:         { s0: 0.8,  e: 1.2 },
    aluminium:      { s0: 0.8,  e: 1.2 },
    ceramic:        { s0: 0.8,  e: 1.2 },
    rubber:         { s0: 0.7,  e: 1.2 },
    silicon:        { s0: 0.6,  e: 1.2 },
    lithium:        { s0: 0.4,  e: 1.4 },
    gold:           { s0: 0.3,  e: 1.4 },
    rare_earths:    { s0: 0.3,  e: 1.4 },

    // Components and basic goods
    bread:          { s0: 1.2,  e: 1.0 },
    steel:          { s0: 1.0,  e: 1.2 },
    cement:         { s0: 0.8,  e: 1.0 },
    paper:          { s0: 0.6,  e: 1.0 },
    wire:           { s0: 0.6,  e: 1.2 },
    magnets:        { s0: 0.4,  e: 1.4 },
    battery:        { s0: 0.4,  e: 1.4 },
    solar_panel:    { s0: 0.4,  e: 1.4 },
    chips:          { s0: 0.3,  e: 1.4 },

    // Assemblies
    concrete:       { s0: 0.6,  e: 1.0 },
    tyres:          { s0: 0.3,  e: 1.2 },
    motor:          { s0: 0.15, e: 1.6 },
    circuit_board:  { s0: 0.15, e: 1.6 },

    // Advanced goods
    smartphone:     { s0: 0.3,  e: 1.6 },
    electric_car:   { s0: 0.2,  e: 1.6 },
    wind_turbine:   { s0: 0.1,  e: 1.6 },
  },
};
