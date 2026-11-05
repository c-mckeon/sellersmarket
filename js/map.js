// Sellers Market: the board, a map of Europe split into 60 territories (46 land, 14 sea).
//
// Temporary: the shapes come from the classic map used by Diplicity (diplicity.com),
// from the godip project (github.com/zond/godip, GPL-3.0). See maps/LICENSE-map.txt.
// That map has 75 provinces; a few small neighbours are merged here to make 60.
// We'll draw our own map later.

const TERRITORIES = [
  // British Isles
  { id: "scotland",   name: "Scotland",          provinces: ["cly", "edi"] },
  { id: "nengland",   name: "Northern England",  provinces: ["lvp", "yor"] },
  { id: "wales",      name: "Wales",             provinces: ["wal"] },
  { id: "london",     name: "London",            provinces: ["lon"] },
  // France and Iberia
  { id: "brest",      name: "Brittany",          provinces: ["bre"] },
  { id: "picardy",    name: "Picardy",           provinces: ["pic"] },
  { id: "paris",      name: "Paris",             provinces: ["par"] },
  { id: "burgundy",   name: "Burgundy",          provinces: ["bur"] },
  { id: "sfrance",    name: "Southern France",   provinces: ["gas", "mar"] },
  { id: "portugal",   name: "Portugal",          provinces: ["por"] },
  { id: "spain",      name: "Spain",             provinces: ["spa"] },
  { id: "nafrica",    name: "North Africa",      provinces: ["naf", "tun"] },
  // Low Countries and Germany
  { id: "lowlands",   name: "Low Countries",     provinces: ["bel", "hol"] },
  { id: "ruhr",       name: "Ruhr",              provinces: ["ruh"] },
  { id: "kiel",       name: "Kiel",              provinces: ["kie"] },
  { id: "berlin",     name: "Berlin",            provinces: ["ber"] },
  { id: "munich",     name: "Munich",            provinces: ["mun"] },
  { id: "prussia",    name: "Prussia",           provinces: ["pru"] },
  // Scandinavia
  { id: "denmark",    name: "Denmark",           provinces: ["den"] },
  { id: "norway",     name: "Norway",            provinces: ["nwy"] },
  { id: "sweden",     name: "Sweden",            provinces: ["swe"] },
  { id: "finland",    name: "Finland",           provinces: ["fin"] },
  // Russia and the east
  { id: "stpete",     name: "St Petersburg",     provinces: ["stp"] },
  { id: "moscow",     name: "Moscow",            provinces: ["mos"] },
  { id: "livonia",    name: "Livonia",           provinces: ["lvn"] },
  { id: "warsaw",     name: "Warsaw",            provinces: ["war"] },
  { id: "ukraine",    name: "Ukraine",           provinces: ["ukr"] },
  { id: "crimea",     name: "Sevastopol",        provinces: ["sev"] },
  // Central Europe
  { id: "bohemia",    name: "Bohemia & Silesia", provinces: ["boh", "sil"] },
  { id: "galicia",    name: "Galicia",           provinces: ["gal"] },
  { id: "tyrol",      name: "Tyrol",             provinces: ["tyr"] },
  { id: "vienna",     name: "Vienna",            provinces: ["vie"] },
  { id: "budapest",   name: "Budapest",          provinces: ["bud"] },
  { id: "trieste",    name: "Trieste",           provinces: ["tri"] },
  // Italy
  { id: "nwitaly",    name: "Piedmont & Tuscany", provinces: ["pie", "tus"] },
  { id: "venice",     name: "Venice",            provinces: ["ven"] },
  { id: "rome",       name: "Rome",              provinces: ["rom"] },
  { id: "sitaly",     name: "Naples & Apulia",   provinces: ["nap", "apu"] },
  // Balkans and Turkey
  { id: "serbia",     name: "Serbia",            provinces: ["ser"] },
  { id: "greece",     name: "Greece & Albania",  provinces: ["gre", "alb"] },
  { id: "danube",     name: "Romania & Bulgaria", provinces: ["rum", "bul"] },
  { id: "constant",   name: "Constantinople",    provinces: ["con"] },
  { id: "ankara",     name: "Ankara",            provinces: ["ank"] },
  { id: "smyrna",     name: "Smyrna",            provinces: ["smy"] },
  { id: "armenia",    name: "Armenia",           provinces: ["arm"] },
  { id: "syria",      name: "Syria",             provinces: ["syr"] },

  // Seas
  { id: "arctic",     name: "Arctic Sea",        sea: true, provinces: ["nrg", "bar"] },
  { id: "natlantic",  name: "North Atlantic",    sea: true, provinces: ["nat"] },
  { id: "matlantic",  name: "Mid-Atlantic",      sea: true, provinces: ["mid"] },
  { id: "irish",      name: "Irish Sea",         sea: true, provinces: ["iri"] },
  { id: "channel",    name: "English Channel",   sea: true, provinces: ["eng"] },
  { id: "northsea",   name: "North Sea",         sea: true, provinces: ["nth"] },
  { id: "skagerrak",  name: "Skagerrak & Heligoland", sea: true, provinces: ["ska", "hel"] },
  { id: "baltic",     name: "Baltic Sea",        sea: true, provinces: ["bal", "bot"] },
  { id: "wmed",       name: "Western Mediterranean", sea: true, provinces: ["wes", "gol"] },
  { id: "tyrrhenian", name: "Tyrrhenian Sea",    sea: true, provinces: ["tys"] },
  { id: "ionian",     name: "Ionian Sea",        sea: true, provinces: ["ion"] },
  { id: "adriatic",   name: "Adriatic Sea",      sea: true, provinces: ["adr"] },
  { id: "emed",       name: "Eastern Mediterranean", sea: true, provinces: ["aeg", "eas"] },
  { id: "blacksea",   name: "Black Sea",         sea: true, provinces: ["bla"] },
];
