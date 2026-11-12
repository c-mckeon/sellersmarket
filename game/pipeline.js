// Sellers Market game engine: the automatic steps at the end of each round, in order.
// Add, remove or reorder steps here to change how a round plays out.
//
// Switched off while the market is player-only (the code is still there):
//   SMG.resolveCards, SMG.governmentContracts, SMG.centralBank, SMG.payLoans, SMG.payBonds,
//   SMG.settleFutures, SMG.marginCalls, SMG.expireEffects, SMG.drawCards

SMG.steps.night = [
  SMG.auction,             // the round's orders are matched
  SMG.produce,             // businesses turn inputs into products
  SMG.expire,              // goods at the end of their life go off (game/depreciation.js)
  SMG.refillContracts,     // deadlines, tender awards and new contracts
  SMG.tidyEffects,         // card effects that have run out are forgotten
];
