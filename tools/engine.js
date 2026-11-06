// Loads the game engine into Node, exactly as the website loads it. Used by the tools in this folder.
//   const E = require("./engine")({ "contracts.size": 20 });   // optional settings overrides
//   E.run("SMG.bestBid(st, 'wood')")                           // run code inside the engine
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const FILES = ["js/commodities.js", "js/market.js", "js/broker.js", "js/cards.js", "js/map.js", "maps/europe.js", "js/territories.js", "js/businesses.js",
  "game/settings.js", "game/core.js", "game/market.js", "game/production.js", "game/depreciation.js", "game/map.js", "game/contracts.js", "game/cards.js", "game/finance.js", "game/bots.js", "game/pipeline.js"];

module.exports = (overrides = {}) => {
  const ctx = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Set, Map, WeakMap, Intl, Infinity, Error });
  FILES.forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
    if (f === "game/settings.js") vm.runInContext(`(o => { for (const [k, v] of Object.entries(o)) { const ks = k.split("."); let t = GAME_SETTINGS; ks.slice(0, -1).forEach(x => t = t[x]); t[ks.at(-1)] = v; } })(${JSON.stringify(overrides)})`, ctx);
  });
  // The engine's top-level names (SMG, GAME_SETTINGS, COMMODITIES…) live in the context's global scope
  const G = vm.runInContext("SMG", ctx);
  return { ctx, G, S: vm.runInContext("GAME_SETTINGS", ctx), COMMODITIES: vm.runInContext("COMMODITIES", ctx), run: code => vm.runInContext(code, ctx) };
};
