/* Vespera server — no dependencies, Node 18+.
 *
 *  - Serves the site.
 *  - Proxies TMDB and OMDb so API keys stay on the server (.env), with caching.
 *  - Invite-only sign-in: 6-digit email codes, and Google sign-in when configured.
 *  - Stores each member's profiles, lists and preferences so they follow them across devices.
 *
 *  Run:            node server.js
 *  Invite someone: node server.js invite friend@example.com
 *  List invites:   node server.js invites
 *  Remove invite:  node server.js uninvite friend@example.com
 */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
if (!process.env.RENDER) loadEnv(path.join(ROOT, ".env")); // on Render, settings come from its Environment page
const env = process.env;

const ON_RENDER = !!env.RENDER; // Render sets RENDER=true and RENDER_EXTERNAL_URL automatically
const PORT = +env.PORT || 5173;
const HOST = env.HOST || (ON_RENDER ? "0.0.0.0" : "127.0.0.1");
const PUBLIC_URL = (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const TRUST_PROXY = env.TRUST_PROXY ? env.TRUST_PROXY === "true" : ON_RENDER;
const SECURE_COOKIES = PUBLIC_URL.startsWith("https://");
const INVITE_ONLY = env.INVITE_ONLY !== "false";
const DATA_DIR = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, "data"); // point at a persistent disk when hosted
const DB_FILE = path.join(DATA_DIR, "db.json");
const INVITES_FILE = path.join(DATA_DIR, "invites.txt");
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;

const FEATURES = {
  tmdb: !!env.TMDB_KEY,
  omdb: !!env.OMDB_KEY,
  assistant: !!(env.ANTHROPIC_API_KEY && env.TMDB_KEY),
  google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  mail: !!(env.RESEND_API_KEY && env.MAIL_FROM),
  inviteOnly: INVITE_ONLY,
};

// ---------------------------------------------------------------- utilities
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const normEmail = e => String(e || "").trim().toLowerCase();
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------- storage
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { users: {}, sessions: {} };
try { db = { users: {}, sessions: {}, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) }; } catch {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 200);
}
function invites() {
  // From data/invites.txt (CLI) plus the INVITES setting (comma-separated), handy on hosts without a shell.
  let lines = [];
  try { lines = fs.readFileSync(INVITES_FILE, "utf8").split(/\r?\n/); } catch {}
  return new Set([...lines, ...String(env.INVITES || "").split(",")].map(normEmail).filter(Boolean).filter(l => !l.startsWith("#")));
}
const isInvited = email => !INVITE_ONLY || invites().has(email) || !!db.users[email];

// ---------------------------------------------------------------- CLI
const [, , cmd, arg] = process.argv;
if (cmd === "invite" || cmd === "uninvite" || cmd === "invites") {
  const set = invites();
  if (cmd === "invites") { console.log([...set].join("\n") || "(no invites yet)"); process.exit(0); }
  const e = normEmail(arg);
  if (!validEmail(e)) { console.error("Give a valid email, e.g. node server.js invite friend@example.com"); process.exit(1); }
  cmd === "invite" ? set.add(e) : set.delete(e);
  fs.writeFileSync(INVITES_FILE, "# One invited email per line\n" + [...set].join("\n") + "\n");
  console.log(`${cmd === "invite" ? "Invited" : "Removed"} ${e}. ${set.size} invite(s) total.`);
  process.exit(0);
}

// ---------------------------------------------------------------- rate limiting
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(); const b = buckets.get(key) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++; buckets.set(key, b);
  return b.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 60_000).unref();

// ---------------------------------------------------------------- sessions
const COOKIE = "vespera_session";
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIES ? "; Secure" : ""}`;
}
function addCookie(res, c) {
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [...(prev ? [].concat(prev) : []), c]);
}
function createSession(res, email) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.sessions[sha(token)] = { email, exp: Date.now() + SESSION_DAYS * 864e5 };
  save();
  addCookie(res, cookie(COOKIE, token, SESSION_DAYS * 86400));
}
function sessionOf(req) {
  const t = parseCookies(req)[COOKIE]; if (!t) return null;
  const s = db.sessions[sha(t)];
  if (!s) return null;
  if (s.exp < Date.now()) { delete db.sessions[sha(t)]; save(); return null; }
  return s;
}
function ensureUser(email) {
  if (!db.users[email]) { db.users[email] = { email, since: new Date().toISOString(), data: null }; save(); }
  return db.users[email];
}
setInterval(() => { const now = Date.now(); let n = 0;
  for (const [k, s] of Object.entries(db.sessions)) if (s.exp < now) { delete db.sessions[k]; n++; }
  if (n) save(); }, 3600_000).unref();

// ---------------------------------------------------------------- email codes
const codes = new Map(); // email -> { hash, exp, tries }
async function sendCode(email, code) {
  if (!FEATURES.mail) { log(`[dev] sign-in code for ${email}: ${code}`); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM, to: [email], subject: `${code} is your Vespera sign-in code`,
      text: `Your Vespera sign-in code is ${code}\n\nIt expires in ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;background:#07060f;color:#f3eee6;padding:32px;border-radius:16px;max-width:420px">
        <p style="color:#f4b860;letter-spacing:.2em;font-size:11px;font-weight:700;margin:0 0 12px">VESPERA</p>
        <p style="margin:0 0 18px">Your sign-in code:</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:.3em;margin:0 0 18px">${code}</p>
        <p style="color:#a49db8;font-size:13px;margin:0">It expires in ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email.</p></div>`,
    }),
  });
  if (!r.ok) throw new Error(`Mail provider error ${r.status}: ${await r.text()}`);
}

// ---------------------------------------------------------------- TMDB / OMDb proxy
const cache = new Map(); // url -> { exp, status, body }
const CACHE_MS = 15 * 60_000;
async function cachedFetch(url, headers = {}) {
  const hit = cache.get(url);
  if (hit && hit.exp > Date.now()) return hit;
  let r;
  try { r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) }); }
  catch (e) {
    if (hit) return hit; // serve stale data rather than nothing
    log(`upstream unreachable: ${new URL(url).hostname} (${e.cause?.code || e.name})`);
    return { status: 502, body: JSON.stringify({ error: "upstream_unavailable" }) };
  }
  const entry = { exp: Date.now() + (r.ok ? CACHE_MS : 30_000), status: r.status, body: await r.text() };
  if (r.status >= 500 || r.status === 429) return entry; // don't remember upstream hiccups
  cache.set(url, entry);
  if (cache.size > 3000) cache.delete(cache.keys().next().value);
  return entry;
}
async function proxyTmdb(req, res, sub, query) {
  if (!FEATURES.tmdb) return json(res, 503, { error: "tmdb_not_configured" });
  if (!/^[a-z0-9_\/-]{1,120}$/i.test(sub) || sub.includes("..")) return json(res, 400, { error: "bad_path" });
  const u = new URL("https://api.themoviedb.org/3/" + sub);
  for (const [k, v] of query) if (k !== "api_key") u.searchParams.set(k, v);
  const headers = { accept: "application/json" };
  if (env.TMDB_KEY.length > 40) headers.Authorization = "Bearer " + env.TMDB_KEY; else u.searchParams.set("api_key", env.TMDB_KEY);
  const r = await cachedFetch(u.toString(), headers);
  send(res, r.status, r.body, "application/json; charset=utf-8", { "Cache-Control": "private, max-age=300" });
}
async function proxyOmdb(req, res, query) {
  if (!FEATURES.omdb) return json(res, 503, { error: "omdb_not_configured" });
  const id = query.get("i") || "";
  if (!/^tt\d{5,10}$/.test(id)) return json(res, 400, { error: "bad_id" });
  const r = await cachedFetch(`https://www.omdbapi.com/?i=${id}&apikey=${encodeURIComponent(env.OMDB_KEY)}`);
  send(res, r.status, r.body, "application/json; charset=utf-8", { "Cache-Control": "private, max-age=3600" });
}

// ---------------------------------------------------------------- AI assistant (Claude)
// One Claude call per message: Claude answers and names titles as structured data,
// then each title is matched to its TMDB record so the site can show real cards.
let claude = null;
function claudeClient() {
  if (!claude) { const A = require("@anthropic-ai/sdk"); claude = new (A.default || A)(); } // reads ANTHROPIC_API_KEY
  return claude;
}
const ASSISTANT_MODEL = env.ASSISTANT_MODEL || "claude-opus-5-5";
const ASSISTANT_SYSTEM = `You are the guide inside Vespera, an invite-only website for discovering films, series and anime.
Vespera shows details only: synopses, cast, ratings, trailers and which services carry a title. It does not host or stream video.

Help members decide what to watch: recommend titles, compare them, explain plots without spoilers unless asked, and answer questions about films, series, anime, cast and crew.
- Keep "reply" short and warm: 1-3 sentences, no markdown headings or lists. The titles you name go in "picks", which the site shows as cards.
- Put every title you recommend or discuss in "picks" (up to 8), with its original release year and a one-line "why" in your own words. Only real, released or officially announced titles.
- If the member asks where to watch something, say the title page lists current streaming, rental and purchase options for their region. Never point to unofficial or pirated sources.
- If a request isn't about films or TV, briefly steer back to what you can help with and leave "picks" empty.`;
const PICKS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "picks"],
  properties: {
    reply: { type: "string" },
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "year", "type", "why"],
        properties: {
          title: { type: "string" },
          year: { type: "integer" },
          type: { type: "string", enum: ["movie", "tv"] },
          why: { type: "string" },
        },
      },
    },
  },
};
async function tmdbJson(sub, params) {
  const u = new URL("https://api.themoviedb.org/3/" + sub);
  Object.entries({ language: "en-US", include_adult: "false", ...params }).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  const headers = { accept: "application/json" };
  if (env.TMDB_KEY.length > 40) headers.Authorization = "Bearer " + env.TMDB_KEY; else u.searchParams.set("api_key", env.TMDB_KEY);
  const r = await cachedFetch(u.toString(), headers);
  return r.status === 200 ? JSON.parse(r.body) : { results: [] };
}
async function resolvePick(p) {
  const kind = p.type === "tv" ? "tv" : "movie";
  const yearKey = kind === "movie" ? "primary_release_year" : "first_air_date_year";
  let j = await tmdbJson(`search/${kind}`, { query: p.title, [yearKey]: p.year || undefined });
  if (!j.results?.length) j = await tmdbJson(`search/${kind}`, { query: p.title }); // year can be off by one
  if (!j.results?.length) j = await tmdbJson(`search/${kind === "movie" ? "tv" : "movie"}`, { query: p.title });
  const hit = j.results?.[0];
  if (!hit) return null;
  return { why: p.why, result: { ...hit, media_type: hit.title !== undefined ? "movie" : "tv" } };
}
async function assistant(req, res, user) {
  if (!FEATURES.assistant) return json(res, 503, { error: "assistant_not_configured" });
  if (limited("ai:" + user.email, 30, 10 * 60_000)) return json(res, 429, { error: "slow_down" });
  const body = await readJson(req, 64 * 1024);
  const history = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (history.length && history[0].role !== "user") history.shift();
  if (!history.length || history[history.length - 1].role !== "user") return json(res, 400, { error: "bad_request" });

  const A = require("@anthropic-ai/sdk");
  try {
    const msg = await claudeClient().beta.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if a safety classifier declines, the API retries on a suitable model
      system: [{ type: "text", text: ASSISTANT_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: { type: "json_schema", schema: PICKS_SCHEMA } },
      messages: [...history, { role: "user", content: `(Today is ${new Date().toDateString()}.)` }].reduce((acc, m) => {
        // merge the date note into the final user turn
        if (acc.length && acc[acc.length - 1].role === m.role) acc[acc.length - 1] = { role: m.role, content: acc[acc.length - 1].content + "\n\n" + m.content };
        else acc.push(m);
        return acc;
      }, []),
    });
    if (msg.stop_reason === "refusal") return json(res, 200, { reply: "That's not something I can help with — but ask me about any film or show.", picks: [] });
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    let out;
    try { out = JSON.parse(text); } catch { return json(res, 502, { error: "assistant_failed" }); }
    const picks = (await Promise.all((out.picks || []).slice(0, 8).map(p => resolvePick(p).catch(() => null)))).filter(Boolean);
    return json(res, 200, { reply: String(out.reply || ""), picks });
  } catch (e) {
    if (e instanceof A.RateLimitError) return json(res, 429, { error: "slow_down" });
    if (e instanceof A.AuthenticationError) { log("assistant: Anthropic API key rejected"); return json(res, 503, { error: "assistant_not_configured" }); }
    if (e instanceof A.APIError) { log(`assistant: API error ${e.status}`, e.message); return json(res, 502, { error: "assistant_failed" }); }
    throw e;
  }
}

// ---------------------------------------------------------------- Google sign-in
function googleStart(req, res) {
  if (!FEATURES.google) return redirect(res, "/#/signin?error=google_unavailable");
  const state = crypto.randomBytes(16).toString("base64url");
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${PUBLIC_URL}/api/auth/google/callback`,
    response_type: "code", scope: "openid email", state, prompt: "select_account" });
  addCookie(res, cookie("vespera_oauth", state, 600));
  redirect(res, u.toString());
}
async function googleCallback(req, res, query) {
  addCookie(res, cookie("vespera_oauth", "", 0));
  const fail = e => redirect(res, `/#/signin?error=${e}`);
  const state = parseCookies(req).vespera_oauth;
  if (!FEATURES.google || !state || state !== query.get("state") || !query.get("code")) return fail("google_failed");
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: query.get("code"), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${PUBLIC_URL}/api/auth/google/callback`, grant_type: "authorization_code" }),
    });
    const tok = await r.json();
    if (!r.ok || !tok.id_token) return fail("google_failed");
    // The ID token came straight from Google's token endpoint over TLS, so its claims can be read directly.
    const claims = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64url").toString());
    const email = normEmail(claims.email);
    if (claims.aud !== env.GOOGLE_CLIENT_ID || !claims.email_verified || !validEmail(email)) return fail("google_failed");
    if (!isInvited(email)) return fail("not_invited");
    ensureUser(email);
    createSession(res, email);
    log(`signed in (google): ${email}`);
    redirect(res, "/#/");
  } catch (e) { log("google error", e.message); fail("google_failed"); }
}

// ---------------------------------------------------------------- HTTP helpers
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://image.tmdb.org",
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
    "connect-src 'self'",
    "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; "),
};
function send(res, status, body, type, extra = {}) {
  res.writeHead(status, { "Content-Type": type, ...SECURITY_HEADERS, ...extra });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), "application/json; charset=utf-8", { "Cache-Control": "no-store" });
const redirect = (res, to) => { res.writeHead(302, { Location: to, ...SECURITY_HEADERS }); res.end(); };
function readJson(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(Object.assign(new Error("too_large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")); } catch { reject(Object.assign(new Error("bad_json"), { status: 400 })); } });
    req.on("error", reject);
  });
}
const ip = req => (TRUST_PROXY &&String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress;
const meOf = u => ({ email: u.email, since: u.since, data: u.data, features: FEATURES });

// ---------------------------------------------------------------- static files
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/data.js": ["data.js", "text/javascript; charset=utf-8"],
  "/config.js": ["config.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/star.svg": ["star.svg", "image/svg+xml"],
  "/favicon.ico": ["star.svg", "image/svg+xml"],
};

// ---------------------------------------------------------------- router
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    // State-changing API calls must carry our header (blocks cross-site form posts).
    if (p.startsWith("/api/") && req.method !== "GET" && req.headers["x-vespera"] !== "1") return json(res, 403, { error: "forbidden" });

    if (p === "/healthz") return json(res, 200, { ok: true });
    if (p === "/api/features" && req.method === "GET") return json(res, 200, FEATURES);

    if (p === "/api/auth/start" && req.method === "POST") {
      const { email: raw } = await readJson(req);
      const email = normEmail(raw);
      if (!validEmail(email)) return json(res, 400, { error: "bad_email" });
      if (limited("ip:" + ip(req), 20, 15 * 60_000) || limited("start:" + email, 5, 15 * 60_000)) return json(res, 429, { error: "slow_down" });
      if (!isInvited(email)) { log(`not invited: ${email}`); return json(res, 403, { error: "not_invited" }); }
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      codes.set(email, { hash: sha(email + ":" + code), exp: Date.now() + CODE_MINUTES * 60_000, tries: 0 });
      await sendCode(email, code);
      return json(res, 200, { ok: true, dev: !FEATURES.mail });
    }

    if (p === "/api/auth/verify" && req.method === "POST") {
      const body = await readJson(req);
      const email = normEmail(body.email); const code = String(body.code || "").replace(/\D/g, "");
      if (limited("verify-ip:" + ip(req), 40, 15 * 60_000)) return json(res, 429, { error: "slow_down" });
      const c = codes.get(email);
      if (!c || c.exp < Date.now()) { codes.delete(email); return json(res, 400, { error: "expired" }); }
      if (++c.tries > 5) { codes.delete(email); return json(res, 429, { error: "too_many_tries" }); }
      const a = Buffer.from(sha(email + ":" + code)), b = Buffer.from(c.hash);
      if (code.length !== 6 || !crypto.timingSafeEqual(a, b)) return json(res, 400, { error: "wrong_code", left: 5 - c.tries });
      codes.delete(email);
      const user = ensureUser(email);
      createSession(res, email);
      log(`signed in (email): ${email}`);
      return json(res, 200, meOf(user));
    }

    if (p === "/api/auth/google" && req.method === "GET") return googleStart(req, res);
    if (p === "/api/auth/google/callback" && req.method === "GET") return googleCallback(req, res, url.searchParams);

    if (p === "/api/auth/logout" && req.method === "POST") {
      const t = parseCookies(req)[COOKIE]; if (t) { delete db.sessions[sha(t)]; save(); }
      addCookie(res, cookie(COOKIE, "", 0));
      return json(res, 200, { ok: true });
    }

    // ---- everything below needs a signed-in member
    if (p.startsWith("/api/")) {
      const s = sessionOf(req);
      if (!s || !db.users[s.email]) return json(res, 401, { error: "signed_out" });
      if (limited("api:" + s.email, 900, 60_000)) return json(res, 429, { error: "slow_down" });
      const user = db.users[s.email];

      if (p === "/api/me" && req.method === "GET") return json(res, 200, meOf(user));
      if (p === "/api/me/data" && req.method === "PUT") {
        const d = await readJson(req);
        const ok = d && typeof d === "object" && Array.isArray(d.profiles) && d.profiles.length <= 5 && typeof d.lists === "object";
        if (!ok) return json(res, 400, { error: "bad_data" });
        user.data = { profiles: d.profiles, lists: d.lists, current: typeof d.current === "string" ? d.current : null,
          prefs: typeof d.prefs === "object" && d.prefs ? d.prefs : {}, updated: new Date().toISOString() };
        save();
        return json(res, 200, { ok: true });
      }
      if (p.startsWith("/api/tmdb/") && req.method === "GET") return await proxyTmdb(req, res, p.slice(10), url.searchParams);
      if (p === "/api/omdb" && req.method === "GET") return await proxyOmdb(req, res, url.searchParams);
      if (p === "/api/assistant" && req.method === "POST") return await assistant(req, res, user);
      return json(res, 404, { error: "not_found" });
    }

    // ---- static
    const f = STATIC[p];
    if (!f || (req.method !== "GET" && req.method !== "HEAD")) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    const body = fs.readFileSync(path.join(ROOT, f[0]));
    send(res, 200, req.method === "HEAD" ? undefined : body, f[1], { "Cache-Control": "no-cache" });
  } catch (e) {
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : "server_error" });
    if (!e.status) log("error", p, e.message);
  }
});

server.listen(PORT, HOST, () => {
  log(`Vespera running at ${PUBLIC_URL}`);
  log(`TMDB ${FEATURES.tmdb ? "on" : "OFF (set TMDB_KEY in .env)"} · OMDb ${FEATURES.omdb ? "on" : "off"} · AI assistant ${FEATURES.assistant ? "on" : "off"} · Google ${FEATURES.google ? "on" : "off"} · Email ${FEATURES.mail ? "on" : "dev (codes print here)"} · Invite-only ${INVITE_ONLY ? `on (${invites().size} invited)` : "off"}`);
});
