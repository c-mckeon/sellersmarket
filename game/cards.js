// Sellers Market game engine: cards. You get one each time you deliver a contract.
//
// You hold up to settings.cards.hand cards and can play one a round, as one of your orders:
//   playCard { card, target }   card: its place in your hand; target: what it needs (below)
// Everyone sees which card was played (in the log); cards that reveal something tell only you.
// A card's effect starts tonight and lasts the number of nights it says ("tonight" = 1).
//
// Each card: id, name, icon, group, rarity (how often it's drawn), target, text, play(st, p, target).
//   target: null, "player" (another player), "good", "raw" (a raw material), "territory" (land),
//           "myBusiness", "theirBusiness" (another player's), "myContract" (one you hold),
//           "boardContract" (one on the board), or a list of two of these (the target is then [first, second])
// Lasting effects go in st.effects: { type, by, from, until, … }, and the rest of the engine asks
// G.effects(st, type) what's in force (production, the auction, ageing, building, moving).

(() => {
  const G = SMG, S = GAME_SETTINGS;
  const CS = S.cards ||= { hand: 5, perRound: 1, rarity: { common: 6, uncommon: 3, rare: 1 } };

  // ---------- Lasting effects ----------
  // Add one that starts tonight and lasts `nights` nights
  const effect = (st, p, e, nights) => (st.effects ||= []).push({ ...e, card: st.playing, by: p.id, from: st.round, until: st.round + nights - 1 });
  // What's in force right now (during a round and its night)
  G.effects = (st, type) => (st.effects || []).filter(e => e.type === type && e.from <= st.round && st.round <= e.until);
  // Night, at the end: forget effects that have run out
  G.tidyEffects = st => { st.effects = (st.effects || []).filter(e => e.until >= st.round + 1); };

  // How a business's output is changed tonight: { shut, plus }
  G.outputMod = (st, biz) => {
    const b = G.BIZ_BY[biz.type];
    let shut = false, plus = 0;
    G.effects(st, "output").forEach(e => {
      const hits = (e.all || (e.player && e.player === biz.owner) || (e.territory && e.territory === biz.territory) || (e.biz && e.biz === biz.id))
        && (!e.makes || e.makes.includes(b.makes)) && (!e.kind || e.kind === b.kind);
      if (!hits) return;
      if (e.shut) shut = true;
      plus += e.plus || 0;
    });
    return { shut, plus };
  };
  // Market: goods that can't trade, players whose orders don't trade, what sellers gain or lose on a good
  G.halted = (st, id) => G.effects(st, "halt").some(e => e.good === id);
  G.embargoed = (st, pid) => G.effects(st, "embargo").some(e => e.player === pid);
  G.sellerShare = (st, id) => 1 + G.effects(st, "levy").filter(e => e.good === id).reduce((s, e) => s + e.share, 0);
  // Goods that don't age for a player tonight
  G.coldStore = (st, pid) => G.effects(st, "cold").some(e => e.player === pid);
  // Building and moving
  G.noBuild = (st, tid) => G.effects(st, "noBuild").some(e => e.territory === tid);
  G.extraMoves = (st, pid) => G.effects(st, "moves").filter(e => e.player === pid).reduce((s, e) => s + e.extra, 0);

  // ---------- Helpers for cards that act at once ----------
  const units = p => Object.entries(p.stock).flatMap(([c, q]) => Array(q).fill(c));
  const others = (st, p) => st.players.filter(x => x.id !== p.id);
  const say = (st, msg, pid) => G.log(st, msg, pid);
  const oldestUnits = (p, n) => Object.entries(p.lots || {}).flatMap(([c, L]) => L.flatMap(([q, made]) => Array(q).fill([c, made])))
    .sort((a, b) => a[1] - b[1]).slice(0, n).map(x => x[0]);

  // ---------- The cards ----------
  const CARDS = [
    // The world: what businesses make
    { id: "bumper_harvest", name: "Bumper harvest", icon: "🌾", group: "World", rarity: "common", target: null,
      text: "Every farm makes 1 extra wheat for 2 nights.",
      play: (st, p) => effect(st, p, { type: "output", all: true, makes: ["wheat"], plus: 1 }, 2) },
    { id: "drought", name: "Drought", icon: "☀️", group: "World", rarity: "uncommon", target: null,
      text: "Tonight, no farm or water works anywhere makes anything.",
      play: (st, p) => effect(st, p, { type: "output", all: true, makes: ["wheat", "water"], shut: true }, 1) },
    { id: "mine_collapse", name: "Mine collapse", icon: "⛏️", group: "World", rarity: "uncommon", target: "territory",
      text: "The mines, pits and quarries in a territory make nothing for 3 nights.",
      play: (st, p, t) => effect(st, p, { type: "output", territory: t, kind: "extract", shut: true }, 3) },
    { id: "miners_strike", name: "Miners' strike", icon: "✊", group: "World", rarity: "uncommon", target: null,
      text: "Every coal and iron mine stops for 2 nights.",
      play: (st, p) => effect(st, p, { type: "output", all: true, makes: ["coal", "iron_ore"], shut: true }, 2) },
    { id: "flood", name: "Flood", icon: "🌊", group: "World", rarity: "uncommon", target: "territory",
      text: "Every business in a territory stops for 2 nights.",
      play: (st, p, t) => effect(st, p, { type: "output", territory: t, shut: true }, 2) },
    { id: "overtime", name: "Overtime", icon: "⏱️", group: "World", rarity: "common", target: null,
      text: "Tonight each of your businesses makes 1 extra.",
      play: (st, p) => effect(st, p, { type: "output", player: p.id, plus: 1 }, 1) },
    { id: "power_cut", name: "Power cut", icon: "🔌", group: "World", rarity: "common", target: "player",
      text: "Tonight another player's factories stop.",
      play: (st, p, t) => effect(st, p, { type: "output", player: t, kind: "factory", shut: true }, 1) },
    { id: "rich_seam", name: "Rich seam", icon: "💎", group: "World", rarity: "rare", target: "myBusiness",
      text: "One of your businesses makes 1 extra for 5 nights.",
      play: (st, p, t) => effect(st, p, { type: "output", biz: t, plus: 1 }, 5) },

    // Stockpiles
    { id: "warehouse", name: "Warehouse extension", icon: "🏗️", group: "Stockpile", rarity: "uncommon", target: null,
      text: "Your stockpile gets 5 more rows, for good.",
      play: (st, p) => { p.space += 5; } },
    { id: "damp", name: "Damp warehouse", icon: "💧", group: "Stockpile", rarity: "common", target: "player",
      text: "The 3 oldest units in another player's stockpile spoil.",
      play: (st, p, t) => { const v = G.player(st, t), gone = oldestUnits(v, 3); gone.forEach(c => G.add(v, c, -1));
        say(st, `lost ${gone.length ? gone.map(c => G.COM[c].name).join(", ") : "nothing"} to damp`, v.id); } },
    { id: "cold_store", name: "Cold store", icon: "❄️", group: "Stockpile", rarity: "uncommon", target: null,
      text: "Nothing in your stockpile goes off for 3 nights.",
      play: (st, p) => effect(st, p, { type: "cold", player: p.id }, 3) },
    { id: "weevils", name: "Weevils", icon: "🐛", group: "Stockpile", rarity: "uncommon", target: null,
      text: "Everyone's wheat, flour and bread goes off at once.",
      play: st => st.players.forEach(v => ["wheat", "flour", "bread"].forEach(c => { const n = v.stock[c] || 0; if (n) G.add(v, c, -n); })) },
    { id: "theft", name: "Theft", icon: "🦹", group: "Stockpile", rarity: "uncommon", target: "player",
      text: "Take 2 units at random from another player's stockpile.",
      play: (st, p, t) => { const v = G.player(st, t), got = [];
        for (let i = 0; i < 2; i++) { const all = units(v); if (!all.length) break; const c = all[Math.floor(G.rand(st) * all.length)]; G.add(v, c, -1); G.add(p, c, 1); got.push(c); }
        say(st, `had ${got.length ? got.map(c => G.COM[c].name).join(" and ") : "nothing"} stolen`, v.id);
        say(st, `stole ${got.length ? got.map(c => G.COM[c].name).join(" and ") : "nothing"} from ${v.name}`, p.id); } },
    { id: "shipment", name: "Windfall shipment", icon: "🚢", group: "Stockpile", rarity: "common", target: "raw",
      text: "3 units of a raw material of your choice arrive in your stockpile.",
      play: (st, p, t) => G.add(p, t, 3) },

    // Trading
    { id: "export_controls", name: "Export controls", icon: "🛃", group: "Trading", rarity: "uncommon", target: "good",
      text: "A good can't be traded for 2 auctions. Orders for it wait on the book.",
      play: (st, p, t) => effect(st, p, { type: "halt", good: t }, 2) },
    { id: "embargo", name: "Trade embargo", icon: "🚫", group: "Trading", rarity: "uncommon", target: "player",
      text: "Tonight another player's orders don't trade. They wait on the book.",
      play: (st, p, t) => effect(st, p, { type: "embargo", player: t }, 1) },
    { id: "tariff", name: "Tariff", icon: "📉", group: "Trading", rarity: "common", target: "good",
      text: "For 3 auctions, whoever sells a good keeps only 75% of the price (the rest goes to the state).",
      play: (st, p, t) => effect(st, p, { type: "levy", good: t, share: -0.25 }, 3) },
    { id: "subsidy", name: "Subsidy", icon: "📈", group: "Trading", rarity: "common", target: "good",
      text: "For 3 auctions, whoever sells a good gets 25% on top of the price, paid by the state.",
      play: (st, p, t) => effect(st, p, { type: "levy", good: t, share: 0.25 }, 3) },
    { id: "insider_tip", name: "Insider tip", icon: "🕵️", group: "Trading", rarity: "common", target: "player",
      text: "See another player's stockpile, orders and contracts (only you see it).",
      play: (st, p, t) => { const v = G.player(st, t);
        const stock = Object.entries(v.stock).map(([c, q]) => `${q} ${G.COM[c].name}`).join(", ") || "nothing";
        const orders = st.book.filter(o => o.pid === v.id).map(o => `${o.side === "buy" ? "bid" : "ask"} ${o.qty} ${G.COM[o.good].name} at ${G.money(o.price)}`).join(", ") || "none";
        const ks = (v.contracts || []).map(k => `${k.name} (${G.money(k.price)}, due round ${k.due})`).join(", ") || "none";
        say(st, `insider tip on ${v.name}: stockpile ${stock}; orders ${orders}; contracts ${ks}`, p.id); } },
    { id: "windfall", name: "Windfall", icon: "💰", group: "Trading", rarity: "uncommon", target: null,
      text: "You get €150.",
      play: (st, p) => { p.cash += 150; } },
    { id: "tax_audit", name: "Tax audit", icon: "🧾", group: "Trading", rarity: "uncommon", target: "player",
      text: "Another player pays 10% of their free cash to the state.",
      play: (st, p, t) => { const v = G.player(st, t), fee = Math.round(Math.max(0, v.cash) * 0.1); v.cash -= fee; say(st, `paid ${G.money(fee)} after a tax audit`, v.id); } },
    { id: "rumour", name: "Market rumour", icon: "🗣️", group: "Trading", rarity: "uncommon", target: "good",
      text: "Everyone's bids and asks for a good are cancelled (what they locked comes back).",
      play: (st, p, t) => { st.book.filter(o => o.good === t).forEach(o => G.releaseOrder(st, o)); st.book = st.book.filter(o => o.good !== t); } },

    // Contracts
    { id: "extension", name: "Extension", icon: "📅", group: "Contracts", rarity: "common", target: "myContract",
      text: "One of your contracts gets 3 more rounds.",
      play: (st, p, t) => { const k = p.contracts.find(x => x.id === t); k.due += 3; } },
    { id: "lawyers", name: "Good lawyers", icon: "⚖️", group: "Contracts", rarity: "uncommon", target: "myContract",
      text: "If one of your contracts isn't delivered in time, you pay no legal fees.",
      play: (st, p, t) => { const k = p.contracts.find(x => x.id === t); k.noFee = true; } },
    { id: "lobbying", name: "Lobbying", icon: "🎩", group: "Contracts", rarity: "uncommon", target: "boardContract",
      text: "The client will pay up to 30% more for a contract on the board.",
      play: (st, p, t) => { const k = st.contracts.find(x => x.id === t); k.cap = Math.round(k.cap * 1.3); } },
    { id: "peek", name: "Peek at the tenders", icon: "👀", group: "Contracts", rarity: "common", target: "boardContract",
      text: "See every bid on a contract on the board (only you see it).",
      play: (st, p, t) => { const k = st.contracts.find(x => x.id === t);
        say(st, `the bids on ${k.name}: ${k.bids.map(b => `${G.player(st, b.pid).name} ${G.money(b.amount)}`).join(", ") || "none yet"}`, p.id); } },
    { id: "pass_buck", name: "Pass the buck", icon: "🫴", group: "Contracts", rarity: "uncommon", target: ["myContract", "player"],
      text: "One of your contracts becomes another player's: they're paid if they deliver it in time, and pay the legal fees if not.",
      play: (st, p, [kid, pid]) => { const k = p.contracts.find(x => x.id === kid), v = G.player(st, pid);
        p.contracts = p.contracts.filter(x => x !== k); (v.contracts ||= []).push(k);
        say(st, `was handed ${k.name} by ${p.name}: deliver it by round ${k.due}`, v.id); } },
    { id: "gov_order", name: "Government order", icon: "🏛️", group: "Contracts", rarity: "uncommon", target: ["boardContract", "player"],
      text: "A contract on the board goes to another player now, at its lowest bid so far (or 60% of its cap). They must deliver it in time or pay the legal fees.",
      play: (st, p, [kid, pid]) => { const k = st.contracts.find(x => x.id === kid), v = G.player(st, pid), low = G.lowestBid(k);
        st.contracts = st.contracts.filter(x => x !== k);
        const price = low ? low.amount : Math.round(k.cap * 0.6);
        (v.contracts ||= []).push({ id: k.id, name: k.name, icon: k.icon, goods: k.goods, cap: k.cap, price, won: st.round, due: st.round + G.deliverRoundsOf(k) });
        say(st, `was ordered to make ${k.name} for ${G.money(price)}: deliver it by round ${st.round + G.deliverRoundsOf(k)}`, v.id); } },
    { id: "inside_line", name: "Inside line", icon: "☎️", group: "Contracts", rarity: "common", target: null,
      text: "See the next two contracts that will come to the board (only you see them).",
      play: (st, p) => say(st, `the next contracts: ${G.upcoming(st, 2).map(k => `${k.icon} ${k.name} (${Object.entries(k.goods).map(([c, q]) => `${q} ${G.COM[c].name}`).join(", ")}; client pays up to ${G.money(k.cap)})`).join(" · then ")}`, p.id) },
    { id: "rush_order", name: "Rush order", icon: "📯", group: "Contracts", rarity: "rare", target: null,
      text: "A new contract goes on the board now, and the client will pay up to 50% more for it.",
      play: st => { const k = G.nextContract(st); k.cap = Math.round(k.cap * 1.5); st.contracts.push(k); } },

    // The map
    { id: "fast_horses", name: "Fast horses", icon: "🐎", group: "Map", rarity: "common", target: null,
      text: "This round you can move two steps (instead of one move or build).",
      play: (st, p) => effect(st, p, { type: "moves", player: p.id, extra: 1 }, 1) },
    { id: "grant", name: "Building grant", icon: "🏛️", group: "Map", rarity: "uncommon", target: null,
      text: "Your next business costs half.",
      play: (st, p) => { p.grant = true; } },
    { id: "takeover", name: "Hostile takeover", icon: "🦈", group: "Map", rarity: "rare", target: "theirBusiness",
      text: "Another player's business becomes yours, where it stands.",
      play: (st, p, t) => { const b = st.businesses.find(x => x.id === t), v = G.player(st, b.owner);
        Object.entries(b.stock || {}).forEach(([c, q]) => { G.addBiz(b, c, -q); G.add(v, c, q); }); // its stock stays with the old owner
        b.owner = p.id; say(st, `lost a ${G.BIZ_BY[b.type].name.toLowerCase()} in ${G.TERR[b.territory].name} to a hostile takeover`, v.id); } },
    { id: "objection", name: "Planning objection", icon: "📜", group: "Map", rarity: "common", target: "territory",
      text: "Nothing can be built in a territory for 3 rounds.",
      play: (st, p, t) => effect(st, p, { type: "noBuild", territory: t }, 3) },
  ];
  G.CARDS = CARDS;
  G.CARD = Object.fromEntries(CARDS.map(c => [c.id, c]));

  // ---------- Getting and playing cards ----------
  // Draw one at random, the common ones more often (settings.cards.rarity)
  G.drawCard = (st, p) => {
    if ((p.hand ||= []).length >= CS.hand) { G.log(st, "Your hand is full: no new card.", p.id); return null; }
    const w = c => CS.rarity[c.rarity] || 1, total = CARDS.reduce((s, c) => s + w(c), 0);
    let r = G.rand(st) * total, card = CARDS[0];
    for (const c of CARDS) { r -= w(c); if (r <= 0) { card = c; break; } }
    p.hand.push(card.id);
    return card;
  };

  // Is `target` right for the card? (an error message, or "")
  G.cardTargetError = (st, p, card, t) => {
    if (Array.isArray(card.target)) {
      if (!Array.isArray(t) || t.length !== card.target.length) return "Pick both.";
      for (let i = 0; i < t.length; i++) { const e = G.cardTargetError(st, p, { target: card.target[i] }, t[i]); if (e) return e; }
      return "";
    }
    switch (card.target) {
      case null: return "";
      case "player": return st.players.some(x => x.id === t && x.id !== p.id) ? "" : "Pick another player.";
      case "good": return G.COM[t] && !G.isWaste(t) ? "" : "Pick a good.";
      case "raw": return G.COM[t]?.type === "raw" ? "" : "Pick a raw material.";
      case "territory": return G.TERR[t] && !G.isSea(t) ? "" : "Pick a territory on land.";
      case "myBusiness": return st.businesses.some(b => b.id === t && b.owner === p.id) ? "" : "Pick one of your businesses.";
      case "theirBusiness": return st.businesses.some(b => b.id === t && b.owner !== p.id) ? "" : "Pick another player's business.";
      case "myContract": return (p.contracts || []).some(k => k.id === t) ? "" : "Pick one of your contracts.";
      case "boardContract": return (st.contracts || []).some(k => k.id === t) ? "" : "Pick a contract on the board.";
    }
    return "That card can't be played like that.";
  };

  G.actions.playCard = (st, p, { card, target = null }) => {
    G.need(st.phase === "day", "Not right now.");
    const i = (p.hand || []).indexOf(card);
    G.need(i >= 0, "You don't hold that card.");
    G.need((p.cardsPlayed || 0) < CS.perRound || p.cardRound !== st.round, "You've already played a card this round.");
    const c = G.CARD[card], err = G.cardTargetError(st, p, c, target);
    G.need(!err, err);
    p.hand.splice(i, 1);
    if (p.cardRound !== st.round) { p.cardRound = st.round; p.cardsPlayed = 0; }
    p.cardsPlayed++;
    st.playing = card; c.play(st, p, target); delete st.playing;
    const tt = Array.isArray(c.target) ? c.target.at(-1) : c.target, tv = Array.isArray(target) ? target.at(-1) : target;
    const what = Array.isArray(c.target) ? ` on ${G.player(st, tv)?.name || "?"}` : tt === "theirBusiness" ? ` on ${G.player(st, st.businesses.find(b => b.id === tv)?.owner)?.name || "?"}'s business`
      : c.target === "player" ? ` on ${G.player(st, target).name}` : c.target === "good" || c.target === "raw" ? ` on ${G.COM[target].name}`
      : c.target === "territory" ? ` in ${G.TERR[target].name}` : c.target === "boardContract" ? ` on ${(st.contracts.find(k => k.id === target) || {}).name || "a contract"}` : "";
    G.log(st, `${p.name} played ${c.icon} ${c.name}${what}`); // public
    (st.stats.cards ||= {})[card] = (st.stats.cards[card] || 0) + 1;
    return null;
  };
})();
