// Sellers Market game engine: depreciation. Goods don't last for ever.
//
// Every unit remembers the round it was made (see "Goods age" in game/core.js). A good with a life of
// L rounds made in round r can be used until the end of round r + L − 1; overnight it goes off and is
// thrown away, wherever it is: your stockpile, a business's stock, or a sell order on the book.
// Lifetimes come from settings.depreciation: the good's own, else its kind's (raw, made, waste),
// else the default. 0 = it never goes off.
//
// Why: holding goods back now costs something, so goods come to market instead of piling up.
// Things to watch: a contract or a big build needs time to gather goods, so lifetimes must be longer
// than that; and someone who makes a good fresh every round loses nothing by refusing to sell it.

(() => {
  const G = SMG, S = GAME_SETTINGS;
  const D = () => S.depreciation || {};

  G.lifeOf = cid => {
    const d = D(), c = G.COM[cid];
    return d.goods?.[cid] ?? d.byType?.[c.type] ?? d.life ?? 0;
  };
  // Units of a good in a list of lots that will have gone off by the end of `round`
  const dueBy = (lots, cid, round) => {
    const L = G.lifeOf(cid);
    return L ? (lots || []).filter(([, made]) => made + L - 1 <= round).reduce((s, [q]) => s + q, 0) : 0;
  };
  // How many of a good a player loses tonight if they keep it (their stockpile, businesses and sell orders)
  G.goingOff = (st, p, cid) => !D().on ? 0 : dueBy(p.lots?.[cid], cid, st.round)
    + st.businesses.reduce((s, b) => s + (b.owner === p.id ? dueBy(b.lots?.[cid], cid, st.round) : 0), 0)
    + st.book.reduce((s, o) => s + (o.pid === p.id && o.side === "sell" && o.good === cid ? dueBy(o.lots, cid, st.round) : 0), 0);
  // Rounds left for the oldest unit of a good a player holds (null: none, or it never goes off)
  G.roundsLeft = (st, p, cid) => {
    const L = G.lifeOf(cid);
    if (!D().on || !L) return null;
    const lots = [...(p.lots?.[cid] || []), ...st.businesses.filter(b => b.owner === p.id).flatMap(b => b.lots?.[cid] || [])];
    return lots.length ? Math.min(...lots.map(([, made]) => made + L - st.round)) : null;
  };

  // Overnight: throw away everything that's reached the end of its life
  G.expire = st => {
    if (!D().on) return;
    const lost = {}; // pid → { good: qty }
    const note = (pid, cid, n) => { if (n) { const x = lost[pid] ||= {}; x[cid] = (x[cid] || 0) + n; st.stats.spoiled = (st.stats.spoiled || 0) + n; } };
    const spoil = (h, pid, add) => Object.keys(h.lots || {}).forEach(cid => {
      const n = dueBy(h.lots[cid], cid, st.round);
      if (n) { add(h, cid, -n); note(pid, cid, n); } // removing takes the oldest first: exactly the ones due
    });
    const cold = pid => G.coldStore && G.coldStore(st, pid); // a cold store card: nothing of theirs goes off
    st.players.forEach(p => { if (!cold(p.id)) spoil(p, p.id, G.add); });
    st.businesses.forEach(b => { if (!cold(b.owner)) spoil(b, b.owner, G.addBiz); });
    // Sell orders: the goods on offer go off too (the order shrinks; an empty one is removed)
    st.book.filter(o => o.side === "sell" && o.lots).forEach(o => {
      const n = dueBy(o.lots, o.good, st.round);
      if (!n) return;
      G.takeLots(o.lots, n); o.qty -= n; note(o.pid, o.good, n);
      if (G.isWaste(o.good)) G.player(st, o.pid).cash += o.price * n; // waste that went off needs no fee: unlock it
    });
    st.book = st.book.filter(o => o.qty > 0);
    Object.entries(lost).forEach(([pid, goods]) => G.log(st, `went off overnight: ${Object.entries(goods).map(([c, n]) => `${n} ${G.COM[c].name}`).join(", ")}`, +pid));
  };
})();
