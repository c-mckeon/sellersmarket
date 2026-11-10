// Sellers Market: the Game tab. Draws the game and turns clicks into engine actions.
// All the rules live in the engine (game/*.js); this file only displays and asks.

(() => {
  const G = SMG, S = GAME_SETTINGS;
  const KEY = "sellersmarket-game-v1";
  const root = document.getElementById("game");
  if (!root) return;
  // A trade flash ends by removing its class (so flashed text goes back to normal colours)
  root.addEventListener("animationend", e => { if (/tradeflash/.test(e.animationName)) e.target.closest(".flash")?.classList.remove("flash"); });
  let st = null, ui = { filter: "mine", search: "", card: null, good: null, ticket: {}, tab: "market", seenN: {} };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Money and prices: whole numbers (older saved games may still have cents)
  const m = n => (Number.isInteger(+n) || Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : (+n).toFixed(2)).replace(/^-/, "−");
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const LAND = TERRITORIES.filter(t => !t.sea);
  const COLOURS = ["#d4682a", "#2f6db5", "#8a4fc0", "#2e8b57", "#c23b5a", "#1f8a8a", "#a07a1a", "#555"];
  const NAMES = ["You", "Ana", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus"];

  // ================= Setup =================
  let setup = null;
  // Default players start spread across the map, each with a different region's mine (G.spreadStarts),
  // so the game has its raw materials from the first round
  const defaultPlayers = n => G.spreadStarts(n, { seed: Math.floor(Math.random() * 1e9) }).map((x, i) =>
    ({ name: NAMES[i] || `Player ${i + 1}`, colour: COLOURS[i % COLOURS.length], bot: i > 0, ...x }));
  const defaultPlayer = i => {
    const used = new Set(setup.players.map(p => p.start)), have = new Set(setup.players.map(p => G.BIZ_BY[p.business]?.makes));
    const opts = defaultPlayers(i + 1).filter(x => !used.has(x.start));
    const x = opts.find(o => !have.has(G.BIZ_BY[o.business].makes)) || opts[0] || defaultPlayers(1)[0];
    return { ...x, name: NAMES[i] || `Player ${i + 1}`, colour: COLOURS[i % COLOURS.length], bot: true };
  };

  function renderSetup() {
    setup ||= { players: defaultPlayers(4), rounds: S.rounds };
    const saved = load();
    root.innerHTML = `
      <div class="gsetup">
        <h1>New game</h1>
        <p class="muted">Pick who's playing. Each player starts with ${S.startCash} cash, a ${S.startSpace}-row stockpile (first in, first out), ${S.startBusinesses > 1 ? "two free businesses where they start (the one picked here and the one that uses its output)" : "one free business where they start"}, and ${S.contracts.hand} secret contracts. Deliver contracts to score points; most points after the last round wins, and cash breaks ties. ${S.businessStock ? `What a business makes stays in its own stock (up to ${S.businessSpace} units) until you sell or use it. ` : ""}There's no price list: every price comes from what players bid and ask.</p>
        ${saved && saved.version === 7 && !saved.over ? `<div class="gresume">A game in round ${saved.round} is saved in this browser. <button class="gbtn" id="gResume">Continue it</button></div>` : ""}
        <table class="gplayers"><thead><tr><th></th><th>Name</th><th>Who</th><th>Starts in</th><th>Free businesses</th><th></th></tr></thead><tbody>
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
            </select>${(() => { const x = S.startBusinesses > 1 && G.starterPartner(p.business, p.start); return x ? `<div class="muted small">+ ${x.name.toLowerCase()}</div>` : ""; })()}</td>
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
      if (k === "business") renderSetup(); // show its partner business
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
  // Everyone orders in secret, then it all happens at once. On one device, humans take it in turns
  // to enter their orders; a "pass" screen in between keeps them private.
  let vw = null;               // draft copy of the game: what it looks like if your orders go through
  ui.orders = [];
  ui.seat = null;              // the human whose orders are being entered
  ui.passed = null;            // which human last confirmed they're at the screen
  ui.seenBy = {};              // for each human: how much of the log they've already seen
  const humans = () => st.players.filter(p => !p.bot);
  const nextSeat = () => G.waitingFor(st).find(p => !p.bot) || null;
  const me = () => G.player(vw, ui.seat);
  const needsOf = p => {
    const need = {};
    G.myBusinesses(vw, p.id).forEach(b => Object.entries(G.BIZ_BY[b.type].inputs).forEach(([c, q]) => need[c] = (need[c] || 0) + q));
    return need;
  };
  // Add an order, if it would work given everything else you've ordered
  const tryOrder = (name, args) => {
    const next = [...ui.orders, { name, args }];
    const d = G.draft(st, ui.seat, next);
    if (d.error) return d.error;
    ui.orders = next; return "";
  };
  const doAct = (name, args) => { flash(tryOrder(name, args)); render(); };
  const orderText = o => {
    const a = o.args || {};
    if (o.name === "placeOrder") return `${a.side === "buy" ? "Bid for" : "Offer"} ${a.qty} ${G.COM[a.id].name} at ${m(+a.price)} <em>${m(a.qty * a.price)}</em>`;
    if (o.name === "cancelOrder") { const x = st.book.find(y => y.id === a.order); return x ? `Cancel ${x.side === "buy" ? "bid for" : "offer of"} ${x.qty} ${G.COM[x.good].name} at ${m(x.price)}` : "Cancel an order"; }
    if (o.name === "deliver") { const k = (st.contracts || []).find(x => x.id === a.contract); if (!k) return "Deliver a contract"; const it = G.contractItem(k); return `Deliver ${it.icon} ${esc(it.name.toLowerCase())}`; }
    if (o.name === "dump") return `Throw away ${a.qty} ${G.COM[a.id].name}`;
    if (o.name === "move") return `Move to ${G.TERR[a.to].name}`;
    if (o.name === "build") return `Build a ${G.BIZ_BY[a.type].name.toLowerCase()}`;
    return o.name;
  };
  let flashMsg = "", qStop = null, dStop = () => {}; // qStop / dStop: stop the quote board / order book replay
  const flash = msg => { flashMsg = msg; };
  // A section that starts closed and stays however the player left it (render() rebuilds the page)
  const fold = (key, cls, summary, body) => `<details class="${cls} fold" data-fold="${key}" ${ui.open?.[key] ? "open" : ""}><summary>${summary}</summary>${body}</details>`;

  // Keep the page still on clicks: most buttons redraw everything, and things above the button can change
  // height. So note where the clicked element (or its nearest findable ancestor) sits on screen, and after
  // the redraw scroll so its new copy sits in the same place.
  let anchor = null;
  const sig = e => {
    if (e.id) return `#${CSS.escape(e.id)}`;
    const a = [...e.attributes].find(x => x.name.startsWith("data-") && x.name !== "data-tip");
    if (a) return `${e.tagName.toLowerCase()}[${a.name}="${CSS.escape(a.value)}"]`;
    const c = ["gticket", "qboard", "gorders", "gpanel", "gdash", "gmap"].find(c => e.classList.contains(c));
    return c ? `.${c}` : null;
  };
  root.addEventListener("click", e => {
    const chain = [];
    for (let el = e.target; el && el !== root; el = el.parentElement) {
      const s = sig(el); if (!s) continue;
      chain.push({ s, i: [...root.querySelectorAll(s)].indexOf(el), top: el.getBoundingClientRect().top });
    }
    anchor = chain.length ? chain : null;
    setTimeout(() => anchor = null); // only for redraws caused by this click
  }, true);
  function keepPlace() {
    if (!anchor) return;
    for (const a of anchor) {
      const el = root.querySelectorAll(a.s)[a.i];
      if (el) { window.scrollBy(0, el.getBoundingClientRect().top - a.top); break; }
    }
  }

  function render() {
    if (!st) return renderSetup();
    if (st.over) return renderEnd();
    const seat = nextSeat();
    if (!seat) { G.resolve(st); save(); return render(); } // shouldn't happen, but never get stuck
    if (ui.seat !== seat.id) { ui.seat = seat.id; ui.orders = []; ui.card = null; }
    if (humans().length > 1 && ui.passed !== seat.id) return renderPass(seat);
    vw = G.draft(st, ui.seat, ui.orders).state;
    const p = me();
    const news = st.log.slice(ui.seenBy[p.id] ?? st.log.length);
    const who = l => { if (!l.pid) return ""; const x = G.player(st, l.pid); return `<i class="ndot" style="background:${x.colour}"></i><b>${l.pid === p.id ? "You" : esc(x.name)}</b> `; };
    root.innerHTML = `
      <div class="gbar">
        <span class="gphase day">Round ${st.round} of ${st.rounds} · trade, and move or build</span>
        <span class="gturn"><i style="background:${p.colour}"></i>${p.name === "You" ? "Your" : esc(p.name) + "'s"} orders</span>
        <span class="gready">${st.players.map(x => `<i title="${esc(x.name)}${st.orders[x.id] ? " is ready" : " is deciding"}" style="background:${x.colour};opacity:${st.orders[x.id] ? 1 : .25}"></i>`).join("")}</span>
        <span class="gsp"></span>
        <button class="gbtn" id="gEnd">Submit${ui.orders.length ? ` ${ui.orders.length} order${ui.orders.length > 1 ? "s" : ""}` : " (no orders)"} →</button>
        <button class="gbtn ghost" id="gNew" title="Start a new game">New game</button>
      </div>
      ${flashMsg ? `<div class="gflash">${esc(flashMsg)}</div>` : ""}
      ${news.length ? (n => fold("news", "gnews", `<b>What happened since your last orders <span class="muted small">${n.length} event${n.length === 1 ? "" : "s"}</span></b><button class="glink" id="gNewsOk" title="Dismiss">✕</button>`,
        n.map(l => `<span class="${l.pid === p.id ? "mine" : l.pid ? "" : "pub"}">${who(l)}${esc(l.msg)}</span>`).join("")))(news.filter(l => !/^Round \d/.test(l.msg)).slice(-40)) : ""}
      <div class="glay">
        <div class="gmain ${st.phase}">
          <div class="gmap" id="gMap"></div>
          ${terrCard(p, ui.terr || p.pos)}
          <div class="gpanel">
            <div class="gorders"><b>Your orders</b> <span class="muted small">Nothing happens until everyone has submitted; then all orders go through at once.</span>
              <div>${ui.orders.map((o, i) => `<span class="gorder">${orderText(o)}<button data-undo="${i}" title="Remove">✕</button></span>`).join("") || `<span class="muted">None yet.</span>`}</div>
            </div>
            <div class="gtabs2"><button data-tab="market" class="${ui.tab !== "build" ? "on" : ""}">Market</button><button data-tab="build" class="${ui.tab === "build" ? "on" : ""}">Move or build${p.acted ? " ✓" : ""}</button></div>
            ${ui.tab === "build" ? buildPanel(p) : marketPanel(p)}
          </div>
        </div>
        <aside class="gdash">${dashboard(p)}</aside>
      </div>`;
    flashMsg = "";
    drawMap(p);
    wire(p);
    keepPlace();
  }

  function renderPass(seat) {
    root.innerHTML = `<div class="gpass">
      <span class="gphase day">Round ${st.round}</span>
      <h2><i style="background:${seat.colour}"></i>Pass to ${esc(seat.name)}</h2>
      <p class="muted">Everyone's orders stay secret until they all go through at once.</p>
      <button class="gbtn" id="gImHere">I'm ${esc(seat.name)}: show my orders</button></div>`;
    root.querySelector("#gImHere").addEventListener("click", () => { ui.passed = seat.id; render(); });
  }

  // ----- Dashboard: what's ours, kept compact -----
  // What each of this player's businesses will do tonight, given their orders so far
  // (a dry run of production on a copy of the game, before the auction; its messages are the forecast)
  function middayPreview(p) {
    if (vw.phase !== "day") return null;
    const c = JSON.parse(JSON.stringify(vw)); c.log = []; c.drafting = false;
    c.phase = "night"; G.produce(c);
    return c.log.filter(l => l.pid === p.id).map(l => l.msg);
  }

  // ================= What you own, want, and what the market says =================
  const have = (p, id) => G.have(vw, p, id);
  // Depreciation: how many of a good this player loses tonight, and a small ⌛ badge for it
  const spoils = (p, id) => G.goingOff ? G.goingOff(vw, p, id) : 0;
  const offBadge = (p, id) => { const n = spoils(p, id); return n ? ` <span class="offb" title="${n} go off tonight">⌛${n}</span>` : ""; };
  // Goods this player could be after: the open contracts and one run of each factory
  const wantsOf = p => {
    const w = {};
    (vw.contracts || []).filter(k => !k.takers.length).forEach(k => Object.entries(k.goods).forEach(([c, q]) => w[c] = Math.max(w[c] || 0, q)));
    Object.entries(needsOf(p)).forEach(([c, q]) => w[c] = (w[c] || 0) + q);
    return w;
  };
  const onOffer = (p, id) => vw.book.filter(o => o.pid === p.id && o.side === "sell" && o.good === id).reduce((s, o) => s + o.qty, 0);
  // Where your goods are: [{ label, qty }] (each business, then your own stockpile)
  const whereIs = (p, id) => [
    ...G.myBusinesses(vw, p.id).filter(b => b.stock?.[id]).map(b => ({ label: G.BIZ_BY[b.type].name, qty: b.stock[id] })),
    ...(p.stock[id] ? [{ label: "your stockpile", qty: p.stock[id] }] : []),
  ];
  // Public facts about other players (businesses are on the map): who makes a good, who could use it
  const others = p => vw.players.filter(x => x.id !== p.id);
  const usesGood = (b, id) => b.inputs[id] || Object.keys(b.inputs).some(c => G.substitutesFor(b, c).some(([x]) => x === id));
  const makersOf = (p, id) => others(p).filter(x => vw.businesses.some(b => b.owner === x.id && G.BIZ_BY[b.type].outputs[id]));
  const usersOf = (p, id) => others(p).filter(x => vw.businesses.some(b => b.owner === x.id && usesGood(G.BIZ_BY[b.type], id)));
  // Demand: how many open contracts ask for a good
  const wanted = (p, id) => G.demand(vw, id);
  const wantedTag = (p, id) => { const n = wanted(p, id); return n ? `<span class="mtag want" title="Open contracts on the board that ask for it">in ${n} contract${n === 1 ? "" : "s"}</span>` : ""; };
  const contractGood = id => S.contracts.goods.includes(id) || (S.contracts.rawShare > 0 && G.contractRaws().includes(id));
  const names = list => list.map(x => esc(x.name)).join(", ");

  // Every trade of a good, oldest first: [{ round, phase, price, qty }]
  const series = id => st.history.filter(h => h.trades[id]).map(h => ({ round: h.round, phase: h.phase, ...h.trades[id] }));
  const pct = x => `${x > 0 ? "▲" : x < 0 ? "▼" : ""}${Math.abs(Math.round(x * 100))}%`;
  // A tiny price line: one series, so no legend; the last trade is marked
  const spark = (pts, w = 96, h = 26) => {
    if (!pts.length) return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="2" x2="${w - 2}" y1="${h / 2}" y2="${h / 2}" class="spark-none"/></svg>`;
    const lo = Math.min(...pts.map(x => x.price)), hi = Math.max(...pts.map(x => x.price)), n = pts.length;
    const X = i => n === 1 ? w - 4 : 3 + i * (w - 7) / (n - 1), Y = v => hi === lo ? h / 2 : h - 4 - (v - lo) / (hi - lo) * (h - 8);
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Price history: ${pts.map(x => m(x.price)).join(", ")}">
      ${n > 1 ? `<polyline points="${pts.map((x, i) => `${X(i).toFixed(1)},${Y(x.price).toFixed(1)}`).join(" ")}"/>` : ""}
      <circle cx="${X(n - 1).toFixed(1)}" cy="${Y(pts[n - 1].price).toFixed(1)}" r="2.6"/></svg>`;
  };
  // Last price, and change since the trade before
  const lastBits = id => {
    const s = series(id), a = s.at(-1), b = s.at(-2);
    return { s, last: a?.price ?? st.lastTrade[id]?.price ?? null, chg: a && b ? a.price / b.price - 1 : null };
  };
  // Today's cost basis as text: "105", "≥ 60" (some raw materials haven't traded), or "" (nothing known)
  const basisText = id => { const b = G.costBasis(vw, id); return !b || G.COM[id].type === "raw" ? "" : `${b.missing.length ? "≥ " : ""}${m(b.value)}`; };
  const basisNote = id => { const b = G.costBasis(vw, id); return b?.missing.length ? ` (${b.missing.map(c => G.COM[c].name.toLowerCase()).join(", ")} not traded yet)` : ""; };
  // What to show where a price would go: the last trade, else today's cost basis, else nothing yet
  const priceOrBasis = (id, last, chg) => last != null
    ? `<b>${m(last)}</b>${chg != null ? ` <small class="${chg > 0 ? "up" : chg < 0 ? "dn" : ""}">${pct(chg)}</small>` : ""}`
    : basisText(id) ? `<small class="muted" title="Today's cost basis: its raw materials at their last traded prices${basisNote(id)}">cost ${basisText(id)}</small>`
    : `<small class="muted">${G.COM[id].type === "raw" ? "no price yet" : "never traded"}</small>`;

  // ================= Quote board and replay =================
  // A card per active good: best bid and ask, the spread between them drawn on a price line, and the
  // last trade. "Play" replays every auction so far, one frame per auction, with the bars sliding as
  // the book moved; a card flashes yellow whenever its good trades (live, too, after each auction).

  // Goods that traded since this player last looked (each auction has a running number, n)
  const freshTrades = () => {
    const last = st.history.at(-1)?.n ?? -1, seen = ui.seenN[ui.seat];
    ui.seenN[ui.seat] = last;
    if (seen == null) return new Set(); // first look: nothing is "new"
    return new Set(st.history.filter(h => h.n > seen).flatMap(h => Object.keys(h.trades)));
  };

  // ----- Quote board: a small order book per good, price running bottom to top -----
  // The same moments as the big order book replay, lined up so every card moves together: four per
  // auction (orders in, bids meet asks, traded, what's left; a good that didn't trade just holds), then now.
  function boardData() {
    const ids = new Set(st.book.map(o => o.good));
    st.history.forEach(h => { Object.keys(h.trades).forEach(i => ids.add(i)); Object.keys(h.quotes || {}).forEach(i => ids.add(i)); Object.keys(h.pre || {}).forEach(i => ids.add(i)); });
    const busy = id => st.history.reduce((s, h) => s + (h.trades[id] ? 2 : 0) + (h.quotes?.[id] ? 1 : 0), 0) + (st.book.some(o => o.good === id) ? 1 : 0);
    const goods = [...ids].sort((a, b) => busy(b) - busy(a) || G.COM[a].name.localeCompare(G.COM[b].name)).slice(0, 10);
    const hs = st.history.filter(bookOf);
    const frames = [];
    hs.forEach(h => {
      const tr = goods.some(id => h.trades[id]), r = `Round ${h.round}`;
      (tr ? ["orders in", "bids meet asks", "traded", "after the auction"] : ["orders in", "orders in", "nothing traded", "nothing traded"])
        .forEach((l, i) => frames.push({ label: `${r}: ${l}`, hold: tr ? [375, 250, 100, 375][i] : [375, 0, 0, 375][i] }));
    });
    frames.push({ label: "Now: the book as it stands", now: true });
    const per = {};
    goods.forEach(id => {
      const fs = [];
      hs.forEach(h => { const f = auctionFrames(id, h); fs.push(...(f.length === 4 ? f : [f[0], f[0], f[1], f[1]])); });
      fs.push({ segs: bookSegs(nowBook(st, id)) });
      let last = null;
      for (const h of st.history) { if (hs[0] && h.n >= hs[0].n) break; if (h.trades[id]) last = h.trades[id].price; }
      fs.forEach(f => { if (f.sold != null) last = f.sold; f.last = last; });
      const ghosts = ghostsOf(id, hs.slice(-8)), sc = scaleOf(fs, ghosts);
      fs.forEach(f => { f.lo = sc.lo; f.hi = sc.hi; });
      per[id] = { frames: fs, ghosts, maxQ: sc.maxQ };
    });
    return { goods, frames, per, lastStart: Math.max(0, frames.length - 5) };
  }

  // One card's little chart: asks to the right of the centre line, bids to the left, past orders as grey
  // blobs, the spread shaded, a line at a clearing price, and the last sale as a dot on the centre line
  function drawMini(D, s) {
    const W = 140, H = 100, T = 5, B = 5, cx = W / 2, half = cx - 5, span = s.hi - s.lo || 1, plotH = H - T - B;
    const Yraw = p => T + (s.hi - p) / span * plotH, Y = p => Math.min(H - B, Math.max(T, Yraw(p)));
    const pinned = p => Yraw(p) < T - 0.5 || Yraw(p) > H - B + 0.5;
    const k = half / D.maxQ, bh = Math.max(3, Math.min(7, plotH / span * 0.7));
    const segs = Object.values(s.segs).filter(x => x.w > 0.02 && x.op > 0.02);
    let g = "";
    const G0 = D.ghosts;
    if (G0.n) {
      const sd = Math.max(span / 30, 0.5), N = 60;
      const curve = list => Array.from({ length: N + 1 }, (_, i) => list.reduce((t, [pp, q]) => t + q * Math.exp(-((s.hi - i / N * span - pp) ** 2) / (2 * sd * sd)), 0));
      const C2 = { a: curve(G0.a), b: curve(G0.b) }, kg = 0.7 * half / Math.max(1e-9, ...C2.a, ...C2.b);
      [["a", 1], ["b", -1]].forEach(([side, dir]) => {
        if (!G0[side].length) return;
        g += `<path class="ghost" d="M${cx},${T} ${C2[side].map((v, i) => `L${(cx + dir * v * kg).toFixed(1)},${(T + i / N * plotH).toFixed(1)}`).join(" ")} L${cx},${H - B} Z"/>`;
      });
    }
    const live = side => segs.filter(x => x.side === side && x.op > 0.5 && !x.fill);
    const bid = Math.max(-Infinity, ...live("b").map(x => x.p)), ask = Math.min(Infinity, ...live("a").map(x => x.p));
    if (isFinite(bid) && isFinite(ask) && ask > bid) g += `<rect class="band" x="3" y="${Y(ask).toFixed(1)}" width="${W - 6}" height="${(Y(bid) - Y(ask)).toFixed(1)}"/>`;
    if (s.trade != null && s.tradeOp > 0.02) g += `<line class="tline" opacity="${s.tradeOp.toFixed(2)}" x1="3" x2="${W - 3}" y1="${Y(s.trade).toFixed(1)}" y2="${Y(s.trade).toFixed(1)}"/>`;
    segs.forEach(x => {
      const w = x.w * k, off = x.x0 * k, fill = `rgb(${x.rgb.map(Math.round).join(",")})`;
      g += `<rect x="${(x.side === "a" ? cx + off : cx - off - w).toFixed(1)}" y="${(Y(x.p) - bh / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${fill}" opacity="${(x.op * (pinned(x.p) ? 0.35 : 1)).toFixed(2)}"/>`;
    });
    g += `<line class="axis" x1="${cx}" x2="${cx}" y1="${T}" y2="${H - B}"/>`;
    if (s.last != null) g += `<circle class="ldot" cx="${cx}" cy="${Y(s.last).toFixed(1)}" r="3.5"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}</svg>`;
  }

  // The words on a card for moment k: best bid and ask still standing, and the last or current trade
  const cardWords = (id, f) => {
    const best = side => Object.entries(f.segs).filter(([key, x]) => key[0] === side && x.op > 0.5).sort((a, b) => side === "b" ? b[1].p - a[1].p : a[1].p - b[1].p)[0]?.[1];
    const b = best("b"), a = best("a");
    const n = G.demand(vw, id);
    return {
      h: `<b>${G.COM[id].name}${n ? ` <small class="qc-want" title="In ${n} open contract${n === 1 ? "" : "s"}">in ${n} contract${n === 1 ? "" : "s"}</small>` : ""}</b><span class="qc-last">${f.sold != null ? `traded at ${m(f.sold)}` : f.last != null ? `last ${m(f.last)}` : "no trades"}</span>`,
      n: `<span class="b">${b ? `bid ${m(b.p)} <small>×${b.w}</small>` : "no bids"}</span><span class="sp">${a && b ? `spread ${m(a.p - b.p)}` : ""}</span><span class="a">${a ? `ask ${m(a.p)} <small>×${a.w}</small>` : "no asks"}</span>`,
    };
  };
  const cardHTML = (id, d, k, flash) => {
    const f = d.per[id].frames[k], w = cardWords(id, f);
    return `<button class="qcard${flash ? " flash" : ""}" data-good="${id}">
      <span class="qc-h">${w.h}</span><span class="qc-svg">${drawMini(d.per[id], still(f, themeColours()))}</span><span class="qc-n">${w.n}</span></button>`;
  };

  function quoteBoard(fresh, open = "") {
    const d = boardData();
    const openHTML = id => `<div class="qopen" data-open="${id}">${open}</div>`;
    if (!d.goods.length) return `<section class="msec"><h3>Quote board</h3>${open ? `<div class="qgrid">${openHTML(ui.good)}</div>` : `<p class="muted">No orders or trades yet. Cards appear here as goods get bids and asks.</p>`}</section>`;
    const k = d.frames.length - 1;
    ui.board = d; // the replay reads this
    const cards = d.goods.map(id => id === ui.good && open ? openHTML(id) : cardHTML(id, d, k, fresh.has(id)));
    if (open && !d.goods.includes(ui.good)) cards.unshift(openHTML(ui.good)); // a good with no card yet: open at the top
    return `<section class="msec qboard">
      <div class="qhead"><h3>Quote board <span class="muted small">each good's book: asks right, bids left, the dot is the last trade</span></h3>
        <button class="gbtn ghost" id="qOpen" ${ui.qOpen ? "hidden" : ""}>▶ Replay</button></div>
      <div class="qctl" ${ui.qOpen ? "" : "hidden"}><div class="gseg"><button data-rmode="last" class="${ui.rmode !== "game" ? "on" : ""}">Last auction</button><button data-rmode="game" class="${ui.rmode === "game" ? "on" : ""}">Whole game</button></div>
        <button class="gbtn ghost" id="qPlay">▶ Replay</button><input type="range" id="qSlide" min="${ui.rmode === "game" ? 0 : d.lastStart}" max="${k}" value="${k}" aria-label="Step through the auctions">
        <span id="qLabel" class="muted small">${d.frames[k].label}</span><button class="glink" id="qClose" title="Close the replay">✕</button></div>
      <div class="qgrid" id="qGrid">${cards.join("")}</div>
    </section>`;
  }

  // Draw the board at moment k, or part-way from k - 1 to k (t from 0 to 1). Cards update in place.
  function showFrame(k, t = 1, C = themeColours()) {
    const d = ui.board, grid = root.querySelector("#qGrid");
    if (!d || !grid) return;
    root.querySelector("#qLabel").textContent = d.frames[k].label;
    root.querySelector("#qSlide").value = k;
    d.goods.forEach(id => {
      const el = grid.querySelector(`.qcard[data-good="${id}"]`);
      if (!el) return;
      const F = d.per[id].frames, f = F[k];
      el.querySelector(".qc-svg").innerHTML = drawMini(d.per[id], k > 0 && t < 1 ? blend(F[k - 1], f, t, C) : still(f, C));
      if (t === 1 || !el.dataset.k || +el.dataset.k !== k) {
        const w = cardWords(id, f);
        el.querySelector(".qc-h").innerHTML = w.h; el.querySelector(".qc-n").innerHTML = w.n;
        if (+el.dataset.k !== k && f.sold != null) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
        el.dataset.k = k;
      }
    });
  }
  // Play from moment `from` to `to`: each blends into the next, then holds. Returns a stop function.
  function playBoard(from, to, fast, done) {
    const d = ui.board, C = themeColours(), MOVE = fast ? 160 : 325;
    let k = from, t0 = null, raf = 0;
    const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const tick = now => {
      if (t0 == null) t0 = now;
      const el = Math.max(0, now - t0), move = k === from ? 0 : MOVE, hold = (d.frames[k].hold ?? 375) * (fast ? 0.4 : 1);
      showFrame(k, move && el < move ? ease(el / move) : 1, C);
      if (el >= move + hold) { if (++k > to) return done(); t0 = now; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }

  // ================= Sidebar =================
  // The stockpile: one row per unit, first in at the top (it's the first out: used, sold and delivered
  // first, and pushed out first when the stockpile overflows). Each row counts down to when it goes off.
  // Units in your sell orders keep their rows; buy orders hold empty rows for what they could bring in.
  function stockList(p) {
    const rows = [];
    Object.entries(p.stock).forEach(([c, q]) => {
      let lots = (p.lots?.[c] || []).map(l => [...l]), n = lots.reduce((s, l) => s + l[0], 0);
      if (n < q) lots.push([q - n, vw.round]); // units without a known age count as new
      let left = q;
      lots.forEach(([k, made]) => { for (let i = 0; i < k && left > 0; i++, left--) rows.push({ c, made }); });
    });
    vw.book.filter(o => o.pid === p.id && o.side === "sell").forEach(o => {
      const lots = o.lots?.length ? o.lots : [[o.qty, vw.round]];
      lots.forEach(([k, made]) => { for (let i = 0; i < k; i++) rows.push({ c: o.good, made, offer: true }); });
    });
    rows.sort((a, b) => a.made - b.made || a.c.localeCompare(b.c));
    const reserved = G.reserved(vw, p);
    const life = r => {
      const L = G.lifeOf ? G.lifeOf(r.c) : 0;
      if (!S.depreciation?.on || !L) return `<span class="sl-life keep">keeps</span>`;
      const n = r.made + L - vw.round; // rounds left, counting this one
      return n <= 1 ? `<span class="sl-life due">goes off tonight</span>` : `<span class="sl-life${n <= 2 ? " soon" : ""}">${n} rounds</span>`;
    };
    const out = [];
    for (let i = 0; i < p.space; i++) {
      const r = rows[i];
      if (r) out.push(`<li class="${r.offer ? "offer" : ""}"><span class="sl-n">${i + 1}</span><button class="sl-good" data-good="${r.c}" title="Open ${G.COM[r.c].name} in the market">${G.COM[r.c].name}${r.offer ? ` <small>on offer</small>` : ""}</button>${life(r)}</li>`);
      else if (i < rows.length + reserved) out.push(`<li class="resv"><span class="sl-n">${i + 1}</span><span class="sl-good">kept free for a buy order</span><span></span></li>`);
      else out.push(`<li class="empty"><span class="sl-n">${i + 1}</span><span class="sl-good">empty</span><span></span></li>`);
    }
    const over = rows.length - p.space;
    return `<ol class="dstock">${out.join("")}</ol>
      <p class="dhint">Top row first out. ${over > 0 ? `<b class="bad">${over} more than fit: the oldest go tonight.</b> ` : ""}When it overflows, the oldest units are pushed out.</p>`;
  }

  function dashboard(p) {
    const locked = G.lockedCash(vw, p);
    const biz = G.myBusinesses(vw, p.id);
    const pv = middayPreview(p);
    return `
      <div class="dtop">
        <div><span>Points</span><b>${p.points}</b></div>
        <div><span>Cash</span><b>${m(p.cash)}</b>${locked ? `<small class="muted">+${m(locked)} in buy orders</small>` : ""}</div>
      </div>
      <div class="dsec">
        <h4 title="The same 5 contracts for everyone: the first to deliver one gets its points">Contracts <em>first to deliver wins</em></h4>
        ${(vw.contracts || []).map(k => {
          const mineNow = k.takers.includes(p.id);
          const ok = !mineNow && G.canDeliver(vw, p, k), it = G.contractItem(k), goods = Object.entries(k.goods);
          const need = goods.reduce((s, [, q]) => s + q, 0), got = mineNow ? need : goods.reduce((s, [c, q]) => s + Math.min(have(p, c), q), 0);
          const left = S.contracts.life - (vw.round - k.drawn);
          return `<div class="kc${ok || mineNow ? " ready" : ""}">
            <div class="kc-top"><span class="kc-icon">${it.icon}</span>
              <div class="kc-title"><b>${esc(it.name)}</b><small>${mineNow ? "Delivered when you submit · paid tonight, unless someone else delivers it too (then you share)" : ok ? "Ready to deliver" : `${got} of ${need} goods in hand · ${left <= 1 ? "leaves the board tonight" : `${left} rounds left`}`}</small></div>
              <span class="kc-pts">${k.points}<small>pts</small></span></div>
            <div class="kc-bar"><i style="width:${Math.round(got / need * 100)}%"></i></div>
            <div class="kc-foot"><div class="kc-goods">${goods.map(([c, q]) => { const h = mineNow ? q : Math.min(have(p, c), q); return `<button class="kc-good${h >= q ? " ok" : ""}" data-good="${c}" title="Open ${G.COM[c].name} in the market">${G.COM[c].name}<b>${h}/${q}</b></button>`; }).join("")}</div>
              ${mineNow ? "" : `<button class="kc-make" data-deliver="${k.id}" ${ok ? "" : "disabled"} title="${ok ? "Deliver it: the first to deliver gets the points" : "You don't have all of it yet (goods on offer don't count)"}">Deliver</button>`}</div>
          </div>`;
        }).join("") || `<p class="dnone">None right now.</p>`}
        ${(() => { const all = p.made || [], done = (G.player(st, p.id).made || []).length; // the shelf of things made in earlier turns
          return (done ? `<div class="dmade" title="What you've made">${all.slice(0, done).map(x => `<span class="dthing" title="${esc(x.name)}: ${x.points} points, round ${x.round}">${x.icon}</span>`).join("")}</div>` : ""); })()}
      </div>
      <div class="dsec">
        <h4>Businesses <em>${biz.length}${S.businessStock ? ` · each holds ${S.businessSpace}` : ""}</em></h4>
        ${biz.map(b => {
          const t = G.BIZ_BY[b.type], held = Object.entries(b.stock || {}), used = held.reduce((s, [, q]) => s + q, 0);
          const miss = t.kind === "factory" ? G.inputsFor(vw, p, t).missing : [];
          return `<div class="dbiz"><span class="bicon" style="background:${p.colour}"><svg viewBox="0 0 24 24">${iconSVG(BIZ_ICON[t.id], 12, 12, 18)}</svg></span>
            <b>${t.name}</b> <span class="muted">${G.TERR[b.territory].name}</span>
            ${S.businessStock ? `<span class="dcap" title="${used} of ${S.businessSpace} units"><i style="width:${Math.min(100, used / S.businessSpace * 100)}%" class="${used >= S.businessSpace ? "full" : ""}"></i></span>
            <span class="dheld">${held.map(([c, q]) => `<button class="dgood" data-good="${c}" title="Sell it">${q} ${G.COM[c].name}${offBadge(p, c)}</button>`).join("") || `<span class="muted">empty</span>`}${used >= S.businessSpace ? ` <b class="bad">full</b>` : ""}</span>` : ""}
            ${miss.length ? `<span class="bad">needs ${miss.map(([c, n]) => `${n} ${G.COM[c].name}`).join(", ")}</span>` : ""}</div>`;
        }).join("") || `<p class="dnone">None</p>`}
        ${pv && pv.length ? `<div class="dprev"><b>Tonight</b>${pv.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="dsec">
        <h4>Your stockpile <em>${Math.min(p.space, G.used(p) + G.offered(vw, p) + G.reserved(vw, p))} of ${p.space} rows</em></h4>
        ${stockList(p)}
      </div>
      <div class="dsec">
        <h4>Players</h4>
        ${G.ranking(st).map(x => `<div class="dplayer${x.id === p.id ? " me" : ""}"><span><i style="background:${x.colour}"></i>${x.id === p.id ? "You" : esc(x.name)}</span>
          <span class="muted">${G.myBusinesses(st, x.id).map(b => G.BIZ_BY[b.type].name.toLowerCase()).join(", ") || "no businesses"} · ${m(G.totalCash(st, x))} cash</span><b>${x.points} pts</b></div>`).join("")}
      </div>`;
  }

  // ================= The market =================
  // Built around three questions: can I sell what I make, can I get what I need, and what's moving?
  // Goods that matter in this game: what contracts ask for, everything those are made from (and their
  // by-products), building materials, wheat and water, and anything a player holds or has orders for
  function goodsInPlay() {
    const set = new Set([...S.contracts.goods, ...(S.contracts.raws || []), "wheat", "water"]), seen = new Set();
    const add = id => { if (seen.has(id)) return; seen.add(id); set.add(id);
      const r = RECIPES.find(x => Object.keys(x.out)[0] === id); if (r) { Object.keys(r.in).forEach(add); Object.keys(r.out).forEach(o => set.add(o)); } };
    S.contracts.goods.forEach(add);
    vw.players.forEach(x => Object.keys(G.holdings(vw, x)).forEach(c => set.add(c)));
    vw.book.forEach(o => set.add(o.good));
    return set;
  }

  // Opportunities: goods other players are bidding for that nobody is selling, or whose best bid beats
  // today's cost basis. Making them earns that margin, which is the market's reason to make what others need.
  function opportunities(p) {
    const list = COMMODITIES.map(c => {
      const bid = G.bestBid(vw, c.id); if (!bid) return null;
      if (vw.book.some(o => o.good === c.id && o.side === "buy" && o.pid === p.id && o.price === bid.price)) return null; // that's you bidding
      const ask = G.bestAsk(vw, c.id), cb = G.costBasis(vw, c.id), basis = cb && !cb.missing.length && c.type !== "raw" ? cb.value : null;
      const margin = basis != null ? bid.price - basis : null;
      if (ask && ask.price <= bid.price) return null;
      if (ask && (margin == null || margin <= 0)) return null;
      const makers = vw.businesses.filter(b => G.BIZ_BY[b.type].outputs[c.id]).map(b => b.owner === p.id ? "you" : G.player(vw, b.owner).name);
      const biz = G.BIZ.find(b => b.makes === c.id);
      return { id: c.id, bid, ask, basis, margin, makers: [...new Set(makers)], biz, score: (margin ?? bid.price * 0.3) * bid.qty + (ask ? 0 : 1000) };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 6);
    if (!list.length) return "";
    return fold("opps", "msec", `<h3>Opportunities <span class="muted small">${list.length} · what other players want and nobody is selling</span></h3>`, `
      <div class="opps">${list.map(o => `<button class="opp" data-good="${o.id}">
        <b>${G.COM[o.id].name}</b> <span class="mtag good">wanted: ${o.bid.qty} at ${m(o.bid.price)}</span>
        ${o.margin != null ? `<span class="${o.margin > 0 ? "up" : "dn"}">cost basis ${m(o.basis)}: ${o.margin >= 0 ? "+" : "−"}${m(Math.abs(o.margin))} a unit</span>` : ""}
        <small>${o.ask ? `cheapest ask ${m(o.ask.price)}` : "nobody selling"} · ${o.makers.length ? `made by ${esc(o.makers.join(", "))}` : `nobody makes it${o.biz ? `: a ${o.biz.name.toLowerCase()} would` : ""}`}</small>
      </button>`).join("")}</div>`);
  }

  function marketPanel(p) {
    const want = wantsOf(p), hold = G.holdings(vw, p), fresh = freshTrades(); // fresh: goods that traded since you last looked (they flash)
    const sel = ui.good && G.COM[ui.good] ? ui.good : null;
    const last = st.history.at(-1);
    const live = COMMODITIES.filter(c => G.bestBid(vw, c.id) || G.bestAsk(vw, c.id)).length;
    const myOrders = vw.book.filter(o => o.pid === p.id);

    // Sell: everything you hold beyond what you want, plus anything already on offer
    const sellIds = [...new Set([...Object.keys(hold).filter(c => hold[c] > (want[c] || 0)), ...myOrders.filter(o => o.side === "sell").map(o => o.good)])]
      .sort((a, b) => (hold[b] || 0) - (hold[a] || 0));
    // Buy: what you want and don't have enough of, plus anything you're already bidding for
    const buyIds = [...new Set([...Object.keys(want).filter(c => (hold[c] || 0) < want[c]), ...myOrders.filter(o => o.side === "buy").map(o => o.good)])];
    // Moving: everything that traded in the last 6 auctions, busiest first
    const recent = st.history.slice(-6), moved = {};
    recent.forEach(h => Object.entries(h.trades).forEach(([id, t]) => moved[id] = (moved[id] || 0) + t.qty));

    const sellCard = id => {
      const bid = G.bestBid(vw, id), { s, last, chg } = lastBits(id), users = usersOf(p, id);
      const spare = (hold[id] || 0) - (want[id] || 0), off = onOffer(p, id);
      const demand = wantedTag(p, id) + (bid ? `<span class="mtag good">Bid ${m(bid.price)} ×${bid.qty}</span>`
        : users.length ? `<span class="mtag">No bids · ${names(users)} could use it</span>`
        : contractGood(id) ? `<span class="mtag">No bids · contracts can ask for it</span>`
        : wanted(p, id) ? "" : `<span class="mtag warn">⚠ Nobody else can use it now</span>`);
      return `<button class="mcard${id === sel ? " sel" : ""}${fresh.has(id) ? " flash" : ""}" data-good="${id}">
        <span class="mc-top"><b>${G.COM[id].name}</b><span class="mc-qty">${spare > 0 ? spare : 0}${off ? ` <small>+${off} on offer</small>` : ""}</span></span>
        <span class="mc-where">${whereIs(p, id).map(x => `${x.qty} ${x.label === "your stockpile" ? "in" : "at"} ${x.label.toLowerCase()}`).join(" · ") || "all on offer"}</span>
        <span class="mc-mid">${spark(s)}<span class="mc-px">${priceOrBasis(id, last, chg)}</span></span>
        ${demand}${spoils(p, id) ? `<span class="mtag warn">⌛ ${spoils(p, id)} go off tonight: sell or use them</span>` : ""}</button>`;
    };
    const buyCard = id => {
      const ask = G.bestAsk(vw, id), { s, last, chg } = lastBits(id), makers = makersOf(p, id);
      const need = Math.max(0, (want[id] || 0) - (hold[id] || 0)), bidding = myOrders.filter(o => o.side === "buy" && o.good === id).reduce((x, o) => x + o.qty, 0);
      const why = [(vw.contracts || []).some(k => !k.takers.length && k.goods[id]) ? "contract" : "", needsOf(p)[id] ? "factory input" : ""].filter(Boolean).join(" + ");
      const supply = (ask ? `<span class="mtag good">Ask ${m(ask.price)} ×${ask.qty}</span>`
        : makers.length ? `<span class="mtag">Nobody selling · ${names(makers)} make${makers.length === 1 ? "s" : ""} it</span>`
        : `<span class="mtag warn">⚠ Nobody makes it yet</span>`) + (wanted(p, id) ? `<span class="mtag">in ${wanted(p, id)} open contract${wanted(p, id) === 1 ? "" : "s"}</span>` : "");
      return `<button class="mcard${id === sel ? " sel" : ""}${fresh.has(id) ? " flash" : ""}" data-good="${id}">
        <span class="mc-top"><b>${G.COM[id].name}</b><span class="mc-qty">${need ? `need ${need}` : "✓"}${bidding ? ` <small>bidding ${bidding}</small>` : ""}</span></span>
        <span class="mc-where">${why || "you're bidding"}${hold[id] ? ` · have ${hold[id]}` : ""}</span>
        <span class="mc-mid">${spark(s)}<span class="mc-px">${priceOrBasis(id, last, chg)}</span></span>
        ${supply}</button>`;
    };
    const movers = Object.entries(moved).sort((a, b) => b[1] - a[1]);
    // The full list: goods in play by default (contract goods, what they're made from, building materials,
    // and anything someone holds or has orders for); the other goods behind a toggle
    const inPlay = goodsInPlay(), hidden = COMMODITIES.length - inPlay.size;
    const rows = COMMODITIES.filter(c => (ui.allGoods || inPlay.has(c.id)) && (!ui.search || c.name.toLowerCase().includes(ui.search)));
    return `
      ${fold("stats", "msec", `<h3>Market summary <span class="muted small">last auction, your orders, what's trading</span></h3>`, `<div class="mstats">
        <div><span>Last auction</span><b>${last ? `${Object.keys(last.trades).length} good${Object.keys(last.trades).length === 1 ? "" : "s"}` : "–"}</b><small>${last ? `${Object.values(last.trades).reduce((s, t) => s + t.qty, 0)} units · round ${last.round} ${last.phase}` : "no auctions yet"}</small></div>
        <div><span>Goods with orders</span><b>${live}</b><small>of 50 on the book</small></div>
        <div><span>Your orders</span><b>${myOrders.length}</b><small>${G.lockedCash(vw, p) ? `${m(G.lockedCash(vw, p))} cash locked` : "nothing locked"}</small></div>
      </div>
      <p class="muted small">One sealed auction tonight: each good trades at a single price, where the most units change hands. Orders stay until they fill or you cancel.</p>
      <h4 class="msub">What's trading <span class="muted small">last ${recent.length || 6} auctions</span></h4>
        ${movers.length ? `<table class="gmkt mmovers"><thead><tr><th>Good</th><th>Price</th><th class="n">Last</th><th class="n">Change</th><th class="n">Units</th><th class="n">Bid / ask now</th></tr></thead><tbody>
          ${movers.map(([id, vol]) => { const { s, last, chg } = lastBits(id), q = G.quote(vw, id);
            return `<tr data-good="${id}" class="${fresh.has(id) ? "flash" : ""}"><td>${G.COM[id].name}</td><td>${spark(s.slice(-12), 80, 20)}</td><td class="n"><b>${m(last)}</b></td>
              <td class="n ${chg > 0 ? "up" : chg < 0 ? "dn" : ""}">${chg != null ? pct(chg) : "–"}</td><td class="n">${vol}</td>
              <td class="n">${q.bid != null ? m(q.bid) : "–"} / ${q.ask != null ? m(q.ask) : "–"}</td></tr>`; }).join("")}
        </tbody></table>` : `<p class="muted">Nothing has traded yet. The first trades set the first prices.</p>`}`)}
      ${quoteBoard(fresh, sel ? ticket(p, sel, want) : "")}
      ${opportunities(p)}
      ${fold("sell", "msec", `<h3>Sell what you make <span class="muted small">${sellIds.length || "nothing"} spare</span></h3>`,
        sellIds.length ? `<div class="mgrid">${sellIds.map(sellCard).join("")}</div>` : `<p class="muted">Nothing spare right now.</p>`)}
      ${fold("buy", "msec", `<h3>Buy what you need <span class="muted small">${buyIds.length ? `${buyIds.length} good${buyIds.length === 1 ? "" : "s"} · ` : ""}for your contracts and factories</span></h3>`,
        buyIds.length ? `<div class="mgrid">${buyIds.map(buyCard).join("")}</div>` : `<p class="muted">You have everything your contracts and factories need.</p>`)}
      <details class="msec mall" ${ui.allOpen ? "open" : ""}><summary><h3>${ui.allGoods ? `All ${COMMODITIES.length} goods` : `Goods in play (${inPlay.size})`}</h3></summary>
        <div class="grow"><input class="gsearch" id="gSearch" placeholder="Search" value="${esc(ui.search)}">
          <button class="glink blink" id="gAllGoods">${ui.allGoods ? "Show only goods in play" : `Show the other ${hidden} goods`}</button></div>
        <table class="gmkt gbook-list"><thead><tr><th>Good</th><th class="n">Bid</th><th class="n">Ask</th><th class="n">Last</th><th class="n" title="Its raw materials at their last traded prices">Cost basis</th><th class="n">Have</th><th class="n">Want</th><th class="n" title="Other players whose contracts ask for it (a count: contracts stay secret)">Wanted by</th><th>Made by</th></tr></thead><tbody>
        ${rows.map(c => { const q = G.quote(vw, c.id), mk = makersOf(p, c.id);
          return `<tr data-good="${c.id}" class="${c.id === sel ? "sel" : ""}"><td>${c.name}</td>
            <td class="n">${q.bid != null ? `${m(q.bid)} <small>×${q.bids[0].qty}</small>` : "–"}</td><td class="n">${q.ask != null ? `${m(q.ask)} <small>×${q.asks[0].qty}</small>` : "–"}</td>
            <td class="n">${q.last ? m(q.last.price) : "–"}</td><td class="n muted">${basisText(c.id) || "–"}</td><td class="n">${hold[c.id] || ""}</td><td class="n">${want[c.id] || ""}</td><td class="n">${wanted(p, c.id) || ""}</td>
            <td class="small muted">${[vw.businesses.some(b => b.owner === p.id && G.BIZ_BY[b.type].outputs[c.id]) ? "you" : "", ...mk.map(x => esc(x.name))].filter(Boolean).join(", ")}</td></tr>`; }).join("")}
        </tbody></table></details>`;
  }

  // A bigger price chart for one good: price line on top, units traded below (two bands, one x-axis).
  // Hover shows each auction's price and units.
  function priceChart(id) {
    const s = series(id);
    if (!s.length) return `<p class="muted small">No trades yet: the first one sets the price.</p>`;
    const W = 320, H = 132, padL = 34, padR = 8, top = 8, lineH = 78, gap = 10, volH = 30;
    const lo = Math.min(...s.map(x => x.price)), hi = Math.max(...s.map(x => x.price)), vmax = Math.max(...s.map(x => x.qty));
    const span = hi - lo || hi * 0.2 || 1, y0 = lo - span * 0.1, y1 = hi + span * 0.1;
    const n = s.length, inset = 10, X = i => n === 1 ? padL + (W - padL - padR) / 2 : padL + inset + i * (W - padL - padR - 2 * inset) / (n - 1);
    const Y = v => top + lineH - (v - y0) / (y1 - y0) * lineH, bw = Math.max(2, Math.min(14, (W - padL - padR) / n - 3));
    const vTop = top + lineH + gap;
    return `<div class="pchart" data-pts='${JSON.stringify(s.map((x, i) => ({ x: X(i), y: Y(x.price), t: `Round ${x.round}: ${x.qty} at ${m(x.price)}` })))}'>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${G.COM[id].name} trades: ${s.map(x => `${x.qty} at ${m(x.price)}`).join("; ")}">
        <line class="grid" x1="${padL}" x2="${W - padR}" y1="${Y(hi)}" y2="${Y(hi)}"/><line class="grid" x1="${padL}" x2="${W - padR}" y1="${Y(lo)}" y2="${Y(lo)}"/>
        <text class="ax" x="${padL - 4}" y="${Y(hi) + 3}" text-anchor="end">${m(hi)}</text>${hi !== lo ? `<text class="ax" x="${padL - 4}" y="${Y(lo) + 3}" text-anchor="end">${m(lo)}</text>` : ""}
        ${n > 1 ? `<polyline class="pline" points="${s.map((x, i) => `${X(i).toFixed(1)},${Y(x.price).toFixed(1)}`).join(" ")}"/>` : ""}
        ${s.map((x, i) => `<circle class="pdot" cx="${X(i).toFixed(1)}" cy="${Y(x.price).toFixed(1)}" r="${i === n - 1 ? 4 : 2.5}"/>`).join("")}
        ${s.map((x, i) => `<rect class="vbar" x="${(X(i) - bw / 2).toFixed(1)}" y="${(vTop + volH - x.qty / vmax * volH).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, x.qty / vmax * volH).toFixed(1)}" rx="2"/>`).join("")}
        <text class="ax" x="${padL - 4}" y="${vTop + volH}" text-anchor="end">units</text>
        <line class="xhair" x1="0" x2="0" y1="${top}" y2="${vTop + volH}" visibility="hidden"/>
      </svg><div class="ptip" hidden></div></div>`;
  }

  // The order book, on a price scale running left to right (the same scale as the replay):
  // asks as red bars rising from the centre line, bids as green bars hanging below it, one bar per price.
  // Faint grey blobs behind them are where orders sat in earlier rounds (a soft curve round each past
  // order, added up), the shaded band is the gap between the best bid and ask, and the dot on the centre
  // line is the last sale.
  function bookChart(id, yours) {
    const D = depthFrames(id, bookRounds(), nowBook(vw, id));
    const now = D.frames.at(-1);
    if (!Object.keys(now.segs).length && !D.ghosts.n && now.last == null) return `<p class="muted small">No orders on the book yet. Place the first one.</p>`;
    const tip = x => { const side = x.side === "a" ? "sell" : "buy", mine = yours(side, x.p);
      return `${x.w} ${side === "sell" ? "for sale" : "wanted"} at ${m(x.p)}${mine ? ` (${mine} yours)` : ""}`; };
    return `<div class="depth">${drawBook(D, still(now, themeColours()), Object.values(now.segs).map(x => ({ ...x, tip: tip(x) })))}<div class="ptip" hidden></div></div>`;
  }
  // The book now, as price levels: { b: [[price, qty]…], a: […] }
  const nowBook = (state, id) => ({ b: G.depth(state, id, "buy").slice(0, 10).map(x => [x.price, x.qty]), a: G.depth(state, id, "sell").slice(0, 10).map(x => [x.price, x.qty]) });

  // ----- Order book replay: the last 4 rounds of one good's book, animated smoothly -----
  // One bar per price (the amount at that price): asks to the right, bids to the left.
  // Nothing pops in or out: a new order's bar grows outwards from the centre line, a cancelled one shrinks
  // back into it, and everything (bars, spread band, price scale) glides from one moment to the next.
  // At each auction the part of each order that fills slides to the clearing price, the bids and asks
  // meet at the centre line, turn yellow and fade away; whatever didn't fill stays where it was.
  // The full book kept for an auction (st.bookLog; older games kept it on the history entry)
  const bookOf = h => st.bookLog?.[h.n] || h.depth;
  const bookRoundsKept = () => st.history.filter(bookOf).length;
  // How many rounds the book chart and its replay cover (the same, so they share one price scale)
  const bookRounds = () => Math.max(1, Math.min(ui.dRounds || 8, bookRoundsKept()));
  // A good's book at one auction, as moments to show: { label, segs, trade?, sold?, hold? }
  // segs: one bar per price level { side "b"/"a", p price, w amount, x0 offset from the centre line, col, op }.
  // No trade: the orders in, then what's left. A trade: the orders in (the part about to fill drawn beyond
  // the part that stays), the filling parts sliding to the clearing price and the centre line in yellow,
  // fading away, then what's left.
  const seg = (side, p, w, x0 = 0, col = side, op = 1) => ({ side, p, w, x0, col, op });
  const bookSegs = lv => { const segs = {}; lv.b.forEach(([p, q]) => segs["b" + p] = seg("b", p, q)); lv.a.forEach(([p, q]) => segs["a" + p] = seg("a", p, q)); return segs; };
  function auctionFrames(id, h) {
    const d = bookOf(h)?.[id] || { pre: { b: [], a: [] }, post: { b: [], a: [] } }, tr = h.trades[id];
    const when = `Round ${h.round}`;
    if (!tr) return [{ label: `${when}: orders in`, segs: bookSegs(d.pre) }, { label: `${when}: nothing traded`, segs: bookSegs(d.post) }];
    // Which part of each price level filled: best prices first, up to the volume traded
    const filled = (lv, ok) => { let v = tr.qty; const f = {}; lv.filter(([p]) => ok(p)).forEach(([p, q]) => { const n = Math.min(q, v); if (n > 0) { f[p] = n; v -= n; } }); return f; };
    const fb = filled(d.pre.b, p => p >= tr.price), fa = filled(d.pre.a, p => p <= tr.price);
    const pre = {};
    [["b", d.pre.b, fb], ["a", d.pre.a, fa]].forEach(([s, lv, f]) => lv.forEach(([p, q]) => {
      const t = f[p] || 0;
      pre[s + p] = seg(s, p, q - t);
      if (t) pre["t" + s + p] = seg(s, p, t, q - t);
    }));
    const meet = { ...pre }, gone = { ...pre };
    Object.keys(pre).filter(k => k[0] === "t").forEach(k => { meet[k] = { ...pre[k], p: tr.price, x0: 0, col: "y" }; gone[k] = { ...meet[k], op: 0 }; });
    return [
      { label: `${when}: orders in`, segs: pre },
      { label: `${when}: bids meet asks at ${m(tr.price)}`, segs: meet, trade: tr.price, hold: 250 },
      { label: `${when}: traded ${tr.qty} at ${m(tr.price)}`, segs: gone, trade: tr.price, sold: tr.price, hold: 100 },
      { label: `${when}: after the auction`, segs: bookSegs(d.post) },
    ];
  }
  // A fixed price scale covering every bid, ask and sale in a list of moments (and past orders), so
  // nothing leaves the chart during a replay
  const scaleOf = (frames, ghosts) => {
    let maxQ = 1;
    const all = [...frames.flatMap(f => { Object.values(f.segs).forEach(x => maxQ = Math.max(maxQ, x.x0 + x.w)); return [...Object.values(f.segs).map(x => x.p), f.trade, f.last]; }),
      ...ghosts.a.map(x => x[0]), ...ghosts.b.map(x => x[0])].filter(x => x != null);
    const a = all.length ? Math.min(...all) : 0, z = all.length ? Math.max(...all) : 12, wid = Math.max(12, (z - a) * 1.12), mid = (a + z) / 2;
    return { lo: mid - wid / 2, hi: mid + wid / 2, maxQ };
  };
  // Where orders sat in some auctions (each one's book as the orders came in), for the grey blobs
  const ghostsOf = (id, hs) => {
    const g = { a: [], b: [], n: 0 };
    hs.forEach(h => { const d = bookOf(h)?.[id]; if (!d) return; g.n++; d.pre.a.forEach(x => g.a.push(x)); d.pre.b.forEach(x => g.b.push(x)); });
    return g;
  };

  function depthFrames(id, rounds = 4, now = nowBook(st, id)) {
    const frames = [];
    const shown = st.history.filter(bookOf).slice(-rounds);
    // The last sale before the replay starts (from earlier auctions), for the last-sale line
    let lastBefore = null;
    for (const h of st.history) { if (shown[0] && h.n >= shown[0].n) break; if (h.trades[id]) lastBefore = h.trades[id].price; }
    shown.forEach(h => frames.push(...auctionFrames(id, h)));
    frames.push({ label: "Now", segs: bookSegs(now) });
    const ghosts = ghostsOf(id, shown);
    // Skip moments when this good had no orders at all (they'd just be a blank chart), but keep the
    // first empty one after some orders so the last bars can shrink away
    const has = f => Object.keys(f.segs).length || f.trade != null;
    const kept = frames.filter((f, i) => has(f) || f.label === "Now" || (i > 0 && has(frames[i - 1])));
    frames.length = 0; frames.push(...kept);
    // The last sale at each moment: it moves when a trade completes
    let last = lastBefore;
    frames.forEach(f => { if (f.sold != null) last = f.sold; f.last = last; });
    const { lo, hi, maxQ } = scaleOf(frames, ghosts);
    frames.forEach(f => { f.lo = lo; f.hi = hi; });
    return { frames, maxQ, ghosts, empty: frames.length < 2 || frames.every(f => !Object.keys(f.segs).length) };
  }

  // Colours come from the page's theme (light or dark), so the replay matches the rest of the market
  const rgb = hex => { const h = hex.trim().replace("#", ""); const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const themeColours = () => { const cs = getComputedStyle(document.documentElement); return { b: rgb(cs.getPropertyValue("--raw") || "#5f8f3e"), a: rgb(cs.getPropertyValue("--waste") || "#b8443b"), y: [232, 194, 26] }; };
  const mix = (a, b, t) => a + (b - a) * t;
  // Blend two moments. A bar only in one of them grows from (or shrinks to) nothing at its own price.
  const blend = (f0, f1, t, C) => {
    const segs = {};
    new Set([...Object.keys(f0.segs), ...Object.keys(f1.segs)]).forEach(k => {
      const a = f0.segs[k] || { ...f1.segs[k], w: 0 }, b = f1.segs[k] || { ...f0.segs[k], w: 0 };
      const ca = C[a.col], cb = C[b.col];
      segs[k] = { side: b.side, fill: k[0] === "t", p: mix(a.p, b.p, t), w: mix(a.w, b.w, t), x0: mix(a.x0, b.x0, t), op: mix(a.op, b.op, t), rgb: ca.map((x, i) => mix(x, cb[i], t)) };
    });
    return { segs, lo: mix(f0.lo, f1.lo, t), hi: mix(f0.hi, f1.hi, t), trade: f1.trade ?? f0.trade ?? null, tradeOp: mix(f0.trade != null ? 1 : 0, f1.trade != null ? 1 : 0, t),
      last: f0.last != null && f1.last != null ? mix(f0.last, f1.last, t) : f1.last ?? f0.last ?? null };
  };
  const still = (f, C) => blend(f, f, 1, C);
  // Draws one moment of the book (see bookChart). hits: bars to give hover tips (the live chart only).
  function drawBook(D, s, hits = []) {
    const W = 320, H = 210, L = 8, R = 8, top = 16, bot = 26, cy = top + (H - top - bot) / 2, half = (H - top - bot) / 2 - 2;
    const span = s.hi - s.lo || 1, plotW = W - L - R;
    const Xraw = p => L + (p - s.lo) / span * plotW;
    const X = p => Math.min(W - R, Math.max(L, Xraw(p)));                    // far-off prices are pinned to the edge
    const pinned = p => Xraw(p) < L - 0.5 || Xraw(p) > W - R + 0.5;
    const k = half / D.maxQ, bw = Math.max(2.5, Math.min(12, plotW / span * 0.7));
    const segs = Object.values(s.segs).filter(x => x.w > 0.02 && x.op > 0.02);
    let g = "";
    // Price gridlines, labelled along the bottom; they glide with the scale
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find(x => span / x <= 6) || 10000;
    for (let v = Math.ceil(s.lo / step) * step; v <= s.hi; v += step) {
      const x = Xraw(v); if (x < L - 1 || x > W - R + 1) continue;
      g += `<line class="grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top}" y2="${H - bot}"/><text class="gl" x="${x.toFixed(1)}" y="${H - bot + 12}" text-anchor="middle">${m(v)}</text>`;
    }
    // Past orders: a soft curve round each one, added up over the rounds shown
    const G0 = D.ghosts;
    if (G0 && G0.n) {
      const sd = Math.max(span / 40, 0.5), N = 160;
      const dens = (list, p) => list.reduce((t, [pp, q]) => t + q * Math.exp(-((p - pp) ** 2) / (2 * sd * sd)), 0);
      const curve = side => Array.from({ length: N + 1 }, (_, i) => dens(G0[side], s.lo + i / N * span));
      const C2 = { a: curve("a"), b: curve("b") }, peak = Math.max(1e-9, ...C2.a, ...C2.b);
      // Only their shape matters: the busiest past price reaches 70% of the way to the edge
      const kg = 0.7 * half / peak;
      [["a", -1], ["b", 1]].forEach(([side, dir]) => {
        if (!G0[side].length) return;
        let d = `M${L},${cy}`;
        C2[side].forEach((v, i) => { d += ` L${(L + i / N * plotW).toFixed(1)},${(cy + dir * v * kg).toFixed(1)}`; });
        g += `<path class="ghost" d="${d} L${W - R},${cy} Z"/>`;
      });
    }
    // The gap between the best bid and ask still standing
    const live = side => segs.filter(x => x.side === side && x.op > 0.5 && !x.fill);
    const bid = Math.max(-Infinity, ...live("b").map(x => x.p)), ask = Math.min(Infinity, ...live("a").map(x => x.p));
    if (isFinite(bid) && isFinite(ask) && ask > bid) g += `<rect class="band" x="${X(bid).toFixed(1)}" y="${top}" width="${(X(ask) - X(bid)).toFixed(1)}" height="${H - top - bot}"/>`;
    // A trade happening (replay): a line at the clearing price
    if (s.trade != null && s.tradeOp > 0.02) g += `<line class="tline" opacity="${s.tradeOp.toFixed(2)}" x1="${X(s.trade).toFixed(1)}" x2="${X(s.trade).toFixed(1)}" y1="${top}" y2="${H - bot}"/>
      <text class="tlbl" opacity="${s.tradeOp.toFixed(2)}" x="${X(s.trade).toFixed(1)}" y="${top - 4}" text-anchor="middle">${m(s.trade)}</text>`;
    // The bars: asks up, bids down; a part about to fill sits beyond the part that stays (x0)
    segs.forEach(x => {
      const h = x.w * k, off = x.x0 * k, fill = `rgb(${x.rgb.map(Math.round).join(",")})`;
      const y = x.side === "a" ? cy - off - h : cy + off;
      g += `<rect x="${(X(x.p) - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${fill}" opacity="${(x.op * (pinned(x.p) ? 0.35 : 1)).toFixed(2)}"/>`;
    });
    // Hover targets (live chart)
    hits.forEach(x => { const h = Math.max(8, x.w * k);
      g += `<rect class="hit" data-tip="${esc(x.tip)}" x="${(X(x.p) - Math.max(bw, 8) / 2).toFixed(1)}" y="${(x.side === "a" ? cy - h : cy).toFixed(1)}" width="${Math.max(bw, 8).toFixed(1)}" height="${h.toFixed(1)}"/>`; });
    // The centre line, and the last sale as a dot on it
    g += `<line class="axis" x1="${L}" x2="${W - R}" y1="${cy}" y2="${cy}"/>`;
    if (s.last != null) g += `<circle class="ldot" cx="${X(s.last).toFixed(1)}" cy="${cy}" r="4.5"><title>Last sale ${m(Math.round(s.last))}</title></circle>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Order book: asks above the line, bids below, by price"><text class="lbl" x="${L}" y="11">Asks ↑</text><text class="lbl" x="${L}" y="${H - 2}">Bids ↓</text>${s.last != null ? `<text class="llbl" x="${W - R}" y="11" text-anchor="end">● last ${m(Math.round(s.last))}</text>` : ""}${g}</svg>`;
  }
  // Play: each moment blends into the next over 0.65s, then holds. Returns a stop function.
  function playDepth(box, label, id, rounds, done) {
    const D = depthFrames(id, rounds, nowBook(vw, id)), C = themeColours();
    if (D.empty) { label.textContent = `Nothing to replay: nobody bid for or offered ${G.COM[id].name.toLowerCase()} in the last ${rounds} round${rounds === 1 ? "" : "s"}.`; label.classList.add("dnow"); done(); return () => {}; }
    label.classList.add("dnow");
    const MOVE = 325, HOLD = 375, F = D.frames;
    // The clock starts on the first frame: a browser stamps each frame with when the frame began, which can
    // be a moment before the click was handled, so time measured from the click could come out negative
    let k = 0, t0 = null, raf = 0;
    const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const tick = now => {
      if (t0 == null) t0 = now;
      const el = Math.max(0, now - t0), move = k === 0 ? 0 : MOVE, hold = F[k].hold ?? HOLD;
      box.innerHTML = drawBook(D, k > 0 && el < move ? blend(F[k - 1], F[k], ease(el / move), C) : still(F[k], C));
      label.textContent = `${F[k].label} (${k + 1}/${F.length})`;
      if (el >= move + hold) { if (++k >= F.length) return done(); t0 = now; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }

  // One good: who makes and uses it, its book, price history, your orders and the order form
  function ticket(p, id, want) {
    const q = G.quote(vw, id), c = G.COM[id];
    const hold = have(p, id);
    const t = ui.ticket[id] ||= { side: hold > (want[id] || 0) ? "sell" : "buy", price: "", qty: "" };
    const yours = (side, price) => vw.book.filter(o => o.pid === p.id && o.good === id && o.side === side && o.price === price).reduce((s, o) => s + o.qty, 0);
    const myOrders = vw.book.filter(o => o.pid === p.id && o.good === id);
    const isNew = o => !st.book.some(x => x.id === o.id);
    const cb = G.costBasis(vw, id), basisVal = cb && !cb.missing.length && cb.value ? cb.value : null;
    const suggest = t.side === "buy" ? q.ask ?? q.last?.price ?? q.bid ?? basisVal : q.bid ?? q.last?.price ?? q.ask ?? basisVal;
    const makers = makersOf(p, id), users = usersOf(p, id);
    const standIn = b => Object.keys(b.inputs).find(x => G.substitutesFor(b, x).some(([y]) => y === id));
    const usedBy = G.BIZ.filter(b => usesGood(b, id)).map(b => `${b.name.toLowerCase()}${b.inputs[id] ? "" : ` <i>instead of ${G.COM[standIn(b)].name.toLowerCase()}</i>`}`);
    return `<div class="gticket">
      <div class="ghead"><h3>${c.name}</h3><span class="muted small">${q.last ? `last ${m(q.last.price)} · ${q.volume} traded in 3 rounds` : "nothing traded yet"}${basisText(id) ? ` · <span title="What its inputs cost at their last traded prices${basisNote(id)}">cost basis ${basisText(id)}</span>` : G.COM[id].type === "raw" && !q.last ? " · raw: the market sets its price" : ""}${q.spread != null ? ` · spread ${Math.round(q.spread * 100)}%` : ""}</span><span class="gsp"></span><button class="glink" id="gTicketClose" title="Close">✕</button></div>
      <div class="tfacts">
        <div><span>You have</span><b>${hold}${spoils(p, id) ? ` <small class="bad">⌛ ${spoils(p, id)} go off tonight</small>` : G.roundsLeft && G.roundsLeft(vw, p, id) != null ? ` <small class="muted">oldest lasts ${G.roundsLeft(vw, p, id)} more round${G.roundsLeft(vw, p, id) === 1 ? "" : "s"}</small>` : ""}</b>${whereIs(p, id).length > 1 || (whereIs(p, id)[0] && whereIs(p, id)[0].label !== "your stockpile") ? `<small>${whereIs(p, id).map(x => `${x.qty} ${x.label === "your stockpile" ? "in" : "at"} ${x.label.toLowerCase()}`).join(", ")}</small>` : ""}</div>
        <div><span>Made by</span><b>${makers.length ? names(makers) : "nobody else"}</b></div>
        <div><span>Could use it</span><b>${users.length ? names(users) : "nobody yet"}</b></div>
      </div>
      <p class="small muted tused">${[wanted(p, id) ? `in ${wanted(p, id)} open contract${wanted(p, id) === 1 ? "" : "s"}` : "", contractGood(id) ? "contracts can ask for it" : ""].filter(Boolean).map(x => x + " · ").join("")}used by ${usedBy.join(", ") || "no factory"}${S.depreciation?.on ? ` · ${G.lifeOf(id) ? `lasts ${G.lifeOf(id)} rounds` : "never goes off"}` : ""}</p>
      <div class="tcharts">
        <div><h4 title="Price runs left to right. Red bars above the line are asks, green bars below are bids: the taller, the more at that price. Grey blobs: where orders sat in recent rounds. The dot is the last sale. Hover a bar for details.">Order book <span class="hint">ⓘ</span></h4><div class="depthbox">${bookChart(id, yours)}</div>
          <div class="drctl">${bookRoundsKept() ? `<button class="gbtn ghost" id="dPlay">▶ Replay</button><label class="drr">last <input type="number" id="dRounds" min="1" max="${bookRoundsKept()}" value="${bookRounds()}"> <span class="muted">of ${bookRoundsKept()} rounds</span></label><span id="dLabel" class="muted small"></span>` : `<button class="gbtn ghost" disabled>▶ Replay</button><span class="muted small">Replays build up from here on: each auction from now is recorded.</span>`}</div></div>
        <div><h4>Price history</h4>${priceChart(id)}</div>
      </div>
      <div class="${myOrders.length ? "gtwo" : ""}">
        <div>
          <h4>New order</h4>
          <div class="gform">
            <div class="gseg"><button data-side="buy" class="${t.side === "buy" ? "on" : ""}">Buy</button><button data-side="sell" class="${t.side === "sell" ? "on" : ""}">Sell</button></div>
            <label>Price each <input type="number" id="gPrice" min="1" step="1" value="${t.price || (suggest != null ? suggest : "")}" placeholder="price"></label>
            <label>Quantity <input type="number" id="gQty" min="1" step="1" value="${t.qty || (t.side === "sell" ? hold : Math.max(1, (want[id] || 0) - hold)) || 1}"></label>
            <button class="gbtn" id="gPlace">${t.side === "buy" ? "Place buy" : "Place sell"}</button>
          </div>
          <p class="muted small" title="${t.side === "buy" ? "Locks price × quantity of your cash until it fills or you cancel. What you buy goes to your stockpile." : "Takes the goods from your businesses first, then your stockpile."}">${t.side === "buy" ? `Locks the cash until filled or cancelled · ${m(p.cash)} free` : `${hold} available to sell`}</p>
        </div>
        ${myOrders.length ? `<div>
          <h4>Your orders</h4>
          ${myOrders.map(o => `<div class="gpos">${o.side === "buy" ? "Buy" : "Sell"} ${o.qty} at ${m(o.price)}${isNew(o) ? ` <em>new</em>` : ""}<button data-cancel="${o.id}" data-new="${isNew(o) ? 1 : ""}">Cancel</button></div>`).join("")}
        </div>` : ""}
      </div>
    </div>`;
  }

  // ----- Move or build (one of them a round; building is free) -----
  const ioText = b => b.kind === "extract" ? `makes ${b.outputs[b.makes]} ${G.COM[b.makes].name}`
    : `${Object.entries(b.inputs).map(([c, q]) => `${q} ${G.COM[c].name}`).join(" + ")} → ${Object.entries(b.outputs).map(([c, q]) => `${q} ${G.COM[c].name}`).join(" + ")}`;
  function buildPanel(p) {
    const here = p.pos;
    const opts = G.buildable(here).sort((a, b) => G.bizTier(a) - G.bizTier(b) || a.name.localeCompare(b.name));
    const done = p.acted ? "You've already moved or built this round" : "";
    return `
      <div class="ghead"><h3>${G.TERR[here].name}</h3><span class="muted">${G.isSea(here) ? "Sea" : G.coastal(here) ? "Coastal" : "Inland"} · one move or one build a round</span></div>
      <h4 class="gsub">${p.acted ? "Done for this round ✓" : "Move <span class=\"muted\">(or click the map)</span>"}</h4>
      <div class="gmoves">${G.neighbours(here).map(t => `<button data-move="${t}" ${p.acted ? "disabled" : ""}>${G.TERR[t].name}</button>`).join("")}</div>
      <h4 class="gsub">…or build here <span class="muted">(free)</span></h4>
      ${opts.length ? `<table class="gmkt"><thead><tr><th>Business</th><th>Each round</th><th></th></tr></thead><tbody>
        ${opts.map(b => `<tr><td>${b.name}</td><td class="muted small">${ioText(b)}</td>
          <td class="acts"><button data-build="${b.id}" ${p.acted ? "disabled" : ""} title="${done || "Build it"}">Build</button></td></tr>`).join("")}
      </tbody></table>` : `<p class="muted">Nothing can be built here.</p>`}`;
  }

  // ----- The territory you clicked (or where you are): what can be built there -----
  function terrCard(p, tid) {
    const T = G.TERR[tid], info = TERRITORY_INFO[tid], sea = G.isSea(tid);
    const dist = G.distances(p.pos)[tid] ?? null;
    const where = tid === p.pos ? "You're here" : dist === 1 ? "Next to you" : dist != null ? `${dist} moves away` : "";
    const opts = G.buildable(tid);
    const others = b => TERRITORIES.filter(t => t.id !== tid && G.canBuildAt(b, t.id)).length;
    const row = b => `<li><span class="bicon tc-icon"><svg viewBox="0 0 24 24">${iconSVG(BIZ_ICON[b.id], 12, 12, 18)}</svg></span>
        <span><b>${b.name}</b>: ${ioText(b)}<small>${others(b) ? `also in ${others(b)} other territor${others(b) === 1 ? "y" : "ies"}` : "only here"}</small></span></li>`;
    const ext = opts.filter(b => b.kind === "extract"), fac = opts.filter(b => b.kind === "factory");
    const here = vw.businesses.filter(b => b.territory === tid);
    const canMove = vw.phase === "day" && !p.acted && G.neighbours(p.pos).includes(tid);
    return `<div class="gterr">
      <div class="tc-head"><h3>${T.name}</h3><span class="muted">${sea ? "Sea" : G.coastal(tid) ? "Coastal" : "Inland"}${where ? ` · ${where}` : ""}</span>
        <span class="gsp"></span>
        ${canMove ? `<button class="gbtn" data-move="${tid}">Move here</button>` : ""}
        ${tid === p.pos && vw.phase === "day" && !p.acted && opts.length ? `<button class="gbtn ghost" data-tab="build">Build here →</button>` : ""}
        ${ui.terr ? `<button class="glink" id="gTerrClose" title="Back to where you are">✕</button>` : ""}</div>
      ${info.note ? `<p class="muted small tc-note">${esc(info.note)}</p>` : ""}
      ${opts.length ? `<div class="tc-cols">
        <div><h4>Mines, pits and farms</h4>${ext.length ? `<ul class="tc-list">${ext.map(row).join("")}</ul>` : `<p class="muted small">None here.</p>`}</div>
        <div><h4>Factories</h4>${fac.length ? `<ul class="tc-list">${fac.map(row).join("")}</ul>` : `<p class="muted small">None here.</p>`}</div>
      </div>` : `<p class="muted small">${sea ? "Open water: nothing can be built here." : "Nothing can be built here."}</p>`}
      ${here.length ? `<p class="small tc-here"><b>Businesses here:</b> ${here.map(b => `${b.owner === p.id ? "your" : esc(G.player(vw, b.owner).name) + "'s"} ${G.BIZ_BY[b.type].name.toLowerCase()}`).join(", ")}</p>` : ""}
    </div>`;
  }

  // ----- Map -----
  function drawMap(p) {
    const FID = "tOutlineGame";
    let { svg, below } = europeMapSVG(FID);
    const near = vw.phase === "day" && !p.acted ? G.neighbours(p.pos) : [];
    // Highlights go in the top layer: where you are, and where you can move
    const sel = ui.terr && ui.terr !== p.pos ? mapHighlightSVG(FID, ui.terr, "sel") : "";
    svg = svg.replace(`<g class="hl"></g></svg>`, `<g class="hl">${near.map(t => mapHighlightSVG(FID, t, "near")).join("")}${mapHighlightSVG(FID, p.pos, "here")}${sel}</g>`);
    // Markers under each name: pawns first, then businesses; up to 4 a row, kept inside the map
    const [W] = MAP_SIZE, S = 28, step = 32, perRow = 4;
    const marks = {};
    vw.players.forEach(x => (marks[x.pos] ||= []).push({ kind: "pawn", x }));
    vw.businesses.forEach(b => (marks[b.territory] ||= []).push({ kind: "biz", b }));
    Object.entries(marks).forEach(([tid, list]) => {
      const [x] = TERRITORY_LABELS[tid], show = list.slice(0, 8), rows = Math.ceil(show.length / perRow);
      show.forEach((mk, i) => {
        const r = Math.floor(i / perRow), inRow = Math.min(perRow, show.length - r * perRow), k = i - r * perRow;
        const half = (inRow - 1) / 2 * step + S / 2 + 4;
        const cx = Math.min(W - half, Math.max(half, x)) + (k - (inRow - 1) / 2) * step, cy = below[tid] + 22 + r * (S + 4);
        if (mk.kind === "biz") { const o = G.player(vw, mk.b.owner), t = G.BIZ_BY[mk.b.type]; svg += `<g class="mk"><title>${esc(o.name)}: ${t.name}</title><rect x="${cx - S / 2}" y="${cy - S / 2}" width="${S}" height="${S}" rx="6" fill="${o.colour}" stroke="#fff" stroke-width="2"/>${iconSVG(BIZ_ICON[t.id], cx, cy, 19)}</g>`; }
        else svg += `<g class="mk"><title>${esc(mk.x.name)}${mk.x.id === p.id ? " (you)" : ""}</title>${pawnSVG(cx, cy, mk.x.id === p.id ? 36 : 30, mk.x.colour)}</g>`;
      });
      if (show.length < list.length) svg += `<text x="${x}" y="${below[tid] + 22 + rows * (S + 4) + 6}" text-anchor="middle" font-size="12" font-weight="700" fill="#4a4232" paint-order="stroke" stroke="#fff" stroke-width="3">+${list.length - show.length} more</text>`;
    });
    document.getElementById("gMap").innerHTML = `<div class="bd-scroll">${svg.replace(/<\/svg>$/, "")}</svg></div>`;
    document.querySelectorAll("#gMap .terr").forEach(g => {
      const t = g.dataset.t;
      if (near.includes(t)) g.classList.add("near");
      // Clicking a territory shows what's there (and, if it's next door, a button to move)
      g.addEventListener("click", () => { ui.terr = ui.terr === t ? null : t; render(); });
    });
  }

  // Between rounds: a light night-blue tint that warms to morning gold, with a small "Night" label
  function nightfall(round) {
    document.querySelector(".gnight")?.remove();
    const el = document.createElement("div");
    el.className = "gnight";
    el.innerHTML = `<div><span class="gmoon"></span><b>Night</b><small>Round ${round}</small></div>`;
    el.addEventListener("animationend", () => el.remove()); // the tint and the label end together
    document.body.appendChild(el);
  }

  // ----- Opening a good: its quote card grows into the big card, and shrinks back when closed -----
  const pageRect = el => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
  // A plain box shaped like a card glides from `from` to where `to` now sits, then `to` fades in
  function morph(from, to) {
    if (!to) return;
    const after = () => { if (to.getBoundingClientRect().bottom > innerHeight || to.getBoundingClientRect().top < 0) to.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
    if (!from || matchMedia("(prefers-reduced-motion: reduce)").matches) return after();
    const end = pageRect(to), box = document.createElement("div");
    box.className = "qflip";
    const place = r => Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    place(from); document.body.appendChild(box);
    to.style.opacity = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => { box.classList.add("go"); place(end); }));
    let finished = false;
    const finish = () => { if (finished) return; finished = true; box.remove(); to.style.transition = "opacity .18s"; to.style.opacity = 1; after(); };
    box.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 600); // in case the transition never fires
  }
  function closeGood() {
    const open = root.querySelector(".qopen"), id = ui.good, from = open && pageRect(open);
    ui.good = null; render();
    morph(from, root.querySelector(`.qcard[data-good="${id}"]`));
  }

  // ----- Clicks -----
  function wire(p) {
    root.querySelector("#gEnd").addEventListener("click", () => {
      const before = st.log.length, who = ui.seat, round = st.round;
      const r = G.submit(st, ui.seat, ui.orders);
      if (!r.ok) { flash(r.msg); return render(); }
      ui.orders = []; ui.card = null;
      ui.seenBy[who] = before; // next time they look, show everything since they submitted
      save(); render();
      if (st.round > round && !st.over) nightfall(st.round);
    });
    root.querySelector("#gNewsOk")?.addEventListener("click", e => { e.preventDefault(); ui.seenBy[ui.seat] = st.log.length; render(); });
    root.querySelectorAll("[data-fold]").forEach(d => d.addEventListener("toggle", () => (ui.open ??= {})[d.dataset.fold] = d.open));
    root.querySelectorAll("[data-undo]").forEach(b => b.addEventListener("click", () => {
      const next = ui.orders.filter((_, i) => i !== +b.dataset.undo);
      const d = G.draft(st, ui.seat, next);
      if (d.error) flash("Can't remove that: later orders depend on it. Remove those first."); else ui.orders = next;
      render();
    }));
    root.querySelector("#gNew").addEventListener("click", () => { if (confirm("Abandon this game and start a new one?")) { st = null; localStorage.removeItem(KEY); render(); } });
    const s = root.querySelector("#gSearch");
    if (s) s.addEventListener("input", () => { ui.search = s.value.toLowerCase(); ui.allOpen = true; const pos = s.selectionStart; render(); const n = root.querySelector("#gSearch"); n.focus(); n.setSelectionRange(pos, pos); });
    root.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { ui.tab = b.dataset.tab; render(); }));
    // Market: pick a good, then the order ticket
    // Any card, row or chip with a good on it opens that good (from the sidebar too, switching to the market)
    // A good opens in the quote board, growing out of its card; clicking the card's good again (or ✕) shrinks it back
    root.querySelectorAll("[data-good]").forEach(el => el.addEventListener("click", () => {
      const fromSide = !!el.closest(".gdash"), id = el.dataset.good;
      if (!fromSide && ui.good === id) return closeGood();
      const card = el.closest(".qcard");
      ui.good = id; ui.tab = "market"; render();
      morph(card && pageRect(card), root.querySelector(".qopen"));
    }));
    root.querySelector("#gTicketClose")?.addEventListener("click", closeGood);
    root.querySelector(".mall")?.addEventListener("toggle", e => ui.allOpen = e.target.open);
    root.querySelector("#gAllGoods")?.addEventListener("click", e => { e.preventDefault(); ui.allGoods = !ui.allGoods; ui.allOpen = true; render(); });
    // Order book replay (last 4 rounds): ▶ starts it, ■ stops it; a redraw of the page stops it too
    dStop(); dStop = () => {};
    const dPlay = root.querySelector("#dPlay");
    // How many rounds back to replay (remembered while you look at other goods)
    root.querySelector("#dRounds")?.addEventListener("change", e => { ui.dRounds = Math.max(1, Math.min(bookRoundsKept(), Math.floor(+e.target.value) || bookRoundsKept())); render(); });
    dPlay?.addEventListener("click", () => {
      if (dPlay.dataset.on) { dStop(); dStop = () => {}; delete dPlay.dataset.on; dPlay.textContent = "▶ Replay"; return; }
      dPlay.dataset.on = 1; dPlay.textContent = "■ Stop";
      dStop = playDepth(root.querySelector(".depthbox"), root.querySelector("#dLabel"), ui.good, bookRounds(), () => { delete dPlay.dataset.on; dPlay.textContent = "▶ Replay again"; dStop = () => {}; });
    });
    // Quote board replay: ▶ animates through the auctions; the slider jumps to any moment
    qStop?.(); qStop = null;
    const qPlay = root.querySelector("#qPlay"), qSlide = root.querySelector("#qSlide");
    const stopReplay = () => { qStop?.(); qStop = null; if (qPlay) qPlay.textContent = "▶ Replay"; };
    qSlide?.addEventListener("input", () => { stopReplay(); showFrame(+qSlide.value); });
    // One ▶ Replay button: opens the controls and starts playing; ✕ puts them away and shows the book as it stands
    root.querySelector("#qOpen")?.addEventListener("click", e => {
      ui.qOpen = true; e.target.hidden = true; root.querySelector(".qctl").hidden = false; qPlay.click();
    });
    root.querySelector("#qClose")?.addEventListener("click", () => {
      ui.qOpen = false; stopReplay(); showFrame(ui.board.frames.length - 1);
      root.querySelector(".qctl").hidden = true; root.querySelector("#qOpen").hidden = false;
    });
    root.querySelectorAll("[data-rmode]").forEach(b => b.addEventListener("click", () => { ui.rmode = b.dataset.rmode; render(); }));
    qPlay?.addEventListener("click", () => {
      if (qStop) return stopReplay();
      const end = ui.board.frames.length - 1;
      const start = ui.rmode === "game" ? 0 : ui.board.lastStart;
      const k = +qSlide.value >= end ? start : Math.max(start, +qSlide.value);
      qPlay.textContent = "❚❚ Pause";
      qStop = playBoard(k, end, ui.rmode === "game", () => { qStop = null; qPlay.textContent = "▶ Replay"; });
    });
    // Price chart: crosshair and tooltip on the nearest trade
    root.querySelectorAll(".pchart").forEach(box => {
      const pts = JSON.parse(box.dataset.pts), svg = box.querySelector("svg"), tip = box.querySelector(".ptip"), xh = svg.querySelector(".xhair");
      svg.addEventListener("mousemove", e => {
        const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, x = (e.clientX - r.left) / r.width * vb.width;
        const pt = pts.reduce((a, b) => Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a);
        xh.setAttribute("x1", pt.x); xh.setAttribute("x2", pt.x); xh.setAttribute("visibility", "visible");
        tip.hidden = false; tip.textContent = pt.t;
        tip.style.left = `${Math.min(r.width - 150, Math.max(0, pt.x / vb.width * r.width - 70))}px`; tip.style.top = `${pt.y / vb.height * r.height - 34}px`;
      });
      svg.addEventListener("mouseleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
    });
    // Order book chart: hovering a row says what's at that price and in total
    root.querySelectorAll(".depth").forEach(box => {
      const tip = box.querySelector(".ptip");
      box.querySelectorAll("[data-tip]").forEach(g => {
        g.addEventListener("mousemove", e => {
          const r = box.getBoundingClientRect();
          tip.hidden = false; tip.textContent = g.dataset.tip;
          tip.style.left = `${Math.min(r.width - 230, Math.max(0, e.clientX - r.left - 110))}px`; tip.style.top = `${e.clientY - r.top - 34}px`;
        });
        g.addEventListener("mouseleave", () => tip.hidden = true);
      });
    });
    const t = ui.good && ui.ticket[ui.good];
    const keep = () => { if (!t) return; t.price = root.querySelector("#gPrice")?.value || ""; t.qty = root.querySelector("#gQty")?.value || ""; };
    root.querySelectorAll("[data-side]").forEach(b => b.addEventListener("click", () => { t.side = b.dataset.side; t.price = t.qty = ""; render(); }));
    ["#gPrice", "#gQty"].forEach(id => root.querySelector(id)?.addEventListener("input", keep));
    root.querySelector("#gPlace")?.addEventListener("click", () => {
      keep();
      const msg = tryOrder("placeOrder", { id: ui.good, side: t.side, price: +t.price, qty: +t.qty });
      if (!msg) t.price = t.qty = "";
      flash(msg); render();
    });
    root.querySelector("#gQty")?.addEventListener("keydown", e => { if (e.key === "Enter") root.querySelector("#gPlace").click(); });
    // Cancel: an order already on the book becomes a cancel order; a new one is just taken back
    root.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", () => {
      const id = +b.dataset.cancel;
      if (!b.dataset.new) return doAct("cancelOrder", { order: id });
      // New orders get the next ids in the order they were placed
      let k = st.nextOrderId - 1;
      const i = ui.orders.findIndex(o => o.name === "placeOrder" && ++k === id);
      const next = ui.orders.filter((_, j) => j !== i);
      if (i < 0 || G.draft(st, ui.seat, next).error) flash("Can't take that back: later orders depend on it. Remove those first.");
      else ui.orders = next;
      render();
    }));
    // Contracts
    root.querySelectorAll("[data-deliver]").forEach(b => b.addEventListener("click", () => doAct("deliver", { contract: +b.dataset.deliver })));
    // Afternoon
    root.querySelectorAll("[data-move]").forEach(b => b.addEventListener("click", () => { ui.terr = null; doAct("move", { to: b.dataset.move }); }));
    root.querySelector("#gTerrClose")?.addEventListener("click", () => { ui.terr = null; render(); });
    root.querySelectorAll("[data-build]").forEach(b => b.addEventListener("click", () => doAct("build", { type: b.dataset.build })));
  }

  // ----- End of game -----
  function renderEnd() {
    const rank = G.ranking(st);
    root.innerHTML = `<div class="gsetup">
      <h1>${esc(rank[0].name)} wins</h1>
      <table class="gplayers"><thead><tr><th>#</th><th>Player</th><th class="n">Points</th><th class="n">Contracts</th><th class="n">Cash</th><th class="n">Businesses</th></tr></thead><tbody>
      ${rank.map((p, i) => `<tr><td>${i + 1}</td><td><i class="gdot" style="background:${p.colour}"></i>${esc(p.name)}</td><td class="n"><b>${p.points}</b></td><td class="n">${p.delivered || 0}</td><td class="n">${m(G.totalCash(st, p))}</td><td class="n">${G.myBusinesses(st, p.id).length}</td></tr>`).join("")}
      </tbody></table>
      <div class="grow"><button class="gbtn" id="gAgain">New game</button></div></div>`;
    root.querySelector("#gAgain").addEventListener("click", () => { st = null; localStorage.removeItem(KEY); render(); });
  }

  // Start: continue a saved game in progress, or show setup
  const saved = load();
  st = saved && saved.version === 7 && !saved.over ? saved : null;
  render();
})();
