// Sellers Market: fills the numbers on the Gameplay and Market pages from the game's own settings,
// so the rules pages always match the game. <span data-s="contracts.open"></span> shows a setting;
// data-f="pct" shows it as a percentage. A few names are worked out here (lists of goods, regions…).

(() => {
  const S = GAME_SETTINGS, G = SMG;
  const name = id => G.COM[id].name.toLowerCase();
  const list = a => a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`;
  const special = {
    startGoods: () => list(Object.entries(S.startGoods).map(([c, q]) => `${q} ${name(c)}`)),
    cardList: () => G.CARDS.map(c => `${c.icon} ${c.name}: ${c.text}`).join(" · "),
    goalMoney: () => `€${S.goal.toLocaleString()}`,
    perRound: () => { const [a, b] = S.contracts.perRound; return a === b ? `${a}` : `${a} to ${b}`; },
    projects: () => list(PROJECTS.map(([n, , g]) => `${n.toLowerCase()} (${g.map(name).join(", ")})`)),
    failFee: () => { const f = S.contracts.failFee; return [f.base ? `${f.base}` : "", f.share ? `${Math.round(f.share * 100)}% of your bid` : ""].filter(Boolean).join(" + ") || "nothing"; },
    substitutes: () => list((S.substitutes || []).slice(0, 4).map(r => `${r.ratio} ${name(r.use)} for 1 ${name(r.for)}`)) + " (and more)",
    lifetimes: () => { if (!S.depreciation?.on) return "goods never go off (switched off)";
      const d = S.depreciation, life = id => d.goods?.[id] ?? d.byType?.[G.COM[id].type] ?? d.life ?? 0;
      const show = ["bread", "wheat", "flour", "water", "wood", "lumber", "iron", "steel", "glass"];
      return show.map(id => `${name(id)} ${life(id) ? `${life(id)} rounds` : "never"}`).join(", "); },
    // Where each raw material can be dug up or grown
    regions: () => COMMODITIES.filter(c => c.type === "raw").map(c => `${name(c.id)} (${list(G.sourcesOf(c.id).map(t => G.TERR[t].name))})`).join("; "),
  };
  const get = path => path.split(".").reduce((o, k) => o?.[k], S);
  document.querySelectorAll("[data-s]").forEach(el => {
    const k = el.dataset.s;
    let v = special[k] ? special[k]() : get(k);
    if (v == null) return;
    if (el.dataset.f === "pct") v = `${Math.round(v * 100)}%`;
    else if (typeof v === "number") v = v.toLocaleString();
    el.textContent = v;
  });
})();
