// Sellers Market: what each territory is like, based on real geography.
//
// res:  natural resources found there, rated 1 (small) to 3 (world-class).
//       Extraction businesses (mines, farms, wells) can only be built where their resource is.
// cost: how expensive it is to build there (1 = average). Big cities cost more.
// note: a line on why.
// Whether a territory is on the coast is worked out from the map.

const TERRITORY_INFO = {
  // Each raw material is found in one region of the map, so getting what you need means trading
  // with, or travelling to, faraway players. Farms and water works can go anywhere; wheat and water
  // here only mark where they do better than usual.
  //   iron ore: the north-west        coal: the centre            wood: the northern forests
  //   clay: the eastern plains        sand: North Sea coasts, North Africa
  //   limestone: the Mediterranean    copper and lithium: Iberia  gold: Scandinavia
  //   bauxite: the south              crude oil: the south-east, North Africa and offshore
  //   rare earth ore: only the far south-east (Ankara, Armenia, Syria)
  // British Isles
  scotland:  { cost: 1.0, res: { iron_ore: 2, water: 2 }, note: "Highland iron and rain-fed rivers." },
  nengland:  { cost: 1.0, res: { iron_ore: 3 }, note: "The iron north: the richest ore in the game." },
  wales:     { cost: 0.9, res: { iron_ore: 2, water: 2 }, note: "Valleys of iron ore and rivers." },
  london:    { cost: 2.0, res: { wheat: 1 }, note: "A financial capital. Nothing to dig up, and very expensive land." },
  // France and Iberia
  brest:     { cost: 0.9, res: { iron_ore: 1, wheat: 2 }, note: "Brittany: farms, and the last of the north-west's iron." },
  picardy:   { cost: 1.0, res: { limestone: 2, wheat: 3 }, note: "Flat, fertile wheat country on chalk." },
  paris:     { cost: 1.8, res: { wheat: 2 }, note: "A capital on rich farmland." },
  burgundy:  { cost: 1.0, res: { wheat: 2 }, note: "Vineyards and farms between north and south." },
  sfrance:   { cost: 1.1, res: { bauxite: 3 }, note: "Bauxite is named after Les Baux in Provence, where it was found." },
  portugal:  { cost: 0.8, res: { lithium_brine: 3, copper_ore: 2 }, note: "Europe's lithium, and copper at Neves-Corvo." },
  spain:     { cost: 0.9, res: { copper_ore: 3, lithium_brine: 1 }, note: "Rio Tinto has been mined for copper for 5,000 years." },
  nafrica:   { cost: 0.6, res: { sand: 3, crude_oil: 1 }, note: "Endless sand and some oil. Cheap land." },
  // Low Countries and Germany
  lowlands:  { cost: 1.6, res: { sand: 3, wheat: 2 }, note: "Dunes, polders and busy ports." },
  ruhr:      { cost: 1.2, res: { coal: 3 }, note: "Germany's industrial heartland, built on coal." },
  kiel:      { cost: 1.0, res: { sand: 2 }, note: "Sandy North Sea coast." },
  berlin:    { cost: 1.4, res: { coal: 1 }, note: "A capital with brown coal to its south." },
  munich:    { cost: 1.5, res: { water: 3 }, note: "Alpine rivers and wealthy cities." },
  prussia:   { cost: 0.8, res: { clay: 2, wheat: 3 }, note: "Grain estates and clay on the Baltic plain." },
  // Scandinavia
  denmark:   { cost: 1.3, res: { sand: 2, wheat: 2 }, note: "Farms and sandy coasts at the gateway to the Baltic." },
  norway:    { cost: 1.3, res: { wood: 3, water: 3 }, note: "Forests and endless hydropower." },
  sweden:    { cost: 1.2, res: { gold_ore: 2, wood: 3 }, note: "Boliden gold and deep forests." },
  finland:   { cost: 1.1, res: { gold_ore: 3, wood: 2 }, note: "Forests, lakes, and Kittilä, Europe's biggest gold mine." },
  // Russia and the east
  stpete:    { cost: 1.0, res: { wood: 3 }, note: "Northern forest as far as you can see." },
  moscow:    { cost: 0.9, res: { wood: 2, wheat: 2 }, note: "Forest and farmland." },
  livonia:   { cost: 0.8, res: { wood: 2 }, note: "The Baltic states: timber." },
  warsaw:    { cost: 0.9, res: { clay: 3, wheat: 2 }, note: "The clay of the great eastern plain." },
  ukraine:   { cost: 0.7, res: { clay: 2, wheat: 3 }, note: "Europe's breadbasket, on deep clay soils." },
  crimea:    { cost: 0.8, res: { crude_oil: 2 }, note: "Oil on the Black Sea coast." },
  // Central Europe
  bohemia:   { cost: 1.0, res: { coal: 3 }, note: "Silesian coal." },
  galicia:   { cost: 0.7, res: { coal: 2, clay: 1 }, note: "Coal seams and clay." },
  tyrol:     { cost: 1.2, res: { water: 3 }, note: "Alpine valleys: hydropower and little else." },
  vienna:    { cost: 1.4, res: { coal: 1, wheat: 2 }, note: "An imperial capital on the edge of the coalfields." },
  budapest:  { cost: 0.9, res: { clay: 1, wheat: 3 }, note: "The Hungarian plain." },
  trieste:   { cost: 1.0, res: { limestone: 2 }, note: "A great port on the limestone Karst." },
  // Italy
  nwitaly:   { cost: 1.4, res: { bauxite: 2, water: 2 }, note: "Alpine rivers and southern bauxite." },
  venice:    { cost: 1.3, res: { limestone: 1, wheat: 2 }, note: "The Po valley farms and Istrian stone." },
  rome:      { cost: 1.4, res: { limestone: 3 }, note: "Travertine quarries: the stone Rome was built from." },
  sitaly:    { cost: 0.8, res: { limestone: 2, crude_oil: 1 }, note: "Limestone hills and Basilicata's oil." },
  // Balkans and Turkey
  serbia:    { cost: 0.7, res: { bauxite: 1 }, note: "Hills with a little bauxite." },
  greece:    { cost: 0.8, res: { bauxite: 2, limestone: 1 }, note: "Greek bauxite and marble." },
  danube:    { cost: 0.7, res: { crude_oil: 3, wheat: 2 }, note: "Ploiești oil and the Danube plain." },
  constant:  { cost: 1.3, res: {}, note: "A trading city between two continents. Nothing to dig up." },
  ankara:    { cost: 0.7, res: { rare_earth_ore: 2 }, note: "Rare earths at Beylikova, the far south-east's first find." },
  smyrna:    { cost: 0.8, res: { wheat: 2 }, note: "Western Anatolia's farmland." },
  armenia:   { cost: 0.6, res: { rare_earth_ore: 3 }, note: "The richest rare earths on the map, as far from Europe's factories as you can get." },
  syria:     { cost: 0.6, res: { crude_oil: 3, rare_earth_ore: 1 }, note: "Oil fields and a little rare earth ore." },

  // Seas: only offshore oil rigs can be built at sea
  arctic:     { res: { crude_oil: 2 }, note: "The Norwegian and Barents Seas: hard-to-reach offshore oil and gas." },
  natlantic:  { res: {}, note: "Open ocean. A shipping lane, nothing more." },
  matlantic:  { res: {}, note: "The route from the Atlantic into the Mediterranean." },
  irish:      { res: {}, note: "A short crossing between Britain and Ireland." },
  channel:    { res: {}, note: "One of the busiest shipping lanes in the world." },
  northsea:   { res: { crude_oil: 3 }, note: "North Sea oil: Brent, Forties, Ekofisk." },
  skagerrak:  { res: {}, note: "The narrow entrance to the Baltic." },
  baltic:     { res: {}, note: "An enclosed, shallow sea of busy ports." },
  wmed:       { res: {}, note: "Busy Mediterranean trade routes." },
  tyrrhenian: { res: {}, note: "The sea off Italy's west coast." },
  ionian:     { res: {}, note: "Between Italy and Greece." },
  adriatic:   { res: { crude_oil: 1 }, note: "Small offshore oil and gas fields." },
  emed:       { res: { crude_oil: 1 }, note: "The Aegean and Levantine Seas, with new offshore gas finds." },
  blacksea:   { res: { crude_oil: 1 }, note: "Offshore gas off Romania and Turkey." },
};
