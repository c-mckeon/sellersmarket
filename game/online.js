// Sellers Market: online play. One shared game in a Firebase Realtime Database, for the people in
// ONLINE_PLAYERS (game/online-config.js), each on their own device.
//
// Stored under sellersmarket/ in the database:
//   game                the whole game, as JSON text (null: no game yet)
// Orders are sent with a transaction: the game is read, your orders are added with SMG.submit, and if
// that was the last player the round is played out, all in one step, so two players submitting at
// the same moment can't overwrite each other.
//
// There are no passwords: each player just picks their name.
//
// Testing without Firebase: add ?mock to the page address. A stand-in database lives in this browser
// (shared between its tabs), so two tabs can play Con and Kev.

const NET = (() => {
  const mock = /[?&]mock\b/.test(location.search);
  const ready = !!(typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG?.databaseURL) || mock;
  const ROOT = /[?&]testroot\b/.test(location.search) ? "sellersmarket-test" : "sellersmarket"; // ?testroot: a scratch area for testing
  const USER_KEY = "sellersmarket-user";

  // ----- A tiny database interface, the same for Firebase and the stand-in -----
  //   watch(path, cb)   cb(value) now and on every change
  //   get(path)         → value
  //   set(path, value)
  //   txn(path, fn)     fn(current) → new value, or undefined to leave it; may run more than once
  function standIn() {
    const KEY = "sellersmarket-mockdb", read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const listeners = [];
    const at = (o, path) => path.split("/").reduce((x, k) => x?.[k], o) ?? null;
    const put = (path, v) => { const db = read(), ks = path.split("/"); let o = db; ks.slice(0, -1).forEach(k => o = o[k] ||= {}); if (v == null) delete o[ks.at(-1)]; else o[ks.at(-1)] = v; localStorage.setItem(KEY, JSON.stringify(db)); fire(); };
    const fire = () => { const db = read(); listeners.forEach(([p, cb]) => cb(at(db, p))); };
    addEventListener("storage", e => { if (e.key === KEY) fire(); });
    return {
      watch: (path, cb) => { listeners.push([path, cb]); cb(at(read(), path)); },
      get: async path => at(read(), path),
      set: async (path, v) => put(path, v),
      txn: async (path, fn) => { const v = fn(at(read(), path)); if (v !== undefined) put(path, v); },
      push: async (path, v) => put(`${path}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, v),
    };
  }
  let fbReady = null;
  function firebaseDb() {
    const load = src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Couldn't load Firebase")); document.head.appendChild(s); });
    fbReady ||= load("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js")
      .then(() => load("https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"))
      .then(() => { firebase.initializeApp(FIREBASE_CONFIG); return firebase.database(); });
    fbReady.catch(() => {}); // a failure is reported where the database is used
    const ref = async path => (await fbReady).ref(path);
    return {
      watch: async (path, cb) => (await ref(path)).on("value", s => cb(s.val())),
      get: async path => (await (await ref(path)).get()).val(),
      set: async (path, v) => (await ref(path)).set(v),
      // Firebase may first call fn with null before it knows the real value; returning null then makes
      // it fetch the real one and call fn again (if it really is null, nothing changes)
      txn: async (path, fn) => (await ref(path)).transaction(cur => cur === null ? null : fn(cur)),
      push: async (path, v) => (await ref(path)).push(v),
    };
  }
  const db = ready ? (mock ? standIn() : firebaseDb()) : null;

  // ----- Logging in -----
  let user = null;
  try { user = localStorage.getItem(USER_KEY); } catch (e) {}
  if (!ONLINE_PLAYERS.includes(user)) user = null;

  // No passwords: you pick who you are. (Anyone with the site can pick either name.)
  async function login(name) {
    if (!ONLINE_PLAYERS.includes(name)) return { ok: false, msg: "Unknown player." };
    user = name; try { localStorage.setItem(USER_KEY, name); } catch (e) {}
    return { ok: true };
  }
  const logout = () => { user = null; try { localStorage.removeItem(USER_KEY); } catch (e) {} };

  // ----- The shared game -----
  const GAME = `${ROOT}/game`;
  const watch = cb => db.watch(GAME, v => { try { cb(v ? JSON.parse(v) : null); } catch (e) { cb(null); } });
  const start = st => db.set(GAME, JSON.stringify(st));
  const reset = () => db.set(GAME, null);
  // Send this player's orders. Returns { ok, msg }.
  async function submit(pid, round, orders) {
    let res = { ok: false, msg: "There's no game right now." };
    try {
      await db.txn(GAME, cur => {
        if (!cur) { res = { ok: false, msg: "There's no game." }; return undefined; }
        const st = JSON.parse(cur);
        if (st.round !== round) { res = { ok: false, msg: "That round is already over." }; return undefined; }
        res = SMG.submit(st, pid, orders);
        return res.ok ? JSON.stringify(st) : undefined;
      });
    } catch (e) { res = { ok: false, msg: `Couldn't reach the database: ${e.message}` }; }
    return res;
  }

  // ----- Chat: kept apart from the game (sellersmarket/chat), newest last -----
  const CHAT = `${ROOT}/chat`;
  const watchChat = cb => db.watch(CHAT, v => cb(Object.values(v || {}).sort((a, b) => a.t - b.t).slice(-200)));
  const say = text => user && text.trim() ? db.push(CHAT, { name: user, text: text.trim().slice(0, 500), t: Date.now() }) : Promise.resolve();

  return { ready, mock, get user() { return user; }, players: ONLINE_PLAYERS, login, logout, watch, start, reset, submit, watchChat, say };
})();
