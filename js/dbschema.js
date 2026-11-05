// Sellers Market: how the game would be stored in a SQL database.
// A simulation: the rows are built from the site's data files and the example game.
//
// Each column: [name, type, flags, note]
//   flags: "pk" = primary key (identifies the row), "fk:table" = points to that table's id

const DB_SCHEMA = [
  // ---------- Design data: the rules of the game, the same in every game ----------
  { name: "sectors", group: "Design data", desc: "The 8 sectors goods are grouped into. Each has an ETF.",
    cols: [["id", "text", "pk"], ["name", "text"], ["etf_ticker", "text", "", "e.g. FOOD"]] },
  { name: "commodities", group: "Design data", desc: "The 50 goods, with their pricing settings.",
    cols: [["id", "text", "pk"], ["name", "text"], ["type", "text", "", "raw, made or waste"], ["sector_id", "text", "fk:sectors"],
      ["base_price", "numeric"], ["balanced_share", "numeric", "", "s₀, in %"], ["elasticity", "numeric", "", "e"]] },
  { name: "business_types", group: "Design data", desc: "Every kind of business: 16 that extract raw goods and 30 factories.",
    cols: [["id", "text", "pk"], ["name", "text"], ["kind", "text", "", "extract or factory"], ["placement", "text", "", "resource, land, oil_access or sea"], ["base_cost", "numeric"]] },
  { name: "recipe_inputs", group: "Design data", desc: "What a business uses up each midday. One row per input, so a recipe with 3 inputs has 3 rows.",
    cols: [["business_type_id", "text", "pk fk:business_types"], ["commodity_id", "text", "pk fk:commodities"], ["qty", "numeric"]] },
  { name: "recipe_outputs", group: "Design data", desc: "What a business makes each midday, including waste by-products.",
    cols: [["business_type_id", "text", "pk fk:business_types"], ["commodity_id", "text", "pk fk:commodities"], ["qty", "numeric"], ["is_byproduct", "boolean"]] },
  { name: "territories", group: "Design data", desc: "The 60 areas of the map.",
    cols: [["id", "text", "pk"], ["name", "text"], ["is_sea", "boolean"], ["is_coastal", "boolean"], ["cost_level", "numeric"], ["note", "text"]] },
  { name: "territory_resources", group: "Design data", desc: "Which raw goods are found where, and how rich the deposit is (1 to 3).",
    cols: [["territory_id", "text", "pk fk:territories"], ["commodity_id", "text", "pk fk:commodities"], ["richness", "integer"]] },
  { name: "territory_neighbours", group: "Design data", desc: "Which territories touch. Stored both ways round, so each border is two rows.",
    cols: [["territory_id", "text", "pk fk:territories"], ["neighbour_id", "text", "pk fk:territories"]] },
  { name: "cards", group: "Design data", desc: "The 50 action cards.",
    cols: [["id", "integer", "pk"], ["name", "text"], ["category", "text"], ["rarity", "text"], ["text", "text"]] },
  { name: "card_effects", group: "Design data", desc: "What each card does. One row per effect; a card can have several.",
    cols: [["id", "integer", "pk"], ["card_id", "integer", "fk:cards"], ["hook", "text", "", "the variable it changes"], ["target", "text"], ["op", "text"], ["amount", "numeric"], ["rounds", "integer", "", "null = until repealed"]] },

  // ---------- A game in progress ----------
  { name: "games", group: "Game", desc: "One row per game. Everything below belongs to a game.",
    cols: [["id", "integer", "pk"], ["name", "text"], ["round", "integer"], ["phase", "text", "", "morning, midday, afternoon or overnight"], ["inflation_rate", "numeric"], ["base_rate", "numeric"]] },
  { name: "players", group: "Game", desc: "The people in a game, their cash and where their pawn is.",
    cols: [["id", "integer", "pk"], ["game_id", "integer", "fk:games"], ["name", "text"], ["colour", "text"], ["cash", "numeric"], ["territory_id", "text", "fk:territories", "where their pawn is"], ["stockpile_space", "integer"]] },
  { name: "holdings", group: "Game", desc: "What's in each player's stockpile.",
    cols: [["player_id", "integer", "pk fk:players"], ["commodity_id", "text", "pk fk:commodities"], ["qty", "numeric"]] },
  { name: "businesses", group: "Game", desc: "Every business built, who owns it and where.",
    cols: [["id", "integer", "pk"], ["game_id", "integer", "fk:games"], ["owner_id", "integer", "fk:players"], ["business_type_id", "text", "fk:business_types"], ["territory_id", "text", "fk:territories"], ["built_round", "integer"], ["build_cost", "numeric"]] },
  { name: "market_prices", group: "Game", desc: "Each commodity's price every round. Keeping history lets us draw price charts.",
    cols: [["game_id", "integer", "pk fk:games"], ["round", "integer", "pk"], ["commodity_id", "text", "pk fk:commodities"], ["share", "numeric", "", "s, in %"], ["demand", "numeric"], ["price", "numeric"]] },
  { name: "trades", group: "Game", desc: "Every buy and sell on the market. Never edited, only added to.",
    cols: [["id", "integer", "pk"], ["game_id", "integer", "fk:games"], ["round", "integer"], ["player_id", "integer", "fk:players"], ["commodity_id", "text", "fk:commodities"], ["side", "text", "", "buy or sell"], ["qty", "numeric"], ["price", "numeric"]] },

  // ---------- Money ----------
  { name: "loans", group: "Money", desc: "Government loans. The balance drops as overnight repayments are made.",
    cols: [["id", "integer", "pk"], ["player_id", "integer", "fk:players"], ["borrowed", "numeric"], ["balance", "numeric"], ["rate", "numeric", "", "base + 1% when taken"], ["taken_round", "integer"]] },
  { name: "bonds", group: "Money", desc: "Government bonds a player has bought.",
    cols: [["id", "integer", "pk"], ["player_id", "integer", "fk:players"], ["count", "integer"], ["length", "integer", "", "rounds"], ["rate", "numeric", "", "locked in when bought"], ["bought_round", "integer"]] },
  { name: "futures", group: "Money", desc: "Open futures contracts.",
    cols: [["id", "integer", "pk"], ["player_id", "integer", "fk:players"], ["commodity_id", "text", "fk:commodities"], ["side", "text", "", "long or short"], ["qty", "numeric"], ["price", "numeric"], ["settle_round", "integer"], ["deposit", "numeric"]] },
  { name: "etf_holdings", group: "Money", desc: "Units of sector ETFs a player owns.",
    cols: [["player_id", "integer", "pk fk:players"], ["sector_id", "text", "pk fk:sectors"], ["units", "numeric"], ["avg_price", "numeric"]] },

  // ---------- Cards in play ----------
  { name: "player_cards", group: "Cards in play", desc: "Which cards each player holds or has played.",
    cols: [["id", "integer", "pk"], ["player_id", "integer", "fk:players"], ["card_id", "integer", "fk:cards"], ["status", "text", "", "hand or played"], ["drawn_round", "integer"]] },
  { name: "active_effects", group: "Cards in play", desc: "Card effects currently changing the game. Checked every overnight; removed when they run out.",
    cols: [["id", "integer", "pk"], ["game_id", "integer", "fk:games"], ["player_card_id", "integer", "fk:player_cards"], ["card_effect_id", "integer", "fk:card_effects"], ["target_territory_id", "text", "fk:territories", "if it hits a territory"], ["target_commodity_id", "text", "fk:commodities", "if the player chose one"], ["target_business_id", "integer", "fk:businesses", "e.g. a strike"], ["target_player_id", "integer", "fk:players", "e.g. a loan called in"], ["starts_round", "integer"], ["ends_round", "integer"]] },
];
