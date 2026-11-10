// Sellers Market: the jobs that contracts are for. Each one is a real thing and the goods it would really
// take: [name, icon, goods]. A contract picks one and asks for a few of each good (settings.contracts.unitsPerGood).
// Add or remove jobs freely; any good from js/commodities.js can be asked for (not waste).

const PROJECTS = [
  // One material: bulk orders
  ["Grain for the granary",           "🌾", ["wheat"]],
  ["Bread for the garrison",          "🍞", ["bread"]],
  ["Flour for the army bakers",       "🥖", ["flour"]],
  ["Coal for the gasworks",           "🔥", ["coal"]],
  ["Firewood for the winter",         "🪵", ["wood"]],
  ["Timber for a hay barn",           "🛖", ["lumber"]],
  ["Paper for the printing house",    "📰", ["paper"]],
  ["Ore for the foundry",             "⛏️", ["iron_ore"]],
  ["Sand for the flood defences",     "🌊", ["sand"]],
  ["Window glass for a new street",   "🪟", ["glass"]],
  ["Floor tiles for the bathhouse",   "🛁", ["ceramic"]],
  ["Cement for the dock repairs",     "⚓", ["cement"]],
  ["Steel rails for the branch line", "🛤️", ["steel"]],
  ["Pig iron for the forge",          "⚒️", ["iron"]],
  ["Clay for the potteries",          "🏺", ["clay"]],
  ["Building stone for the abbey",    "⛪", ["limestone"]],

  // Two materials
  ["Greenhouse",                      "🪴", ["glass", "lumber"]],
  ["Pottery workshop",                "🏺", ["clay", "coal"]],
  ["Village bakery's order",          "🥐", ["flour", "coal"]],
  ["Stone cottage",                   "🏡", ["limestone", "lumber"]],
  ["Lighthouse lantern",              "🗼", ["glass", "iron"]],
  ["Railway sleepers and rails",      "🛤️", ["lumber", "steel"]],
  ["Brick chimney",                   "🏭", ["ceramic", "cement"]],
  ["Footbridge",                      "🌉", ["concrete", "steel"]],
  ["Harvest feast",                   "🍽️", ["bread", "wheat"]],
  ["Fishing boats",                   "🛶", ["lumber", "iron"]],

  // Three materials
  ["Railway station",                 "🚉", ["steel", "glass", "lumber"]],
  ["Steam engine",                    "🚂", ["steel", "iron", "coal"]],
  ["Printing press",                  "📰", ["iron", "steel", "paper"]],
  ["Warehouse",                       "🏬", ["lumber", "iron", "cement"]],
  ["Canal lock",                      "🚤", ["concrete", "iron", "lumber"]],
  ["Field hospital",                  "🏥", ["lumber", "glass", "bread"]],
  ["Village school",                  "🏫", ["lumber", "glass", "paper"]],
  ["Watermill",                       "⚙️", ["limestone", "lumber", "iron"]],
  ["Cathedral windows",               "⛪", ["glass", "iron", "limestone"]],

  // Four materials
  ["Town hall",                       "🏛️", ["limestone", "glass", "lumber", "ceramic"]],
  ["Dam",                             "🌊", ["concrete", "steel", "cement", "sand"]],
  ["Locomotive",                      "🚂", ["steel", "iron", "coal", "lumber"]],
  ["Department store",                "🏬", ["steel", "glass", "concrete", "lumber"]],
  ["Gasworks",                        "🏭", ["steel", "ceramic", "coal", "cement"]],
];
