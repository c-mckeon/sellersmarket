// Sellers Market: commodity network.
// Each commodity is "raw" (dug up or grown), "made" (produced by a recipe) or "waste" (a by-product).
// Whether a made good is an intermediate or a finished good is worked out from the recipes.

const COMMODITIES = [
  // Raw resources
  { id: "wheat",          name: "Wheat",          type: "raw",   desc: "Grown on farmland. The start of the food chain." },
  { id: "water",          name: "Water",          type: "raw",   desc: "Pumped from rivers and wells. Used almost everywhere." },
  { id: "wood",           name: "Wood",           type: "raw",   desc: "Logged from forests." },
  { id: "sand",           name: "Sand",           type: "raw",   desc: "Quarried silica sand. Becomes glass and concrete." },
  { id: "clay",           name: "Clay",           type: "raw",   desc: "Dug from riverbanks. Fired into ceramic." },
  { id: "limestone",      name: "Limestone",      type: "raw",   desc: "Quarried rock. Used for glass and cement." },
  { id: "coal",           name: "Coal",           type: "raw",   desc: "Mined fuel. Heats most furnaces and kilns." },
  { id: "iron_ore",       name: "Iron ore",       type: "raw",   desc: "Mined rock rich in iron." },

  // Waste: by-products nobody wants
  { id: "slag",           name: "Slag",           type: "waste", desc: "Glassy leftovers from smelting. No use: you pay someone to take it, or keep it till it goes off." },
  { id: "sawdust",        name: "Sawdust",        type: "waste", desc: "Offcuts from the sawmill. No use: you pay someone to take it, or keep it till it goes off." },

  // Processed materials
  { id: "flour",          name: "Flour",          type: "made",  desc: "Milled wheat." },
  { id: "lumber",         name: "Lumber",         type: "made",  desc: "Sawn planks, sold to builders." },
  { id: "iron",           name: "Iron",           type: "made",  desc: "Smelted pig iron." },
  { id: "glass",          name: "Glass",          type: "made",  desc: "Melted sand and limestone." },
  { id: "ceramic",        name: "Ceramic",        type: "made",  desc: "Fired clay. Heat-proof and insulating." },
  { id: "cement",         name: "Cement",         type: "made",  desc: "Powdered binder made from limestone and clay." },
  { id: "paper",          name: "Paper",          type: "made",  desc: "Pulped wood. Sold for packaging and print." },

  // Goods and building materials
  { id: "bread",          name: "Bread",          type: "made",  desc: "Baked daily. Cheap, but everyone needs it." },
  { id: "steel",          name: "Steel",          type: "made",  desc: "Iron refined to be strong and tough." },
  { id: "concrete",       name: "Concrete",       type: "made",  desc: "Cement, sand and water. Foundations for anything big." },
];

// Each recipe turns inputs into outputs, once a round. The first output is the main product (every
// business makes 2 of it a round); any further output is waste (1 a round), which nothing uses.
const RECIPES = [
  { at: "Flour mill",          in: { wheat: 2, water: 1 },                  out: { flour: 2 } },
  { at: "Sawmill",             in: { wood: 2 },                             out: { lumber: 2, sawdust: 1 } },
  { at: "Blast furnace",       in: { iron_ore: 2, coal: 1 },                out: { iron: 2, slag: 1 } },
  { at: "Glassworks",          in: { sand: 2, limestone: 1 },               out: { glass: 2 } },
  { at: "Kiln",                in: { clay: 2, coal: 1 },                    out: { ceramic: 2 } },
  { at: "Cement kiln",         in: { limestone: 2, clay: 1 },               out: { cement: 2 } },
  { at: "Paper mill",          in: { wood: 2, water: 1 },                   out: { paper: 2 } },
  { at: "Bakery",              in: { flour: 2, water: 1 },                  out: { bread: 2 } },
  { at: "Steelworks",          in: { iron: 2, coal: 1 },                    out: { steel: 2, slag: 1 } },
  { at: "Concrete plant",      in: { cement: 1, sand: 2, water: 1 },        out: { concrete: 2 } },
];
