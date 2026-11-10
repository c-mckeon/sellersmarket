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

  // Waste and by-products
  { id: "slag",           name: "Slag",           type: "waste", desc: "Glassy leftovers from smelting. Can be ground into cement." },
  { id: "sawdust",        name: "Sawdust",        type: "waste", desc: "Offcuts from the sawmill. Can be pulped into paper." },

  // Processed materials
  { id: "flour",          name: "Flour",          type: "made",  desc: "Milled wheat." },
  { id: "lumber",         name: "Lumber",         type: "made",  desc: "Sawn planks, sold to builders." },
  { id: "iron",           name: "Iron",           type: "made",  desc: "Smelted pig iron." },
  { id: "glass",          name: "Glass",          type: "made",  desc: "Melted sand and limestone." },
  { id: "ceramic",        name: "Ceramic",        type: "made",  desc: "Fired clay. Heat-proof and insulating." },
  { id: "cement",         name: "Cement",         type: "made",  desc: "Powdered binder made from limestone and slag." },
  { id: "paper",          name: "Paper",          type: "made",  desc: "Pulped sawdust. Sold for packaging and print." },

  // Goods and building materials
  { id: "bread",          name: "Bread",          type: "made",  desc: "Baked daily. Cheap, but everyone needs it." },
  { id: "steel",          name: "Steel",          type: "made",  desc: "Iron refined to be strong and tough." },
  { id: "concrete",       name: "Concrete",       type: "made",  desc: "Cement, sand and water. Foundations for anything big." },
];

// Each recipe turns inputs into outputs. The first output is the main product;
// any further outputs are by-products (usually waste).
const RECIPES = [
  { at: "Flour mill",          in: { wheat: 3, water: 1 },                  out: { flour: 2 } },
  { at: "Sawmill",             in: { wood: 2 },                             out: { lumber: 1, sawdust: 1 } },
  { at: "Blast furnace",       in: { iron_ore: 2, coal: 1 },                out: { iron: 1, slag: 1 } },
  { at: "Glassworks",          in: { sand: 2, limestone: 1 },               out: { glass: 2 } },
  { at: "Kiln",                in: { clay: 2, coal: 1 },                    out: { ceramic: 1 } },
  { at: "Cement kiln",         in: { limestone: 2, slag: 1 },               out: { cement: 2 } },
  { at: "Paper mill",          in: { sawdust: 2, water: 2 },                out: { paper: 1 } },
  { at: "Bakery",              in: { flour: 2, water: 1 },                  out: { bread: 3 } },
  { at: "Steelworks",          in: { iron: 1, coal: 1 },                    out: { steel: 1, slag: 1 } },
  { at: "Concrete plant",      in: { cement: 1, sand: 3, water: 1 },         out: { concrete: 4 } },
];
