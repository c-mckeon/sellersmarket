// Sellers Market game engine: the automatic steps, in order.
// Add, remove or reorder steps here to change how a round plays out.

SMG.steps.midday = [
  SMG.produce,             // businesses turn inputs into products; full stockpiles throw things away
  SMG.repriceStep,         // prices update now stockpiles have changed
];

SMG.steps.overnight = [
  SMG.resolveCards,        // cards played this afternoon are revealed and take effect
  SMG.governmentContracts, // the state buys output under any government contracts
  SMG.payWages,            // businesses' running costs
  SMG.inflate,             // prices creep up
  SMG.repriceStep,         // prices for tomorrow morning
  SMG.centralBank,         // every 5 rounds: base rate review; the government adjusts lending
  SMG.payLoans,            // interest and repayments
  SMG.payBonds,            // coupons, and bonds that end pay back 100
  SMG.settleFutures,       // contracts due now settle
  SMG.marginCalls,         // loans over the borrowing limit: the bank sells your things
  SMG.expireEffects,       // card effects that have run their course end
  SMG.rememberWorth,       // for the windfall tax
  SMG.drawCards,           // everyone draws 2 cards (up to 5)
];
