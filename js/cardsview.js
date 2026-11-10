// ---------- Action cards tab ----------
const CAT = {
  commodity:  { name: "Commodities",       color: "--raw" },
  business:   { name: "Businesses",        color: "--mid" },
  sector:     { name: "Sectors",           color: "--fin" },
  market:     { name: "Markets",           color: "--accent" },
  default:    { name: "Defaults & credit", color: "--waste" },
  regulation: { name: "Regulations",       color: "--night" },
};
const nameOf = t => BY_ID[t] ? BY_ID[t].name
  : t.startsWith("sector:") ? (SECTORS[t.slice(7)]?.name ?? t.slice(7)) + " sector"
  : t === "all" ? "everything" : t;

function fxText([hook, on, op, v, rounds]) {
  const amt = op === "×" ? `×${v}`
    : op === "+" ? (Math.abs(v) < 1 && hook !== "e" ? `${v > 0 ? "+" : "−"}${+(Math.abs(v) * 100).toFixed(2)}%` : `${v > 0 ? "+" : "−"}${Math.abs(v)}`)
    : op === "%" ? `${+(v * 100).toFixed(1)}%`
    : op === "=" ? (v < 1 ? `set to ${v * 100}%` : `set to ${v}×`)
    : op === "×base" ? `max ${v}× base`
    : op === "repay" ? `repay ${v * 100}%`
    : op === "units" ? `${v} units a round`
    : op === "cancel" ? "cancel" : `${op} ${v}`;
  const dur = rounds === 0 ? "once" : rounds == null ? "until repealed" : `${rounds} round${rounds > 1 ? "s" : ""}`;
  return `<li><span class="hook" title="${HOOKS[hook].desc}">${HOOKS[hook].name}</span> <span class="on">${nameOf(on)}</span> <b>${amt}</b> <span class="dur">${dur}</span></li>`;
}

function renderCards(filter) {
  const list = CARDS.filter(c => !filter || filter === "all" || c.cat === filter);
  document.getElementById("cardGrid").innerHTML = list.map(c => `
    <article class="acard" style="--c:var(${CAT[c.cat].color})">
      <header><span class="cat">${CAT[c.cat].name}</span><span class="rar ${c.rarity}">${c.rarity}</span></header>
      <h3>${c.name}</h3>
      <p>${c.text}</p>
      <ul class="fx">${c.fx.map(fxText).join("")}</ul>
    </article>`).join("");
}

function initCards() {
  const counts = {};
  CARDS.forEach(c => counts[c.cat] = (counts[c.cat] || 0) + 1);
  const bar = document.getElementById("cardFilter");
  bar.innerHTML = `<button data-f="all" class="on">All ${CARDS.length}</button>` +
    Object.entries(CAT).map(([k, v]) => `<button data-f="${k}" style="--c:var(${v.color})"><i></i>${v.name} ${counts[k] || 0}</button>`).join("");
  bar.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    bar.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    renderCards(b.dataset.f);
  });

  // Which hooks exist, and how many cards use each.
  const used = {};
  CARDS.forEach(c => c.fx.forEach(f => used[f[0]] = (used[f[0]] || 0) + 1));
  const areas = {};
  Object.entries(HOOKS).forEach(([k, h]) => (areas[h.area] ||= []).push([k, h]));
  document.getElementById("hookTable").innerHTML = Object.entries(areas).map(([a, hs]) =>
    `<tr class="area"><th colspan="3">${a}</th></tr>` +
    hs.map(([k, h]) => `<tr><td class="hk">${h.name}</td><td>${h.desc}</td><td class="n">${used[k] || 0}</td></tr>`).join("")).join("");

  document.getElementById("sectorList").innerHTML = Object.values(SECTORS).map(s =>
    `<div><b>${s.name}</b><span>${s.items.map(i => BY_ID[i].name).join(", ")}</span></div>`).join("");

  renderCards("all");
}
initCards();
