// Sellers Market: how the game would be stored in a SQL database.
// A simulation: the rows come from the game's own data files and a short game played by bots.
//
// Each column: [name, type, flags, note]
//   flags: "pk" = primary key (identifies the row), "fk:table" = points to that table's id

const DB_SCHEMA = [
  // ---------- Design data: the rules of the game, the same in every game ----------
  { name: "commodities", group: "Design data", desc: "The 20 goods.",
    cols: [["id", "text", "pk"], ["name", "text"], ["type", "text", "", "raw, made or waste"], ["life", "integer", "", "rounds before it goes off; 0 = never"]] },
  { name: "business_types", group: "Design data", desc: "Every kind of business: 8 that dig up or grow raw goods and 10 factories.",
    cols: [["id", "text", "pk"], ["name", "text"], ["kind", "text", "", "extract or factory"], ["cost", "integer", "", "cash to build one"]] },
  { name: "recipe_inputs", group: "Design data", desc: "What a business uses up each round. One row per input, so a recipe with 3 inputs has 3 rows.",
    cols: [["business_type_id", "text", "pk fk:business_types"], ["commodity_id", "text", "pk fk:commodities"], ["qty", "integer"]] },
  { name: "recipe_outputs", group: "Design data", desc: "What a business makes each round (2 of its main product), including by-products.",
    cols: [["business_type_id", "text", "pk fk:business_types"], ["commodity_id", "text", "pk fk:commodities"], ["qty", "integer"], ["is_byproduct", "boolean"]] },
  { name: "territories", group: "Design data", desc: "The 60 areas of the map.",
    cols: [["id", "text", "pk"], ["name", "text"], ["is_sea", "boolean"], ["is_coastal", "boolean"], ["note", "text"]] },
  { name: "territory_businesses", group: "Design data", desc: "Which businesses can be built in each territory. Nothing else can go there.",
    cols: [["territory_id", "text", "pk fk:territories"], ["business_type_id", "text", "pk fk:business_types"]] },
  { name: "territory_neighbours", group: "Design data", desc: "Which territories touch. Stored both ways round, so each border is two rows.",
    cols: [["territory_id", "text", "pk fk:territories"], ["neighbour_id", "text", "pk fk:territories"]] },

  // ---------- A game in progress ----------
  { name: "games", group: "Game", desc: "One row per game. Everything below belongs to a game.",
    cols: [["id", "integer", "pk"], ["round", "integer"], ["rounds", "integer"], ["phase", "text", "", "day (taking orders), night or over"]] },
  { name: "players", group: "Game", desc: "The people in a game: cash, points and where their pawn is.",
    cols: [["id", "integer", "pk"], ["game_id", "integer", "fk:games"], ["name", "text"], ["colour", "text"], ["cash", "integer"], ["points", "integer"], ["territory_id", "text", "fk:territories", "where their pawn is"]] },
  { name: "stockpile", group: "Game", desc: "Each player's stockpile: one row per unit, numbered first in, first out (row 1 goes first).",
    cols: [["player_id", "integer", "pk fk:players"], ["row", "integer", "pk"], ["commodity_id", "text", "fk:commodities"], ["made_round", "integer", "", "for when it goes off"]] },
  { name: "businesses", group: "Game", desc: "Every business built, who owns it and where.",
    cols: [["id", "integer", "pk"], ["game_id", "integer", "fk:games"], ["owner_id", "integer", "fk:players"], ["business_type_id", "text", "fk:business_types"], ["territory_id", "text", "fk:territories"], ["built_round", "integer"]] },
  { name: "contracts", group: "Game", desc: "The shared contracts on the board. The first to deliver one gets its points.",
    cols: [["id", "integer", "pk"], ["game_id", "integer", "fk:games"], ["points", "integer"], ["drawn_round", "integer"]] },
  { name: "contract_goods", group: "Game", desc: "What each contract asks for. One row per good.",
    cols: [["contract_id", "integer", "pk fk:contracts"], ["commodity_id", "text", "pk fk:commodities"], ["qty", "integer"]] },
  { name: "orders", group: "Game", desc: "The order book: bids and asks waiting for the next auction.",
    cols: [["id", "integer", "pk"], ["player_id", "integer", "fk:players"], ["commodity_id", "text", "fk:commodities"], ["side", "text", "", "buy or sell"], ["price", "integer"], ["qty", "integer"]] },
  { name: "trades", group: "Game", desc: "What each night's auction cleared: one price per good per round.",
    cols: [["round", "integer", "pk"], ["commodity_id", "text", "pk fk:commodities"], ["price", "integer"], ["qty", "integer"]] },
];
