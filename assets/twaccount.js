/* TWAccount: sign-in, device PIN and watchlist sync for TWstock.
   Same accounts as EZexams: the same Supabase project (username + password, Supabase Auth) and the same Worker
   (device PIN, tools/ezexams-worker.js). The watchlist lives in the Supabase table `watchlist`
   (tools/supabase-twstock.sql), read and written from the browser with the person's own sign-in, so Row Level
   Security decides who sees what. Without an account the watchlist stays in this browser only.

   Exposes window.TWAccount. Nothing here runs until a page calls it. */
(function () {
  const WORKER = "https://ezexams-ai.ta77199ta.workers.dev";
  /* the Supabase project; the publishable key is public by design (Row Level Security protects the data) */
  const SB = "https://jyfmolrqxypufwjqexan.supabase.co";
  const SBK = "sb_publishable_YJbE5DyYa6UKsAbfsxjnWg_4VW4HVnr";
  /* same suffix as EZexams, so one username works on both sites (nothing is ever sent to it) */
  const MAIL = "@ezexams.example.com";
  const SESS_KEY = "twstock-s";   /* sign-in: this tab only (sessionStorage), like EZexams */
  const DEV_KEY = "twstock-dev";  /* this device: account id, device id, whether a PIN is set */
  const WL_KEY = "twstock-watch"; /* watchlist kept in this browser */
  const MAX_SYMBOLS = 200;

  const store = {
    get(st, k) { try { return st.getItem(k); } catch (e) { return null; } },
    set(st, k, v) { try { v == null ? st.removeItem(k) : st.setItem(k, v); } catch (e) {} },
  };
  const jget = (st, k) => { try { return JSON.parse(store.get(st, k) || "null"); } catch (e) { return null; } };
  const sess = () => jget(sessionStorage, SESS_KEY);
  const sessSet = v => store.set(sessionStorage, SESS_KEY, v ? JSON.stringify(v) : null);
  const dev = () => jget(localStorage, DEV_KEY);
  const devSet = v => store.set(localStorage, DEV_KEY, v ? JSON.stringify(v) : null);
  const newId = () => {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
  };
  const cleanUser = u => String(u || "").trim().toLowerCase();

  class AuthError extends Error {
    constructor(code, message, extra) {
      super(message || code);
      this.code = code;
      Object.assign(this, extra || {});
    }
  }

  /* ---------- Supabase Auth, called from the browser ---------- */
  async function sb(method, path, { body, token, prefer } = {}) {
    let r;
    try {
      r = await fetch(SB + path, {
        method,
        headers: Object.assign(
          { apikey: SBK, "Content-Type": "application/json" },
          token ? { Authorization: "Bearer " + token } : {},
          prefer ? { Prefer: prefer } : {}
        ),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new AuthError("net", String(e.message || e));
    }
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch (e) {}
    if (r.ok) return j;
    const why = (j && (j.msg || j.message || j.error_description || j.error)) || "HTTP " + r.status;
    const ec = String((j && (j.error_code || j.code)) || "");
    const code = /invalid_credentials|invalid login/i.test(ec + " " + why) ? "badcreds"
      : /user_already_exists|already registered|already been registered/i.test(ec + " " + why) ? "taken"
      : /weak_password/i.test(ec) || /password should be/i.test(why) ? "weak"
      : r.status === 429 || /rate_limit/i.test(ec) ? "rate"
      : r.status === 401 || /jwt|PGRST30/i.test(ec + " " + why) ? "login"
      : "http";
    throw new AuthError(code, why, { status: r.status });
  }

  function adopt(j, username) {
    const u = j.user || {};
    const s = {
      at: j.access_token,
      rt: j.refresh_token,
      exp: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      uid: u.id,
      username: username || (u.user_metadata && u.user_metadata.username) || "",
    };
    sessSet(s);
    return s;
  }

  let refreshing = null;
  /* a valid access token; renewed with the refresh token when it is about to expire */
  async function token(force) {
    const s = sess();
    if (!s) return null;
    if (!force && s.exp > Date.now() / 1000 + 60) return s.at;
    if (!refreshing) {
      refreshing = (async () => {
        try {
          return adopt(await sb("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: s.rt } }), s.username).at;
        } catch (e) {
          if (e.code === "badcreds" || e.code === "login" || [400, 401, 403].includes(e.status)) {
            sessSet(null);
            throw new AuthError("login", "登入已過期");
          }
          throw e;
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }
  /* run a call with the access token; renewed once if it has just expired */
  async function withToken(fn) {
    try { return await fn(await token()); }
    catch (e) {
      if (e.code !== "login" || !sess()) throw e;
      return await fn(await token(true));
    }
  }

  /* ---------- the Worker: device PIN ---------- */
  async function px(path, body) {
    let r;
    try {
      r = await fetch(WORKER + path, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },   /* simple request: no CORS preflight */
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new AuthError("net", String(e.message || e));
    }
    const text = await r.text();
    if (r.ok) return JSON.parse(text);
    let er = {};
    try { er = JSON.parse(text).error || {}; } catch (e) {}
    const code = er.status === "LOCKED" ? "locked"
      : er.status === "NEED_LOGIN" ? "login"
      : er.status === "NO_PIN" ? "nopin"
      : er.status === "BAD_PIN" ? "badpin"
      : er.status === "PIN_LOCKED" ? "pinlocked"
      : er.status === "BAD_CODE" ? "badcode"
      : r.status === 429 ? "rate"
      : "server";
    throw new AuthError(code, er.message || "HTTP " + r.status, {
      status: r.status,
      left: er.left,
      wait: (+r.headers.get("retry-after") || 0) * 1000,
    });
  }

  /* ---------- accounts ---------- */
  async function auth(kind, username, password) {
    const u = cleanUser(username);
    if (!/^[a-z0-9_]{1,20}$/.test(u)) throw new AuthError("badname", "帳號名稱最多 20 個字，只能用英文、數字和底線。");
    password = String(password || "");
    if (password.length < 6) throw new AuthError("weak", "密碼至少要 6 個字。");
    if (new TextEncoder().encode(password).length > 72) throw new AuthError("longpass", "密碼太長了。");
    const body = { email: u + MAIL, password };
    const j = kind === "register"
      ? await sb("POST", "/auth/v1/signup", { body: Object.assign(body, { data: { username: u } }) })
      : await sb("POST", "/auth/v1/token?grant_type=password", { body });
    if (!j || !j.access_token) throw new AuthError("confirm", "註冊還需要 Email 確認，請在 Supabase 關閉 Confirm email。");
    const s = adopt(j, u);
    const d = dev();
    devSet(d && d.uid === s.uid
      ? Object.assign(d, { username: u })
      : { uid: s.uid, username: u, dev: newId(), pin: false });
    return s;
  }
  const signUp = (u, p) => auth("register", u, p);
  const signIn = (u, p) => auth("login", u, p);

  async function signOut() {
    const s = sess();
    if (s) sb("POST", "/auth/v1/logout?scope=local", { token: s.at }).catch(() => {});
    sessSet(null);
  }

  /* after a password sign-in, this device can remember a 4-digit PIN (only on this device) */
  async function setPin(pin) {
    const d = dev(), s = sess();
    if (!d || !s || d.uid !== s.uid) throw new AuthError("login", "請先用帳號和密碼登入");
    if (!/^\d{4}$/.test(pin)) throw new AuthError("badcode", "PIN 碼是 4 位數字。");
    await withToken(tk => px("/pin/set", { t: tk, deviceId: d.dev, pin }));
    devSet(Object.assign(d, { pin: true }));
  }

  /* right PIN → the Worker hands back a one-time link, which becomes a session here */
  async function pinLogin(pin) {
    const d = dev();
    if (!d || !d.pin) throw new AuthError("nopin", "這台裝置沒有設定 PIN，請用帳號和密碼登入。");
    if (!/^\d{4}$/.test(pin)) throw new AuthError("badcode", "PIN 碼是 4 位數字。");
    let t;
    try {
      t = await px("/pin/login", { uid: d.uid, deviceId: d.dev, pin });
    } catch (e) {
      if (e.code === "nopin" || e.code === "pinlocked") devSet(Object.assign(d, { pin: false }));
      throw e;
    }
    const j = await sb("POST", "/auth/v1/verify", { body: { type: "magiclink", token_hash: t.token_hash } });
    if (!j || !j.access_token) throw new AuthError("server", "Supabase 沒有回傳登入資料");
    return adopt(j, d.username);
  }

  async function clearPin() {
    const d = dev();
    if (!d) return;
    if (sess()) await withToken(tk => px("/pin/clear", { t: tk, deviceId: d.dev })).catch(() => {});
    devSet(Object.assign(d, { pin: false }));
  }

  /* ---------- watchlist ---------- */
  const localWL = () => jget(localStorage, WL_KEY) || { owner: null, updatedAt: 0, symbols: [] };
  const localWLSet = v => store.set(localStorage, WL_KEY, JSON.stringify(v));

  /* Newer copy wins (so a removal on one device reaches the others). A list kept on this browser before any
     sign-in is adopted by the first account that signs in; another account's list is not. */
  async function loadWatchlist() {
    const s = sess();
    const local = localWL();
    if (!s) return local.symbols;
    const rows = await withToken(tk => sb("GET", "/rest/v1/watchlist?select=payload&limit=1", { token: tk }));
    const remote = rows && rows[0] && rows[0].payload;
    const ours = !local.owner || local.owner === s.uid;
    if (!remote) {                       /* first time in the cloud: upload what this browser has */
      const v = ours
        ? { owner: s.uid, updatedAt: local.updatedAt || Date.now(), symbols: local.symbols }
        : { owner: s.uid, updatedAt: Date.now(), symbols: [] };
      localWLSet(v);
      await pushWatchlist(v);
      return v.symbols;
    }
    if (ours && (local.updatedAt || 0) > (remote.updatedAt || 0)) {   /* this browser changed last: upload it */
      const v = Object.assign({}, local, { owner: s.uid });
      localWLSet(v);
      await pushWatchlist(v);
      return v.symbols;
    }
    const v = { owner: s.uid, updatedAt: remote.updatedAt || 0, symbols: remote.symbols || [] };
    localWLSet(v);
    return v.symbols;
  }

  async function pushWatchlist(v) {
    const s = sess();
    if (!s) return;
    const payload = { updatedAt: v.updatedAt, symbols: v.symbols };
    await withToken(tk => sb("POST", "/rest/v1/watchlist?on_conflict=user_id", {
      token: tk,
      body: { user_id: s.uid, payload, updated_at: new Date(v.updatedAt).toISOString() },
      prefer: "resolution=merge-duplicates,return=minimal",
    }));
  }

  /* saves on this browser first, then to the account if signed in; throws if the account copy could not be saved */
  async function saveWatchlist(symbols) {
    const s = sess();
    const clean = [...new Set((symbols || []).map(x => String(x).trim()).filter(Boolean))].slice(0, MAX_SYMBOLS);
    const v = { owner: s ? s.uid : localWL().owner, updatedAt: Date.now(), symbols: clean };
    localWLSet(v);
    await pushWatchlist(v);
    return clean;
  }

  const MESSAGES = {
    badcode: "PIN 碼是 4 位數字。",
    badcreds: "帳號名稱或密碼不對。",
    badname: "帳號名稱最多 20 個字，只能用英文、數字和底線。",
    longpass: "密碼太長了。",
    nopin: "這台裝置沒有設定 PIN，請用帳號和密碼登入。",
    badpin: "PIN 碼不對。",
    pinlocked: "PIN 碼錯太多次，這台裝置的 PIN 已移除，請用帳號和密碼登入。",
    taken: "這個帳號名稱已經有人用了，換一個。",
    weak: "密碼至少要 6 個字。",
    confirm: "註冊還需要 Email 確認，請在 Supabase 關閉 Confirm email。",
    locked: "PIN 碼輸入錯太多次，請稍後再試。",
    login: "請先登入，或登入已過期。",
    net: "暫時連不上網路。自選股已存在這台裝置。",
    rate: "伺服器暫時忙碌，請稍後再試。",
  };
  function errMsg(e) {
    if (e && e.code === "badpin" && e.left != null) return "PIN 碼不對，還剩 " + e.left + " 次機會。";
    if (e && e.code === "locked") return "PIN 碼輸入錯太多次，請 " + Math.max(1, Math.ceil((e.wait || 0) / 60000)) + " 分鐘後再試。";
    return MESSAGES[e && e.code] || "發生錯誤，自選股已存在這台裝置，稍後再試。";
  }

  window.TWAccount = {
    AuthError,
    errMsg,
    signUp,
    signIn,
    signOut,
    setPin,
    pinLogin,
    clearPin,
    loadWatchlist,
    saveWatchlist,
    account: () => { const s = sess(); return s ? { uid: s.uid, username: s.username } : null; },
    device: () => { const d = dev(); return d ? { username: d.username, pin: !!d.pin, asked: !!d.asked } : null; },
    /* the person said "not now" to a PIN on this device: do not ask again after every sign-in */
    markPinAsked() { const d = dev(); if (d) { d.asked = 1; devSet(d); } },
    /* forget which account this device belongs to (another person is signing in) */
    forgetDevice() { devSet(null); },
  };
})();
