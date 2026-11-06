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
        <p class="muted">Pick who's playing. Each player starts with ${S.startCash} cash, ${S.unlimitedSpace ? "an unlimited stockpile for what they buy" : `${S.startSpace} crates of stockpile space`}, ${S.startBusinesses > 1 ? "two free businesses where they start (the one picked here and the one that uses its output)" : "one free business where they start"}, and ${S.contracts.hand} secret contracts. Deliver contracts to score points; most points after the last round wins, and cash breaks ties. ${S.businessStock ? `What a business makes stays in its own stock (up to ${S.businessSpace} units) until you sell or use it. ` : ""}There's no price list: every price comes from what players bid and ask.</p>
        ${saved && saved.version === 6 && !saved.over ? `<div class="gresume">A game in round ${saved.round} is saved in this browser. <button class="gbtn" id="gResume">Continue it</button></div>` : ""}
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
    if (o.name === "deliver") return `Deliver a contract`;
    if (o.name === "discardContract") return `Throw away a contract`;
    if (o.name === "dump") return `Throw away ${a.qty} ${G.COM[a.id].name}`;
    if (o.name === "upgradeSpace") return `+${S.spaceUpgrade.crates} crates of space`;
    if (o.name === "move") return `Move to ${G.TERR[a.to].name}`;
    if (o.name === "build") return `Build a ${G.BIZ_BY[a.type].name.toLowerCase()}`;
    if (o.name === "playCard") return `Play ${G.CARD[a.card].name}`;
    if (o.name === "setDiscard") return `If full, throw away first: ${a.list.map(c => G.COM[c].name).join(", ") || "cheapest goods"}`;
    if (o.name === "borrow") return `Borrow ${m(a.amount)}`;
    if (o.name === "repay") return `Repay ${m(a.amount)}`;
    if (o.name === "buyBond") return `Buy ${a.count} ${a.length}-round bond${a.count > 1 ? "s" : ""} <em>${m(a.count * 100)}</em>`;
    if (o.name === "sellBond") return `Sell bond #${a.id}`;
    if (o.name === "openFuture") return `${a.side === "long" ? "Long" : "Short"} ${a.qty} ${G.COM[a.cid].name}, ${a.rounds} round${a.rounds > 1 ? "s" : ""}`;
    if (o.name === "closeFuture") return `Close futures #${a.id}`;
    if (o.name === "buyEtf") return `Buy ${a.units} ${BROKER.etfs.tickers[a.sector]}`;
    if (o.name === "sellEtf") return `Sell ${a.units} ${BROKER.etfs.tickers[a.sector]}`;
    return o.name;
  };
  let flashMsg = "", qTimer = null; // qTimer: the quote board replay
  const flash = msg => { flashMsg = msg; };

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
        <span class="gphase ${st.phase}">Round ${st.round} of ${st.rounds} · ${st.phase === "morning" ? "Morning: trade" : "Afternoon: trade, and move or build"}</span>
        <span class="gturn"><i style="background:${p.colour}"></i>${p.name === "You" ? "Your" : esc(p.name) + "'s"} orders</span>
        <span class="gready">${st.players.map(x => `<i title="${esc(x.name)}${st.orders[x.id] ? " is ready" : " is deciding"}" style="background:${x.colour};opacity:${st.orders[x.id] ? 1 : .25}"></i>`).join("")}</span>
        <span class="gsp"></span>
        <button class="gbtn" id="gEnd">Submit${ui.orders.length ? ` ${ui.orders.length} order${ui.orders.length > 1 ? "s" : ""}` : " (no orders)"} →</button>
        <button class="gbtn ghost" id="gNew" title="Start a new game">New game</button>
      </div>
      ${flashMsg ? `<div class="gflash">${esc(flashMsg)}</div>` : ""}
      ${news.length ? `<div class="gnews"><div><b>What happened since your last orders</b><button class="glink" id="gNewsOk">✕</button></div>${news.filter(l => !/^Round \d/.test(l.msg)).slice(-40).map(l => `<span class="${l.pid === p.id ? "mine" : l.pid ? "" : "pub"}">${who(l)}${esc(l.msg)}</span>`).join("")}</div>` : ""}
      <div class="glay">
        <div class="gmain ${st.phase}">
          <div class="gmap" id="gMap"></div>
          <div class="gpanel">
            <div class="gorders"><b>Your orders</b> <span class="muted small">Nothing happens until everyone has submitted; then all orders go through at once.</span>
              <div>${ui.orders.map((o, i) => `<span class="gorder">${orderText(o)}<button data-undo="${i}" title="Remove">✕</button></span>`).join("") || `<span class="muted">None yet.</span>`}</div>
            </div>
            ${st.phase === "afternoon" ? `<div class="gtabs2"><button data-tab="market" class="${ui.tab !== "build" ? "on" : ""}">Market</button><button data-tab="build" class="${ui.tab === "build" ? "on" : ""}">Move or build</button></div>` : ""}
            ${st.phase === "afternoon" && ui.tab === "build" ? afternoonPanel(p) : marketPanel(p)}
          </div>
        </div>
        <aside class="gdash">${dashboard(p)}</aside>
      </div>`;
    flashMsg = "";
    drawMap(p);
    wire(p);
  }

  function renderPass(seat) {
    root.innerHTML = `<div class="gpass">
      <span class="gphase ${st.phase}">Round ${st.round} · ${st.phase}</span>
      <h2><i style="background:${seat.colour}"></i>Pass to ${esc(seat.name)}</h2>
      <p class="muted">Everyone's orders stay secret until they all go through at once.</p>
      <button class="gbtn" id="gImHere">I'm ${esc(seat.name)}: show my orders</button></div>`;
    root.querySelector("#gImHere").addEventListener("click", () => { ui.passed = seat.id; render(); });
  }

  // ----- Dashboard: what's ours, kept compact -----
  // What each of this player's businesses will do at midday, given their orders so far
  // (a dry run of production on a copy of the game; its messages are the forecast)
  function middayPreview(p) {
    if (vw.phase !== "morning") return null;
    const c = JSON.parse(JSON.stringify(vw)); c.log = []; c.drafting = false;
    c.phase = "midday"; G.produce(c);
    return c.log.filter(l => l.pid === p.id).map(l => l.msg);
  }

  // ================= What you own, want, and what the market says =================
  const have = (p, id) => G.have(vw, p, id);
  // Goods this player is after: their contracts and one run of each factory
  const wantsOf = p => {
    const w = {};
    p.contracts.forEach(k => Object.entries(k.goods).forEach(([c, q]) => w[c] = Math.max(w[c] || 0, q)));
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
    return { s, last: a?.price ?? null, chg: a && b ? a.price / b.price - 1 : null };
  };

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

  // Frames for the replay: one per auction (book left afterwards + what traded), then "now" (the public book)
  function boardData() {
    const ids = new Set(st.book.map(o => o.good));
    st.history.forEach(h => { Object.keys(h.trades).forEach(i => ids.add(i)); Object.keys(h.quotes || {}).forEach(i => ids.add(i)); });
    const busy = id => st.history.reduce((s, h) => s + (h.trades[id] ? 2 : 0) + (h.quotes?.[id] ? 1 : 0), 0) + (st.book.some(o => o.good === id) ? 1 : 0);
    const goods = [...ids].sort((a, b) => busy(b) - busy(a) || G.COM[a].name.localeCompare(G.COM[b].name)).slice(0, 24);
    const frames = st.history.map(h => ({
      label: `Round ${h.round} · ${h.phase} auction`,
      q: Object.fromEntries(goods.filter(id => h.quotes?.[id]).map(id => { const x = h.quotes[id]; return [id, [x.bid, x.ask, x.bq || 0, x.aq || 0]]; })),
      t: Object.fromEntries(goods.filter(id => h.trades[id]).map(id => [id, [h.trades[id].price, h.trades[id].qty]])),
    }));
    frames.push({ label: "Now: the book as it stands", now: true, t: {},
      q: Object.fromEntries(goods.map(id => { const b = G.bestBid(st, id), a = G.bestAsk(st, id); return b || a ? [id, [b?.price ?? null, a?.price ?? null, b?.qty || 0, a?.qty || 0]] : null; }).filter(Boolean)) });
    // Each good's price scale, fixed for the whole replay so the bars move rather than the axis
    const scale = {};
    goods.forEach(id => {
      const v = frames.flatMap(f => [f.q[id]?.[0], f.q[id]?.[1], f.t[id]?.[0]]).filter(x => x != null);
      const lo = Math.min(...v), hi = Math.max(...v), pad = Math.max(1, (hi - lo) * 0.15);
      scale[id] = [Math.max(0, lo - pad), hi + pad];
    });
    return { goods, frames, scale };
  }

  // One card's contents for a frame. last: the last trade up to that frame, or null.
  const cardState = (d, id, f, last) => {
    const [lo, hi] = d.scale[id], X = v => ((v - lo) / (hi - lo || 1) * 100).toFixed(1);
    const q = f.q[id] || [null, null, 0, 0], tr = f.t[id];
    return { bid: q[0], ask: q[1], bq: q[2], aq: q[3], last, traded: !!tr, tr, xb: q[0] != null ? X(q[0]) : null, xa: q[1] != null ? X(q[1]) : null, xl: last != null ? X(last) : null };
  };
  const cardHTML = (id, c, flash) => `<button class="qcard${flash ? " flash" : ""}" data-good="${id}">
      <span class="qc-h"><b>${G.COM[id].name}</b><span class="qc-last">${c.tr ? `traded ${c.tr[1]} at ${m(c.tr[0])}` : c.last != null ? `last ${m(c.last)}` : "no trades"}</span></span>
      <span class="qc-bar"><span class="qc-band" style="${c.xb != null && c.xa != null ? `left:${c.xb}%;width:${(c.xa - c.xb).toFixed(1)}%` : "display:none"}"></span>
        <i class="qc-bid" style="${c.xb != null ? `left:${c.xb}%` : "display:none"}"></i><i class="qc-ask" style="${c.xa != null ? `left:${c.xa}%` : "display:none"}"></i>
        <i class="qc-tr" style="${c.xl != null ? `left:${c.xl}%` : "display:none"}"></i></span>
      <span class="qc-n"><span class="b">${c.bid != null ? `bid ${m(c.bid)} <small>×${c.bq}</small>` : "no bids"}</span><span class="sp">${c.bid != null && c.ask != null ? `spread ${m(c.ask - c.bid)}` : ""}</span><span class="a">${c.ask != null ? `ask ${m(c.ask)} <small>×${c.aq}</small>` : "no asks"}</span></span>
    </button>`;

  function quoteBoard(fresh) {
    const d = boardData();
    if (!d.goods.length) return `<section class="msec"><h3>Quote board</h3><p class="muted">No orders or trades yet. Cards appear here as goods get bids and asks.</p></section>`;
    const lastTrade = id => st.lastTrade[id]?.price ?? null, f = d.frames.at(-1);
    ui.board = d; // the replay reads this
    return `<section class="msec qboard">
      <h3>Quote board <span class="muted small">bid ↔ ask for each good; the dot is the last trade</span></h3>
      <div class="qctl"><button class="gbtn ghost" id="qPlay">▶ Replay</button><input type="range" id="qSlide" min="0" max="${d.frames.length - 1}" value="${d.frames.length - 1}" aria-label="Auction">
        <span id="qLabel" class="muted small">${f.label}</span></div>
      <div class="qgrid" id="qGrid">${d.goods.map(id => cardHTML(id, cardState(d, id, f, lastTrade(id)), fresh.has(id))).join("")}</div>
    </section>`;
  }

  // Show frame k of the replay: update each card in place, so the bars slide (CSS transitions)
  function showFrame(k) {
    const d = ui.board, grid = root.querySelector("#qGrid");
    if (!d || !grid) return;
    const f = d.frames[k];
    root.querySelector("#qLabel").textContent = f.label;
    root.querySelector("#qSlide").value = k;
    d.goods.forEach(id => {
      let last = null;
      for (let i = k; i >= 0 && last == null; i--) last = d.frames[i].t[id]?.[0] ?? null;
      const el = grid.querySelector(`.qcard[data-good="${id}"]`), c = cardState(d, id, f, last);
      const tmp = document.createElement("div"); tmp.innerHTML = cardHTML(id, c, false);
      const fresh = tmp.firstElementChild;
      // Keep the element (so transitions run); swap its insides
      el.querySelector(".qc-h").innerHTML = fresh.querySelector(".qc-h").innerHTML;
      el.querySelector(".qc-n").innerHTML = fresh.querySelector(".qc-n").innerHTML;
      ["qc-band", "qc-bid", "qc-ask", "qc-tr"].forEach(cl => el.querySelector("." + cl).setAttribute("style", fresh.querySelector("." + cl).getAttribute("style")));
      el.classList.remove("flash");
      if (c.traded) { void el.offsetWidth; el.classList.add("flash"); } // restart the flash
    });
  }

  // ================= Sidebar =================
  function dashboard(p) {
    const locked = G.lockedCash(vw, p);
    const biz = G.myBusinesses(vw, p.id);
    const mine = Object.entries(p.stock).sort((a, b) => b[1] - a[1]);
    const pv = middayPreview(p);
    const canDiscard = p.discardRound !== st.round;
    return `
      <div class="dtop">
        <div><span>Points</span><b>${p.points}</b></div>
        <div><span>Cash</span><b>${m(p.cash)}</b>${locked ? `<small class="muted">+${m(locked)} in buy orders</small>` : ""}</div>
      </div>
      <div class="dsec">
        <h4>Contracts <em>${p.delivered || 0} delivered</em></h4>
        ${p.contracts.map(k => {
          const ok = G.canDeliver(vw, p, k);
          return `<div class="dcon${ok ? " ready" : ""}">
            <div class="dcon-h"><b>${k.points} pts</b>
              <span><button class="glink" data-deliver="${k.id}" ${ok ? "" : "disabled"} title="${ok ? "Hand the goods over now" : "You don't have all of it yet (goods on offer don't count)"}">Deliver</button>
              <button class="glink" data-discard="${k.id}" ${canDiscard ? "" : "disabled"} title="${canDiscard ? "Throw it away; a new one comes overnight (one a round)" : "You've already thrown one away this round"}">✕</button></span></div>
            ${Object.entries(k.goods).map(([c, q]) => { const h = have(p, c); return `<button class="dgood ${h >= q ? "ok" : ""}" data-good="${c}" title="Open ${G.COM[c].name} in the market">${Math.min(h, q)}/${q} ${G.COM[c].name}</button>`; }).join("")}
          </div>`;
        }).join("") || `<p class="dnone">None. New ones come overnight.</p>`}
      </div>
      <div class="dsec">
        <h4>Businesses <em>${biz.length} · each holds ${S.businessSpace}</em></h4>
        ${biz.map(b => {
          const t = G.BIZ_BY[b.type], held = Object.entries(b.stock || {}), used = held.reduce((s, [, q]) => s + q, 0);
          const miss = t.kind === "factory" ? G.inputsFor(vw, p, t).missing : [];
          return `<div class="dbiz"><span class="bicon" style="background:${p.colour}"><svg viewBox="0 0 24 24">${iconSVG(BIZ_ICON[t.id], 12, 12, 18)}</svg></span>
            <b>${t.name}</b> <span class="muted">${G.TERR[b.territory].name}</span>
            ${S.businessStock ? `<span class="dcap" title="${used} of ${S.businessSpace} units"><i style="width:${Math.min(100, used / S.businessSpace * 100)}%" class="${used >= S.businessSpace ? "full" : ""}"></i></span>
            <span class="dheld">${held.map(([c, q]) => `<button class="dgood" data-good="${c}" title="Sell it">${q} ${G.COM[c].name}</button>`).join("") || `<span class="muted">empty</span>`}${used >= S.businessSpace ? ` <b class="bad">full</b>` : ""}</span>` : ""}
            ${miss.length ? `<span class="bad">needs ${miss.map(([c, n]) => `${n} ${G.COM[c].name}`).join(", ")}</span>` : ""}</div>`;
        }).join("") || `<p class="dnone">None</p>`}
        ${pv && pv.length ? `<div class="dprev"><b>At midday</b>${pv.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="dsec">
        <h4>Your stockpile <em>${S.unlimitedSpace ? "no limit" : `${G.used(p) + G.offered(vw, p)}/${p.space}`}</em></h4>
        ${mine.length ? `<div class="dchips">${mine.map(([c, q]) => `<button class="dgood" data-good="${c}">${q} ${G.COM[c].name}</button>`).join("")}</div>` : `<p class="dnone">Empty. What you buy comes here.</p>`}
        ${G.offered(vw, p) ? `<p class="dhint">${G.offered(vw, p)} more on offer in sell orders.</p>` : ""}
      </div>
      <div class="dsec">
        <h4>Players</h4>
        ${G.ranking(st).map(x => `<div class="dplayer${x.id === p.id ? " me" : ""}"><span><i style="background:${x.colour}"></i>${x.id === p.id ? "You" : esc(x.name)}</span>
          <span class="muted">${G.myBusinesses(st, x.id).map(b => G.BIZ_BY[b.type].name.toLowerCase()).join(", ") || "no businesses"} · ${m(G.totalCash(st, x))} cash</span><b>${x.points} pts</b></div>`).join("")}
      </div>`;
  }

  // ================= The market =================
  // Built around three questions: can I sell what I make, can I get what I need, and what's moving?
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
      const demand = bid ? `<span class="mtag good">Bid ${m(bid.price)} ×${bid.qty}</span>`
        : users.length ? `<span class="mtag">No bids · ${names(users)} could use it</span>`
        : G.isMaterial(id) ? `<span class="mtag">No bids · anyone can build with it</span>`
        : contractGood(id) ? `<span class="mtag">No bids · contracts can ask for it</span>`
        : `<span class="mtag warn">⚠ Nobody else can use it now</span>`;
      return `<button class="mcard${id === sel ? " sel" : ""}${fresh.has(id) ? " flash" : ""}" data-good="${id}">
        <span class="mc-top"><b>${G.COM[id].name}</b><span class="mc-qty">${spare > 0 ? spare : 0}${off ? ` <small>+${off} on offer</small>` : ""}</span></span>
        <span class="mc-where">${whereIs(p, id).map(x => `${x.qty} ${x.label === "your stockpile" ? "in" : "at"} ${x.label.toLowerCase()}`).join(" · ") || "all on offer"}</span>
        <span class="mc-mid">${spark(s)}<span class="mc-px">${last != null ? `<b>${m(last)}</b>${chg != null ? ` <small class="${chg > 0 ? "up" : chg < 0 ? "dn" : ""}">${pct(chg)}</small>` : ""}` : `<small class="muted">never traded</small>`}</span></span>
        ${demand}</button>`;
    };
    const buyCard = id => {
      const ask = G.bestAsk(vw, id), { s, last, chg } = lastBits(id), makers = makersOf(p, id);
      const need = Math.max(0, (want[id] || 0) - (hold[id] || 0)), bidding = myOrders.filter(o => o.side === "buy" && o.good === id).reduce((x, o) => x + o.qty, 0);
      const why = [p.contracts.some(k => k.goods[id]) ? "contract" : "", needsOf(p)[id] ? "factory input" : ""].filter(Boolean).join(" + ");
      const supply = ask ? `<span class="mtag good">Ask ${m(ask.price)} ×${ask.qty}</span>`
        : makers.length ? `<span class="mtag">Nobody selling · ${names(makers)} make${makers.length === 1 ? "s" : ""} it</span>`
        : `<span class="mtag warn">⚠ Nobody makes it yet</span>`;
      return `<button class="mcard${id === sel ? " sel" : ""}${fresh.has(id) ? " flash" : ""}" data-good="${id}">
        <span class="mc-top"><b>${G.COM[id].name}</b><span class="mc-qty">${need ? `need ${need}` : "✓"}${bidding ? ` <small>bidding ${bidding}</small>` : ""}</span></span>
        <span class="mc-where">${why || "you're bidding"}${hold[id] ? ` · have ${hold[id]}` : ""}</span>
        <span class="mc-mid">${spark(s)}<span class="mc-px">${last != null ? `<b>${m(last)}</b>${chg != null ? ` <small class="${chg > 0 ? "up" : chg < 0 ? "dn" : ""}">${pct(chg)}</small>` : ""}` : `<small class="muted">never traded</small>`}</span></span>
        ${supply}</button>`;
    };
    const movers = Object.entries(moved).sort((a, b) => b[1] - a[1]);
    const rows = COMMODITIES.filter(c => !ui.search || c.name.toLowerCase().includes(ui.search));
    return `
      <div class="mstats">
        <div><span>Last auction</span><b>${last ? `${Object.keys(last.trades).length} good${Object.keys(last.trades).length === 1 ? "" : "s"}` : "–"}</b><small>${last ? `${Object.values(last.trades).reduce((s, t) => s + t.qty, 0)} units · round ${last.round} ${last.phase}` : "no auctions yet"}</small></div>
        <div><span>Goods with orders</span><b>${live}</b><small>of 50 on the book</small></div>
        <div><span>Your orders</span><b>${myOrders.length}</b><small>${G.lockedCash(vw, p) ? `${m(G.lockedCash(vw, p))} cash locked` : "nothing locked"}</small></div>
      </div>
      <p class="muted small">One sealed auction at the end of this phase: each good trades at a single price, where the most units change hands. Orders stay until they fill or you cancel.</p>
      ${sel ? ticket(p, sel, want) : ""}
      ${quoteBoard(fresh)}
      <section class="msec"><h3>Sell what you make</h3>
        ${sellIds.length ? `<div class="mgrid">${sellIds.map(sellCard).join("")}</div>` : `<p class="muted">Nothing spare right now.</p>`}</section>
      <section class="msec"><h3>Buy what you need <span class="muted small">for your contracts and factories</span></h3>
        ${buyIds.length ? `<div class="mgrid">${buyIds.map(buyCard).join("")}</div>` : `<p class="muted">You have everything your contracts and factories need.</p>`}</section>
      <section class="msec"><h3>What's trading <span class="muted small">last ${recent.length || 6} auctions</span></h3>
        ${movers.length ? `<table class="gmkt mmovers"><thead><tr><th>Good</th><th>Price</th><th class="n">Last</th><th class="n">Change</th><th class="n">Units</th><th class="n">Bid / ask now</th></tr></thead><tbody>
          ${movers.map(([id, vol]) => { const { s, last, chg } = lastBits(id), q = G.quote(vw, id);
            return `<tr data-good="${id}" class="${fresh.has(id) ? "flash" : ""}"><td>${G.COM[id].name}</td><td>${spark(s.slice(-12), 80, 20)}</td><td class="n"><b>${m(last)}</b></td>
              <td class="n ${chg > 0 ? "up" : chg < 0 ? "dn" : ""}">${chg != null ? pct(chg) : "–"}</td><td class="n">${vol}</td>
              <td class="n">${q.bid != null ? m(q.bid) : "–"} / ${q.ask != null ? m(q.ask) : "–"}</td></tr>`; }).join("")}
        </tbody></table>` : `<p class="muted">Nothing has traded yet. The first trades set the first prices.</p>`}</section>
      <details class="msec mall" ${ui.allOpen ? "open" : ""}><summary><h3>All 50 goods</h3></summary>
        <input class="gsearch" id="gSearch" placeholder="Search" value="${esc(ui.search)}">
        <table class="gmkt gbook-list"><thead><tr><th>Good</th><th class="n">Bid</th><th class="n">Ask</th><th class="n">Last</th><th class="n">Have</th><th class="n">Want</th><th>Made by</th></tr></thead><tbody>
        ${rows.map(c => { const q = G.quote(vw, c.id), mk = makersOf(p, c.id);
          return `<tr data-good="${c.id}" class="${c.id === sel ? "sel" : ""}"><td>${c.name}</td>
            <td class="n">${q.bid != null ? `${m(q.bid)} <small>×${q.bids[0].qty}</small>` : "–"}</td><td class="n">${q.ask != null ? `${m(q.ask)} <small>×${q.asks[0].qty}</small>` : "–"}</td>
            <td class="n">${q.last ? m(q.last.price) : "–"}</td><td class="n">${hold[c.id] || ""}</td><td class="n">${want[c.id] || ""}</td>
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
    return `<div class="pchart" data-pts='${JSON.stringify(s.map((x, i) => ({ x: X(i), y: Y(x.price), t: `Round ${x.round} ${x.phase}: ${x.qty} at ${m(x.price)}` })))}'>
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

  // The order book as a depth chart: sell orders as bars to the right above the centre line, buy orders
  // to the left below it, best prices nearest the middle, and the bid/ask spread as a band between them.
  // Each bar is the running total from the best price outwards (how much you could trade going that
  // far), so the book's shape shows how deep it is. Rows are price levels in order, evenly spaced.
  function depthChart(q, yours) {
    const N = 8, asks = q.asks.slice(0, N), bids = q.bids.slice(0, N);
    if (!asks.length && !bids.length) return `<p class="muted small">No orders on the book yet. Place the first one.</p>`;
    const cum = list => { let s = 0; return list.map(x => ({ ...x, cum: s += x.qty })); };
    const A = cum(asks).reverse(), B = cum(bids); // asks: highest price at the top
    const W = 320, cx = W / 2, rowH = 15, gap = 4, head = 18, bandH = 26, half = cx - 46;
    const maxCum = Math.max(A[0]?.cum || 0, B.at(-1)?.cum || 0, 1);
    const aRows = Math.max(A.length, 1), bRows = Math.max(B.length, 1);
    const yA = i => head + i * (rowH + gap), bandTop = head + aRows * (rowH + gap), bandBot = bandTop + bandH;
    const yB = i => bandBot + gap + i * (rowH + gap), H = yB(bRows) + head - gap;
    const w = x => Math.max(2, x.cum / maxCum * half);
    const tip = (x, side) => `${x.qty} ${side === "sell" ? "for sale" : "wanted"} at ${m(x.price)}${yours(side, x.price) ? ` (${yours(side, x.price)} yours)` : ""} · ${x.cum} in all at ${m(x.price)} or ${side === "sell" ? "less" : "more"}`;
    const row = (x, y, side) => {
      const bw = w(x), mine = yours(side, x.price), sell = side === "sell";
      const bx = sell ? cx : cx - bw;
      return `<g class="drow ${side}" data-tip="${tip(x, side)}">
        <rect class="hit" x="0" y="${y - gap / 2}" width="${W}" height="${rowH + gap}"/>
        <rect class="bar" x="${bx.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${rowH}" rx="3"/>
        <text class="px" x="${sell ? cx - 6 : cx + 6}" y="${y + rowH - 4}" text-anchor="${sell ? "end" : "start"}">${m(x.price)}</text>
        <text class="qt" x="${sell ? bx + bw + 4 : bx - 4}" y="${y + rowH - 4}" text-anchor="${sell ? "start" : "end"}">${x.qty}${mine ? " ●" : ""}</text></g>`;
    };
    const spread = q.spread != null ? `Spread ${m(q.ask - q.bid)} · ${Math.round(q.spread * 100)}%` : q.last ? `One side empty · last trade ${m(q.last.price)}` : "One side empty";
    return `<div class="depth"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Order book. Asks: ${asks.map(x => `${x.qty} at ${m(x.price)}`).join(", ") || "none"}. Bids: ${bids.map(x => `${x.qty} at ${m(x.price)}`).join(", ") || "none"}.">
      <text class="lbl" x="${cx + 6}" y="12">Sell orders (asks)</text>
      ${A.map((x, i) => row(x, yA(i), "sell")).join("") || `<text class="none" x="${cx + 8}" y="${yA(0) + rowH - 4}">Nobody selling</text>`}
      <rect class="band" x="4" y="${bandTop}" width="${W - 8}" height="${bandH}"/>
      <line class="edge sell" x1="4" x2="${W - 4}" y1="${bandTop}" y2="${bandTop}"/><line class="edge buy" x1="4" x2="${W - 4}" y1="${bandBot}" y2="${bandBot}"/>
      <text class="sp" x="10" y="${bandTop + bandH / 2 + 4}">↕ ${spread}</text>
      ${B.map((x, i) => row(x, yB(i), "buy")).join("") || `<text class="none" x="${cx - 8}" y="${yB(0) + rowH - 4}" text-anchor="end">Nobody buying</text>`}
      <text class="lbl" x="${cx - 6}" y="${H - 4}" text-anchor="end">Buy orders (bids)</text>
      <line class="axis" x1="${cx}" x2="${cx}" y1="${head - 4}" y2="${H - head + 4}"/>
    </svg><div class="ptip" hidden></div>
    <p class="muted small dnote">Bars add up from the best price outwards; the number is the amount at that price. ● = includes yours.</p></div>`;
  }

  // One good: who makes and uses it, its book, price history, your orders and the order form
  function ticket(p, id, want) {
    const q = G.quote(vw, id), c = G.COM[id];
    const hold = have(p, id);
    const t = ui.ticket[id] ||= { side: hold > (want[id] || 0) ? "sell" : "buy", price: "", qty: "" };
    const yours = (side, price) => vw.book.filter(o => o.pid === p.id && o.good === id && o.side === side && o.price === price).reduce((s, o) => s + o.qty, 0);
    const myOrders = vw.book.filter(o => o.pid === p.id && o.good === id);
    const isNew = o => !st.book.some(x => x.id === o.id);
    const suggest = t.side === "buy" ? q.ask ?? q.last?.price ?? q.bid : q.bid ?? q.last?.price ?? q.ask;
    const makers = makersOf(p, id), users = usersOf(p, id);
    const standIn = b => Object.keys(b.inputs).find(x => G.substitutesFor(b, x).some(([y]) => y === id));
    const usedBy = G.BIZ.filter(b => usesGood(b, id)).map(b => `${b.name.toLowerCase()}${b.inputs[id] ? "" : ` <i>instead of ${G.COM[standIn(b)].name.toLowerCase()}</i>`}`);
    return `<div class="gticket">
      <div class="ghead"><h3>${c.name}</h3><span class="muted">${q.last ? `last ${m(q.last.price)} · ${q.volume} traded in the last 3 rounds` : "never traded"}${q.spread != null ? ` · spread ${Math.round(q.spread * 100)}%` : ""}</span><span class="gsp"></span><button class="glink" id="gTicketClose" title="Close">✕</button></div>
      <div class="tfacts">
        <div><span>You have</span><b>${hold}</b>${whereIs(p, id).length > 1 || (whereIs(p, id)[0] && whereIs(p, id)[0].label !== "your stockpile") ? `<small>${whereIs(p, id).map(x => `${x.qty} ${x.label === "your stockpile" ? "in" : "at"} ${x.label.toLowerCase()}`).join(", ")}</small>` : ""}</div>
        <div><span>Made by</span><b>${makers.length ? names(makers) : "nobody else"}</b></div>
        <div><span>Others who could use it</span><b>${users.length ? names(users) : "nobody yet"}</b><small>${[G.isMaterial(id) ? "building material" : "", contractGood(id) ? "contracts can ask for it" : ""].filter(Boolean).join(" · ")}</small></div>
      </div>
      <p class="small muted tused">Used by: ${usedBy.join(" · ") || "no factory"}</p>
      <div class="tcharts">
        <div><h4>Order book</h4>${depthChart(q, yours)}</div>
        <div><h4>Price history</h4>${priceChart(id)}</div>
      </div>
      <div class="gtwo">
        <div>
          <h4>New order</h4>
          <div class="gseg"><button data-side="buy" class="${t.side === "buy" ? "on" : ""}">Buy</button><button data-side="sell" class="${t.side === "sell" ? "on" : ""}">Sell</button></div>
          <div class="gform">
            <label>Price each <input type="number" id="gPrice" min="1" step="1" value="${t.price || (suggest != null ? suggest : "")}" placeholder="price"></label>
            <label>Quantity <input type="number" id="gQty" min="1" step="1" value="${t.qty || (t.side === "sell" ? hold : Math.max(1, (want[id] || 0) - hold)) || 1}"></label>
            <button class="gbtn" id="gPlace">${t.side === "buy" ? "Place buy order" : "Place sell order"}</button>
          </div>
          <p class="muted small">${t.side === "buy" ? `Locks price × quantity of your cash (${m(p.cash)} free) until it fills or you cancel. What you buy goes to your stockpile.` : `Takes the goods from your businesses first, then your stockpile: you have ${hold} not already on offer.`}</p>
        </div>
        <div>
          <h4>Your orders for this good</h4>
          ${myOrders.map(o => `<div class="gpos">${o.side === "buy" ? "Buy" : "Sell"} ${o.qty} at ${m(o.price)}${isNew(o) ? ` <em>new</em>` : ""}<button data-cancel="${o.id}" data-new="${isNew(o) ? 1 : ""}">Cancel</button></div>`).join("") || `<p class="muted small">None.</p>`}
        </div>
      </div>
    </div>`;
  }

  // ----- Afternoon: move or build (paid in goods) -----
  // Building materials: what you have to build with, and what's stopping you
  const cheapestOf = list => list.map(c => ({ c, px: (G.bestAsk(vw, c)?.price ?? st.lastTrade[c]?.price ?? 999) / S.build.materials[c] })).sort((a, b) => a.px - b.px)[0].c;
  const buyLink = list => { const c = cheapestOf(list), a = G.bestAsk(vw, c); return `<button class="glink blink" data-good="${c}">${G.COM[c].name.toLowerCase()}${a ? ` (ask ${m(a.price)})` : ""}</button>`; };
  function materialsBox(p) {
    const M = S.build.materials, hold = G.holdings(vw, p);
    const mats = G.MATERIALS.filter(c => hold[c]);
    const total = mats.reduce((s, c) => s + hold[c] * M[c], 0), heavy = S.build.heavy.goods.reduce((s, c) => s + (hold[c] || 0) * M[c], 0);
    const locked = G.MATERIALS.map(c => [c, onOffer(p, c)]).filter(([, n]) => n);
    return `<div class="matbox">
      <div><b>Your building materials: ${m(total)}</b>${heavy ? ` <span class="muted">(${m(heavy)} heavy)</span>` : ""}
        ${mats.length ? `<span class="muted"> · ${mats.map(c => `${hold[c]} ${G.COM[c].name.toLowerCase()}`).join(", ")}</span>` : ` <span class="bad">none</span>`}</div>
      ${locked.length ? `<div class="bad small">${locked.map(([c, n]) => `${n} ${G.COM[c].name.toLowerCase()}`).join(", ")} in your sell orders: cancel them to build with it.</div>` : ""}
      <div class="muted small">A business costs a number of materials. Lumber, iron, ceramic, cement and glass count 1 each, steel and aluminium 2, concrete ½. Big factories need half in heavy ones (steel, glass, concrete, aluminium). Materials your contracts ask for are used last.</div>
    </div>`;
  }

  function afternoonPanel(p) {
    const here = p.pos, info = TERRITORY_INFO[here];
    const opts = G.buildable(vw, here, p.id).sort((a, b) => G.bizTier(a.b) - G.bizTier(b.b) || a.b.name.localeCompare(b.b.name));
    const res = Object.entries(info.res).sort((a, b) => b[1] - a[1]);
    const io = b => b.kind === "extract" ? `makes ${Math.floor(b.outputs[b.makes] * G.richness(b, here) * S.extractOutput)} ${G.COM[b.makes].name}`
      : `${Object.entries(b.inputs).map(([c, q]) => `${q} ${G.COM[c].name}`).join(" + ")} → ${Object.entries(b.outputs).map(([c, q]) => `${q} ${G.COM[c].name}`).join(" + ")}`;
    return `
      <div class="ghead"><h3>${G.TERR[here].name}</h3><span class="muted">${G.isSea(here) ? "Sea" : G.coastal(here) ? "Coastal" : "Inland"} · cost level ×${info.cost ?? 1}${res.length ? " · " + res.map(([c, r]) => `${G.COM[c].name} ${"★".repeat(r)}`).join(", ") : ""}</span></div>
      <h4 class="gsub">${p.acted ? "Done for this afternoon ✓" : "Move <span class=\"muted\">(or click the map)</span>"}</h4>
      <div class="gmoves">${G.neighbours(here).map(t => `<button data-move="${t}" ${p.acted ? "disabled" : ""}>${G.TERR[t].name}</button>`).join("")}</div>
      <h4 class="gsub">…or build here</h4>
      ${materialsBox(p)}
      ${opts.length ? `<table class="gmkt"><thead><tr><th>Business</th><th>Each round</th><th class="n">Materials</th><th>You'd use</th><th></th></tr></thead><tbody>
        ${opts.map(o => { const r = G.payFor(vw, p, o.cost); return `<tr><td>${o.b.name}</td><td class="muted small">${io(o.b)}</td>
          <td class="n">${o.cost.crates}${o.cost.heavy ? `<small> (${o.cost.heavy} heavy)</small>` : ""}</td>
          <td class="small">${r.short ? `<span class="bad">${r.short} short${r.heavyShort ? `, ${r.heavyShort} of them heavy` : ""}</span> · buy ${buyLink(r.heavyShort ? S.build.heavy.goods : G.MATERIALS)}` : G.costText(r.pay)}</td>
          <td class="acts"><button data-build="${o.b.id}" ${p.acted || r.short ? "disabled" : ""} title="${p.acted ? "You've already moved or built this afternoon" : r.short ? "Not enough building materials" : "Build it"}">Build</button></td></tr>`; }).join("")}
      </tbody></table>` : `<p class="muted">Nothing can be built here.</p>`}`;
  }

  // ----- Map -----
  function drawMap(p) {
    const FID = "tOutlineGame";
    let { svg, below } = europeMapSVG(FID);
    const near = vw.phase === "afternoon" && !p.acted ? G.neighbours(p.pos) : [];
    // Highlights go in the top layer: where you are, and (afternoon) where you can move
    svg = svg.replace(`<g class="hl"></g></svg>`, `<g class="hl">${near.map(t => mapHighlightSVG(FID, t, "near")).join("")}${mapHighlightSVG(FID, p.pos, "here")}</g>`);
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
      if (near.includes(t)) { g.classList.add("near"); g.addEventListener("click", () => doAct("move", { to: t })); }
    });
  }

  // ----- Clicks -----
  function wire(p) {
    root.querySelector("#gEnd").addEventListener("click", () => {
      const before = st.log.length, who = ui.seat;
      const r = G.submit(st, ui.seat, ui.orders);
      if (!r.ok) { flash(r.msg); return render(); }
      ui.orders = []; ui.card = null;
      ui.seenBy[who] = before; // next time they look, show everything since they submitted
      save(); render();
    });
    root.querySelector("#gNewsOk")?.addEventListener("click", () => { ui.seenBy[ui.seat] = st.log.length; render(); });
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
    root.querySelectorAll("[data-good]").forEach(el => el.addEventListener("click", () => {
      const fromSide = !!el.closest(".gdash");
      ui.good = !fromSide && ui.good === el.dataset.good ? null : el.dataset.good; ui.tab = "market"; render();
      if (ui.good) root.querySelector(".gticket")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }));
    root.querySelector("#gTicketClose")?.addEventListener("click", () => { ui.good = null; render(); });
    root.querySelector(".mall")?.addEventListener("toggle", e => ui.allOpen = e.target.open);
    // Quote board replay: ▶ steps through the auctions, one every 0.7s; the slider jumps to any of them
    clearInterval(qTimer); qTimer = null;
    const qPlay = root.querySelector("#qPlay"), qSlide = root.querySelector("#qSlide");
    const stopReplay = () => { clearInterval(qTimer); qTimer = null; if (qPlay) qPlay.textContent = "▶ Replay"; };
    qSlide?.addEventListener("input", () => { stopReplay(); showFrame(+qSlide.value); });
    qPlay?.addEventListener("click", () => {
      if (qTimer) return stopReplay();
      const end = ui.board.frames.length - 1;
      let k = +qSlide.value >= end ? 0 : +qSlide.value;
      showFrame(k); qPlay.textContent = "❚❚ Pause";
      qTimer = setInterval(() => { if (++k > end) return stopReplay(); showFrame(k); }, 700);
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
    root.querySelectorAll("[data-discard]").forEach(b => b.addEventListener("click", () => { if (confirm("Throw this contract away? A new one comes overnight.")) doAct("discardContract", { contract: +b.dataset.discard }); }));
    // Afternoon
    root.querySelectorAll("[data-move]").forEach(b => b.addEventListener("click", () => doAct("move", { to: b.dataset.move })));
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
  st = saved && saved.version === 6 && !saved.over ? saved : null;
  render();
})();
