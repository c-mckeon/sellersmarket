// Sellers Market: the Game tab. Draws the game and turns clicks into engine actions.
// All the rules live in the engine (game/*.js); this file only displays and asks.

(() => {
  const G = SMG, S = GAME_SETTINGS;
  const KEY = "sellersmarket-game-v1";
  const root = document.getElementById("game");
  if (!root) return;
  let st = null, ui = { filter: "mine", search: "", card: null, good: null, ticket: {}, tab: "market" };

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
        <p class="muted">Pick who's playing. Each player starts with ${S.startCash} cash, ${S.startSpace} crates of stockpile space, ${S.startBusinesses > 1 ? "two free businesses where they start (the one picked here and the one that uses its output)" : "one free business where they start"}, and ${S.contracts.hand} secret contracts. Deliver contracts to score points; most points after the last round wins, and cash breaks ties. There's no price list: every price comes from what players bid and ask.</p>
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
  let flashMsg = "";
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
  // What midday will do to this player's stockpile, given their orders so far
  function middayPreview(p) {
    if (vw.phase !== "morning") return null;
    const c = JSON.parse(JSON.stringify(vw)); c.log = []; c.drafting = false; // keep its log: it says what gets thrown away
    const before = { ...G.player(c, p.id).stock };
    c.phase = "midday"; G.produce(c);
    const after = G.player(c, p.id).stock, delta = {};
    new Set([...Object.keys(before), ...Object.keys(after)]).forEach(k => { const d = (after[k] || 0) - (before[k] || 0); if (d) delta[k] = d; });
    const lost = c.log.filter(l => l.pid === p.id && /threw away/.test(l.msg)).map(l => l.msg.replace(/^stockpile full: threw away /, ""));
    return { delta, lost, used: G.used(G.player(c, p.id)) };
  }

  // Goods this player is after: their contracts and one run of each factory
  const wantsOf = p => {
    const w = {};
    p.contracts.forEach(k => Object.entries(k.goods).forEach(([c, q]) => w[c] = Math.max(w[c] || 0, q)));
    Object.entries(needsOf(p)).forEach(([c, q]) => w[c] = (w[c] || 0) + q);
    return w;
  };
  const onOffer = (p, id) => vw.book.filter(o => o.pid === p.id && o.side === "sell" && o.good === id).reduce((s, o) => s + o.qty, 0);

  function dashboard(p) {
    const used = G.used(p), locked = G.lockedCash(vw, p), offered = G.offered(vw, p);
    const biz = G.myBusinesses(vw, p.id);
    const stock = Object.entries(p.stock).sort((a, b) => b[1] - a[1]);
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
          const ok = G.canDeliver(p, k);
          return `<div class="dcon${ok ? " ready" : ""}">
            <div class="dcon-h"><b>${k.points} pts</b>
              <span><button class="glink" data-deliver="${k.id}" ${ok ? "" : "disabled"} title="${ok ? "Hand the goods over now" : "You don't have all of it yet (goods on offer don't count)"}">Deliver</button>
              <button class="glink" data-discard="${k.id}" ${canDiscard ? "" : "disabled"} title="${canDiscard ? "Throw it away; a new one comes overnight (one a round)" : "You've already thrown one away this round"}">✕</button></span></div>
            ${Object.entries(k.goods).map(([c, q]) => { const h = p.stock[c] || 0; return `<span class="${h >= q ? "ok" : ""}">${Math.min(h, q)}/${q} ${G.COM[c].name}</span>`; }).join("")}
          </div>`;
        }).join("") || `<p class="dnone">None. New ones come overnight.</p>`}
      </div>
      <div class="dsec">
        <h4>Stockpile <em>${used + offered}/${p.space}</em></h4>
        <div class="dspace"><span style="width:${Math.min(100, (used + offered) / p.space * 100)}%"></span></div>
        ${stock.length ? `<div class="dchips">${stock.map(([c, q]) => `<span>${q} ${G.COM[c].name}</span>`).join("")}</div>` : `<p class="dnone">Empty</p>`}
        ${offered ? `<p class="dhint">${offered} more on offer in sell orders (still in your stockpile).</p>` : ""}
        ${pv ? `<div class="dprev"><b>At midday:</b> ${Object.entries(pv.delta).map(([c, d]) => `<span class="${d > 0 ? "up" : "dn"}">${d > 0 ? "+" : "−"}${Math.abs(d)} ${G.COM[c].name}</span>`).join(" ") || "nothing changes"}
          ${pv.lost.length ? `<div class="dlost">⚠ Full: you'll throw away ${esc(pv.lost.join("; "))}</div>` : ""}</div>` : ""}
      </div>
      <div class="dsec">
        <h4>Businesses <em>${biz.length}</em></h4>
        ${biz.map(b => {
          const t = G.BIZ_BY[b.type];
          const miss = Object.entries(t.inputs).filter(([c, q]) => (p.stock[c] || 0) < q);
          return `<div class="dbiz"><span class="bicon" style="background:${p.colour}"><svg viewBox="0 0 24 24">${iconSVG(BIZ_ICON[t.id], 12, 12, 18)}</svg></span><b>${t.name}</b> <span class="muted">${G.TERR[b.territory].name}</span>
            <span class="${miss.length ? "bad" : "ok"}">${t.kind === "extract" ? "✓ ready" : miss.length ? "needs " + miss.map(([c, q]) => `${q - (p.stock[c] || 0)} ${G.COM[c].name}`).join(", ") : "✓ inputs ready"}</span></div>`;
        }).join("") || `<p class="dnone">None</p>`}
      </div>
      <div class="dsec">
        <h4>Players</h4>
        ${G.ranking(st).map(x => `<div class="dplayer${x.id === p.id ? " me" : ""}"><span><i style="background:${x.colour}"></i>${x.id === p.id ? "You" : esc(x.name)}</span>
          <span class="muted">${G.TERR[x.pos].name} · ${G.myBusinesses(st, x.id).length} business${G.myBusinesses(st, x.id).length === 1 ? "" : "es"} · ${m(G.totalCash(st, x))} cash</span><b>${x.points} pts</b></div>`).join("")}
      </div>`;
  }

  // ----- The market: one sealed auction at the end of every phase -----
  // The list shows every good's book at a glance; clicking one opens its book and an order ticket.
  // The book shown is the public one plus your own new orders (everyone else's new orders stay secret
  // until the auction).
  function marketPanel(p) {
    const want = wantsOf(p);
    const mine = c => p.stock[c.id] || want[c.id] || onOffer(p, c.id) || vw.book.some(o => o.pid === p.id && o.good === c.id);
    const anyMine = COMMODITIES.some(mine);
    const filter = anyMine ? ui.filter : "all";
    const rows = COMMODITIES.filter(c => ui.search ? c.name.toLowerCase().includes(ui.search) : filter === "all" || mine(c));
    const sel = ui.good && G.COM[ui.good] ? ui.good : null;
    return `
      <div class="ghead">
        <h3>Market</h3>
        <div class="gseg"><button data-f="mine" class="${filter === "mine" ? "on" : ""}" ${anyMine ? "" : "disabled"}>Mine &amp; wanted</button><button data-f="all" class="${filter === "all" ? "on" : ""}">All 50</button></div>
        <input class="gsearch" id="gSearch" placeholder="Search" value="${esc(ui.search)}">
      </div>
      <p class="muted small">At the end of this phase every good trades at a single price: the one where the most units change hands. Everyone who trades gets that price; if you bid more, you pay less. Orders stay on the book until they fill or you cancel them.</p>
      ${sel ? ticket(p, sel, want) : ""}
      <table class="gmkt gbook-list"><thead><tr><th>Good</th><th class="n">Bid</th><th class="n">Ask</th><th class="n">Last</th><th class="n" title="Units traded in the last 3 rounds">Vol</th><th class="n">Have</th><th class="n">Want</th></tr></thead><tbody>
      ${rows.map(c => {
        const q = G.quote(vw, c.id, 6), have = p.stock[c.id] || 0, mineHere = vw.book.some(o => o.pid === p.id && o.good === c.id);
        return `<tr data-good="${c.id}" class="${c.id === sel ? "sel" : ""}"><td>${c.name}${mineHere ? ` <span class="gmine" title="You have orders here">●</span>` : ""}</td>
          <td class="n">${q.bid != null ? `${m(q.bid)} <small>×${q.bids[0].qty}</small>` : "–"}</td>
          <td class="n">${q.ask != null ? `${m(q.ask)} <small>×${q.asks[0].qty}</small>` : "–"}</td>
          <td class="n">${q.last ? m(q.last.price) : "–"}</td><td class="n">${q.volume || ""}</td>
          <td class="n">${have || ""}${onOffer(p, c.id) ? `<small> +${onOffer(p, c.id)}</small>` : ""}</td><td class="n">${want[c.id] || ""}</td></tr>`;
      }).join("") || `<tr><td colspan="7" class="muted">Nothing here yet. Try "All 50".</td></tr>`}
      </tbody></table>`;
  }

  // One good: its book, recent trades, your orders and the order form
  function ticket(p, id, want) {
    const q = G.quote(vw, id, 6), c = G.COM[id];
    const t = ui.ticket[id] ||= { side: (p.stock[id] || 0) > (want[id] || 0) ? "sell" : "buy", price: "", qty: "" };
    const yours = (side, price) => vw.book.filter(o => o.pid === p.id && o.good === id && o.side === side && o.price === price).reduce((s, o) => s + o.qty, 0);
    const lv = (x, side) => { const y = yours(side, x.price); return `<tr class="${side}"><td class="n">${side === "sell" ? m(x.price) : ""}</td><td class="n">${x.qty - y || ""}${y ? ` <b class="gmine">+${y} yours</b>` : ""}</td><td class="n">${side === "buy" ? m(x.price) : ""}</td></tr>`; };
    const asks = q.asks.slice(0, 6).reverse(), bids = q.bids.slice(0, 6);
    const trades = st.history.filter(h => h.trades[id]).slice(-6).reverse();
    const myOrders = vw.book.filter(o => o.pid === p.id && o.good === id);
    const isNew = o => !st.book.some(x => x.id === o.id);
    const suggest = t.side === "buy" ? q.ask ?? q.last?.price ?? q.bid : q.bid ?? q.last?.price ?? q.ask;
    const have = p.stock[id] || 0;
    // Who could want it: the factories that use it, and who owns one (public: they're on the map)
    const users = G.BIZ.filter(b => b.inputs[id]).map(b => {
      const owners = [...new Set(vw.businesses.filter(x => x.type === b.id).map(x => x.owner))].map(o => o === p.id ? "you" : esc(G.player(vw, o).name));
      return `${b.name.toLowerCase()} <span class="muted">(${owners.length ? owners.join(", ") : "nobody has one"})</span>`;
    });
    return `<div class="gticket">
      <div class="ghead"><h3>${c.name}</h3><span class="muted">${q.last ? `last ${m(q.last.price)} (${q.last.qty} traded, round ${q.last.round} ${q.last.phase})` : "never traded"}${q.spread != null ? ` · spread ${Math.round(q.spread * 100)}%` : ""}</span><span class="gsp"></span><button class="glink" id="gTicketClose" title="Close">✕</button></div>
      <p class="small gused"><b>Used by:</b> ${users.join(" · ") || "no factory"}${G.isMaterial(id) ? " · <b>building</b> (any business)" : ""}${S.contracts.goods.includes(id) ? " · <b>contracts</b> (they're secret)" : ""}</p>
      <div class="gtwo">
        <div>
          <h4>Book</h4>
          <table class="gmkt gladder"><thead><tr><th class="n">Ask</th><th class="n">Qty</th><th class="n">Bid</th></tr></thead><tbody>
            ${asks.map(x => lv(x, "sell")).join("") || `<tr><td colspan="3" class="muted">No one selling</td></tr>`}
            <tr class="mid"><td colspan="3">${q.spread != null ? `spread ${m(q.ask - q.bid)}` : q.last ? `last ${m(q.last.price)}` : ""}</td></tr>
            ${bids.map(x => lv(x, "buy")).join("") || `<tr><td colspan="3" class="muted">No one buying</td></tr>`}
          </tbody></table>
          ${q.asks.length > 6 || q.bids.length > 6 ? `<p class="muted small">Showing the best 6 prices each side.</p>` : ""}
          <h4>Recent trades</h4>
          ${trades.length ? `<div class="dchips">${trades.map(h => `<span>R${h.round} ${h.phase.slice(0, 3)}: ${h.trades[id].qty} at ${m(h.trades[id].price)}</span>`).join("")}</div>` : `<p class="muted small">None yet.</p>`}
        </div>
        <div>
          <h4>New order</h4>
          <div class="gseg"><button data-side="buy" class="${t.side === "buy" ? "on" : ""}">Buy</button><button data-side="sell" class="${t.side === "sell" ? "on" : ""}">Sell</button></div>
          <div class="gform">
            <label>Price each <input type="number" id="gPrice" min="0.01" step="0.01" value="${t.price || (suggest != null ? suggest : "")}" placeholder="price"></label>
            <label>Quantity <input type="number" id="gQty" min="1" step="1" value="${t.qty || (t.side === "sell" ? have : Math.max(1, (want[id] || 0) - have)) || 1}"></label>
            <button class="gbtn" id="gPlace">${t.side === "buy" ? "Place buy order" : "Place sell order"}</button>
          </div>
          <p class="muted small">${t.side === "buy" ? `Locks price × quantity of your cash (${m(p.cash)} free) until it fills or you cancel.` : `Locks the goods: you have ${have} not already on offer.`}</p>
          <h4>Your orders</h4>
          ${myOrders.map(o => `<div class="gpos">${o.side === "buy" ? "Buy" : "Sell"} ${o.qty} at ${m(o.price)}${isNew(o) ? ` <em>new</em>` : ""}<button data-cancel="${o.id}" data-new="${isNew(o) ? 1 : ""}">Cancel</button></div>`).join("") || `<p class="muted small">None.</p>`}
        </div>
      </div>
    </div>`;
  }

  // ----- Afternoon: move or build (paid in goods) -----
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
      <p class="muted small">Paid in crates of building materials from your stockpile: any of ${Object.entries(S.build.materials).map(([c, v]) => `${G.COM[c].name.toLowerCase()}${v !== 1 ? ` (${v} crate${v > 1 ? "s" : ""} each)` : ""}`).join(", ")}. Big factories need half of it in heavy materials (${S.build.heavy.goods.map(c => G.COM[c].name.toLowerCase()).join(", ")}). Materials your contracts ask for are used last.</p>
      ${opts.length ? `<table class="gmkt"><thead><tr><th>Business</th><th>Each round</th><th class="n">Crates</th><th>You'd use</th><th></th></tr></thead><tbody>
        ${opts.map(o => { const r = G.payFor(vw, p, o.cost); return `<tr><td>${o.b.name}</td><td class="muted small">${io(o.b)}</td>
          <td class="n">${o.cost.crates}${o.cost.heavy ? `<small> (${o.cost.heavy} heavy)</small>` : ""}</td>
          <td class="small">${r.short ? `<span class="bad">${r.short} short${r.heavyShort ? `, ${r.heavyShort} of them heavy` : ""}</span>` : G.costText(r.pay)}</td>
          <td class="acts"><button data-build="${o.b.id}" ${p.acted || r.short ? "disabled" : ""}>Build</button></td></tr>`; }).join("")}
      </tbody></table>` : `<p class="muted">Nothing can be built here.</p>`}`;
  }

  // ----- Map -----
  function drawMap(p) {
    let { svg, below } = europeMapSVG("tOutlineGame");
    svg = svg.replace(/<\/svg>$/, "");
    const marks = {};
    vw.businesses.forEach(b => (marks[b.territory] ||= []).push({ kind: "biz", b }));
    vw.players.forEach(x => (marks[x.pos] ||= []).push({ kind: "pawn", x }));
    Object.entries(marks).forEach(([tid, list]) => {
      const [x] = TERRITORY_LABELS[tid], y = below[tid] + 26, step = 38;
      const show = list.length > 6 ? [...list.filter(l => l.kind === "pawn"), ...list.filter(l => l.kind === "biz").slice(0, 5)] : list;
      show.forEach((mk, i) => {
        const cx = x + (i - (show.length - 1) / 2) * step;
        if (mk.kind === "biz") { const o = G.player(vw, mk.b.owner), t = G.BIZ_BY[mk.b.type]; svg += `<g><title>${esc(o.name)}: ${t.name}</title><rect x="${cx - 17}" y="${y - 17}" width="34" height="34" rx="8" fill="${o.colour}" stroke="#fff" stroke-width="3"/>${iconSVG(BIZ_ICON[t.id], cx, y, 23)}</g>`; }
        else svg += `<g><title>${esc(mk.x.name)}${mk.x.id === p.id ? " (you)" : ""}</title>${pawnSVG(cx, y, mk.x.id === p.id ? 44 : 36, mk.x.colour)}</g>`;
      });
      if (show.length < list.length) svg += `<text x="${x}" y="${y + 30}" text-anchor="middle" font-size="12" font-weight="700" fill="#4a4232">+${list.length - show.length} more</text>`;
    });
    document.getElementById("gMap").innerHTML = `<div class="bd-scroll">${svg}</svg></div>`;
    const near = vw.phase === "afternoon" && !p.acted ? G.neighbours(p.pos) : [];
    document.querySelectorAll("#gMap .terr").forEach(g => {
      const t = g.dataset.t;
      if (t === p.pos) g.classList.add("here");
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
    root.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => { ui.filter = b.dataset.f; ui.search = ""; render(); }));
    const s = root.querySelector("#gSearch");
    if (s) s.addEventListener("input", () => { ui.search = s.value.toLowerCase(); const pos = s.selectionStart; render(); const n = root.querySelector("#gSearch"); n.focus(); n.setSelectionRange(pos, pos); });
    root.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { ui.tab = b.dataset.tab; render(); }));
    // Market: pick a good, then the order ticket
    root.querySelectorAll("tr[data-good]").forEach(tr => tr.addEventListener("click", () => { ui.good = ui.good === tr.dataset.good ? null : tr.dataset.good; render(); }));
    root.querySelector("#gTicketClose")?.addEventListener("click", () => { ui.good = null; render(); });
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
