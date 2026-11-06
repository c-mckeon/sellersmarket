// Sellers Market game engine: the automatic steps, in order.
// Add, remove or reorder steps here to change how a round plays out.
//
// Switched off while the market is player-only (the code is still there):
//   SMG.resolveCards, SMG.governmentContracts, SMG.centralBank, SMG.payLoans, SMG.payBonds,
//   SMG.settleFutures, SMG.marginCalls, SMG.expireEffects, SMG.drawCards

SMG.steps.midday = [
  SMG.auction,             // the morning's orders are matched
  SMG.produce,             // businesses turn inputs into products; full stockpiles throw things away
];

SMG.steps.overnight = [
  SMG.auction,             // the afternoon's orders are matched
  SMG.refillContracts,     // delivered and discarded contracts are replaced
];
