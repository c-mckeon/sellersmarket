// Sellers Market: every kind of business.
//
// Extraction businesses (mines, pits, farms, water works) dig up or grow a raw material from nothing.
// Factories are the recipes on the Commodities tab (js/commodities.js).
// Every business makes 2 of its product a round. Building one is free, but each territory only allows
// certain businesses: see `biz` in js/territories.js.

// Extraction businesses: [name, makes, output per round]
const EXTRACTORS = [
  ["Farm",              "wheat",     2],
  ["Water works",       "water",     2],
  ["Logging camp",      "wood",      2],
  ["Sand pit",          "sand",      2],
  ["Clay pit",          "clay",      2],
  ["Limestone quarry",  "limestone", 2],
  ["Coal mine",         "coal",      2],
  ["Iron mine",         "iron_ore",  2],
];
