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
        ${saved && saved.version === 4 && !saved.over ? `<div class="gresume">A game in round ${saved.round} is saved in this browser. <button class="gbtn" id="gResume">Continue it</button></div>` : ""}
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
    if (o.name === "buy") return `Buy ${a.qty} ${G.COM[a.id].name} <em>${m(a.qty * st.prices[a.id])}</em>`;
    if (o.name === "sell") return `${st.prices[a.id] < 0 ? "Dump" : "Sell"} ${a.qty} ${G.COM[a.id].name} <em>${m(a.qty * st.prices[a.id])}</em>`;
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
        <span class="gphase ${st.phase}">Round ${st.round} of ${st.rounds} · ${st.phase === "morning" ? "Morning: trade" : "Afternoon: move or build, and play a card"}</span>
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
            ${st.phase === "morning" ? `<div class="gseg gtabs"><button data-tab="market" class="${ui.tab !== "broker" ? "on" : ""}">Market</button><button data-tab="broker" class="${ui.tab === "broker" ? "on" : ""}">Broker</button></div>` + (ui.tab === "broker" ? brokerPanel(p) : marketPanel(p)) : afternoonPanel(p)}
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
    const c = JSON.parse(JSON.stringify(vw)); c.log = [];
    const before = { ...G.player(c, p.id).stock };
    c.phase = "midday"; G.produce(c);
    const after = G.player(c, p.id).stock, delta = {};
    new Set([...Object.keys(before), ...Object.keys(after)]).forEach(k => { const d = (after[k] || 0) - (before[k] || 0); if (d) delta[k] = d; });
    const lost = c.log.filter(l => l.pid === p.id && /threw away/.test(l.msg)).map(l => l.msg.replace(/^stockpile full: threw away /, ""));
    return { delta, lost, used: G.used(G.player(c, p.id)) };
  }

  function dashboard(p) {
    const used = G.used(p), worth = G.netWorth(vw, p);
    const biz = G.myBusinesses(vw, p.id);
    const stock = Object.entries(p.stock).sort((a, b) => b[1] * vw.prices[b[0]] - a[1] * vw.prices[a[0]]);
    const pv = middayPreview(p);
    const discard = p.discard || [];
    const bondV = p.bonds.reduce((s, b) => s + b.count * G.bondValue(vw, b), 0);
    const etfV = Object.entries(p.etf).reduce((s, [k, u]) => s + u * G.etfPrice(vw, k), 0);
    const futV = p.futures.reduce((s, f) => s + G.futureValue(vw, f), 0);
    const effects = {};
    G.activeEffects(st).forEach(e => { const k = e.card + "-" + e.by + "-" + e.from; (effects[k] ||= { e, list: [] }).list.push(e); });
    const others = [...st.players].sort((a, b) => G.netWorth(st, b) - G.netWorth(st, a));
    return `
      <div class="dtop">
        <div><span>Cash</span><b>${m(p.cash)}</b></div>
        <div><span>Net worth</span><b>${m(worth)}</b></div>
      </div>
      ${p.loan || p.bonds.length || p.futures.length || Object.keys(p.etf).length ? `<div class="dfin">
        ${p.loan ? `<span>Loan <b class="neg">−${m(p.loan)}</b></span>` : ""}
        ${p.bonds.length ? `<span>Bonds <b>${m(bondV)}</b></span>` : ""}
        ${p.futures.length ? `<span>Futures <b>${m(futV)}</b></span>` : ""}
        ${Object.keys(p.etf).length ? `<span>ETFs <b>${m(etfV)}</b></span>` : ""}
      </div>` : ""}
      <div class="dsec">
        <h4>Stockpile <em>${used}/${p.space}</em></h4>
        <div class="dspace"><span style="width:${Math.min(100, used / p.space * 100)}%"></span></div>
        ${stock.length ? `<div class="dchips">${stock.map(([c, q]) => `<span title="${m(q * vw.prices[c])}">${q} ${G.COM[c].name}</span>`).join("")}</div>` : `<p class="dnone">Empty</p>`}
        ${pv ? `<div class="dprev"><b>At midday:</b> ${Object.entries(pv.delta).map(([c, d]) => `<span class="${d > 0 ? "up" : "dn"}">${d > 0 ? "+" : "−"}${Math.abs(d)} ${G.COM[c].name}</span>`).join(" ") || "nothing changes"}
          ${pv.lost.length ? `<div class="dlost">⚠ Full: you'll throw away ${esc(pv.lost.join("; "))}</div>` : ""}</div>` : ""}
        <div class="ddisc"><span>If full, throw away first:</span>
          ${discard.map((c, i) => `<span class="dtag">${G.COM[c].name}<button data-disc-del="${i}" title="Remove">✕</button></span>`).join("")}
          <select id="gDiscAdd"><option value="">${discard.length ? "+ add" : "cheapest first (choose…)"}</option>${COMMODITIES.filter(c => !discard.includes(c.id)).map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select>
        </div>
      </div>
      <div class="dsec">
        <h4>Businesses <em>${biz.length}${S.wageRate ? ` · wages ${m(biz.reduce((s, b) => s + G.wage(vw, b), 0))}/night` : ""}</em></h4>
        ${biz.map(b => {
          const t = G.BIZ_BY[b.type];
          const miss = Object.entries(t.inputs).filter(([c, q]) => (p.stock[c] || 0) < q);
          return `<div class="dbiz"><span class="bicon" style="background:${p.colour}"><svg viewBox="0 0 24 24">${iconSVG(BIZ_ICON[t.id], 12, 12, 18)}</svg></span><b>${t.name}</b> <span class="muted">${G.TERR[b.territory].name}</span>
            <span class="${miss.length ? "bad" : "ok"}">${t.kind === "extract" ? "✓ ready" : miss.length ? "needs " + miss.map(([c, q]) => `${q - (p.stock[c] || 0)} ${G.COM[c].name}`).join(", ") : "✓ inputs ready"}</span></div>`;
        }).join("") || `<p class="dnone">None</p>`}
      </div>
      <div class="dsec">
        <h4>Cards in play <em>${Object.keys(effects).length}</em></h4>
        ${Object.values(effects).map(({ e, list }) => { const c = G.CARD[e.card], by = G.player(st, e.by);
          return `<div class="deff"><b>${c.name}</b> <span class="muted">by ${by.id === p.id ? "you" : esc(by.name)} · ${e.until === Infinity ? "until repealed" : `${e.until - st.round + 1} round${e.until - st.round ? "s" : ""} left`}</span>
            <span>${list.map(x => { const f = G.fxText([x.hook, x.target, x.op, x.v, null]); const t = x.target === "chosen commodity" && G.COM[x.targets[0]] ? G.COM[x.targets[0]].name : x.hook === "yield" || x.hook === "premium" ? x.target : f.on; return `${f.hook} ${esc(t)} ${f.amount}`; }).join(" · ")}</span></div>`; }).join("") || `<p class="dnone">None right now.</p>`}
      </div>
      <div class="dsec">
        <h4>Players</h4>
        ${others.map(x => `<div class="dplayer${x.id === p.id ? " me" : ""}"><span><i style="background:${x.colour}"></i>${x.id === p.id ? "You" : esc(x.name)}</span>
          <span class="muted">${G.TERR[x.pos].name} · ${G.myBusinesses(st, x.id).length} business${G.myBusinesses(st, x.id).length === 1 ? "" : "es"}</span><b>${m(G.netWorth(st, x))}</b></div>`).join("")}
      </div>`;
  }

  // ----- Morning: the market -----
  function marketPanel(p) {
    const need = needsOf(p);
    const missing = Object.entries(need).filter(([c, q]) => (p.stock[c] || 0) < q);
    const missCost = missing.reduce((s, [c, q]) => s + (q - (p.stock[c] || 0)) * vw.prices[c], 0);
    const anyMine = COMMODITIES.some(c => p.stock[c.id] || need[c.id]);
    const filter = anyMine ? ui.filter : "all";
    const rows = COMMODITIES.filter(c => {
      if (ui.search) return c.name.toLowerCase().includes(ui.search);
      return filter === "all" || p.stock[c.id] || need[c.id];
    });
    const chg = c => { const a = vw.lastPrices[c] ?? vw.prices[c], b = vw.prices[c]; return a ? b / a - 1 : 0; };
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
        const pr = vw.prices[c.id], ch = chg(c.id), have = p.stock[c.id] || 0;
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

  // ----- Morning: the broker -----
  function brokerPanel(p) {
    const BK = BROKER, limit = G.borrowLimit(vw, p), room = Math.max(0, limit - p.loan);
    const nextReview = Math.ceil((st.round + 0.5) / BK.centralBank.reviewEvery) * BK.centralBank.reviewEvery;
    const fc = ui.fut || (ui.fut = { cid: "wheat", side: "long", qty: 10, rounds: 3 });
    const fPrice = G.futuresPrice(vw, fc.cid, fc.rounds), fDep = fPrice * fc.qty * BK.futures.deposit * ((G.financeMods(vw).futMargin) || 1);
    return `
      <div class="gcb">Central bank base rate <b>${(vw.baseRate * 100).toFixed(2)}%</b> · next review end of round ${nextReview} · the government lets you borrow <b>${Math.round(G.borrowLimitShare(vw) * 100)}%</b> of what you own</div>
      <div class="gbk">
        <section><h4>Loan</h4>
          <div class="gkv"><span>Owed</span><b>${m(p.loan)}</b><span>Rate</span><b>${(G.loanRate(vw, p) * 100).toFixed(2)}%/round</b><span>Limit</span><b>${m(limit)}</b><span>Can borrow</span><b>${m(room)}</b></div>
          <div class="grow2"><input type="number" id="gLoanAmt" min="1" step="10" value="${Math.min(100, Math.floor(room)) || 100}"><button data-fin="borrow">Borrow</button><button data-fin="repay" ${p.loan ? "" : "disabled"}>Repay</button></div>
          <p class="muted small">Each night you pay the interest plus 5% of the loan. If it ends up over your limit, the bank sells your things 20% under market.</p>
        </section>
        <section><h4>Government bonds <span class="muted">new ones pay ${(G.bondRateNow(vw) * 100).toFixed(2)}%/round</span></h4>
          <div class="grow2"><select id="gBondLen">${BK.bonds.lengths.map(l => `<option value="${l}">${l} rounds</option>`).join("")}</select><input type="number" id="gBondN" min="1" value="1"><button data-fin="buyBond">Buy (100 each)</button></div>
          ${p.bonds.map(b => `<div class="gpos">${b.count} × ${b.length}-round at ${(b.rate * 100).toFixed(2)}% · ${b.left} left · worth ${m(b.count * G.bondValue(vw, b))}<button data-sellbond="${b.id}">Sell</button></div>`).join("")}
        </section>
        <section><h4>Futures</h4>
          <div class="grow2"><select id="gFutC">${COMMODITIES.filter(c => c.type !== "waste").map(c => `<option value="${c.id}"${c.id === fc.cid ? " selected" : ""}>${c.name}</option>`).join("")}</select>
            <select id="gFutSide"><option value="long"${fc.side === "long" ? " selected" : ""}>Long (buy)</option><option value="short"${fc.side === "short" ? " selected" : ""}>Short (sell)</option></select></div>
          <div class="grow2"><label>Units <input type="number" id="gFutQ" min="1" value="${fc.qty}"></label><label>Rounds <input type="number" id="gFutR" min="1" max="${BK.futures.maxRounds}" value="${fc.rounds}"></label><button data-fin="openFuture">Open</button></div>
          <p class="muted small">Price ${m(fPrice)} each (today ${m(vw.prices[fc.cid])}) · deposit ${m(fDep)}. On the day you get (price then − ${m(fPrice)}) × units${fc.side === "short" ? ", the other way round" : ""}.</p>
          ${p.futures.map(f => `<div class="gpos">${f.side === "long" ? "Long" : "Short"} ${f.qty} ${G.COM[f.cid].name} at ${m(f.price)} · settles round ${f.settle} · worth ${m(G.futureValue(vw, f))}<button data-closefut="${f.id}">Close</button></div>`).join("")}
        </section>
        <section><h4>Sector ETFs <span class="muted">no stockpile space needed</span></h4>
          <table class="gmkt"><tbody>${Object.keys(SECTORS).map(k => `<tr><td><b>${BK.etfs.tickers[k]}</b> <span class="muted">${SECTORS[k].name}</span></td><td class="n">${m(G.etfPrice(vw, k))}</td><td class="n">${p.etf[k] || ""}</td>
            <td class="acts">${p.etf[k] ? `<button data-etf-sell="${k}">−1</button>` : ""}<button data-etf-buy="${k}" data-q="1">+1</button><button data-etf-buy="${k}" data-q="5">+5</button></td></tr>`).join("")}</tbody></table>
        </section>
      </div>`;
  }

  // ----- Afternoon: move or build, and cards -----
  function afternoonPanel(p) {
    const here = p.pos, info = TERRITORY_INFO[here];
    const opts = G.buildable(vw, here, p.id).map(o => ({ ...o, profit: G.bizProfit(vw, o.b, here) })).sort((a, b) => b.profit / b.cost - a.profit / a.cost);
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
            ${opts.map(o => { const crates = Object.values(o.b.inputs).reduce((x, y) => x + y, 0); return `<tr><td>${o.b.name}</td><td class="n ${crates > p.space ? "bad" : ""}">${crates || "—"}</td><td class="n ${o.profit > 0 ? "up" : "dn"}">${m(o.profit)}</td><td class="n">${m(o.cost)}</td>
              <td class="acts"><button data-build="${o.b.id}" ${p.acted || o.cost > p.cash ? "disabled" : ""}>Build</button></td></tr>`; }).join("")}
          </tbody></table><p class="muted small">* Crates: stockpile space its inputs take each round (you have ${p.space}). Earns: outputs minus inputs and wages, at today's prices.</p>` : `<p class="muted">Nothing can be built here.</p>`}
        </div>
        <div>
          <h4>Your cards <em>${p.hand.length}/${S.handMax}</em> ${p.cardsPlayed ? "· played one ✓" : ""}</h4>
          <div class="ghand">${p.hand.map((id, i) => { const c = G.CARD[id]; return `<button class="gcard ${c.cat}${ui.card === id ? " sel" : ""}" data-card="${id}" ${p.cardsPlayed >= S.cardsPerAfternoon ? "disabled" : ""}><b>${c.name}</b><span>${esc(c.text)}</span><ul>${c.fx.map(f => { const t = G.fxText(f); return `<li><b>${t.hook}</b> ${esc(t.on)} <em>${t.amount}</em> · ${t.dur}</li>`; }).join("")}</ul></button>`; }).join("") || `<p class="muted">No cards.</p>`}</div>
          ${card ? `<div class="gplay">
            <b>Play ${card.name}?</b> It takes effect overnight.
            ${needs.commodity ? `<label>Commodity <select id="gcCom">${COMMODITIES.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select></label>` : ""}
            ${needs.ownBusiness ? `<label>Your business <select id="gcOwn">${G.myBusinesses(vw, p.id).map(b => `<option value="${b.id}">${G.BIZ_BY[b.type].name}, ${G.TERR[b.territory].name}</option>`).join("")}</select></label>` : ""}
            ${needs.targetBusiness ? `<label>Target <select id="gcTgt">${vw.businesses.filter(b => b.owner !== p.id).map(b => `<option value="${b.id}">${esc(G.player(vw, b.owner).name)}'s ${G.BIZ_BY[b.type].name}, ${G.TERR[b.territory].name}</option>`).join("")}</select></label>` : ""}
            ${needs.targetPlayer ? `<label>Player <select id="gcPl">${vw.players.filter(x => x.id !== p.id).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label>` : ""}
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
    root.querySelectorAll("[data-buy]").forEach(b => b.addEventListener("click", () => doAct("buy", { id: b.dataset.buy, qty: +b.dataset.q })));
    root.querySelectorAll("[data-sell]").forEach(b => b.addEventListener("click", () => doAct("sell", { id: b.dataset.sell, qty: +b.dataset.q })));
    root.querySelector("#gSpace")?.addEventListener("click", () => doAct("upgradeSpace"));
    root.querySelector("#gBuyMissing")?.addEventListener("click", () => {
      const need = needsOf(p); let msg = "";
      for (const [c, q] of Object.entries(need)) {
        const miss = q - (p.stock[c] || 0);
        if (miss > 0) { msg = tryOrder("buy", { id: c, qty: miss }); if (msg) break; }
      }
      flash(msg); render();
    });
    root.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { ui.tab = b.dataset.tab; render(); }));
    // Throw-away list: one setDiscard order, replaced whenever it changes
    const setDiscard = list => { ui.orders = ui.orders.filter(o => o.name !== "setDiscard"); doAct("setDiscard", { list }); };
    root.querySelector("#gDiscAdd")?.addEventListener("change", e => { if (e.target.value) setDiscard([...(p.discard || []), e.target.value]); });
    root.querySelectorAll("[data-disc-del]").forEach(b => b.addEventListener("click", () => setDiscard((p.discard || []).filter((_, i) => i !== +b.dataset.discDel))));
    // Broker
    const num = id => +root.querySelector(id)?.value;
    root.querySelectorAll("[data-fin]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.fin;
      if (k === "borrow" || k === "repay") doAct(k, { amount: num("#gLoanAmt") });
      if (k === "buyBond") doAct(k, { length: num("#gBondLen"), count: num("#gBondN") });
      if (k === "openFuture") doAct(k, { cid: ui.fut.cid, side: ui.fut.side, qty: ui.fut.qty, rounds: ui.fut.rounds });
    }));
    ["#gFutC", "#gFutSide", "#gFutQ", "#gFutR"].forEach(id => root.querySelector(id)?.addEventListener("change", () => {
      ui.fut = { cid: root.querySelector("#gFutC").value, side: root.querySelector("#gFutSide").value, qty: Math.max(1, num("#gFutQ")), rounds: Math.min(BROKER.futures.maxRounds, Math.max(1, num("#gFutR"))) };
      render();
    }));
    root.querySelectorAll("[data-sellbond]").forEach(b => b.addEventListener("click", () => doAct("sellBond", { id: +b.dataset.sellbond })));
    root.querySelectorAll("[data-closefut]").forEach(b => b.addEventListener("click", () => doAct("closeFuture", { id: +b.dataset.closefut })));
    root.querySelectorAll("[data-etf-buy]").forEach(b => b.addEventListener("click", () => doAct("buyEtf", { sector: b.dataset.etfBuy, units: +b.dataset.q })));
    root.querySelectorAll("[data-etf-sell]").forEach(b => b.addEventListener("click", () => doAct("sellEtf", { sector: b.dataset.etfSell, units: 1 })));
    root.querySelectorAll("[data-move]").forEach(b => b.addEventListener("click", () => doAct("move", { to: b.dataset.move })));
    root.querySelectorAll("[data-build]").forEach(b => b.addEventListener("click", () => doAct("build", { type: b.dataset.build })));
    root.querySelectorAll("[data-card]").forEach(b => b.addEventListener("click", () => { ui.card = +b.dataset.card; render(); }));
    root.querySelector("#gCancel")?.addEventListener("click", () => { ui.card = null; render(); });
    root.querySelector("#gPlay")?.addEventListener("click", () => {
      const args = { card: ui.card, commodity: root.querySelector("#gcCom")?.value, ownBusiness: root.querySelector("#gcOwn")?.value, targetBusiness: root.querySelector("#gcTgt")?.value, targetPlayer: root.querySelector("#gcPl")?.value };
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
  st = saved && saved.version === 4 && !saved.over ? saved : null;
  render();
})();
