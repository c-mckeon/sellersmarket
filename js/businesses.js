// Sellers Market: every kind of business, where it can be built, and what it costs.
//
//   Build cost = base cost × territory cost × (1 + crowding × businesses already there)
//
// Extraction businesses (mines, farms, wells) dig up or grow a raw resource. They can only
// go where that resource exists, and richer deposits produce more:
//   output = base output × richness bonus
// Factories (the recipes on the Commodities tab) can go on any land.

const BUILD = {
  crowding: 0.25,                     // each business already in a territory adds 25% to the next one's cost
  richness: { 1: 1, 2: 1.5, 3: 2 },   // output bonus for small / good / world-class deposits
  factoryCost: { 1: 150, 2: 250, 3: 400, 4: 700 }, // base cost of a factory by the tier of what it makes
};

// Extraction businesses: [name, makes, base output per round, base cost, where]
// Outputs are set so each makes about 20% of its base cost in value per round, at base prices.
//   where "res"   = only in territories with that resource
//         "land"  = any land territory
const EXTRACTORS = [
  ["Farm",              "wheat",          3, 100, "land"], // anywhere; better where the land is fertile
  ["Water works",       "water",          8,  80, "land"],
  ["Logging camp",      "wood",           5, 100, "res"],
  ["Sand pit",          "sand",           8,  80, "res"],
  ["Clay pit",          "clay",           8,  80, "res"],
  ["Limestone quarry",  "limestone",      6,  90, "res"],
  ["Coal mine",         "coal",           6, 140, "res"],
  ["Iron mine",         "iron_ore",       5, 150, "res"],
];

// Factories that need crude oil (only on the coast, or by an oil field). None, now that oil is out of the game.
const NEEDS_OIL_ACCESS = [];
