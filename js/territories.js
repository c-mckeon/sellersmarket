// Sellers Market: what each territory is like, based on real geography.
//
// res:  natural resources found there, rated 1 (small) to 3 (world-class).
//       Extraction businesses (mines, farms, wells) can only be built where their resource is.
// cost: how expensive it is to build there (1 = average). Big cities cost more.
// note: a line on why.
// Whether a territory is on the coast is worked out from the map.

const TERRITORY_INFO = {
  // British Isles
  scotland:  { cost: 1.0, res: { water: 3, wood: 2, coal: 1 }, note: "Rain, rivers and forests. Old coalfields in the central belt." },
  nengland:  { cost: 1.0, res: { coal: 3, limestone: 2, iron_ore: 1, wheat: 1 }, note: "The coal-and-steel north: Yorkshire and Lancashire." },
  wales:     { cost: 0.9, res: { coal: 3, water: 2, copper_ore: 1, gold_ore: 1 }, note: "South Wales coal, Anglesey copper, and a little Welsh gold." },
  london:    { cost: 2.0, res: { clay: 2, wheat: 1, sand: 1 }, note: "A financial capital sitting on London clay. Very expensive land." },
  // France and Iberia
  brest:     { cost: 0.9, res: { wheat: 2, water: 2, clay: 1 }, note: "Brittany: farms, rain and kaolin clay." },
  picardy:   { cost: 1.0, res: { wheat: 3, limestone: 2 }, note: "Flat, fertile wheat country on chalk." },
  paris:     { cost: 1.8, res: { wheat: 3, limestone: 2, sand: 2 }, note: "The Paris basin: grain, building stone and fine glass sand." },
  burgundy:  { cost: 1.0, res: { iron_ore: 2, wheat: 2, wood: 2, limestone: 2 }, note: "Includes Lorraine, once France's great iron field." },
  sfrance:   { cost: 1.1, res: { bauxite: 3, wheat: 2, limestone: 2, water: 1 }, note: "Bauxite is named after Les Baux in Provence, where it was found." },
  portugal:  { cost: 0.8, res: { copper_ore: 2, lithium_brine: 2, wood: 2 }, note: "Neves-Corvo copper, cork forests, and some of Europe's biggest lithium deposits." },
  spain:     { cost: 0.9, res: { copper_ore: 3, wheat: 2, clay: 2, coal: 1, sand: 1, limestone: 1 }, note: "Rio Tinto has been mined for copper for 5,000 years." },
  nafrica:   { cost: 0.6, res: { crude_oil: 2, sand: 3, limestone: 1 }, note: "Algerian oil and endless sand. Cheap land." },
  // Low Countries and Germany
  lowlands:  { cost: 1.6, res: { wheat: 2, sand: 2, clay: 2, coal: 1 }, note: "Rich farmland, busy ports and Belgium's old Walloon coalfield." },
  ruhr:      { cost: 1.2, res: { coal: 3, water: 2, iron_ore: 1 }, note: "Germany's industrial heartland, built on coal." },
  kiel:      { cost: 1.0, res: { wheat: 2, crude_oil: 1, sand: 1 }, note: "Farmland and Mittelplate, Germany's biggest oil field." },
  berlin:    { cost: 1.4, res: { sand: 2, wheat: 1, clay: 1 }, note: "A capital on sandy plains." },
  munich:    { cost: 1.5, res: { wood: 2, water: 2, limestone: 2, wheat: 1, clay: 1 }, note: "Bavaria: Alpine water, forests and wealthy cities." },
  prussia:   { cost: 0.8, res: { wheat: 3, wood: 2, sand: 1 }, note: "East Prussian grain estates on the Baltic." },
  // Scandinavia
  denmark:   { cost: 1.3, res: { wheat: 2, limestone: 2, sand: 1 }, note: "Farms on chalk, and the gateway to the Baltic." },
  norway:    { cost: 1.3, res: { water: 3, wood: 2, iron_ore: 1, copper_ore: 1, rare_earth_ore: 1 }, note: "Endless hydropower, and the Fen rare earth find, the largest in Europe." },
  sweden:    { cost: 1.2, res: { iron_ore: 3, wood: 3, copper_ore: 2, rare_earth_ore: 2, water: 2, gold_ore: 1 }, note: "Kiruna iron (with rare earths), Falun copper and Boliden gold." },
  finland:   { cost: 1.1, res: { wood: 3, water: 3, copper_ore: 1, gold_ore: 1, lithium_brine: 1 }, note: "Forests, lakes, and Kittilä, Europe's biggest gold mine." },
  // Russia and the east
  stpete:    { cost: 1.0, res: { wood: 3, rare_earth_ore: 2, water: 2, bauxite: 1, iron_ore: 1 }, note: "Includes the Kola peninsula's rare earths and Boksitogorsk bauxite." },
  moscow:    { cost: 0.9, res: { wood: 3, crude_oil: 2, wheat: 2, gold_ore: 1, coal: 1 }, note: "Stretches to the Volga–Urals oil fields and Ural gold." },
  livonia:   { cost: 0.8, res: { wood: 2, wheat: 1, sand: 1, crude_oil: 1 }, note: "The Baltic states: timber, and Estonian oil shale." },
  warsaw:    { cost: 0.9, res: { wheat: 2, sand: 1, clay: 1 }, note: "Central Poland's farmland." },
  ukraine:   { cost: 0.7, res: { wheat: 3, iron_ore: 3, coal: 2, clay: 1, lithium_brine: 1 }, note: "Europe's breadbasket, with Kryvyi Rih iron and Donbas coal." },
  crimea:    { cost: 0.8, res: { coal: 2, wheat: 2, crude_oil: 1, limestone: 1 }, note: "The southern steppe down to the Black Sea." },
  // Central Europe
  bohemia:   { cost: 1.0, res: { coal: 3, copper_ore: 2, clay: 2, sand: 2, wood: 2, lithium_brine: 1 }, note: "Silesian coal and copper, Bohemian glass and porcelain, Cínovec lithium." },
  galicia:   { cost: 0.7, res: { crude_oil: 2, wheat: 2, wood: 2 }, note: "Home of one of the world's first oil industries, at Boryslav." },
  tyrol:     { cost: 1.2, res: { water: 3, wood: 2, limestone: 1 }, note: "Alpine valleys: hydropower and timber." },
  vienna:    { cost: 1.4, res: { wheat: 2, crude_oil: 1, wood: 1 }, note: "An imperial capital with oil fields to its north-east." },
  budapest:  { cost: 0.9, res: { wheat: 3, bauxite: 2, water: 1 }, note: "The Hungarian plain, and once one of Europe's main sources of bauxite." },
  trieste:   { cost: 1.0, res: { bauxite: 2, limestone: 2, wood: 1 }, note: "A great port, with Dalmatian bauxite down the coast." },
  // Italy
  nwitaly:   { cost: 1.4, res: { water: 2, limestone: 2, iron_ore: 1, clay: 1, sand: 1, wheat: 1 }, note: "Turin and Florence: Alpine rivers, Carrara marble and Elba iron." },
  venice:    { cost: 1.3, res: { wheat: 2, sand: 2, water: 1 }, note: "The Po valley and Murano's glassmaking sand." },
  rome:      { cost: 1.4, res: { wheat: 1, clay: 1, limestone: 1 }, note: "A capital city; few raw materials." },
  sitaly:    { cost: 0.8, res: { wheat: 2, crude_oil: 1, limestone: 1, sand: 1 }, note: "Basilicata has Europe's biggest onshore oil field." },
  // Balkans and Turkey
  serbia:    { cost: 0.7, res: { copper_ore: 3, lithium_brine: 2, wheat: 2, gold_ore: 1, coal: 1 }, note: "Bor copper and gold, and the Jadar valley lithium deposit." },
  greece:    { cost: 0.8, res: { bauxite: 2, crude_oil: 1, limestone: 1, clay: 1 }, note: "Greek bauxite and Albania's Patos-Marinza oil field." },
  danube:    { cost: 0.7, res: { wheat: 3, crude_oil: 2, gold_ore: 2, copper_ore: 1, coal: 1 }, note: "Ploiești oil, Roșia Montană gold, and the Danube plain." },
  constant:  { cost: 1.3, res: { sand: 1, limestone: 1, water: 1 }, note: "A trading city between two continents." },
  ankara:    { cost: 0.7, res: { wheat: 2, coal: 1, clay: 1 }, note: "The Anatolian plateau and the Zonguldak coalfield." },
  smyrna:    { cost: 0.8, res: { clay: 2, gold_ore: 1, wheat: 1 }, note: "Western Anatolia: Kütahya ceramics and Kışladağ gold." },
  armenia:   { cost: 0.6, res: { copper_ore: 2, gold_ore: 1, water: 1 }, note: "Caucasus copper and gold." },
  syria:     { cost: 0.6, res: { crude_oil: 2, wheat: 1, sand: 1 }, note: "Oil in the east, and part of the Fertile Crescent." },

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
