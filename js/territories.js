// Sellers Market: what each territory is like, based on real geography.
//
// biz:  the businesses that can be built there (ids from js/businesses.js: the name in lower case,
//       spaces as underscores). Nothing else can go there, so every territory has its own trade.
//       Mines, pits, farms and water works go where the resource is; each territory can also run the
//       factories that process what it digs or grows, and big cities have bakeries and concrete plants.
// note: a line on why.
// Whether a territory is on the coast is worked out from the map.

const TERRITORY_INFO = {
  // Raw materials by region:
  //   iron ore: the north-west, Sweden, Spain, Crimea   coal: the centre, Serbia, Turkey
  //   wood: the northern forests      clay: the eastern plains, Portugal
  //   sand: North Sea coasts, North Africa, Syria         limestone: the Mediterranean, Tyrol
  //   wheat: the farm belts           water: the Alps, Scandinavia, the Danube, Scotland and Wales
  // British Isles
  scotland:  { biz: ["iron_mine", "water_works", "blast_furnace"], note: "Highland iron and rain-fed rivers." },
  nengland:  { biz: ["iron_mine", "blast_furnace", "steelworks"], note: "The iron north: some of the richest ore in the game." },
  wales:     { biz: ["iron_mine", "water_works", "blast_furnace", "steelworks"], note: "Valleys of iron ore and rivers." },
  london:    { biz: ["farm", "flour_mill", "bakery", "concrete_plant"], note: "A financial capital. Nothing to dig up, but plenty of mouths and building sites." },
  // France and Iberia
  brest:     { biz: ["iron_mine", "farm", "blast_furnace", "flour_mill"], note: "Brittany: farms, and the last of the north-west's iron." },
  picardy:   { biz: ["limestone_quarry", "farm", "cement_kiln", "flour_mill"], note: "Flat, fertile wheat country on chalk." },
  paris:     { biz: ["farm", "flour_mill", "bakery", "concrete_plant"], note: "A capital on rich farmland." },
  burgundy:  { biz: ["farm", "flour_mill"], note: "Vineyards and farms between north and south." },
  sfrance:   { biz: ["limestone_quarry", "cement_kiln"], note: "Provence's white limestone hills." },
  portugal:  { biz: ["clay_pit", "logging_camp", "kiln", "sawmill", "paper_mill"], note: "Clay for the azulejo tiles, and cork-oak forests." },
  spain:     { biz: ["iron_mine", "blast_furnace"], note: "Basque iron ore fed Bilbao's blast furnaces." },
  nafrica:   { biz: ["sand_pit", "glassworks"], note: "Endless sand." },
  // Low Countries and Germany
  lowlands:  { biz: ["sand_pit", "farm", "glassworks", "flour_mill", "bakery", "concrete_plant"], note: "Dunes, polders and busy ports." },
  ruhr:      { biz: ["coal_mine", "steelworks", "blast_furnace"], note: "Germany's industrial heartland, built on coal." },
  kiel:      { biz: ["sand_pit", "glassworks"], note: "Sandy North Sea coast." },
  berlin:    { biz: ["coal_mine", "steelworks", "bakery", "concrete_plant"], note: "A capital with brown coal to its south." },
  munich:    { biz: ["water_works", "bakery", "concrete_plant"], note: "Alpine rivers and wealthy cities." },
  prussia:   { biz: ["clay_pit", "farm", "kiln", "flour_mill"], note: "Grain estates and clay on the Baltic plain." },
  // Scandinavia
  denmark:   { biz: ["sand_pit", "farm", "glassworks", "flour_mill", "bakery"], note: "Farms and sandy coasts at the gateway to the Baltic." },
  norway:    { biz: ["logging_camp", "water_works", "sawmill", "paper_mill", "bakery"], note: "Forests and endless hydropower." },
  sweden:    { biz: ["iron_mine", "logging_camp", "water_works", "blast_furnace", "sawmill", "paper_mill"], note: "Kiruna iron, Europe's biggest iron mine, and deep forests." },
  finland:   { biz: ["logging_camp", "water_works", "sawmill", "paper_mill"], note: "Forests and lakes." },
  // Russia and the east
  stpete:    { biz: ["logging_camp", "sawmill", "paper_mill"], note: "Northern forest as far as you can see." },
  moscow:    { biz: ["logging_camp", "farm", "sawmill", "paper_mill", "flour_mill"], note: "Forest and farmland." },
  livonia:   { biz: ["logging_camp", "sawmill", "paper_mill"], note: "The Baltic states: timber." },
  warsaw:    { biz: ["clay_pit", "farm", "kiln", "flour_mill"], note: "The clay of the great eastern plain." },
  ukraine:   { biz: ["clay_pit", "farm", "kiln", "flour_mill"], note: "Europe's breadbasket, on deep clay soils." },
  crimea:    { biz: ["iron_mine", "blast_furnace"], note: "Iron ore at Kerch." },
  // Central Europe
  bohemia:   { biz: ["coal_mine", "steelworks"], note: "Silesian coal." },
  galicia:   { biz: ["coal_mine", "clay_pit", "steelworks", "kiln"], note: "Coal seams and clay." },
  tyrol:     { biz: ["water_works", "limestone_quarry"], note: "Alpine valleys: hydropower and little else." },
  vienna:    { biz: ["coal_mine", "farm", "water_works", "steelworks", "flour_mill", "bakery", "concrete_plant"], note: "An imperial capital on the edge of the coalfields." },
  budapest:  { biz: ["clay_pit", "farm", "water_works", "kiln", "flour_mill"], note: "The Hungarian plain." },
  trieste:   { biz: ["limestone_quarry", "cement_kiln"], note: "A great port on the limestone Karst." },
  // Italy
  nwitaly:   { biz: ["water_works", "bakery", "concrete_plant"], note: "Alpine rivers and wealthy cities." },
  venice:    { biz: ["limestone_quarry", "farm", "cement_kiln", "flour_mill", "bakery"], note: "The Po valley farms and Istrian stone." },
  rome:      { biz: ["limestone_quarry", "cement_kiln", "bakery", "concrete_plant"], note: "Travertine quarries: the stone Rome was built from." },
  sitaly:    { biz: ["limestone_quarry", "cement_kiln"], note: "Limestone hills." },
  // Balkans and Turkey
  serbia:    { biz: ["coal_mine", "steelworks"], note: "Lignite at Kolubara." },
  greece:    { biz: ["limestone_quarry", "cement_kiln"], note: "Marble and limestone." },
  danube:    { biz: ["farm", "flour_mill"], note: "The Danube plain." },
  constant:  { biz: ["bakery", "concrete_plant"], note: "A trading city between two continents. Nothing to dig up." },
  ankara:    { biz: ["coal_mine", "steelworks"], note: "Coal from Zonguldak on the Black Sea coast." },
  smyrna:    { biz: ["farm", "flour_mill"], note: "Western Anatolia's farmland." },
  armenia:   { biz: ["limestone_quarry", "clay_pit", "cement_kiln", "kiln"], note: "Volcanic stone and clay, far from Europe's factories." },
  syria:     { biz: ["sand_pit", "glassworks"], note: "Desert sand." },

  // Seas: nothing can be built at sea; they're for moving through
  arctic:     { biz: [], note: "The Norwegian and Barents Seas." },
  natlantic:  { biz: [], note: "Open ocean. A shipping lane, nothing more." },
  matlantic:  { biz: [], note: "The route from the Atlantic into the Mediterranean." },
  irish:      { biz: [], note: "A short crossing between Britain and Ireland." },
  channel:    { biz: [], note: "One of the busiest shipping lanes in the world." },
  northsea:   { biz: [], note: "Busy shipping lanes between Britain and the continent." },
  skagerrak:  { biz: [], note: "The narrow entrance to the Baltic." },
  baltic:     { biz: [], note: "An enclosed, shallow sea of busy ports." },
  wmed:       { biz: [], note: "Busy Mediterranean trade routes." },
  tyrrhenian: { biz: [], note: "The sea off Italy's west coast." },
  ionian:     { biz: [], note: "Between Italy and Greece." },
  adriatic:   { biz: [], note: "The sea between Italy and the Balkans." },
  emed:       { biz: [], note: "The Aegean and Levantine Seas." },
  blacksea:   { biz: [], note: "The sea between Ukraine and Turkey." },
};
