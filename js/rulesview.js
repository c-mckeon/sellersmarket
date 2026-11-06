// Sellers Market: fills the numbers on the Gameplay and Market pages from the game's own settings,
// so the rules pages always match the game. <span data-s="contracts.hand"></span> shows a setting;
// data-f="pct" shows it as a percentage. A few names are worked out here (lists of goods, regions…).

(() => {
  const S = GAME_SETTINGS, G = SMG;
  const name = id => G.COM[id].name.toLowerCase();
  const list = a => a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`;
  const half = v => v === 0.5 ? "½" : v === 0.25 ? "¼" : String(v);
  const special = {
    startGoods: () => list(Object.entries(S.startGoods).map(([c, q]) => `${q} ${name(c)}`)),
    contractGoods: () => list(S.contracts.goods.map(name)),
    contractRaws: () => list((S.contracts.raws || G.contractRaws()).map(name)),
    substitutes: () => list((S.substitutes || []).slice(0, 4).map(r => `${r.ratio} ${name(r.use)} for 1 ${name(r.for)}`)) + " (and more)",
    materials: () => { const by = {}; Object.entries(S.build.materials).forEach(([c, v]) => (by[v] ||= []).push(name(c)));
      return Object.entries(by).sort((a, b) => b[0] - a[0]).map(([v, l]) => `${list(l)} count ${half(+v)}`).join("; "); },
    heavy: () => list(S.build.heavy.goods.map(name)),
    lifetimes: () => { if (!S.depreciation?.on) return "goods never go off (switched off)";
      const d = S.depreciation, life = id => d.goods?.[id] ?? d.byType?.[G.COM[id].type] ?? d.life ?? 0;
      const show = ["bread", "wheat", "flour", "water", "wood", "lumber", "iron", "steel", "glass", "gold"];
      return show.map(id => `${name(id)} ${life(id) ? `${life(id)} rounds` : "never"}`).join(", "); },
    regions: () => { const by = {};
      TERRITORIES.filter(t => !t.sea).forEach(t => Object.keys(TERRITORY_INFO[t.id].res || {}).forEach(r => { if (r !== "wheat" && r !== "water") (by[r] ||= []).push(t.name); }));
      return Object.entries(by).map(([r, ts]) => `${name(r)} (${list(ts)})`).join("; "); },
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
