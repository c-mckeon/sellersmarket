// Sellers Market game engine: the automatic steps, in order.
// Add, remove or reorder steps here to change how a round plays out.

SMG.steps.midday = [
  SMG.produce,        // businesses turn inputs into products
  SMG.repriceStep,    // prices update now stockpiles have changed
];

SMG.steps.overnight = [
  SMG.resolveCards,   // cards played this afternoon are revealed and take effect
  SMG.payWages,       // businesses' running costs
  SMG.inflate,        // prices creep up
  SMG.repriceStep,    // prices for tomorrow morning
  SMG.expireEffects,  // card effects that have run their course end
  SMG.drawCards,      // everyone draws 2 cards (up to 5)
];
