// Sellers Market: every kind of business.
//
// Extraction businesses (mines, pits, farms, water works) dig up or grow a raw material from nothing.
// Factories are the recipes on the Commodities tab (js/commodities.js).
// Every business makes 1 of its product a round. Building one costs cash (BUSINESS_COST below), and each
// territory only allows certain businesses: see `biz` in js/territories.js.

// Extraction businesses: [name, makes, output per round]
const EXTRACTORS = [
  ["Farm",              "wheat",     1],
  ["Water works",       "water",     1],
  ["Logging camp",      "wood",      1],
  ["Sand pit",          "sand",      1],
  ["Clay pit",          "clay",      1],
  ["Limestone quarry",  "limestone", 1],
  ["Coal mine",         "coal",      1],
  ["Iron mine",         "iron_ore",  1],
];

// What each business costs to build, in cash: 120 to 170. Mines, pits and farms are cheapest; factories
// cost more the further along the chain their product is.
const BUSINESS_COST = {
  farm: 120, water_works: 120, sand_pit: 120, clay_pit: 120,
  logging_camp: 125, limestone_quarry: 125, coal_mine: 135, iron_mine: 135,
  flour_mill: 140, sawmill: 140, kiln: 145, glassworks: 145, blast_furnace: 150,
  cement_kiln: 155, paper_mill: 155, bakery: 155, steelworks: 165, concrete_plant: 170,
};
