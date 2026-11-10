// Sellers Market: every kind of business.
//
// Extraction businesses (mines, pits, farms, water works) dig up or grow a raw material from nothing.
// Factories are the recipes on the Commodities tab (js/commodities.js).
// Every business makes 2 of its product a round. Building one costs cash (BUSINESS_COST below), and each
// territory only allows certain businesses: see `biz` in js/territories.js.

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

// What each business costs to build, in cash: 120 to 170. Mines, pits and farms are cheapest; factories
// cost more the further along the chain their product is.
const BUSINESS_COST = {
  farm: 120, water_works: 120, sand_pit: 120, clay_pit: 120,
  logging_camp: 125, limestone_quarry: 125, coal_mine: 135, iron_mine: 135,
  flour_mill: 140, sawmill: 140, kiln: 145, glassworks: 145, blast_furnace: 150,
  cement_kiln: 155, paper_mill: 155, bakery: 155, steelworks: 165, concrete_plant: 170,
};
