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

// What each business costs to build, in cash: 240 to 340. Mines, pits and farms are cheapest; factories
// cost more the further along the chain their product is.
const BUSINESS_COST = {
  farm: 240, water_works: 240, sand_pit: 240, clay_pit: 240,
  logging_camp: 250, limestone_quarry: 250, coal_mine: 270, iron_mine: 270,
  flour_mill: 280, sawmill: 280, kiln: 290, glassworks: 290, blast_furnace: 300,
  cement_kiln: 310, paper_mill: 310, bakery: 310, steelworks: 330, concrete_plant: 340,
};
