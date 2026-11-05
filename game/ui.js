// Sellers Market: the Game tab. Draws the game and turns clicks into engine actions.
// All the rules live in the engine (game/*.js); this file only displays and asks.

(() => {
  const G = SMG, S = GAME_SETTINGS;
  const KEY = "sellersmarket-game-v1";
  const root = document.getElementById("game");
  if (!root) return;
  let st = null, ui = { filter: "mine", search: "", card: null };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const m = n => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toFixed(2)).replace(/^-/, "−");
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const LAND = TERRITORIES.filter(t => !t.sea);
  const COLOURS = ["#d4682a", "#2f6db5", "#8a4fc0", "#2e8b57", "#c23b5a", "#1f8a8a", "#a07a1a", "#555"];
  const NAMES = ["You", "Ana", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus"];

  // ================= Setup =================
  let setup = null;
  const defaultPlayer = i => {
    const start = i === 0 ? "ukraine" : LAND[(i * 13 + 5) % LAND.length].id;
    const ext = G.BIZ.filter(b => b.kind === "extract" && G.canBuildAt(b, start));
    return { name: NAMES[i] || `Player ${i + 1}`, colour: COLOURS[i % COLOURS.length], bot: i > 0, start, business: (ext.find(b => b.id === "farm") || ext[0] || G.BIZ_BY.water_works).id };
  };

  function renderSetup() {
    setup ||= { players: [0, 1, 2, 3].map(defaultPlayer), rounds: S.rounds };
    const saved = load();
    root.innerHTML = `
      <div class="gsetup">
        <h1>New game</h1>
        <p class="muted">Pick who's playing. Each player starts with ${S.startCash} cash, ${S.startSpace} crates of stockpile space, ${S.cardsPerRound} cards and one free business where they start. Highest net worth after the last round wins.</p>
        ${saved && !saved.over ? `<div class="gresume">A game in round ${saved.round} is saved in this browser. <button class="gbtn" id="gResume">Continue it</button></div>` : ""}
        <table class="gplayers"><thead><tr><th></th><th>Name</th><th>Who</th><th>Starts in</th><th>Free business</th><th></th></tr></thead><tbody>
        ${setup.players.map((p, i) => {
          const opts = G.BIZ.filter(b => G.canBuildAt(b, p.start));
          return `<tr data-i="${i}">
            <td><input type="color" data-k="colour" value="${p.colour}"></td>
            <td><input data-k="name" value="${esc(p.name)}" maxlength="16"></td>
            <td><select data-k="bot"><option value="0"${p.bot ? "" : " selected"}>Human</option><option value="1"${p.bot ? " selected" : ""}>Computer</option></select></td>
            <td><select data-k="start">${LAND.map(t => `<option value="${t.id}"${t.id === p.start ? " selected" : ""}>${t.name}</option>`).join("")}</select></td>
            <td><select data-k="business">
              <optgroup label="Extraction">${opts.filter(b => b.kind === "extract").map(b => `<option value="${b.id}"${b.id === p.business ? " selected" : ""}>${b.name}</option>`).join("")}</optgroup>
              <optgroup label="Factories">${opts.filter(b => b.kind === "factory").map(b => `<option value="${b.id}"${b.id === p.business ? " selected" : ""}>${b.name}</option>`).join("")}</optgroup>
            </select></td>
            <td>${setup.players.length > 1 ? `<button class="glink" data-del="${i}" title="Remove">✕</button>` : ""}</td>
          </tr>`; }).join("")}
        </tbody></table>
        <div class="grow">
          ${setup.players.length < 8 ? `<button class="gbtn ghost" id="gAdd">+ Add player</button>` : ""}
          <label>Rounds <input type="number" id="gRounds" min="3" max="200" value="${setup.rounds}"></label>
          <button class="gbtn" id="gStart">Start game</button>
        </div>
      </div>`;
    root.querySelectorAll("tr[data-i]").forEach(tr => tr.addEventListener("change", e => {
      const p = setup.players[+tr.dataset.i], k = e.target.dataset.k;
      if (!k) return;
      p[k] = k === "bot" ? e.target.value === "1" : e.target.value;
      if (k === "start") {
        const ok = G.BIZ.filter(b => G.canBuildAt(b, p.start));
        if (!ok.some(b => b.id === p.business)) p.business = (ok.find(b => b.kind === "extract") || ok[0]).id;
        renderSetup();
      }
    }));
    root.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => { setup.players.splice(+b.dataset.del, 1); renderSetup(); }));
    root.querySelector("#gAdd")?.addEventListener("click", () => { setup.players.push(defaultPlayer(setup.players.length)); setup.players.at(-1).bot = true; renderSetup(); });
    root.querySelector("#gRounds").addEventListener("change", e => setup.rounds = Math.max(3, Math.min(200, +e.target.value || S.rounds)));
    root.querySelector("#gResume")?.addEventListener("click", () => { st = saved; render(); });
    root.querySelector("#gStart").addEventListener("click", () => {
      st = G.newGame({ players: setup.players, rounds: setup.rounds });
      save(); render();
    });
  }

  // ================= Game screen =================
  const me = () => G.current(st);
  const needsOf = p => {
    const need = {};
    G.myBusinesses(st, p.id).forEach(b => Object.entries(G.BIZ_BY[b.type].inputs).forEach(([c, q]) => need[c] = (need[c] || 0) + q));
    return need;
  };
  const doAct = (name, args) => {
    const r = G.act(st, me().id, name, args);
    flash(r.ok ? "" : r.msg);
    save(); render();
  };
  let flashMsg = "";
  const flash = msg => { flashMsg = msg; };

  function render() {
    if (!st) return renderSetup();
    if (st.over) return renderEnd();
    const p = me();
    root.innerHTML = `
      <div class="gbar">
        <span class="gphase ${st.phase}">Round ${st.round} of ${st.rounds} · ${st.phase === "morning" ? "Morning: trade" : "Afternoon: move or build, and play a card"}</span>
        <span class="gturn"><i style="background:${p.colour}"></i>${p.name === "You" ? "Your" : esc(p.name) + "'s"} turn</span>
        <span class="gsp"></span>
        <button class="gbtn" id="gEnd">${st.phase === "morning" ? "Done trading" : "End turn"} →</button>
        <button class="gbtn ghost" id="gNew" title="Start a new game">New game</button>
      </div>
      ${flashMsg ? `<div class="gflash">${esc(flashMsg)}</div>` : ""}
      <div class="glay">
        <div class="gmain ${st.phase}">
          <div class="gmap" id="gMap"></div>
          <div class="gpanel">${st.phase === "morning" ? marketPanel(p) : afternoonPanel(p)}</div>
        </div>
        <aside class="gdash">${dashboard(p)}</aside>
      </div>`;
    flashMsg = "";
    drawMap(p);
    wire(p);
  }

  // ----- Dashboard: only what's ours -----
  function dashboard(p) {
    const used = G.used(p), worth = G.netWorth(st, p), need = needsOf(p);
    const biz = G.myBusinesses(st, p.id);
    const stock = Object.entries(p.stock).sort((a, b) => b[1] * st.prices[b[0]] - a[1] * st.prices[a[0]]);
    const mine = st.log.filter(l => l.pid === p.id || l.pid === null).slice(-8).reverse();
    const rank = [...st.players].sort((a, b) => G.netWorth(st, b) - G.netWorth(st, a));
    return `
      <div class="dtop">
        <div><span>Cash</span><b>${m(p.cash)}</b></div>
        <div><span>Net worth</span><b>${m(worth)}</b></div>
      </div>
      <div class="dsec">
        <h4>Stockpile <em>${used}/${p.space}</em></h4>
        <div class="dspace"><span style="width:${Math.min(100, used / p.space * 100)}%"></span></div>
        ${stock.length ? `<div class="dchips">${stock.map(([c, q]) => `<span title="${m(q * st.prices[c])}">${q} ${G.COM[c].name}</span>`).join("")}</div>` : `<p class="dnone">Empty</p>`}
      </div>
      <div class="dsec">
        <h4>Businesses <em>${biz.length}</em></h4>
        ${biz.map(b => {
          const t = G.BIZ_BY[b.type];
          const miss = Object.entries(t.inputs).filter(([c, q]) => (p.stock[c] || 0) < q);
          return `<div class="dbiz"><b>${t.name}</b> <span class="muted">${G.TERR[b.territory].name}</span>
            <span class="${miss.length ? "bad" : "ok"}">${t.kind === "extract" ? "✓ ready" : miss.length ? "needs " + miss.map(([c, q]) => `${q - (p.stock[c] || 0)} ${G.COM[c].name}`).join(", ") : "✓ inputs ready"}</span></div>`;
        }).join("") || `<p class="dnone">None</p>`}
      </div>
      <div class="dsec">
        <h4>Standings</h4>
        ${rank.map((x, i) => `<div class="drank${x.id === p.id ? " me" : ""}"><span>${i + 1}. <i style="background:${x.colour}"></i>${esc(x.name)}</span><b>${m(G.netWorth(st, x))}</b></div>`).join("")}
      </div>
      <div class="dsec">
        <h4>Recent</h4>
        <div class="dlog">${mine.map(l => `<div><em>R${l.round}</em> ${l.pid ? "" : "· "}${esc(l.msg)}</div>`).join("")}</div>
      </div>`;
  }

  // ----- Morning: the market -----
  function marketPanel(p) {
    const need = needsOf(p);
    const missing = Object.entries(need).filter(([c, q]) => (p.stock[c] || 0) < q);
    const missCost = missing.reduce((s, [c, q]) => s + (q - (p.stock[c] || 0)) * st.prices[c], 0);
    const anyMine = COMMODITIES.some(c => p.stock[c.id] || need[c.id]);
    const filter = anyMine ? ui.filter : "all";
    const rows = COMMODITIES.filter(c => {
      if (ui.search) return c.name.toLowerCase().includes(ui.search);
      return filter === "all" || p.stock[c.id] || need[c.id];
    });
    const chg = c => { const a = st.lastPrices[c] ?? st.prices[c], b = st.prices[c]; return a ? b / a - 1 : 0; };
    return `
      <div class="ghead">
        <h3>Market</h3>
        <div class="gseg"><button data-f="mine" class="${filter === "mine" ? "on" : ""}" ${anyMine ? "" : "disabled"}>Mine &amp; needed</button><button data-f="all" class="${filter === "all" ? "on" : ""}">All 50</button></div>
        <input class="gsearch" id="gSearch" placeholder="Search" value="${esc(ui.search)}">
      </div>
      <div class="gquick">
        ${missing.length ? `<button class="gbtn" id="gBuyMissing">Buy everything my businesses need (${m(missCost)})</button>` : `<span class="ok">✓ All your businesses have their inputs.</span>`}
        <button class="gbtn ghost" id="gSpace">+${S.spaceUpgrade.crates} crates for ${G.spaceUpgradeCost(p)}</button>
      </div>
      <table class="gmkt"><thead><tr><th>Commodity</th><th class="n">Price</th><th class="n">Change</th><th class="n">Have</th><th class="n">Need</th><th></th></tr></thead><tbody>
      ${rows.map(c => {
        const pr = st.prices[c.id], ch = chg(c.id), have = p.stock[c.id] || 0;
        return `<tr><td>${c.name}</td><td class="n"><b>${m(pr)}</b></td>
          <td class="n ${ch > 0.005 ? "up" : ch < -0.005 ? "dn" : ""}">${Math.abs(ch) < 0.005 ? "—" : (ch > 0 ? "▲" : "▼") + Math.abs(ch * 100).toFixed(0) + "%"}</td>
          <td class="n">${have || ""}</td><td class="n">${need[c.id] || ""}</td>
          <td class="acts">
            ${have ? `<button data-sell="${c.id}" data-q="${have}" title="Sell all">${pr >= 0 ? "Sell all" : "Dump all"}</button><button data-sell="${c.id}" data-q="1">−1</button>` : ""}
            ${pr > 0 ? `<button data-buy="${c.id}" data-q="1">+1</button><button data-buy="${c.id}" data-q="5">+5</button>` : ""}
          </td></tr>`;
      }).join("") || `<tr><td colspan="6" class="muted">Nothing here yet. Try "All 50".</td></tr>`}
      </tbody></table>
      <p class="muted small">Prices are fixed until midday, then move with what everyone holds and needs.</p>`;
  }

  // ----- Afternoon: move or build, and cards -----
  function afternoonPanel(p) {
    const here = p.pos, info = TERRITORY_INFO[here];
    const opts = G.buildable(st, here).map(o => ({ ...o, profit: G.bizProfit(st, o.b, here) })).sort((a, b) => b.profit / b.cost - a.profit / a.cost);
    const res = Object.entries(info.res).sort((a, b) => b[1] - a[1]);
    const card = ui.card && p.hand.includes(ui.card) ? G.CARD[ui.card] : null;
    const needs = card ? G.cardNeeds(card) : {};
    return `
      <div class="ghead"><h3>${G.TERR[here].name}</h3><span class="muted">${G.isSea(here) ? "Sea" : G.coastal(here) ? "Coastal" : "Inland"} · cost level ×${info.cost ?? 1}${res.length ? " · " + res.map(([c, r]) => `${G.COM[c].name} ${"★".repeat(r)}`).join(", ") : ""}</span></div>
      <div class="gtwo">
        <div>
          <h4>${p.acted ? "Done for this afternoon ✓" : "Move <span class=\"muted\">(or click the map)</span>"}</h4>
          <div class="gmoves">${G.neighbours(here).map(t => `<button data-move="${t}" ${p.acted ? "disabled" : ""}>${G.TERR[t].name}</button>`).join("")}</div>
          <h4>…or build here</h4>
          ${opts.length ? `<table class="gmkt"><thead><tr><th>Business</th><th class="n">Crates*</th><th class="n">Earns/round*</th><th class="n">Cost</th><th></th></tr></thead><tbody>
            ${opts.map(o => { const crates = Object.values(o.b.inputs).reduce((x, y) => x + y, 0); return `<tr><td>${o.b.name}</td><td class="n ${crates > p.space ? "dn" : ""}">${crates || "—"}</td><td class="n ${o.profit > 0 ? "up" : "dn"}">${m(o.profit)}</td><td class="n">${m(o.cost)}</td>
              <td class="acts"><button data-build="${o.b.id}" ${p.acted || o.cost > p.cash ? "disabled" : ""}>Build</button></td></tr>`; }).join("")}
          </tbody></table><p class="muted small">* Crates: stockpile space its inputs take each round (you have ${p.space}). Earns: outputs minus inputs at today's prices.</p>` : `<p class="muted">Nothing can be built here.</p>`}
        </div>
        <div>
          <h4>Your cards <em>${p.hand.length}/${S.handMax}</em> ${p.cardsPlayed ? "· played one ✓" : ""}</h4>
          <div class="ghand">${p.hand.map((id, i) => { const c = G.CARD[id]; return `<button class="gcard ${c.cat}${ui.card === id ? " sel" : ""}" data-card="${id}" ${p.cardsPlayed >= S.cardsPerAfternoon ? "disabled" : ""}><b>${c.name}</b><span>${esc(c.text)}</span></button>`; }).join("") || `<p class="muted">No cards.</p>`}</div>
          ${card ? `<div class="gplay">
            <b>Play ${card.name}?</b> It takes effect overnight.
            ${needs.commodity ? `<label>Commodity <select id="gcCom">${COMMODITIES.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select></label>` : ""}
            ${needs.ownBusiness ? `<label>Your business <select id="gcOwn">${G.myBusinesses(st, p.id).map(b => `<option value="${b.id}">${G.BIZ_BY[b.type].name}, ${G.TERR[b.territory].name}</option>`).join("")}</select></label>` : ""}
            ${needs.targetBusiness ? `<label>Target <select id="gcTgt">${st.businesses.filter(b => b.owner !== p.id).map(b => `<option value="${b.id}">${esc(G.player(st, b.owner).name)}'s ${G.BIZ_BY[b.type].name}, ${G.TERR[b.territory].name}</option>`).join("")}</select></label>` : ""}
            <button class="gbtn" id="gPlay">Play it</button> <button class="gbtn ghost" id="gCancel">Cancel</button>
          </div>` : ""}
        </div>
      </div>`;
  }

  // ----- Map -----
  function drawMap(p) {
    let { svg, below } = europeMapSVG("tOutlineGame");
    svg = svg.replace(/<\/svg>$/, "");
    const marks = {};
    st.businesses.forEach(b => (marks[b.territory] ||= []).push({ kind: "biz", b }));
    st.players.forEach(x => (marks[x.pos] ||= []).push({ kind: "pawn", x }));
    Object.entries(marks).forEach(([tid, list]) => {
      const [x] = TERRITORY_LABELS[tid], y = below[tid] + 20, step = 28;
      const show = list.length > 6 ? [...list.filter(l => l.kind === "pawn"), ...list.filter(l => l.kind === "biz").slice(0, 5)] : list;
      show.forEach((mk, i) => {
        const cx = x + (i - (show.length - 1) / 2) * step;
        if (mk.kind === "biz") { const o = G.player(st, mk.b.owner), t = G.BIZ_BY[mk.b.type]; svg += `<g><title>${esc(o.name)}: ${t.name}</title><rect x="${cx - 11}" y="${y - 11}" width="22" height="22" rx="5" fill="${o.colour}" stroke="#fff" stroke-width="2.5"/><text x="${cx}" y="${y + 5}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">${t.name[0]}</text></g>`; }
        else svg += `<g><title>${esc(mk.x.name)}</title><circle cx="${cx}" cy="${y}" r="${mk.x.id === p.id ? 15 : 12}" fill="${mk.x.colour}" stroke="#fff" stroke-width="3"/><circle cx="${cx}" cy="${y}" r="4.5" fill="#fff"/></g>`;
      });
      if (show.length < list.length) svg += `<text x="${x}" y="${y + 30}" text-anchor="middle" font-size="12" font-weight="700" fill="#4a4232">+${list.length - show.length} more</text>`;
    });
    document.getElementById("gMap").innerHTML = `<div class="bd-scroll">${svg}</svg></div>`;
    const near = st.phase === "afternoon" && !p.acted ? G.neighbours(p.pos) : [];
    document.querySelectorAll("#gMap .terr").forEach(g => {
      const t = g.dataset.t;
      if (t === p.pos) g.classList.add("here");
      if (near.includes(t)) { g.classList.add("near"); g.addEventListener("click", () => doAct("move", { to: t })); }
    });
  }

  // ----- Clicks -----
  function wire(p) {
    root.querySelector("#gEnd").addEventListener("click", () => { ui.card = null; G.endTurn(st); save(); render(); });
    root.querySelector("#gNew").addEventListener("click", () => { if (confirm("Abandon this game and start a new one?")) { st = null; localStorage.removeItem(KEY); render(); } });
    root.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => { ui.filter = b.dataset.f; ui.search = ""; render(); }));
    const s = root.querySelector("#gSearch");
    if (s) s.addEventListener("input", () => { ui.search = s.value.toLowerCase(); const pos = s.selectionStart; render(); const n = root.querySelector("#gSearch"); n.focus(); n.setSelectionRange(pos, pos); });
    root.querySelectorAll("[data-buy]").forEach(b => b.addEventListener("click", () => doAct("buy", { id: b.dataset.buy, qty: +b.dataset.q })));
    root.querySelectorAll("[data-sell]").forEach(b => b.addEventListener("click", () => doAct("sell", { id: b.dataset.sell, qty: +b.dataset.q })));
    root.querySelector("#gSpace")?.addEventListener("click", () => doAct("upgradeSpace"));
    root.querySelector("#gBuyMissing")?.addEventListener("click", () => {
      const need = needsOf(p); let msg = "";
      for (const [c, q] of Object.entries(need)) {
        const miss = q - (p.stock[c] || 0);
        if (miss > 0) { const r = G.act(st, p.id, "buy", { id: c, qty: miss }); if (!r.ok) { msg = r.msg; break; } }
      }
      flash(msg); save(); render();
    });
    root.querySelectorAll("[data-move]").forEach(b => b.addEventListener("click", () => doAct("move", { to: b.dataset.move })));
    root.querySelectorAll("[data-build]").forEach(b => b.addEventListener("click", () => doAct("build", { type: b.dataset.build })));
    root.querySelectorAll("[data-card]").forEach(b => b.addEventListener("click", () => { ui.card = +b.dataset.card; render(); }));
    root.querySelector("#gCancel")?.addEventListener("click", () => { ui.card = null; render(); });
    root.querySelector("#gPlay")?.addEventListener("click", () => {
      const args = { card: ui.card, commodity: root.querySelector("#gcCom")?.value, ownBusiness: root.querySelector("#gcOwn")?.value, targetBusiness: root.querySelector("#gcTgt")?.value };
      ui.card = null; doAct("playCard", args);
    });
  }

  // ----- End of game -----
  function renderEnd() {
    const rank = [...st.players].sort((a, b) => G.netWorth(st, b) - G.netWorth(st, a));
    root.innerHTML = `<div class="gsetup">
      <h1>${esc(rank[0].name)} wins</h1>
      <table class="gplayers"><thead><tr><th>#</th><th>Player</th><th class="n">Net worth</th><th class="n">Cash</th><th class="n">Businesses</th></tr></thead><tbody>
      ${rank.map((p, i) => `<tr><td>${i + 1}</td><td><i class="gdot" style="background:${p.colour}"></i>${esc(p.name)}</td><td class="n"><b>${m(G.netWorth(st, p))}</b></td><td class="n">${m(p.cash)}</td><td class="n">${G.myBusinesses(st, p.id).length}</td></tr>`).join("")}
      </tbody></table>
      <div class="grow"><button class="gbtn" id="gAgain">New game</button></div></div>`;
    root.querySelector("#gAgain").addEventListener("click", () => { st = null; localStorage.removeItem(KEY); render(); });
  }

  // Start: continue a saved game in progress, or show setup
  const saved = load();
  st = saved && saved.version === 1 && !saved.over ? saved : null;
  render();
})();
