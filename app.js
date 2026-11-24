/* Vespera — single-page front end (details only; Vespera doesn't host or stream video).
   Data: live from TMDB (+ optional OMDb) when keys are set in config.js,
   otherwise the built-in sample catalog in data.js.
   Hash routes:
     #/welcome  #/signin  #/who  #/who/manage  #/account
     #/  #/movies  #/series  #/anime   (add ?view=all for the full filterable grid)
     #/constellations  #/constellations/:id  #/clips  #/pairings  #/list
     #/search?q=&type=&genre=&year=&rating=&sort=
     #/title/:key  #/network/:id  #/genre/:name
   Auth here is front-end only (localStorage) so the UI can be built and
   reviewed before a real backend is wired in. */
(() => {
  "use strict";

  const CFG = window.VESPERA_CONFIG || {};
  // Vespera brand assets (place both PNG files beside the app entry page).
  const brandFavicon = document.querySelector('link[rel~="icon"]') || document.createElement("link");
  brandFavicon.rel = "icon"; brandFavicon.type = "image/png"; brandFavicon.href = "vespera-icon-minimal.png";
  if (!brandFavicon.parentNode) document.head.appendChild(brandFavicon);
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') || document.createElement("link");
  appleIcon.rel = "apple-touch-icon"; appleIcon.href = "vespera-icon-minimal.png";
  if (!appleIcon.parentNode) document.head.appendChild(appleIcon);
  // Only an explicit true enables server mode. The documented "auto" value
  // must fall back to static mode so TMDB uses the public config key.
  const SERVER = CFG.server === true || CFG.server === "true";
  const LIVE = SERVER || !!(CFG.tmdbKey && CFG.tmdbKey.trim());
  let FEAT = { omdb: !!(CFG.omdbKey && CFG.omdbKey.trim()), google: false, mail: false };
  const TITLES = window.VESPERA_TITLES;
  const COLLS = window.VESPERA_COLLECTIONS;
  const SECTIONS = window.VESPERA_SECTIONS;
  const byId = Object.fromEntries(TITLES.map(t => [t.id, t]));
  const $app = document.getElementById("app");
  const IMG = "https://image.tmdb.org/t/p/";
  const PLAYBACK_API = (CFG.playbackApi || "https://flixstar-api.onrender.com/api").replace(/\/$/, "");
  const WATCH_PROGRESS_KEY = "vespera.watch-progress";
  const WATCH_PROGRESS_MIN_SECONDS = 120;
  function readWatchProgress() {
    try { const value = JSON.parse(localStorage.getItem(WATCH_PROGRESS_KEY) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function progressKey(item) { return `${item.type}-${item.id}-${item.season || 0}-${item.episode || 0}`; }
  function saveWatchProgress(item) {
    const next = readWatchProgress().filter(x => progressKey(x) !== progressKey(item));
    next.push({ ...item, updatedAt: Date.now() });
    try { localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event("vespera-watch-progress"));
  }
  function removeWatchProgress(item) {
    const next = readWatchProgress().filter(x => progressKey(x) !== progressKey(item));
    try { localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event("vespera-watch-progress"));
  }
  function formatWatchTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  }
  const RESUME_PARAMS = [
    { match: /(^|\.)vidlink\.pro$/i, param: "startAt" },
    { match: /(^|\.)vidfast\.(pro|net|vc)$/i, param: "startAt" },
    { match: /(^|\.)videasy\.(net|to)$/i, param: "progress" },
    { match: /(^|\.)vidplus\.to$/i, param: "progress" },
  ];
  function resumeParamFor(url) {
    try { const host = new URL(url).hostname; return RESUME_PARAMS.find(x => x.match.test(host))?.param || null; }
    catch { return null; }
  }
  function isFrameXTVProvider(id, name = "") {
    return `${id || ""} ${name || ""}`.toLowerCase().replace(/[^a-z0-9]/g, "").includes("framextv");
  }
  function withResume(url, seconds) {
    const param = resumeParamFor(url);
    if (!param || !seconds) return url;
    try { const u = new URL(url); u.searchParams.set(param, String(Math.floor(seconds))); return u.toString(); }
    catch { return url; }
  }
  function findSavedProgress(type, id, season, episode) {
    return readWatchProgress().find(x => String(x.id) === String(id) && x.type === type &&
      (type !== "tv" || (Number(x.season) === Number(season) && Number(x.episode) === Number(episode)))) || null;
  }
  function continueWatchingSection() {
    const items = readWatchProgress().filter(x => x?.id && x?.progress > 0 && x?.progress < .95)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 10);
    if (!items.length) return "";
    const cards = items.map(item => {
      const pct = Math.min(100, Math.max(0, Number(item.progress || 0) * 100));
      const remaining = Math.max(0, Number(item.duration || 0) - Number(item.timestamp || 0));
      const key = item.key || `${item.type}-${item.id}`;
      const query = item.type === "tv" ? `?season=${encodeURIComponent(item.season || 1)}&episode=${encodeURIComponent(item.episode || 1)}` : "";
      const image = item.backdrop || item.poster || "";
      return `<article class="cw-card">
        <a class="cw-poster" href="#/watch/${esc(key)}${query}" aria-label="Continue watching ${esc(item.title || item.name || "title")}">
          ${image ? `<img src="${esc(image)}" alt="${esc(item.title || item.name || "")}" loading="lazy">` : `<span class="cw-placeholder">VESPERA</span>`}
          <span class="cw-play">${icons.play}</span><span class="cw-progress"><i style="width:${pct}%"></i></span>
        </a>
        <div class="cw-meta"><a href="#/watch/${esc(key)}${query}" class="cw-title">${esc(item.title || item.name || "Untitled")}</a>
          ${item.type === "tv" ? `<span class="cw-episode">S${Number(item.season) || 1} E${Number(item.episode) || 1}</span>` : ""}
          <span class="cw-time">${remaining > 0 ? `${formatWatchTime(remaining)} left` : `${Math.round(pct)}% watched`}</span>
        </div>
        <button class="cw-remove" data-action="continue-remove" data-progress-key="${esc(progressKey(item))}" aria-label="Remove ${esc(item.title || item.name || "title")}" title="Remove from Continue Watching">×</button>
      </article>`;
    }).join("");
    return `<section class="section cw-section" id="continueWatching">
      <div class="section-head"><h2>Continue Watching</h2><div class="cw-head-actions">
        <button class="cw-manage" data-action="continue-manage" aria-pressed="false">Manage</button>
        <button class="cw-clear" data-action="continue-clear" hidden>Clear all</button>
      </div></div>
      <div class="cw-row-wrap"><div class="cw-row">${cards}</div></div>
    </section>
    <style>
      .cw-head-actions{display:flex;align-items:center;gap:8px}.cw-manage,.cw-clear{border:1px solid var(--line);background:var(--panel,var(--line));color:var(--muted);border-radius:999px;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer}.cw-manage[aria-pressed="true"]{color:var(--text);border-color:var(--accent)}.cw-clear{color:var(--muted)}
      .cw-row-wrap{overflow-x:auto;scrollbar-width:thin;padding:0 var(--gutter)}.cw-row{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(210px,24%);gap:14px;min-width:0}
      .cw-card{position:relative;min-width:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--panel)}.cw-poster{position:relative;display:block;aspect-ratio:16/9;background:var(--panel,var(--line));overflow:hidden}.cw-poster img{width:100%;height:100%;display:block;object-fit:cover;transition:transform .35s}.cw-card:hover .cw-poster img{transform:scale(1.04)}.cw-placeholder{height:100%;display:grid;place-items:center;color:var(--muted);font-size:12px;letter-spacing:.18em}.cw-play{position:absolute;inset:0;display:grid;place-items:center;color:white;background:linear-gradient(0deg,rgba(0,0,0,.34),rgba(0,0,0,.06));opacity:0;transition:opacity .2s}.cw-card:hover .cw-play{opacity:1}.cw-play svg{width:42px;height:42px;padding:11px;border-radius:50%;background:rgba(0,0,0,.62)}.cw-progress{position:absolute;bottom:0;left:0;right:0;height:4px;background:rgba(255,255,255,.28)}.cw-progress i{display:block;height:100%;background:var(--accent);box-shadow:0 0 8px color-mix(in srgb,var(--accent) 55%,transparent)}
      .cw-meta{display:grid;grid-template-columns:1fr auto;gap:5px 8px;padding:10px 11px 11px}.cw-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font-weight:650;font-size:13px;text-decoration:none}.cw-episode{color:var(--muted);font-size:11px}.cw-time{grid-column:1/-1;color:var(--muted);font-size:11px}.cw-remove{display:none;position:absolute;top:8px;right:8px;width:27px;height:27px;border:1px solid rgba(255,255,255,.25);border-radius:50%;background:rgba(8,10,14,.82);color:#fff;font-size:20px;line-height:1;cursor:pointer}.cw-section.cw-managing .cw-remove{display:block}.cw-section.cw-managing .cw-poster{filter:saturate(.8)}
      @media(max-width:700px){.cw-row{grid-auto-columns:minmax(190px,68%);gap:11px}.cw-title{font-size:12px}}
    </style>`;
  }
  const TODAY = new Date().toISOString().slice(0, 10);

  // ---------- storage (safe) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("vespera." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("vespera." + k, JSON.stringify(v)); } catch {} queueSync(k); },
    del(k) { try { localStorage.removeItem("vespera." + k); } catch {} queueSync(k); },
  };
  const region = () => (store.get("region", null) || CFG.region || "US").toUpperCase();

  // ---------- server API + account sync ----------
  async function api(path, method = "GET", body) {
    const r = await fetch("/api/" + path, { method, credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Vespera": "1" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "HTTP " + r.status), { code: j.error, status: r.status, data: j });
    return j;
  }
  const SYNC_KEYS = ["profiles", "lists", "perf", "autoplay", "region", "lang"];
  let hydrating = false, syncTimer = null;
  // Guest mode has no account session. Cross-device transfer is handled by
  // the explicit backup import/export controls in Settings.
  function queueSync(k) { /* local-first guest mode */ }
  function pushData() {
    if (!store.get("auth", null)) return;
    api("me/data", "PUT", {
      profiles: store.get("profiles", []), lists: store.get("lists", {}),
      prefs: Object.fromEntries(["perf", "autoplay", "region", "lang"].map(k => [k, store.get(k, null)]).filter(([, v]) => v !== null)),
    }).catch(e => { if (e.status === 401) signedOut(true); else toast("Couldn't save to your account — will retry"); });
  }
  // Load the member's saved data from the server into this browser.
  function hydrate(me) {
    hydrating = true;
    try {
      FEAT = { ...FEAT, ...(me.features || {}) };
      store.set("auth", { email: me.email, since: me.since });
      const d = me.data || {};
      store.set("profiles", d.profiles || []);
      store.set("lists", d.lists || {});
      Object.entries(d.prefs || {}).forEach(([k, v]) => store.set(k, v));
      const cur = store.get("current", null);
      if (!(d.profiles || []).some(p => p.id === cur)) store.del("current");
    } finally { hydrating = false; }
  }
  function signedOut(expired) {
    closeAssistant(); aiMsgs = []; try { sessionStorage.removeItem("vespera.ai"); } catch {}
    hydrating = true;
    ["auth", "profiles", "lists", "current"].forEach(k => store.del(k));
    hydrating = false;
    location.hash = "#/welcome";
    if (expired) toast("Your session ended — please sign in again");
  }

  // ---------- item registry ----------
  const items = new Map();
  const reg = it => { items.set(it.key, it); return it; };
  TITLES.forEach(t => reg({ ...t, key: t.id, kind: t.type === "tv" || t.format === "Series" ? "tv" : "movie", local: true, full: true,
    byRole: t.type === "movie" || t.format === "Film" ? "Directed by" : "Created by" }));

  // ---------- TMDB ----------
  const reqCache = new Map();
  function tmdb(path, params = {}) {
    const p = { language: "en-US", ...params };
    if (path.startsWith("discover") || path.startsWith("search")) p.include_adult = "false";
    let u, opts = {};
    if (SERVER) u = new URL("/api/tmdb/" + path, location.origin); // the server adds the key
    else {
      u = new URL("https://api.themoviedb.org/3/" + path);
      const key = CFG.tmdbKey.trim();
      if (key.length > 40) opts = { headers: { Authorization: "Bearer " + key, accept: "application/json" } }; else p.api_key = key;
    }
    Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "" && v !== null) u.searchParams.set(k, v); });
    const s = u.toString();
    if (reqCache.has(s)) return reqCache.get(s);
    const pr = fetch(s, opts)
      .then(r => { if (r.status === 401 && SERVER) signedOut(true); if (!r.ok) throw new Error("TMDB " + r.status); return r.json(); });
    pr.catch(() => reqCache.delete(s));
    reqCache.set(s, pr); return pr;
  }

  const G = { movie: {}, tv: {} };
  const ALIAS = { "Science Fiction": "Sci-Fi", "Sci-Fi & Fantasy": "Sci-Fi", "Action & Adventure": "Action", "War & Politics": "War" };
  const alias = n => ALIAS[n] || n;
  let genresReady = null;
  function ensureGenres() {
    if (!LIVE) return Promise.resolve();
    return genresReady ||= Promise.all([tmdb("genre/movie/list"), tmdb("genre/tv/list")]).then(([m, t]) => {
      m.genres.forEach(g => G.movie[g.id] = g.name); t.genres.forEach(g => G.tv[g.id] = g.name);
    }).catch(e => { genresReady = null; throw e; });
  }
  const genreIds = (kind, name) => Object.entries(G[kind]).filter(([, n]) => alias(n) === name).map(([id]) => id);
  const allGenreNames = () => LIVE ? [...new Set([...Object.values(G.movie), ...Object.values(G.tv)].map(alias))].sort()
    : [...new Set(TITLES.flatMap(t => t.genres))].sort();

  function fromTmdb(r, kindHint) {
    const kind = r.media_type || kindHint;
    if (kind !== "movie" && kind !== "tv") return null;
    const key = `${kind}-${r.id}`;
    const date = r.release_date || r.first_air_date || "";
    const gids = r.genre_ids || (r.genres || []).map(g => g.id);
    const anime = gids.includes(16) && r.original_language === "ja";
    const prev = items.get(key) || {};
    return reg({ ...prev, key, tmdbId: r.id, kind, type: anime ? "anime" : kind, format: anime ? (kind === "movie" ? "Film" : "Series") : undefined,
      title: r.title || r.name, year: date ? +date.slice(0, 4) : null, date,
      genres: [...new Set(gids.map(id => alias(G[kind][id])).filter(Boolean))],
      synopsis: r.overview || prev.synopsis || "",
      poster: r.poster_path ? IMG + "w342" + r.poster_path : prev.poster || null,
      posterLg: r.poster_path ? IMG + "w500" + r.poster_path : prev.posterLg || null,
      backdrop: r.backdrop_path ? IMG + "w1280" + r.backdrop_path : prev.backdrop || null,
      lang: r.original_language || prev.lang,
      vote: r.vote_average ?? prev.vote, votes: r.vote_count ?? prev.votes, pop: r.popularity ?? prev.pop });
  }
  const listOf = (json, kind) => (json.results || json.parts || []).map(r => fromTmdb(r, kind)).filter(Boolean);

  async function detail(key) {
    const cached = items.get(key);
    if (cached?.full) return cached;
    if (!LIVE) return cached || null;
    const [kind, id] = key.split("-");
    if (!["movie", "tv"].includes(kind) || !id) return null;
    const d = await tmdb(`${kind}/${id}`, { append_to_response: "credits,watch/providers,videos,external_ids,recommendations,images,reviews", include_image_language: "en,null" });
    const it = fromTmdb({ ...d, media_type: kind });
    const crew = d.credits?.crew || [];
    it.by = kind === "movie" ? crew.filter(c => c.job === "Director").map(c => c.name).join(" & ") : (d.created_by || []).map(c => c.name).join(" & ");
    it.byRole = kind === "movie" ? "Directed by" : "Created by";
    it.cast = (d.credits?.cast || []).slice(0, 4).map(c => c.name);
    it.castNames = (d.credits?.cast || []).slice(0, 10).map(c => c.name);
    it.castFull = (d.credits?.cast || []).slice(0, 14).map(c => ({ id: c.id, name: c.name, role: c.character, photo: c.profile_path ? IMG + "w185" + c.profile_path : null }));
    it.network = kind === "tv" ? (d.networks || []).slice(0, 2).map(n => n.name).join(" / ") : (d.production_companies || []).slice(0, 2).map(c => c.name).join(" / ");
    it.networkIds = kind === "tv" ? (d.networks || []).map(n => ({ id: n.id, name: n.name })) : [];
    it.runtime = kind === "movie" ? (d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : "") : (d.number_of_seasons ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? "s" : ""}` : "");
    it.tagline = d.tagline || "";
    it.status = d.status || "";
    it.imdb = d.imdb_id || d.external_ids?.imdb_id || null;
    it.seasons = kind === "tv" ? (d.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0).map(s => ({ n: s.season_number, name: s.name, count: s.episode_count, year: (s.air_date || "").slice(0, 4) })) : null;
    const vids = (d.videos?.results || []).filter(v => v.site === "YouTube");
    const tr = vids.find(v => v.type === "Trailer" && v.official) || vids.find(v => v.type === "Trailer") || vids.find(v => v.type === "Teaser");
    it.trailer = tr?.key || null; it.trailerName = tr?.name || "";
    const logos = d.images?.logos || [];
    const logo = logos.find(l => l.iso_639_1 === "en") || logos[0];
    it.logo = logo ? IMG + "w500" + logo.file_path : null;
    it.wpAll = d["watch/providers"]?.results || {};
    it.similar = listOf(d.recommendations || {}, kind).map(x => x.key);
    it.reviews = (d.reviews?.results || []).slice(0, 4).map(r => ({ author: r.author, rating: r.author_details?.rating, content: r.content, date: (r.created_at || "").slice(0, 10), url: r.url }));
    if (FEAT.omdb && it.imdb) {
      try {
        const o = await fetch(SERVER ? `/api/omdb?i=${encodeURIComponent(it.imdb)}`
          : `https://www.omdbapi.com/?i=${encodeURIComponent(it.imdb)}&apikey=${encodeURIComponent(CFG.omdbKey)}`).then(r => r.json());
        if (o.Response === "True") {
          it.ratings = (o.Ratings || []).map(r => ({ src: { "Internet Movie Database": "IMDb", "Rotten Tomatoes": "Rotten Tomatoes", "Metacritic": "Metacritic" }[r.Source] || r.Source, val: r.Value.replace(/\/(100|10)$/, "") }));
          it.awards = o.Awards && o.Awards !== "N/A" ? o.Awards : null;
          it.rated = o.Rated && o.Rated !== "N/A" && o.Rated !== "Not Rated" ? o.Rated : null;
        }
      } catch {}
    }
    it.full = true;
    return it;
  }
  function providersFor(it) {
    const wp = it.wpAll?.[region()]; if (!wp) return null;
    const seen = new Set(); const list = [];
    [["flatrate", "Stream"], ["free", "Free"], ["ads", "With ads"], ["rent", "Rent"], ["buy", "Buy"]].forEach(([f, how]) =>
      (wp[f] || []).forEach(p => { if (!seen.has(p.provider_id)) { seen.add(p.provider_id); list.push({ name: p.provider_name, logo: IMG + "w92" + p.logo_path, how }); } }));
    return list.length ? { link: wp.link, list } : null;
  }

  // ---------- data API (same calls in both modes) ----------
  const uniq = list => { const seen = new Set(); return list.filter(x => x && !seen.has(x.key) && seen.add(x.key)); };

  // ---------- people (actors, directors) ----------
  // "Lupita Nyong'o" and "lupita nyongo" compare equal; accents are ignored.
  const normName = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’`.]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const peopleJobs = new Map();
  // People whose name contains every word typed (best known first), or TMDB's top hit if it shares a word.
  function findPeople(q) {
    const key = normName(q);
    if (!peopleJobs.has(key)) peopleJobs.set(key, tmdb("search/person", { query: q }).then(j => {
      const words = key.split(" ").filter(Boolean);
      const res = (j.results || []).filter(p => p.profile_path || (p.known_for || []).length);
      const full = res.filter(p => { const n = normName(p.name); return words.every(w => n.includes(w)); });
      const list = full.length ? full : res.slice(0, 1).filter(p => words.some(w => w.length > 2 && normName(p.name).includes(w)));
      return list.slice(0, 8).map(p => ({ id: p.id, name: p.name, photo: p.profile_path ? IMG + "w185" + p.profile_path : null,
        dept: p.known_for_department || "", pop: p.popularity || 0, exact: normName(p.name) === key,
        kfVotes: Math.max(0, ...(p.known_for || []).map(k => k.vote_count || 0)), // how well known their best work is
        knownFor: (p.known_for || []).map(k => k.title || k.name).filter(Boolean).slice(0, 2) }));
    }).catch(e => { peopleJobs.delete(key); throw e; }));
    return peopleJobs.get(key);
  }
  const filmJobs = new Map();
  // A person's full filmography, biggest parts first.
  function personFilmography(id) {
    if (!filmJobs.has(id)) filmJobs.set(id, tmdb(`person/${id}/combined_credits`).then(c => {
      const skipGenres = [10763, 10764, 10767]; // news, reality, talk shows
      const self = r => /^(self|himself|herself|themselves|narrator \(voice\)|host)\b/i.test(r || "");
      const score = new Map();
      const add = (x, weight) => {
        if ((x.genre_ids || []).some(g => skipGenres.includes(g))) return;
        const it = fromTmdb(x); if (!it || (!it.poster && (it.votes || 0) < 3)) return;
        const base = Math.log10((x.vote_count || 0) + 1) * 70 + Math.min(x.popularity || 0, 200) / 4 + 10;
        score.set(it.key, Math.max(score.get(it.key) || 0, base * weight));
      };
      // How much of a series someone was in: main cast (20+ episodes) counts fully, a guest spot hardly at all.
      const tvShare = n => (n = n || 1) >= 20 ? 1 : n >= 8 ? .75 : n >= 3 ? .45 : .25;
      (c.cast || []).forEach(x => {
        if (self(x.character)) return;
        // Lead roles count fully; small parts and one-off TV guest spots count less.
        const w = x.media_type === "movie" ? (x.order == null ? .7 : x.order <= 3 ? 1 : x.order <= 8 ? .8 : .5) : tvShare(x.episode_count);
        add(x, w);
      });
      (c.crew || []).forEach(x => {
        let w = x.job === "Director" || x.job === "Creator" ? 1 : ["Writer", "Screenplay", "Novel", "Story"].includes(x.job) ? .8 : x.job === "Executive Producer" || x.job === "Producer" ? .35 : 0;
        if (x.media_type === "tv" && x.job !== "Creator") w *= tvShare(x.episode_count); // directing one episode isn't their show
        if (w) add(x, w);
      });
      return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => items.get(k)).filter(Boolean);
    }).catch(e => { filmJobs.delete(id); throw e; }));
    return filmJobs.get(id);
  }
  const localOf = type => TITLES.filter(t => t.type === type).map(t => items.get(t.id));
  const shuffleBy = (l, seed) => [...l].sort((a, b) => hash(a.key + seed) - hash(b.key + seed));
  const data = {
    async row(r) {
      if (!LIVE) {
        if (r.pick) return r.pick.map(id => items.get(id)).filter(Boolean);
        return TITLES.filter(t => (!r.genre || t.genres.includes(r.genre)) && (!r.type || t.type === r.type) && (!r.before || t.year < r.before)).map(t => items.get(t.id));
      }
      return listOf(await tmdb(r.path, r.params || {}), r.kind);
    },
    rowMore(r) {
      if (r.more) return r.more;
      if (!LIVE) { if (r.genre) return `#/genre/${slug(r.genre)}`; if (r.type) return r.type === "tv" ? "#/series" : `#/${r.type}`; }
      return null;
    },
    // Section landing (movies / series / anime)
    section(kind) {
      if (LIVE) return SECTIONS[kind];
      const type = { movies: "movie", series: "tv", anime: "anime" }[kind];
      const all = localOf(type);
      const genres = [...new Set(all.flatMap(t => t.genres))];
      return {
        hero: { local: shuffleBy(all, "hero").slice(0, 5) },
        top10: { label: `Top 10 ${BROWSE[kind].h}`, local: shuffleBy(all, "top").slice(0, 10) },
        rows: genres.map((g, i) => ({ label: i === 1 ? `Spotlight · ${g}` : g, spotlight: i === 1, local: all.filter(t => t.genres.includes(g)), more: `#/genre/${slug(g)}` }))
          .filter(r => r.local.length >= 2),
      };
    },
    async load(r) { return r.local ? r.local : data.row(r); },
    genres(kind) {
      if (!LIVE) {
        const type = { movies: "movie", series: "tv", anime: "anime" }[kind];
        return [...new Set(TITLES.filter(t => t.type === type).flatMap(t => t.genres))].sort().map(g => ({ value: g, label: g }));
      }
      const src = kind === "movies" ? G.movie : G.tv;
      return Object.entries(src).filter(([id]) => !(kind === "anime" && id === "16")).map(([id, n]) => ({ value: id, label: alias(n) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    async browse(kind, g, sort, page) {
      if (!LIVE) {
        const type = { movies: "movie", series: "tv", anime: "anime" }[kind];
        let l = TITLES.filter(t => t.type === type && (!g || t.genres.includes(g))).map(t => items.get(t.id));
        return { list: sortItems(l, sort), more: false };
      }
      const mk = kind === "movies" ? "movie" : "tv";
      const p = { page, ...discoverSort(mk, sort) };
      const gs = [kind === "anime" ? "16" : "", g].filter(Boolean).join(",");
      if (gs) p.with_genres = gs;
      if (kind === "anime") p.with_original_language = "ja";
      const j = await tmdb(`discover/${mk}`, p);
      return { list: listOf(j, mk), more: j.page < Math.min(j.total_pages, 500) };
    },
    // Search returns { list, more } so the page can offer "Load more".
    // Tabs: movie = all films (incl. animated), tv = all series, anime = Japanese animation (films + series).
    async search({ q, type, genre, year, rating, sort }, page = 1) {
      const ofType = it => !type || (type === "anime" ? it.type === "anime" : it.kind === type);
      const refine = l => {
        let out = l.filter(ofType);
        if (genre) out = out.filter(it => (it.genres || []).includes(genre));
        if (year) out = out.filter(it => String(it.year) === String(year));
        if (rating && LIVE) out = out.filter(it => (it.vote || 0) >= +rating);
        return sort ? sortItems(out, sort) : out;
      };
      if (!LIVE) {
        const s = (q || "").toLowerCase();
        const l = TITLES.filter(t => !s || [t.title, t.by, t.network, ...t.genres, ...t.cast, String(t.year)].join(" ").toLowerCase().includes(s)).map(t => items.get(t.id));
        return { list: refine(l), more: false };
      }
      if (!q) return data.discoverSearch({ type, genre, year, rating, sort }, page);

      const yr = year ? +year : undefined;
      const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
      const nq = norm(q);
      const titleScore = it => { const nt = norm(it.title); return nt === nq ? 3 : nt.startsWith(nq + " ") || nt.startsWith(nq) ? 2 : nt.includes(nq) ? 1 : 0; };
      // Title match helps, but popularity decides between e.g. "Batman" (1989) and an unknown short also called "Batman".
      const rank = it => titleScore(it) * 120 + Math.log10((it.votes || 0) + 1) * 70 + Math.min(it.pop || 0, 300) / 3;

      // Titles: films and series searched separately, two pages at a time.
      const pages = [page * 2 - 1, page * 2];
      const kinds = type === "movie" ? ["movie"] : type === "tv" ? ["tv"] : ["movie", "tv"];
      const res = await Promise.all(kinds.flatMap(k => pages.map(p =>
        tmdb(`search/${k}`, { query: q, page: p, ...(yr ? { [k === "movie" ? "primary_release_year" : "first_air_date_year"]: yr } : {}) })
          .then(j => ({ k, j })).catch(() => ({ k, j: { results: [], page: p, total_pages: 0 } })))));
      const more = res.some(({ j }) => (j.page || 0) < (j.total_pages || 0));
      let titles = uniq(res.flatMap(({ k, j }) => listOf(j, k)))
        .filter(t => t.poster || (t.votes || 0) >= 5) // drop near-empty entries
        .sort((a, b) => rank(b) - rank(a));

      // People: a matching actor or director brings their whole filmography, 40 titles per page.
      const PER = 40;
      let people = [], person = null, credits = [];
      if (!yr && nq.length >= 3) {
        people = await findPeople(q).catch(() => []);
        // Lead with a person when the words typed are their name (all words match), not just part of a title.
        const words = normName(q).split(" ");
        const real = people.filter(p => p.kfVotes >= 20); // ignore profiles with no real body of work
        const famousTitle = titles.some(t => titleScore(t) === 3 && (t.votes || 0) > 1000);
        // One common first name ("tom") that fits several well-known people is ambiguous — show the People row instead.
        const nameFits = real.filter(p => normName(p.name).split(" ").includes(words[0]) && p.kfVotes >= 2000
          && ["Acting", "Directing", "Writing"].includes(p.dept) && p.pop >= 1).sort((a, b) => b.pop - a.pop);
        // A clear favourite: far more popular than anyone else with that name (Keanu Reeves vs other Keanus; not the many Toms).
        const clearFavourite = nameFits.length && (nameFits.length === 1 || nameFits[0].pop >= 3 * nameFits[1].pop) ? nameFits[0] : null;
        person = real.find(p => p.exact && (p.kfVotes >= 200 || !famousTitle))
          // several words typed and they're all in the name ("denzel washington", "lupita nyongo")
          || (words.length > 1 && real[0] ? real[0] : null)
          // one word that is a whole first/last name of one well-known person ("keanu", "zendaya")
          || (words.length === 1 ? clearFavourite : null);
        // Only show the People row when it's likely what was meant.
        people = people.filter(p => p === person || (p.exact && p.kfVotes >= 20)
          || (["Acting", "Directing", "Writing"].includes(p.dept) && p.pop >= 1 && p.kfVotes >= 300));
        if (person) credits = await personFilmography(person.id).catch(() => []);
      }
      const creditPage = credits.slice((page - 1) * PER, page * PER);
      const moreCredits = credits.length > page * PER;

      let lead = [], tail = [];
      if (creditPage.length) {
        // e.g. "keanu": the well-known film called exactly that, then Keanu Reeves' work, then everything else.
        const famousExact = page === 1 ? titles.filter(t => titleScore(t) === 3 && (t.votes || 0) > 1000) : [];
        lead = [...famousExact, ...creditPage];
      }
      if (page === 1 && !yr) {
        const [related] = await Promise.all([
          // A theme like "heist" or "time travel" → popular titles tagged with it.
          tmdb("search/keyword", { query: q }).then(async j => {
            const exact = (j.results || []).find(k => norm(k.name) === nq);
            const kw = exact || (j.results || []).find(k => norm(k.name).startsWith(nq));
            if (!kw) return { list: [], exact: false };
            const ls = await Promise.all(["movie", "tv"].filter(k => kinds.includes(k)).map(k =>
              tmdb(`discover/${k}`, { with_keywords: kw.id, sort_by: "vote_count.desc", "vote_count.gte": 30 }).then(d => listOf(d, k)).catch(() => [])));
            const out = []; for (let i = 0; i < 20; i++) ls.forEach(l => l[i] && out.push(l[i]));
            return { list: out, exact: !!exact };
          }).catch(() => ({ list: [], exact: false })),
        ]);
        if (related.exact && related.list.length && !person) {
          // A theme search ("heist", "time travel"): best-known matches by name, then the best titles about it.
          const famous = titles.filter(t => (t.votes || 0) > 300).slice(0, 4);
          lead = [...lead, ...famous, ...related.list.slice(0, 16)];
          tail.push(...related.list.slice(16));
        } else tail.push(...related.list);
      }
      // When the search is clearly a person, their films come first and name-matching titles follow.
      return { list: refine(uniq([...lead, ...titles, ...tail])), more: more || moreCredits, people: page === 1 ? people : [], person };
    },
    // Filters only (no words typed): browse TMDB with the chosen filters.
    async discoverSearch({ type, genre, year, rating, sort }, page = 1) {
      const kinds = type === "movie" ? ["movie"] : type === "tv" ? ["tv"] : ["movie", "tv"];
      const res = await Promise.all(kinds.map(k => {
        const p = { ...discoverSort(k, sort || "popular"), "vote_count.gte": 50, page };
        const ids = genre ? genreIds(k, genre) : [];
        if (genre && !ids.length) return { k, j: { results: [] } };
        if (ids.length) p.with_genres = ids.join("|");
        if (type === "anime") { p.with_genres = ["16", ...ids].join(","); p.with_original_language = "ja"; }
        if (year) p[k === "movie" ? "primary_release_year" : "first_air_date_year"] = year;
        if (rating) p["vote_average.gte"] = rating;
        return tmdb(`discover/${k}`, p).then(j => ({ k, j })).catch(() => ({ k, j: { results: [] } }));
      }));
      const lists = res.map(({ k, j }) => listOf(j, k));
      const out = []; for (let i = 0; i < 20; i++) lists.forEach(l => l[i] && out.push(l[i]));
      return { list: out, more: res.some(({ j }) => (j.page || 0) < Math.min(j.total_pages || 0, 500)) };
    },
    async genre(name) {
      if (!LIVE) return TITLES.filter(t => t.genres.includes(name)).map(t => items.get(t.id));
      const [m, t] = await Promise.all(["movie", "tv"].map(k => { const ids = genreIds(k, name).join("|");
        return ids ? tmdb(`discover/${k}`, { with_genres: ids, "vote_count.gte": 200 }).then(j => listOf(j, k)) : []; }));
      const out = []; for (let i = 0; i < Math.max(m.length, t.length); i++) { if (m[i]) out.push(m[i]); if (t[i]) out.push(t[i]); }
      return out;
    },
    networks() {
      if (LIVE) return window.VESPERA_NETWORKS.map(n => ({ value: n.id, label: n.name }));
      const c = {}; TITLES.forEach(t => t.network.split(" / ").forEach(n => c[n.trim()] = (c[n.trim()] || 0) + 1));
      return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, k]) => ({ value: n, label: n, count: k }));
    },
    async network(v) {
      if (!LIVE) return { name: v, list: TITLES.filter(t => t.network.split(" / ").map(s => s.trim()).includes(v)).map(t => items.get(t.id)) };
      const n = window.VESPERA_NETWORKS.find(x => String(x.id) === String(v));
      const [p1, p2] = await Promise.all([1, 2].map(page => tmdb("discover/tv", { with_networks: v, page, sort_by: "popularity.desc" })));
      return { name: n ? n.name : "Network", list: [...listOf(p1, "tv"), ...listOf(p2, "tv")] };
    },
    async resolveLocal(id) {
      const t = byId[id]; if (!LIVE) return items.get(id);
      const mk = t.type === "tv" || t.format === "Series" ? "tv" : "movie";
      const j = await tmdb(`search/${mk}`, mk === "movie" ? { query: t.title, primary_release_year: t.year } : { query: t.title, first_air_date_year: t.year });
      return listOf(j, mk)[0] || null;
    },
    async collection(c) { return (await Promise.all(c.ids.map(id => data.resolveLocal(id).catch(() => null)))).filter(Boolean); },
    async franchise(name) {
      const s = await tmdb("search/collection", { query: name });
      const c = (s.results || [])[0]; if (!c) return { name, list: [] };
      const j = await tmdb(`collection/${c.id}`);
      const list = listOf(j, "movie").sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
      return { name: j.name.replace(/ Collection$/, ""), list };
    },
    async pairings() {
      if (!LIVE) {
        const out = []; const used = new Set(); const all = TITLES.map(t => items.get(t.id));
        for (const a of all) {
          if (used.has(a.key)) continue; let best = null, score = 0;
          for (const b of all) { if (b.key === a.key || used.has(b.key) || b.type === a.type) continue;
            const s = a.genres.filter(g => b.genres.includes(g)).length; if (s > score) { score = s; best = b; } }
          if (best) { used.add(a.key); used.add(best.key); out.push([a, best]); }
        }
        return out;
      }
      const seeds = (await data.row({ path: "trending/all/week" })).slice(0, 12);
      const used = new Set(seeds.map(s => s.key)); const out = [];
      await Promise.all(seeds.map(async s => {
        try { const j = await tmdb(`${s.kind}/${s.tmdbId}/recommendations`); const recs = listOf(j, s.kind);
          const pick = recs.find(r => !used.has(r.key) && r.backdrop); if (pick) { used.add(pick.key); out.push([s, pick]); } } catch {}
      }));
      return out;
    },
    async clips() {
      if (!LIVE) return [];
      const [a, b, c] = await Promise.all([tmdb("trending/all/week"), tmdb("trending/all/week", { page: 2 }), tmdb("movie/upcoming")]);
      return uniq([...listOf(a), ...listOf(c, "movie"), ...listOf(b)]).filter(t => t.backdrop);
    },
    async random() {
      if (!LIVE) return items.get(TITLES[Math.floor(Math.random() * TITLES.length)].id);
      const j = await tmdb("trending/all/week", { page: 1 + Math.floor(Math.random() * 5) });
      const l = listOf(j); return l[Math.floor(Math.random() * l.length)];
    },
  };
  function discoverSort(mk, sort) {
    const dateF = mk === "movie" ? "primary_release_date" : "first_air_date";
    switch (sort) {
      case "new": return { sort_by: `${dateF}.desc`, [`${dateF}.lte`]: TODAY, "vote_count.gte": 50 };
      case "old": return { sort_by: `${dateF}.asc`, "vote_count.gte": 500 };
      case "az": return { sort_by: mk === "movie" ? "title.asc" : "name.asc", "vote_count.gte": 1000 };
      case "top": return { sort_by: "vote_average.desc", "vote_count.gte": mk === "movie" ? 1500 : 400 };
      default: return { sort_by: "popularity.desc" };
    }
  }
  function sortItems(l, s) {
    const out = [...l];
    if (s === "new") out.sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (s === "old") out.sort((a, b) => (a.year || 9999) - (b.year || 9999));
    else if (s === "az") out.sort((a, b) => a.title.localeCompare(b.title));
    else if (s === "top") out.sort((a, b) => (b.vote || 0) - (a.vote || 0));
    else if (s === "popular" && LIVE) out.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    return out;
  }

  // ---------- profiles / lists ----------
  const AV_COLORS = ["#f4b860", "#ff8a5c", "#9b87f5", "#5cc8ff", "#6fd39a", "#ff6fa8", "#e8e3d8"];
  const AV_PRESETS = ["🦊", "🐼", "🐸", "🐯", "🐱", "🐙", "🐧", "🦉", "🐻", "🐲", "🐨", "🦄", "🐺", "🐰"];
  // Profile avatars are stored with profile data so they follow the profile on supported sync.
  const avatarStyle = document.getElementById("vespera-avatar-style") || document.createElement("style");
  avatarStyle.id = "vespera-avatar-style";
  avatarStyle.textContent = `.avatar{overflow:hidden;display:inline-grid;place-items:center;flex:0 0 auto}.avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit}.avatar-emoji{font-size:1.45em;line-height:1}.modal.avatar-modal{width:min(800px,calc(100vw - 28px));max-height:90vh;overflow:auto}.avatar-picker{width:100%;max-height:unset;overflow:visible}.av-preview{display:flex;align-items:center;gap:14px;margin:18px 0;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.av-preview .avatar{width:64px;height:64px;font-size:24px}.av-tools{display:flex;flex-wrap:wrap;gap:9px}.av-upload{position:relative;display:inline-flex;align-items:center;gap:8px}.av-upload input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.av-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:12px;margin:12px 0 20px}.av-choice{border:1px solid transparent;border-radius:13px;background:var(--panel);color:var(--text);padding:7px;cursor:pointer;display:grid;justify-items:center;gap:5px;min-width:0}.av-choice:hover,.av-choice.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--panel))}.av-choice img{width:58px;height:58px;border-radius:50%;object-fit:cover;background:#17151d}.av-choice .av-emoji{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font-size:30px}.av-choice small{font-size:10px;color:var(--muted);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.av-section-title{font-size:13px;font-weight:700;margin:20px 0 8px}.av-search{display:flex;gap:8px;margin:10px 0}.av-search .input{flex:1;min-width:0}.av-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:10px}.av-status{color:var(--muted);font-size:12px;margin:8px 0}.av-show{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:10px;padding:8px;cursor:pointer;text-align:left}.av-show img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:7px}.av-show b{display:block;font-size:11px;margin-top:5px}.av-franchise-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:10px;margin:12px 0}.av-franchise{display:flex;align-items:center;gap:10px;text-align:left;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text);cursor:pointer;min-height:58px}.av-franchise:hover,.av-franchise.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--panel))}.av-franchise .av-franchise-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:linear-gradient(135deg,#39205d,#171321);font-size:18px;flex:0 0 auto}.av-franchise b{font-size:11px;line-height:1.25}.av-franchise small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.av-load-more{display:flex;justify-content:center;margin:14px 0}.av-character-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:10px}.av-character{border:1px solid transparent;border-radius:12px;background:var(--panel);padding:6px;color:var(--text);cursor:pointer}.av-character img{width:58px;height:58px;object-fit:cover;border-radius:50%;display:block;margin:auto}.av-character small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;margin-top:5px}.av-divider{height:1px;background:var(--line);margin:18px 0}@media(max-width:560px){.avatar-picker{padding:18px}.av-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}`;
  if (!avatarStyle.parentNode) document.head.appendChild(avatarStyle);
  const snap = it => ({ key: it.key, title: it.title, year: it.year, date: it.date, type: it.type, kind: it.kind, format: it.format, genres: it.genres,
    poster: it.poster, backdrop: it.backdrop, synopsis: it.synopsis, tmdbId: it.tmdbId, local: it.local, vote: it.vote, added: it.added });
  const state = {
    get auth() { return store.get("auth", null); },
    get profiles() { return store.get("profiles", []); },
    set profiles(v) { store.set("profiles", v); },
    get currentId() { return store.get("current", null); },
    set currentId(v) { store.set("current", v); },
    get current() { return this.profiles.find(p => p.id === this.currentId) || null; },
    get perf() { return store.get("perf", false); },
    set perf(v) { store.set("perf", v); },
    get autoplay() { return store.get("autoplay", true); },
    set autoplay(v) { store.set("autoplay", v); },
    list() {
      const raw = store.get("lists", {})[this.currentId] || [];
      return raw.map(x => typeof x === "string" ? (items.get(x) ? snap(items.get(x)) : null) : x).filter(Boolean)
        .map(s => { const it = items.get(s.key) || reg({ ...s }); it.added = s.added; return it; });
    },
    isSaved(key) { return this.list().some(x => x.key === key); },
    toggleSave(it) {
      const all = store.get("lists", {}); const cur = this.list();
      const i = cur.findIndex(x => x.key === it.key);
      if (i >= 0) cur.splice(i, 1); else { it.added = Date.now(); cur.unshift(it); }
      all[this.currentId] = cur.map(snap); store.set("lists", all); return i < 0;
    },
    clearList() { const all = store.get("lists", {}); all[this.currentId] = []; store.set("lists", all); },
  };

  // ---------- helpers ----------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const slug = s => encodeURIComponent(s);
  const typeLabel = t => t.type === "movie" ? "Film" : t.type === "tv" ? "Series" : `Anime ${t.format || ""}`.trim();
  const fmtDate = d => d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  const LANGS = { en: "English", ja: "Japanese", ko: "Korean", fr: "French", es: "Spanish", de: "German", it: "Italian", zh: "Chinese", hi: "Hindi", pt: "Portuguese", sv: "Swedish", da: "Danish", no: "Norwegian", ru: "Russian", tr: "Turkish" };
  function badge(t) {
    if (!t.date) return "";
    if (t.date > TODAY) return `<span class="badge soon">Coming soon</span>`;
    const days = (Date.now() - new Date(t.date).getTime()) / 864e5;
    return days <= 45 ? `<span class="badge">New</span>` : "";
  }

  function art(t, variant = "poster") {
    const h = hash(t.key); const a = h % 360; const b = (a + 30 + (h >> 9) % 70) % 360;
    const x = 20 + (h >> 4) % 60, y = 15 + (h >> 12) % 40;
    const glow = variant === "wide" ? "65% 30%" : `${x}% ${y}%`;
    return `background:
      radial-gradient(circle at ${glow}, hsl(${b} 85% 62% / .55), transparent 52%),
      radial-gradient(ellipse at 15% 95%, hsl(${a} 75% 45% / .55), transparent 60%),
      radial-gradient(circle at ${100 - x}% 70%, hsl(${(a + 200) % 360} 60% 40% / .25), transparent 45%),
      linear-gradient(165deg, hsl(${a} 45% 20%), hsl(${b} 40% 7%));`;
  }
  const posterHTML = (t, big) => t.poster
    ? `<img class="cover" src="${esc(big && t.posterLg ? t.posterLg : t.poster)}" alt="" loading="lazy">`
    : `<div class="art" style="${art(t)}"></div><span class="poster-kicker">${esc(typeLabel(t))}${t.year ? " · " + t.year : ""}</span><span class="poster-title">${esc(t.title)}</span>`;
  const wideHTML = (t, eager) => t.backdrop
    ? `<img class="cover" src="${esc(t.backdrop)}" alt="" ${eager ? "" : 'loading="lazy"'}>`
    : `<div class="art" style="${art(t, "wide")}"></div>`;
  const titleOrLogo = (t, cls) => t.logo ? `<img class="${cls}-logo" src="${esc(t.logo)}" alt="${esc(t.title)}">` : `<h1 class="${cls}-title">${esc(t.title)}</h1>`;

  function match(t) {
    const genres = new Set(state.list().flatMap(s => s.genres || []));
    const base = 74 + hash(t.key + (state.currentId || "")) % 14;
    return Math.min(99, base + (t.genres || []).filter(g => genres.has(g)).length * 6);
  }
  const collsFor = t => COLLS.filter(c => c.ids.some(id => { const l = byId[id]; return l && l.title.toLowerCase() === (t.title || "").toLowerCase() && Math.abs(l.year - (t.year || 0)) <= 1; }));
  function awardsShort(s) {
    if (!s) return null;
    const o = s.match(/Won (\d+) Oscars?/i); if (o) return `${o[1]} Oscar${o[1] === "1" ? "" : "s"}`;
    const e = s.match(/Won (\d+) Primetime Emmys?/i); if (e) return `${e[1]} Emmy${e[1] === "1" ? "" : "s"}`;
    const w = s.match(/(\d+) wins?/i), n = s.match(/(\d+) nominations?/i);
    if (w) return `${w[1]} win${w[1] === "1" ? "" : "s"}${n ? ` & ${n[1]} nomination${n[1] === "1" ? "" : "s"}` : ""}`;
    return null;
  }
  function scoreChips(t) {
    const out = [];
    const find = s => t.ratings?.find(r => r.src === s)?.val;
    if (find("IMDb")) out.push(`<span class="score imdb"><b>IMDb</b>${esc(find("IMDb"))}</span>`);
    if (find("Rotten Tomatoes")) out.push(`<span class="score rt"><b>RT</b>${esc(find("Rotten Tomatoes"))}</span>`);
    if (find("Metacritic")) out.push(`<span class="score mc"><b>MC</b>${esc(find("Metacritic"))}</span>`);
    if (t.vote) out.push(`<span class="score tmdb"><b>TMDB</b><i style="--p:${Math.round(t.vote * 10)}%"></i>${Math.round(t.vote * 10)}%</span>`);
    return out.join("");
  }

  const icons = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z"/></svg>',
    muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5zM22 9l-6 6M16 9l6 6"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5c.6 5.3 2.4 9.1 10.5 10.5-8.1 1.4-9.9 5.2-10.5 10.5-.6-5.3-2.4-9.1-10.5-10.5C9.6 10.6 11.4 6.8 12 1.5z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.7 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4"/></svg>',
    orbit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.8.7 3 2.5 3.6 5.2"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18a9 9 0 1116 0"/><path d="M12 13l4-4"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    google: '<svg class="g-icon" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
  };

  const avatar = (p, cls = "") => p ? `<span class="avatar ${cls}" style="background:${AV_COLORS[(p.color || 0) % AV_COLORS.length]}" aria-hidden="true">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : p.avatarEmoji ? `<span class="avatar-emoji">${esc(p.avatarEmoji)}</span>` : esc((p.name || "?")[0].toUpperCase())}</span>` : "";
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  // ---------- background trailer (YouTube, muted) ----------
  let soundOn = false;
  function ytSrc(k, { bg } = {}) {
    const base = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(k)}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&iv_load_policy=3`;
    return bg ? base + `&controls=0&loop=1&playlist=${encodeURIComponent(k)}&disablekb=1&start=8` : base;
  }
  function ytCmd(frame, func) { try { frame.contentWindow.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*"); } catch {} }
  function mountBgVideo(container, ytKey, muteBtn) {
    if (!ytKey || !state.autoplay || state.perf || !LIVE) return null;
    // Phones: YouTube overlays its own controls on background video and autoplay eats data — show the still instead.
    if (matchMedia("(max-width: 700px)").matches) return null;
    container.querySelectorAll(".bg-video").forEach(v => v.remove());
    const wrap = document.createElement("div"); wrap.className = "bg-video";
    wrap.innerHTML = `<iframe src="${ytSrc(ytKey, { bg: true })}" title="Trailer" allow="autoplay; encrypted-media" tabindex="-1" aria-hidden="true"></iframe>`;
    container.appendChild(wrap);
    const f = wrap.querySelector("iframe");
    // Only reveal the video once YouTube says it's actually playing, so a blocked
    // or region-locked trailer never hides the backdrop behind a black box.
    const onMsg = e => {
      if (e.source !== f.contentWindow) return;
      let d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      const st = d?.event === "onStateChange" ? d.info : d?.event === "infoDelivery" ? d.info?.playerState : undefined;
      if (st === 1) { wrap.classList.add("on"); if (soundOn) ytCmd(f, "unMute"); }
      if (d?.event === "onError") wrap.remove();
    };
    addEventListener("message", onMsg);
    new MutationObserver((_, mo) => { if (!document.body.contains(wrap)) { removeEventListener("message", onMsg); mo.disconnect(); } }).observe(container, { childList: true });
    f.addEventListener("load", () => { try { f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: "vespera" }), "*"); } catch {} });
    if (muteBtn) { muteBtn.hidden = false; muteBtn.innerHTML = soundOn ? icons.sound : icons.muted;
      muteBtn.onclick = e => { e.stopPropagation(); soundOn = !soundOn; ytCmd(f, soundOn ? "unMute" : "mute"); muteBtn.innerHTML = soundOn ? icons.sound : icons.muted;
        muteBtn.setAttribute("aria-label", soundOn ? "Mute trailer" : "Unmute trailer"); }; }
    return wrap;
  }

  // ---------- components ----------
  function card(t) {
    const saved = state.isSaved(t.key);
    return `<div class="card" role="button" tabindex="0" data-preview="${esc(t.key)}" data-key="${esc(t.key)}" data-title="${esc((t.title || "").toLowerCase())}" aria-label="${esc(t.title)}">
      ${posterHTML(t)}
      ${badge(t)}
      ${saved ? `<span class="saved-mark" title="On My List">${icons.check}</span>` : ""}
      <div class="card-hover">
        <b>${esc(t.title)}</b>
        <div class="meta">${t.year ? `<span>${t.year}</span><span class="dot"></span>` : ""}<span>${esc((t.genres || []).slice(0, 2).join(", ") || typeLabel(t))}</span>${t.vote ? `<span class="dot"></span><span>★ ${t.vote.toFixed(1)}</span>` : ""}</div>
        <div class="row-btns">
          <span class="btn btn-light">${icons.info} Preview</span>
          <button class="icon-btn" data-save="${esc(t.key)}" aria-label="${saved ? "Remove from" : "Add to"} My List">${saved ? icons.check : icons.plus}</button>
        </div>
      </div>
    </div>`;
  }
  const rankCard = (t, n) => `<div class="rank-item"><span class="rank-num" aria-hidden="true">${n}</span>${card(t)}</div>`;
  const skelRow = () => `<div class="row">${Array.from({ length: 8 }, () => `<div class="card skel"></div>`).join("")}</div>`;
  const rowInner = (list, rank) => `
      <button class="row-arrow l" data-scroll="-1" aria-label="Scroll left">${icons.left}</button>
      <div class="row ${rank ? "rank-row" : ""}">${list.map((t, i) => rank ? rankCard(t, i + 1) : card(t)).join("")}</div>
      <button class="row-arrow r" data-scroll="1" aria-label="Scroll right">${icons.right}</button>`;
  function row(label, list, more) {
    if (!list.length) return "";
    return `<section class="section"><div class="section-head"><h2>${esc(label)}</h2>${more ? `<a href="${more}">See all</a>` : ""}</div>
      <div class="row-wrap">${rowInner(list)}</div></section>`;
  }

  // Lazy blocks: rendered as skeletons, filled when scrolled near.
  let lazySeq = 0; const lazyJobs = new Map();
  function lazy(html, job) { const id = "lz" + (++lazySeq); lazyJobs.set(id, job); return html.replace("data-lazy", `data-lazy="${id}" id="${id}"`); }
  function asyncRow(label, more, loader, opts = {}) {
    return lazy(`<section class="section" data-lazy><div class="section-head"><h2>${esc(label)}</h2>${more ? `<a href="${more}">See all</a>` : ""}</div>
      <div class="row-wrap">${skelRow()}</div></section>`, async el => {
      const list = (await loader()).slice(0, opts.rank ? 10 : 20);
      if (!list.length) { el.remove(); return; }
      el.querySelector(".row-wrap").innerHTML = rowInner(list, opts.rank);
    });
  }
  function asyncSpotlight(label, loader) {
    return lazy(`<section class="section" data-lazy><div class="section-head"><h2>${esc(label)}</h2></div>
      <div class="spotlight skel" style="height:420px;margin:0 var(--gutter)"></div></section>`, async el => {
      const list = (await loader()).filter(t => !LIVE || t.backdrop).slice(0, 4);
      if (list.length < 2) { el.remove(); return; }
      const box = el.querySelector(".spotlight"); box.classList.remove("skel"); box.removeAttribute("style");
      const paint = i => {
        const t = list[i]; const saved = state.isSaved(t.key);
        box.innerHTML = `<div class="sl-main">${wideHTML(t, true)}
          <div class="sl-info"><p class="eyebrow">${esc(typeLabel(t))}${t.year ? " · " + t.year : ""}</p>
            <h3>${esc(t.title)}</h3><div class="score-row">${scoreChips(t)}</div><p>${esc(t.synopsis)}</p>
            <div class="hero-actions"><button class="btn btn-light" data-preview="${esc(t.key)}">${icons.info} Preview</button>
            <button class="btn btn-ghost" data-save="${esc(t.key)}">${saved ? icons.check + " On My List" : icons.plus + " My List"}</button></div></div></div>
          <div class="sl-list">${list.map((x, j) => `<button class="sl-item ${j === i ? "on" : ""}" data-sl="${j}"><span class="sl-thumb">${posterHTML(x)}</span><span><b>${esc(x.title)}</b><small>${x.year || ""}${x.genres?.[0] ? " · " + esc(x.genres[0]) : ""}</small></span></button>`).join("")}</div>`;
      };
      box.onclick = e => { const b = e.target.closest("[data-sl]"); if (b) paint(+b.dataset.sl); };
      box.refresh = () => paint(+(box.querySelector(".sl-item.on")?.dataset.sl || 0));
      paint(0);
    });
  }
  function mountLazy() {
    const run = el => { const job = lazyJobs.get(el.dataset.lazy); if (!job) return; lazyJobs.delete(el.dataset.lazy);
      job(el).catch(err => { console.warn("Vespera row failed:", err); el.querySelector(".row-wrap, .spotlight")?.replaceWith(Object.assign(document.createElement("p"), { className: "fine", textContent: "Couldn't load this row." })); }); };
    const els = document.querySelectorAll("[data-lazy]");
    if (!("IntersectionObserver" in window)) return els.forEach(run);
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }), { rootMargin: "900px 0px" });
    els.forEach(el => io.observe(el));
  }

  const empty = (h, p, extra = "") => `<div class="empty"><h3>${h}</h3><p>${p}</p>${extra}</div>`;
  const notFound = () => `<div class="page">${empty("Lost in the dark", "That page doesn't exist.", `<a class="btn btn-primary" href="#/" style="margin-top:18px">Go home</a>`)}</div>`;
  const failBox = () => empty("Couldn't reach the catalog", LIVE ? "TMDB didn't respond — check the key in config.js or your connection." : "Something went wrong.");

  const NAV = [["#/", "Home"], ["#/movies", "Movies"], ["#/series", "Series"], ["#/anime", "Anime"], ["#/constellations", "Constellations"], ["#/clips", "Clips"], ["#/list", "My List"]];

  function shell(route, inner) {
    const p = state.current; const others = state.profiles.filter(x => x.id !== p?.id);
    const active = h => (h === "#/" ? route === "" : route === h.slice(2)) ? "active" : "";
    return `
    <header class="topbar" id="topbar">
      <button class="icon-btn menu-toggle" id="menuToggle" aria-label="Open menu" aria-expanded="false">${icons.menu}</button>
      <a class="brand" href="#/" aria-label="Vespera home"><img class="brand-full" src="vespera-logo-minimal.png" alt="Vespera" style="width:150px;height:40px;object-fit:contain;display:block"><img class="brand-mark" src="vespera-icon-minimal.png" alt="Vespera"></a>
      <nav class="nav" id="nav" aria-label="Main">
        ${NAV.map(([h, l]) => `<a href="${h}" class="${active(h)}">${l}</a>`).join("")}
        <a href="#/search" class="nav-search ${active("#/search")}" aria-label="Search">${icons.search}<span class="nav-search-label">Search</span></a>
      </nav>
      <div class="top-right">
        <a class="top-icon" href="#/search" aria-label="Search">${icons.search}</a>
        <a class="top-icon" href="#/list" aria-label="My List"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12a1 1 0 011 1V21l-7-4.5L5 21V4.5a1 1 0 011-1z"/></svg></a>
        <button class="avatar" id="avatarBtn" aria-haspopup="menu" aria-expanded="false" aria-label="Profile menu"
          style="background:${AV_COLORS[(p?.color || 0) % AV_COLORS.length]}">${p?.avatar ? `<img src="${esc(p.avatar)}" alt="">` : p?.avatarEmoji ? `<span class="avatar-emoji">${esc(p.avatarEmoji)}</span>` : esc((p?.name || "?")[0].toUpperCase())}</button>
        <div class="pmenu" id="pmenu" role="menu">
          <div class="pmenu-current">${avatar(p)}<div><b>${esc(p?.name)}</b><small>Browsing now</small></div></div>
          <div class="pmenu-profiles">
            ${others.map(o => `<button data-switch="${o.id}" title="Switch to ${esc(o.name)}">${avatar(o)}<span>${esc(o.name)}</span></button>`).join("")}
            ${state.profiles.length < 5 ? `<button data-action="add-profile"><span class="add-av">+</span><span>Add</span></button>` : ""}
          </div>
          <hr>
          <a class="pmenu-item" href="#/who/manage" role="menuitem">${icons.users} Manage profiles</a>
          <button class="pmenu-item" data-action="perf" role="menuitemcheckbox" aria-checked="${state.perf}">${icons.gauge} Performance mode <span class="switch ${state.perf ? "on" : ""}"></span></button>
          <hr>
          <a class="pmenu-item" href="#/account" role="menuitem">${icons.user} Settings &amp; backup</a>
        </div>
      </div>
    </header>
    <main id="main" class="route-${route || "home"}">${inner}</main>
    ${route === "clips" ? "" : `<footer>
      <a class="brand" href="#/" aria-label="Vespera"><img src="vespera-icon-minimal.png" alt="" style="width:22px;height:22px;object-fit:contain"><span style="font-size:18px">Vespera</span></a>
      <nav><a href="#/search">Search</a><a href="#/pairings">Pairings</a><a href="#/constellations">Constellations</a><a href="#/account">Account</a><a href="#" data-action="privacy">Privacy</a></nav>
      <span>${LIVE ? `Data &amp; images from <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.` : "Sample catalog · add a TMDB key in config.js for live data."} Vespera doesn't host or stream video.</span>
    </footer>`}
    ${FEAT.assistant ? `<button class="fab" data-action="assistant" aria-label="Ask Vespera">${icons.spark}<span class="fab-tip">Ask Vespera</span></button>`
      : `<button class="fab" data-action="surprise" aria-label="Surprise me">${icons.spark}<span class="fab-tip">Surprise me</span></button>`}`;
  }

  // ---------- hero carousel (home + sections) ----------
  let heroTimer = null, heroPaused = false;
  const heroShell = () => `<section class="hero" id="hero" aria-roledescription="carousel"><div class="hero-skel skel"></div></section>`;
  async function mountHero(loader, eyebrow) {
    const hero = document.getElementById("hero"); if (!hero) return;
    let featured;
    const load = async () => (await loader()).filter(t => !LIVE || t.backdrop).slice(0, 5);
    try { featured = await load().catch(() => new Promise(r => setTimeout(r, 1500)).then(load)); } // one retry for blips
    catch { hero.innerHTML = `<div style="padding:40px">${failBox()}</div>`; return; }
    if (!document.body.contains(hero) || !featured.length) { hero.remove(); return; }
    hero.innerHTML = `
      ${featured.map((t, i) => `<div class="hero-slide ${i === 0 ? "on" : ""}" data-i="${i}">${wideHTML(t, i === 0)}</div>`).join("")}
      <div class="hero-controls">
        <button class="icon-btn" id="heroMute" aria-label="Unmute trailer" hidden>${icons.muted}</button>
        <button class="icon-btn" id="heroPause" aria-label="Pause carousel">${heroPaused ? icons.play : icons.pause}</button>
      </div>
      <div class="hero-body" id="heroBody"></div>
      <div class="hero-badges" id="heroBadges"></div>
      <div class="hero-dots">${featured.map((t, i) => `<button class="${i === 0 ? "on" : ""}" data-dot="${i}" aria-label="Show ${esc(t.title)}"></button>`).join("")}</div>`;
    let i = 0, videoTimer = null;
    const paint = t => {
      const saved = state.isSaved(t.key);
      document.getElementById("heroBody").innerHTML = `
        <div class="hero-eyebrow">${icons.spark.replace("<svg", '<svg width="12" height="12"')} ${esc(eyebrow)}</div>
        ${titleOrLogo(t, "hero")}
        <div class="meta">${t.genres?.[0] ? `<span>${esc(t.genres[0])}</span><span class="dot"></span>` : ""}${t.year ? `<span>${t.year}</span><span class="dot"></span>` : ""}${t.runtime ? `<span>${esc(t.runtime)}</span><span class="dot"></span>` : ""}<span class="muted">${esc(typeLabel(t))}</span></div>
        <p class="hero-syn">${esc(t.synopsis)}</p>
        <div class="hero-actions">
          <button class="btn btn-light" data-preview="${esc(t.key)}">${icons.info} Preview</button>
          <button class="btn btn-ghost" data-save="${esc(t.key)}">${saved ? icons.check + " On My List" : icons.plus + " My List"}</button>
        </div>`;
      const aw = awardsShort(t.awards); const cs = collsFor(t);
      document.getElementById("heroBadges").innerHTML =
        (aw ? `<span class="chip">${icons.trophy} ${esc(aw)}</span>` : "") +
        (cs.length ? `<span class="chip">${icons.orbit} In ${cs.length} constellation${cs.length > 1 ? "s" : ""}</span>` : "") +
        `<span class="chip">${icons.heart} ${match(t)}% your vibe</span>`;
    };
    const show = n => {
      i = (n + featured.length) % featured.length; const t = featured[i];
      hero.style.setProperty("--amb", t.backdrop ? `url("${t.backdrop}")` : "none"); // tints the page behind the hero on phones
      clearTimeout(videoTimer);
      hero.querySelectorAll(".bg-video").forEach(v => v.remove());
      document.getElementById("heroMute").hidden = true;
      hero.querySelectorAll(".hero-slide").forEach(s => s.classList.toggle("on", +s.dataset.i === i));
      hero.querySelectorAll("[data-dot]").forEach(d => d.classList.toggle("on", +d.dataset.dot === i));
      paint(t);
      if (LIVE) detail(t.key).then(full => {
        if (featured[i] !== t || !document.body.contains(hero)) return;
        paint(full);
        if (full.trailer && state.autoplay && !state.perf) videoTimer = setTimeout(() => {
          if (featured[i] !== t) return;
          const slide = hero.querySelector(`.hero-slide[data-i="${i}"]`);
          if (mountBgVideo(slide, full.trailer, document.getElementById("heroMute"))) clearInterval(heroTimer); // let the trailer play
        }, 2500);
      }).catch(() => {});
    };
    const start = () => { clearInterval(heroTimer); if (!heroPaused && !state.perf) heroTimer = setInterval(() => show(i + 1), 9000); };
    hero.onclick = e => {
      const d = e.target.closest("[data-dot]"); if (d) { show(+d.dataset.dot); start(); }
      if (e.target.closest("#heroPause")) {
        heroPaused = !heroPaused; const b = document.getElementById("heroPause");
        b.innerHTML = heroPaused ? icons.play : icons.pause; b.setAttribute("aria-label", heroPaused ? "Play carousel" : "Pause carousel");
        const f = hero.querySelector(".bg-video iframe"); if (f) ytCmd(f, heroPaused ? "pauseVideo" : "playVideo");
        start();
      }
    };
    hero.refresh = () => paint(featured[i]);
    show(0); start();
  }

  // ---------- pages ----------
  function pageHome() {
    const mine = state.list();
    const ROWS = LIVE ? window.VESPERA_TMDB_ROWS : window.VESPERA_ROWS;
    const rows = ROWS.map((r, idx) => idx === 4 ? asyncSpotlight(`Spotlight · ${r.label}`, () => data.row(r)) : asyncRow(r.label, data.rowMore(r), () => data.row(r)));
    const top = LIVE ? { label: "Top 10 Today", path: "trending/all/day" } : { pick: window.VESPERA_ROWS[1].pick.concat(window.VESPERA_ROWS[0].pick) };
    rows.splice(1, 0, asyncRow("Top 10 Today", null, async () => uniq(await data.row(top)), { rank: true }));
    return `
    <div id="continueWatchingMount">${continueWatchingSection()}</div>
    ${heroShell()}
    ${mine.length ? row("Your List", mine.slice(0, 14), "#/list") : ""}
    ${rows.join("")}
    <section class="section" id="homeColls">
      <div class="section-head"><h2>Constellations</h2><a href="#/constellations">See all</a></div>
      <div class="row" style="grid-auto-columns:minmax(300px,360px)">${COLLS.map(c => collCard(c)).join("")}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Browse by Network</h2></div>
      <div class="networks">${data.networks().map(n => `<a class="network" href="#/network/${slug(n.value)}">${esc(n.label)}${n.count ? `<small>${n.count}</small>` : ""}</a>`).join("")}</div>
    </section>
    <section class="cta-pair">
      <a class="cta" href="#/search"><h2>Didn't find what you're after?</h2><p>Search by title, cast, creator or genre.</p><span class="btn btn-primary">${icons.search} Search Vespera</span></a>
      <a class="cta" href="#/pairings"><h2>Loved something lately?</h2><p>We'll pair it with its perfect other half.</p><span class="btn btn-ghost">${icons.heart} See Pairings</span></a>
    </section>`;
  }

  function collCard(c, resolved) {
    const list = (resolved || c.ids.map(id => items.get(id))).filter(Boolean).slice(0, 3);
    return `<a class="coll coll-wrap" href="#/constellations/${c.id}" data-coll="${c.id}">
      <div class="fan">${list.map((t, i) => `<div class="fan-card" style="--r:${(i - 1) * 6}deg">${t.poster ? `<img class="cover" src="${esc(t.poster)}" alt="" loading="lazy">` : `<div class="art" style="${art(t)}"></div>`}</div>`).join("")}</div>
      <div class="coll-body"><small>${c.ids.length} titles</small><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p></div>
    </a>`;
  }
  function liveColls(scope) {
    if (!LIVE || !scope) return;
    COLLS.forEach(c => data.collection(c).then(list => {
      const el = scope.querySelector(`[data-coll="${c.id}"]`); if (el) el.outerHTML = collCard(c, list);
    }).catch(() => {}));
  }

  const BROWSE = {
    movies: { h: "Movies", p: "Films worth staying up for.", hero: "Popular in films" },
    series: { h: "Series", p: "Shows to lose a weekend to.", hero: "Popular in series" },
    anime: { h: "Anime", p: "Hand-drawn worlds, films and series.", hero: "Popular in anime" },
  };
  const SORTS = LIVE ? { popular: "Popular", top: "Top rated", new: "Newest", old: "Oldest", az: "A–Z" } : { popular: "Featured", new: "Newest", old: "Oldest", az: "A–Z" };

  function pageSection(kind, params) {
    if (params.get("view") === "all" || params.get("g") || params.get("sort")) return pageBrowse(kind, params);
    const s = data.section(kind);
    const rows = s.rows.map(r => r.spotlight ? asyncSpotlight(r.label, () => data.load(r)) : asyncRow(r.label, r.more || null, () => data.load(r)));
    rows.splice(1, 0, asyncRow(s.top10.label, null, () => data.load(s.top10), { rank: true }));
    return `${heroShell()}
      <div class="section-intro"><div><h1>${BROWSE[kind].h}</h1><p>${BROWSE[kind].p}</p></div>
        <a class="btn btn-ghost" href="#/${kind}?view=all">${icons.sliders} Browse all ${BROWSE[kind].h.toLowerCase()}</a></div>
      ${rows.join("")}
      <section class="cta"><h2>Want the whole shelf?</h2><p>Filter every ${kind === "series" ? "series" : kind === "anime" ? "anime title" : "film"} by genre and sort however you like.</p>
        <a class="btn btn-primary" href="#/${kind}?view=all">${icons.sliders} Browse all ${BROWSE[kind].h.toLowerCase()}</a></section>`;
  }

  let browseState = null;
  function pageBrowse(kind, params) {
    const conf = BROWSE[kind];
    const g = params.get("g") || ""; let s = params.get("sort") || "popular"; if (!SORTS[s]) s = "popular";
    browseState = { kind, g, s, page: 1 };
    const keep = p => `view=all${p}`;
    return `<a class="back-link" href="#/${kind}">${icons.left} ${conf.h} highlights</a>
    <div class="page" style="padding-top:0">
      <div class="page-head"><div><h1>All ${conf.h.toLowerCase()}</h1><p>${conf.p}</p></div>
        <select class="select" data-param="sort" aria-label="Sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${k === s ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div class="filters">
        <a class="pill pill-link ${!g ? "on" : ""}" href="#/${kind}?${keep(s !== "popular" ? "&sort=" + s : "")}">All</a>
        ${data.genres(kind).map(x => `<a class="pill pill-link ${String(x.value) === g ? "on" : ""}" href="#/${kind}?${keep(`&g=${slug(x.value)}${s !== "popular" ? "&sort=" + s : ""}`)}">${esc(x.label)}</a>`).join("")}
      </div>
      <div class="grid" id="grid">${Array.from({ length: 12 }, () => `<div class="card skel"></div>`).join("")}</div>
      <div class="more-wrap"><button class="btn btn-ghost" id="moreBtn" data-action="more" hidden>Load more</button></div>
    </div>`;
  }
  async function loadBrowse(append) {
    const st = browseState; const grid = document.getElementById("grid"); const btn = document.getElementById("moreBtn");
    if (!grid || !st) return;
    btn.disabled = true;
    try {
      const { list, more } = await data.browse(st.kind, st.g, st.s, st.page);
      if (browseState !== st) return;
      const html = list.map(card).join("");
      if (append) grid.insertAdjacentHTML("beforeend", html); else grid.innerHTML = html || `<div style="grid-column:1/-1">${empty("Nothing here", "Try another filter.")}</div>`;
      btn.hidden = !more; btn.disabled = false;
    } catch { grid.innerHTML = `<div style="grid-column:1/-1">${failBox()}</div>`; btn.hidden = true; }
  }

  async function pageGenre(name) {
    const list = await data.genre(name);
    return `<div class="page"><div class="page-head"><div><p class="eyebrow">Genre</p><h1>${esc(name)}</h1><p>Films and series, most popular first.</p></div></div>
      ${list.length ? `<div class="grid">${list.map(card).join("")}</div>` : empty("Nothing here yet", "Try another genre.")}</div>`;
  }
  async function pageNetwork(v) {
    const { name, list } = await data.network(v);
    return `<div class="page"><div class="page-head"><div><p class="eyebrow">Network</p><h1>${esc(name)}</h1><p>${LIVE ? "Popular series" : `${list.length} titles`} from ${esc(name)}.</p></div></div>
      ${list.length ? `<div class="grid">${list.map(card).join("")}</div>` : empty("Nothing here yet", "Try another network.")}</div>`;
  }

  // ---------- Constellations: universe rows ----------
  // Light lookup for runtime, title logo and trailer (no OMDb call, so it's cheap per card).
  const liteJobs = new Map();
  function lite(t) {
    if (!LIVE || !t?.tmdbId || t.full || t.liteDone) return Promise.resolve(t);
    if (!liteJobs.has(t.key)) liteJobs.set(t.key, tmdb(`${t.kind}/${t.tmdbId}`, { append_to_response: "images,videos", include_image_language: "en,null" }).then(d => {
      if (t.kind === "movie") t.runtime = t.runtime || (d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : "");
      else t.runtime = t.runtime || (d.number_of_seasons ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? "s" : ""}` : "");
      const logos = d.images?.logos || []; const logo = logos.find(l => l.iso_639_1 === "en") || logos[0];
      if (!t.logo && logo) t.logo = IMG + "w500" + logo.file_path;
      const vids = (d.videos?.results || []).filter(v => v.site === "YouTube");
      t.trailer = t.trailer || (vids.find(v => v.type === "Trailer" && v.official) || vids.find(v => v.type === "Trailer") || vids.find(v => v.type === "Teaser"))?.key || null;
      t.liteDone = true; return t;
    }).catch(() => t));
    return liteJobs.get(t.key);
  }
  function uniCard(t, big) {
    return `<div class="uni-card ${big ? "big" : ""}" role="button" tabindex="0" data-preview="${esc(t.key)}" data-uni="${esc(t.key)}" aria-label="${esc(t.title)}">
      <div class="uni-media">${wideHTML(t)}</div>
      ${big ? "" : `<div class="uni-poster" aria-hidden="true">${posterHTML(t)}</div><span class="uni-tab" ${t.runtime ? "" : "hidden"}>${esc(t.runtime || "")}</span>`}
      <div class="uni-logo">${t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.title)}" loading="lazy">` : `<b>${esc(t.title)}</b>`}</div>
      ${big ? `<div class="uni-actions">
        <button class="btn btn-light" data-action="trailer" data-yt="${esc(t.trailer || "")}" ${t.trailer ? "" : "hidden"}>${icons.play} Trailer</button>
        <a class="btn btn-ghost" data-preview-more href="#/title/${esc(t.key)}">${icons.info} More info</a></div>` : ""}
    </div>`;
  }
  function uniRow(label, loader, { big = false, more = null } = {}) {
    return lazy(`<section class="section uni-section" data-lazy><div class="section-head"><h2>${esc(label)}</h2>${more ? `<a href="${more}">See all</a>` : ""}</div>
      <div class="row-wrap"><div class="row uni-row ${big ? "big" : ""}">${Array.from({ length: big ? 3 : 4 }, () => `<div class="uni-card ${big ? "big" : ""} skel"></div>`).join("")}</div></div></section>`, async el => {
      const list = (await loader()).filter(t => !LIVE || t.backdrop).slice(0, 20);
      if (!list.length) { el.remove(); return; }
      el.querySelector(".row-wrap").innerHTML = `
        <button class="row-arrow l" data-scroll="-1" aria-label="Scroll left">${icons.left}</button>
        <div class="row uni-row ${big ? "big" : ""}">${list.map(t => uniCard(t, big)).join("")}</div>
        <button class="row-arrow r" data-scroll="1" aria-label="Scroll right">${icons.right}</button>`;
      // Fill in runtime tabs, title logos and trailers as they arrive.
      list.forEach(t => lite(t).then(x => {
        el.querySelectorAll(`[data-uni="${CSS.escape(x.key)}"]`).forEach(c => {
          const tab = c.querySelector(".uni-tab"); if (tab && x.runtime) { tab.textContent = x.runtime; tab.hidden = false; }
          const logo = c.querySelector(".uni-logo"); if (logo && x.logo && !logo.querySelector("img")) logo.innerHTML = `<img src="${esc(x.logo)}" alt="${esc(x.title)}" loading="lazy">`;
          const tr = c.querySelector('[data-action="trailer"]'); if (tr && x.trailer) { tr.dataset.yt = x.trailer; tr.hidden = false; }
        });
      }));
    });
  }
  // Hero: the newest film from a handful of big universes.
  async function constellationHeroItems() {
    if (!LIVE) return (await Promise.all(COLLS.slice(0, 5).map(c => data.collection(c).catch(() => [])))).map(l => l[0]).filter(Boolean);
    const names = (window.VESPERA_FRANCHISES || []).slice(0, 12);
    const lists = await Promise.all(names.map(n => data.franchise(n).then(f => f.list).catch(() => [])));
    const picks = lists.map(l => l.filter(t => t.backdrop && (!t.date || t.date <= TODAY)).pop()).filter(Boolean);
    return picks.sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 5).sort(() => Math.random() - .5);
  }
  function pageCollections() {
    const rows = [];
    let n = 0;
    const names = LIVE && Array.isArray(window.VESPERA_FRANCHISES) ? window.VESPERA_FRANCHISES : [];
    const curated = COLLS.map(c => () => uniRow(c.name, () => data.collection(c), { big: n++ % 3 === 1, more: `#/constellations/${c.id}` }));
    // Big franchises first; a hand-picked constellation after every few of them.
    names.forEach((name, i) => {
      rows.push(uniRow(name, async () => (await data.franchise(name)).list, { big: n++ % 3 === 1 }));
      if (i % 5 === 4 && curated.length) rows.push(curated.shift()());
    });
    curated.forEach(make => rows.push(make()));
    return `${heroShell()}
      <div class="section-intro constellation-intro"><div><p class="eyebrow">Explore the multiverse</p><h1>Constellations</h1><p>Worlds, sagas and stories worth getting lost in — every film in order.</p></div>
        <div class="constellation-search"><span>${icons.search}</span><input id="constellationSearch" type="search" placeholder="Find a universe or franchise" aria-label="Search constellations"></div>
      </div>
      <div id="constellationShelves">${rows.join("")}</div>`;
  }
  async function pageCollection(id) {
    const c = COLLS.find(x => x.id === id); if (!c) return notFound();
    const list = await data.collection(c);
    return `<button class="back-link" data-action="back">${icons.left} Back</button>
      <div class="page" style="padding-top:0"><div class="page-head"><div><p class="eyebrow">Constellation</p><h1>${esc(c.name)}</h1><p>${esc(c.blurb)}</p></div></div>
      <div class="grid">${list.map(card).join("")}</div></div>`;
  }

  async function pagePairings() {
    const pairs = await data.pairings();
    return `<div class="page"><div class="page-head"><div><h1>Pairings</h1><p>Loved one? Here's its other half.</p></div></div>
      <div class="spot-grid">${pairs.map(([a, b]) => `
        <div class="spot" role="button" tabindex="0" data-preview="${esc(b.key)}">
          <div class="spot-art">${wideHTML(b)}<span>${esc(b.title)}</span></div>
          <div class="spot-body"><small>If you loved ${esc(a.title)}</small>
          <p>${esc(b.synopsis)}</p>
          <div class="meta" style="margin-top:12px;color:var(--muted)"><span>${esc(typeLabel(b))}</span>${b.year ? `<span class="dot"></span><span>${b.year}</span>` : ""}${(b.genres || []).length ? `<span class="dot"></span><span>${esc(b.genres.slice(0, 2).join(" + "))}</span>` : ""}</div></div>
        </div>`).join("")}</div></div>`;
  }

  // Clips — vertical feed of official trailers
  let clipObserver = null;
  async function pageClips() {
    if (!LIVE) return `<div class="page">${empty("Clips need live data", "Clips plays official trailers from TMDB. Add your TMDB key to config.js to turn this on.")}</div>`;
    const list = await data.clips();
    if (!list.length) return `<div class="page">${empty("No clips right now", "Check back soon.")}</div>`;
    return `<div class="clips" id="clips">${list.map((t, i) => `
      <section class="clip" data-key="${esc(t.key)}" data-i="${i}">
        <div class="clip-video">${wideHTML(t)}<div class="clip-frame"></div></div>
        <div class="clip-info">
          <div class="clip-title"></div>
          <div class="meta">${t.year ? `<span>${t.year}</span><span class="dot"></span>` : ""}<span>${esc(typeLabel(t))}</span><span class="dot"></span><span class="muted clip-vname">Trailer</span></div>
          <div class="score-row clip-scores">${scoreChips(t)}</div>
          <p class="clip-syn">${esc(t.synopsis)}</p>
          <div class="hero-actions">
            <button class="btn btn-light" data-preview="${esc(t.key)}">${icons.info} Preview</button>
            <button class="btn btn-ghost" data-save="${esc(t.key)}">${state.isSaved(t.key) ? icons.check + " On My List" : icons.plus + " My List"}</button>
          </div>
        </div>
      </section>`).join("")}</div>
      <div class="clip-nav"><button class="icon-btn" data-action="clip-prev" aria-label="Previous clip">${icons.up}</button><button class="icon-btn" data-action="clip-next" aria-label="Next clip">${icons.down}</button></div>`;
  }
  function mountClips() {
    const feed = document.getElementById("clips"); if (!feed) return;
    clipObserver?.disconnect();
    const activate = async sec => {
      feed.querySelectorAll(".clip.active").forEach(s => { if (s !== sec) { s.classList.remove("active"); s.querySelector(".clip-frame").innerHTML = ""; } });
      sec.classList.add("active");
      const t = await detail(sec.dataset.key).catch(() => null); if (!t || !sec.classList.contains("active")) return;
      sec.querySelector(".clip-title").innerHTML = titleOrLogo(t, "cliph");
      sec.querySelector(".clip-scores").innerHTML = scoreChips(t);
      if (t.trailerName) sec.querySelector(".clip-vname").textContent = t.trailerName;
      const frame = sec.querySelector(".clip-frame");
      frame.innerHTML = t.trailer ? `<iframe src="${ytSrc(t.trailer)}" title="${esc(t.title)} trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
        : `<div class="no-trailer">No trailer available</div>`;
    };
    feed.querySelectorAll(".clip").forEach(sec => { const t = items.get(sec.dataset.key); sec.querySelector(".clip-title").innerHTML = `<h1 class="cliph-title">${esc(t.title)}</h1>`; });
    clipObserver = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) activate(e.target); }), { root: feed, threshold: .6 });
    feed.querySelectorAll(".clip").forEach(s => clipObserver.observe(s));
  }
  function clipStep(dir) { const feed = document.getElementById("clips"); if (feed) feed.scrollBy({ top: dir * feed.clientHeight, behavior: "smooth" }); }

  function pageList(params) {
    const type = params.get("type") || ""; const sort = params.get("sort") || "recent";
    let list = state.list().filter(t => !type || t.type === type);
    if (sort === "az") list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "year") list.sort((a, b) => (b.year || 0) - (a.year || 0));
    const total = state.list().length;
    const tab = (v, l) => `<a class="pill pill-link ${type === v ? "on" : ""}" href="#/list?${new URLSearchParams({ ...(v ? { type: v } : {}), ...(sort !== "recent" ? { sort } : {}) })}">${l}</a>`;
    return `<div class="page"><div class="page-head"><div><h1>My List</h1><p>${esc(state.current?.name)}'s saved titles${total ? ` · ${total}` : ""}.</p></div>
      ${total ? `<div class="list-tools"><div class="mini-search">${icons.search}<input id="listQ" type="search" placeholder="Search My List" aria-label="Search My List"></div>
        <select class="select" data-param="sort" aria-label="Sort titles"><option value="recent" ${sort === "recent" ? "selected" : ""}>Recently added</option><option value="az" ${sort === "az" ? "selected" : ""}>A–Z</option><option value="year" ${sort === "year" ? "selected" : ""}>Release year</option></select></div>` : ""}</div>
      ${total ? `<div class="filters">${tab("", "All")}${tab("movie", "Movies")}${tab("tv", "Series")}${tab("anime", "Anime")}</div>` : ""}
      ${list.length ? `<div class="grid" id="listGrid">${list.map(card).join("")}</div><div id="listEmpty" hidden>${empty("No matches", "Nothing on your list matches that.")}</div>` :
        total ? empty("Nothing in this tab", "Try another tab.") :
        empty("Your list is empty", "Tap + on anything that catches your eye and it'll wait for you here.", `<a class="btn btn-primary" href="#/" style="margin-top:18px">Browse home</a>`)}</div>`;
  }

  // Search
  const ROT_WORDS = ["hidden gems", "late-night thrillers", "comfort rewatches", "anime classics", "cult favourites", "tonight's watch"];
  let rotTimer = null;
  function pageSearch(params) {
    const f = Object.fromEntries(["q", "type", "genre", "year", "rating", "sort"].map(k => [k, params.get(k) || ""]));
    const nFilters = ["genre", "year", "rating", "sort"].filter(k => f[k]).length;
    const years = Array.from({ length: new Date().getFullYear() + 2 - 1950 }, (_, i) => new Date().getFullYear() + 1 - i);
    const sel = (name, label, opts) => `<label class="fsel"><span>${label}</span><select class="select" data-param="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(f[name]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    return `<div class="page search-page">
      <h1 class="search-h">Search <span class="rot" id="rot">${ROT_WORDS[0]}</span></h1>
      <div class="search-box">${icons.search}<input id="q" type="search" value="${esc(f.q)}" placeholder="Find movies, series, people and more" autocomplete="off" aria-label="Search">
        ${FEAT.assistant ? `<button class="ai-btn" data-action="ask-ai" aria-label="Ask the AI assistant">${icons.spark} Ask AI</button>` : ""}
        <button class="filter-btn ${nFilters ? "on" : ""}" data-action="toggle-filters" aria-expanded="${nFilters ? "true" : "false"}" aria-label="Filters and sort">${icons.sliders}${nFilters ? `<b>${nFilters}</b>` : ""}</button></div>
      <div class="tabs" role="tablist">${[["", "All"], ["movie", "Movies"], ["tv", "Series"], ["anime", "Anime"]].map(([v, l]) => `<button role="tab" aria-selected="${f.type === v}" class="tab ${f.type === v ? "on" : ""}" data-type="${v}">${l}</button>`).join("")}</div>
      <div class="filters-panel" id="filtersPanel" ${nFilters ? "" : "hidden"}>
        ${sel("genre", "Genre", [["", "Any genre"], ...allGenreNames().map(g => [g, g])])}
        ${sel("year", "Year", [["", "Any year"], ...years.map(y => [y, y])])}
        ${sel("rating", "Rating", [["", "Any rating"], ["6", "6+ ★"], ["7", "7+ ★"], ["8", "8+ ★"]])}
        ${sel("sort", "Sort", [["", "Best match"], ["popular", "Most popular"], ["top", "Top rated"], ["new", "Newest"], ["old", "Oldest"], ["az", "A–Z"]])}
        ${nFilters ? `<button class="text-btn" data-action="clear-filters">Clear filters</button>` : ""}
      </div>
      <div id="results"></div>
    </div>`;
  }
  let searchSeq = 0, searchTimer = null;
  async function runSearch() {
    const input = document.getElementById("q"); if (!input) return;
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const f = { q: input.value.trim(), type: params.get("type") || "", genre: params.get("genre") || "", year: params.get("year") || "", rating: params.get("rating") || "", sort: params.get("sort") || "" };
    const res = document.getElementById("results"); const seq = ++searchSeq;
    const anyFilter = f.genre || f.year || f.rating || f.sort;
    searchState = null;
    if (!f.q && !anyFilter) {
      lazyJobs.clear();
      if (LIVE) {
        const anime = (path, extra = {}) => ({ path, kind: path.endsWith("movie") ? "movie" : "tv", params: { with_genres: "16", with_original_language: "ja", "vote_count.gte": 50, ...extra } });
        const rows = f.type === "anime"
          ? [["Popular Anime", anime("discover/tv")], ["Anime Films", anime("discover/movie")], ["New Anime", anime("discover/tv", { "first_air_date.gte": `${new Date().getFullYear() - 2}-01-01` })],
             ["Highest Rated Anime", anime("discover/tv", { sort_by: "vote_average.desc", "vote_count.gte": 300 })]]
          : [["Trending Today", { path: f.type === "movie" ? "trending/movie/day" : f.type === "tv" ? "trending/tv/day" : "trending/all/day", kind: f.type || undefined }],
             ["Popular Films", { path: "movie/popular", kind: "movie" }], ["Popular Series", { path: "tv/popular", kind: "tv" }],
             ["Airing This Week", { path: "tv/on_the_air", kind: "tv" }], ["Coming Soon", { path: "movie/upcoming", kind: "movie" }], ["Now in Cinemas", { path: "movie/now_playing", kind: "movie" }],
             ["Top Rated Films", { path: "movie/top_rated", kind: "movie" }], ["Top Rated Series", { path: "tv/top_rated", kind: "tv" }]]
            .filter(([, r]) => !f.type || !r.kind || r.kind === f.type);
        res.innerHTML = `<h2 class="sub-h">Browse genres</h2><div class="filters">${allGenreNames().map(g => `<a class="pill pill-link" href="#/genre/${slug(g)}">${esc(g)}</a>`).join("")}</div>
          <div class="bleed">${rows.map(([l, r]) => asyncRow(l, null, () => data.row(r))).join("")}</div>`;
      } else {
        res.innerHTML = `<h2 class="sub-h">Browse genres</h2><div class="filters">${allGenreNames().map(g => `<a class="pill pill-link" href="#/genre/${slug(g)}">${esc(g)}</a>`).join("")}</div>
          <div class="bleed">${row("Popular on Vespera", window.VESPERA_ROWS[1].pick.map(id => items.get(id)))}</div>`;
      }
      mountLazy(); return;
    }
    res.innerHTML = `<div class="grid">${Array.from({ length: 12 }, () => `<div class="card skel"></div>`).join("")}</div>`;
    try {
      const st = { f, page: 1, seen: new Set(), seq };
      let { list, more, people = [], person } = await data.search(f, 1);
      // A narrow tab (e.g. Anime) can filter a page down to nothing — look one page further before giving up.
      while (!list.length && more && st.page < 3) { st.page++; ({ list, more } = await data.search(f, st.page)); }
      if (seq !== searchSeq) return;
      list = list.filter(x => !st.seen.has(x.key) && st.seen.add(x.key));
      searchState = { ...st, more };
      const peopleRow = people.length ? `<section class="people-strip" aria-label="People">
          <h2 class="sub-h">People</h2>
          <div class="people-row">${people.map(p => `<a class="person-chip ${person && person.id === p.id ? "on" : ""}" href="#/person/${p.id}">
            <span class="person-ph">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : esc(p.name[0])}</span>
            <span><b>${esc(p.name)}</b><small>${esc([p.dept === "Acting" ? "Actor" : p.dept, ...p.knownFor].filter(Boolean).join(" · "))}</small></span></a>`).join("")}</div>
        </section>` : "";
      res.innerHTML = list.length
        ? `${peopleRow}${person ? `<h2 class="sub-h">${esc(person.name)}'s films &amp; series, then other matches</h2>` : ""}
           <p class="search-count" id="searchCount">${list.length}${more ? "+" : ""} result${list.length > 1 ? "s" : ""}</p>
           <div class="grid" id="searchGrid">${list.map(card).join("")}</div>
           <div class="more-wrap"><button class="btn btn-ghost" id="searchMore" data-action="search-more" ${more ? "" : "hidden"}>Load more</button></div>`
        : peopleRow + empty(f.q ? `Nothing for “${esc(f.q)}”` : "No matches", f.type ? "Try the All tab, check the spelling, or loosen a filter." : "Check the spelling, loosen a filter, or try a person or year.",
          FEAT.assistant && f.q ? `<button class="btn btn-primary" data-action="ask-ai" style="margin-top:18px">${icons.spark} Ask the AI instead</button>` : "");
    } catch (err) { console.warn("Vespera search failed:", err); if (seq === searchSeq) res.innerHTML = failBox(); }
  }
  let searchState = null;
  async function searchMore(btn) {
    const st = searchState; if (!st || !st.more) return;
    btn.disabled = true; btn.textContent = "Loading…";
    try {
      let added = [];
      while (!added.length && st.more) {
        st.page++;
        const r = await data.search(st.f, st.page);
        if (searchState !== st) return;
        st.more = r.more;
        added = r.list.filter(x => !st.seen.has(x.key) && st.seen.add(x.key));
      }
      document.getElementById("searchGrid")?.insertAdjacentHTML("beforeend", added.map(card).join(""));
      const n = document.querySelectorAll("#searchGrid .card").length;
      const c = document.getElementById("searchCount"); if (c) c.textContent = `${n}${st.more ? "+" : ""} results`;
    } catch { toast("Couldn't load more results"); }
    btn.disabled = false; btn.textContent = "Load more"; btn.hidden = !st.more;
  }

  // Quick preview popup (opens from any poster). "More info" goes to the full title page.
  function awardsLong(s) {
    if (!s) return null;
    const won = s.match(/Won (\d+) (Oscars?|Primetime Emmys?|Golden Globes?|BAFTA Film Awards?)/i);
    if (won) return `Winner of ${won[1]} ${won[2].replace(/s?$/, won[1] === "1" ? "" : "s").replace(/ss$/, "s")}`;
    const nom = s.match(/Nominated for (\d+) (Oscars?|Primetime Emmys?|Golden Globes?)/i);
    if (nom) return `Nominated for ${nom[1]} ${nom[2]}`;
    return awardsShort(s);
  }
  const pvRow = (inner, cls = "") => `<div class="row-wrap pv-row-wrap">
      <button class="row-arrow l" data-scroll="-1" aria-label="Scroll left">${icons.left}</button>
      <div class="row pv-row ${cls}">${inner}</div>
      <button class="row-arrow r" data-scroll="1" aria-label="Scroll right">${icons.right}</button></div>`;
  function previewHTML(t, loading) {
    const saved = state.isSaved(t.key);
    const cast = (t.castFull || []).slice(0, 6);
    const castNames = t.castNames || t.cast || [];
    const reviews = (t.reviews || []).slice(0, 8);
    const related = (t.similar || []).map(k => items.get(k)).filter(Boolean).slice(0, 14);
    const aw = awardsLong(t.awards);
    const facts = [t.year, t.runtime, t.rated].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("");
    return `<div class="pv-ambient" style="${t.backdrop || t.poster ? `background-image:url('${esc(t.backdrop || t.poster)}')` : art(t, "wide")}"></div>
      <button class="pv-close" data-close aria-label="Close preview">${icons.x || "×"}</button>
      <section class="pv-hero">
        <div class="pv-media" id="pvMedia">${wideHTML(t, true)}</div>
        <div class="pv-controls">
          <button class="icon-btn" id="pvPause" aria-label="Pause trailer" hidden>${icons.pause}</button>
          <button class="icon-btn" id="pvMute" aria-label="Unmute trailer" hidden>${icons.muted}</button>
        </div>
        <div class="pv-head">
          ${t.logo ? `<img class="pv-logo" src="${esc(t.logo)}" alt="${esc(t.title)}">` : `<h2 class="pv-title">${esc(t.title)}</h2>`}
          <div class="pv-actions">
            ${LIVE && t.tmdbId ? `<a class="btn btn-light" href="#/watch/${esc(t.key)}" data-action="play-title">${icons.play} Play</a>` : ""}
            ${t.trailer ? `<button class="btn btn-primary" data-action="trailer" data-yt="${esc(t.trailer)}">${icons.play} Trailer</button>` : ""}
            <button class="pv-round" data-save="${esc(t.key)}" aria-label="${saved ? "Remove from" : "Add to"} My List">${saved ? icons.check : icons.plus}</button>
            <a class="btn btn-ghost pv-more" data-preview-more href="#/title/${esc(t.key)}">More info</a>
          </div>
        </div>
      </section>
      <div class="pv-body">
        <section class="pv-panel">
          <div class="pv-main">
            <div class="pv-facts"><span class="pv-match">${match(t)}% Match</span>${facts}</div>
            ${scoreChips(t) || aw ? `<div class="pv-scores">${scoreChips(t)}${aw ? `<span class="pv-award">${icons.trophy} ${esc(aw)}</span>` : ""}</div>` : ""}
            <p class="pv-syn">${esc(t.synopsis || "No description available yet.")}</p>
          </div>
          <div class="pv-side">
            ${castNames.length ? `<p><span>Cast:</span> ${castNames.slice(0, 3).map(c => `<a href="#/search?q=${slug(c)}" data-close>${esc(c)}</a>`).join(", ")}${castNames.length > 3 ? `, <a href="#/title/${esc(t.key)}" data-preview-more>more</a>` : ""}</p>` : ""}
            ${(t.genres || []).length ? `<p><span>Genres:</span> ${t.genres.map(g => `<a href="#/genre/${slug(g)}" data-close>${esc(g)}</a>`).join(", ")}</p>` : ""}
            ${t.by ? `<p><span>${esc(t.byRole || "By")}:</span> ${esc(t.by)}</p>` : ""}
            ${cast.length ? `<div class="pv-faces">${cast.map(c => `<a href="${c.id ? `#/person/${c.id}` : `#/search?q=${slug(c.name)}`}" data-close title="${esc(c.name)}${c.role ? ` as ${esc(c.role)}` : ""}">${c.photo ? `<img src="${esc(c.photo)}" alt="${esc(c.name)}" loading="lazy">` : `<span>${esc(c.name[0])}</span>`}</a>`).join("")}</div>` : ""}
          </div>
        </section>
        ${loading ? `<div class="pv-loading skel"></div>` : ""}
        ${reviews.length ? `<section class="pv-sec"><h3>Reviews</h3>${pvRow(reviews.map(r => `<article class="pv-review">
            <header><span class="avatar" style="background:${AV_COLORS[hash(r.author || "?") % AV_COLORS.length]}">${esc((r.author || "?")[0].toUpperCase())}</span>
              <div><b>${esc(r.author || "Viewer")}</b><small>${esc(fmtDate(r.date))}</small></div>
              ${r.rating ? `<span class="pv-rating">★ ${r.rating}<small> / 10</small></span>` : ""}</header>
            <p>${esc(r.content || "")}</p>
            <a href="#/title/${esc(t.key)}" data-preview-more>View more</a></article>`).join(""), "pv-reviews")}</section>` : ""}
        ${related.length ? `<section class="pv-sec"><h3>You Might Also Like</h3>${pvRow(related.map(x => `<button type="button" class="pv-poster" data-preview="${esc(x.key)}" aria-label="${esc(x.title)}">${posterHTML(x)}</button>`).join(""), "pv-posters")}</section>` : ""}
      </div>`;
  }
  async function openTitlePreview(key) {
    const cached = items.get(key);
    if (!cached) return;
    modal(previewHTML(cached, LIVE && !cached.full), async back => {
      const box = back.querySelector(".modal");
      let t = cached;
      if (LIVE && !cached.full) {
        try { t = await detail(key); } catch { t = cached; }
        if (!back.isConnected || !t) return;
        box.innerHTML = previewHTML(t, false);
      }
      // Muted trailer in the hero, like the home page.
      if (t.trailer) {
        const media = box.querySelector("#pvMedia"), mute = box.querySelector("#pvMute"), pause = box.querySelector("#pvPause");
        setTimeout(() => {
          if (!back.isConnected) return;
          const wrap = mountBgVideo(media, t.trailer, mute);
          if (!wrap) return;
          let paused = false; pause.hidden = false;
          pause.onclick = e => { e.stopPropagation(); paused = !paused; const f = wrap.querySelector("iframe"); if (f) ytCmd(f, paused ? "pauseVideo" : "playVideo");
            pause.innerHTML = paused ? icons.play : icons.pause; pause.setAttribute("aria-label", paused ? "Play trailer" : "Pause trailer"); };
        }, 900);
      }
    }, "pv-modal");
  }

  // Person page: photo, bio and full filmography (40 at a time).
  let personState = null;
  async function pagePerson(id, params) {
    if (!LIVE || !/^\d+$/.test(id || "")) return notFound();
    const [p, all] = await Promise.all([tmdb(`person/${id}`), personFilmography(id)]);
    const type = params.get("type") || "";
    const list = all.filter(it => !type || (type === "anime" ? it.type === "anime" : it.kind === type));
    personState = { list, shown: 40 };
    const age = p.birthday ? Math.floor((new Date(p.deathday || Date.now()) - new Date(p.birthday)) / 31557600000) : null;
    const facts = [p.known_for_department === "Acting" ? "Actor" : p.known_for_department,
      p.birthday ? `Born ${fmtDate(p.birthday)}${!p.deathday && age ? ` (age ${age})` : ""}` : "", p.place_of_birth, p.deathday ? `Died ${fmtDate(p.deathday)}` : ""].filter(Boolean);
    const tab = (v, l) => `<a class="pill pill-link ${type === v ? "on" : ""}" href="#/person/${id}${v ? `?type=${v}` : ""}">${l}</a>`;
    return `<button class="back-link" data-action="back">${icons.left} Back</button>
      <div class="page person-page" style="padding-top:0">
        <header class="person-head">
          <span class="person-photo">${p.profile_path ? `<img src="${IMG}w300${esc(p.profile_path)}" alt="${esc(p.name)}">` : esc((p.name || "?")[0])}</span>
          <div>
            <p class="eyebrow">Person</p>
            <h1>${esc(p.name)}</h1>
            ${facts.length ? `<p class="person-facts">${facts.map(esc).join(" · ")}</p>` : ""}
            ${p.biography ? `<p class="person-bio clamp">${esc(p.biography)}</p>${p.biography.length > 320 ? `<button class="text-btn" data-action="expand-bio">Read more</button>` : ""}` : ""}
          </div>
        </header>
        <div class="filters" style="margin-top:26px">${tab("", `All · ${all.length}`)}${tab("movie", "Movies")}${tab("tv", "Series")}${tab("anime", "Anime")}</div>
        ${list.length ? `<div class="grid" id="personGrid">${list.slice(0, 40).map(card).join("")}</div>
          <div class="more-wrap"><button class="btn btn-ghost" data-action="person-more" ${list.length > 40 ? "" : "hidden"}>Load more · ${Math.max(0, list.length - 40)} left</button></div>`
          : empty("Nothing here", "Try another tab.")}
      </div>`;
  }

  async function pageTitle(key) {
    const t = await detail(key); if (!t) return notFound();
    const saved = state.isSaved(t.key);
    let similar;
    if (t.local) similar = TITLES.map(x => items.get(x.id)).filter(x => x.key !== t.key)
      .map(x => [x, x.genres.filter(g => t.genres.includes(g)).length + (x.type === t.type ? .5 : 0)])
      .filter(([, s]) => s >= 1).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([x]) => x);
    else similar = (t.similar || []).map(k => items.get(k)).filter(Boolean);
    const cs = collsFor(t); const aw = awardsShort(t.awards); const prov = t.local ? null : providersFor(t);
    const nets = t.networkIds?.length ? t.networkIds.map(n => `<a href="#/network/${n.id}">${esc(n.name)}</a>`).join(", ")
      : t.local ? t.network.split(" / ").map(n => `<a href="#/network/${slug(n.trim())}">${esc(n.trim())}</a>`).join(", ") : esc(t.network.replace(/ \/ /g, ", "));
    const watchHref = prov ? "#providers" : `https://www.justwatch.com/${region().toLowerCase()}/search?q=${slug(t.title)}`;
    const castNames = t.castNames || t.cast || [];
    const detailRows = [
      ["Genres", (t.genres || []).map(g => `<a href="#/genre/${slug(g)}">${esc(g)}</a>`).join(", ")],
      ["Released", t.date ? esc(fmtDate(t.date)) : t.year],
      ["Status", esc(t.status)],
      ["Language", t.lang ? esc(LANGS[t.lang] || t.lang.toUpperCase()) : ""],
      [t.byRole, t.by ? esc(t.by) : ""],
      [t.kind === "tv" ? "Network" : "Studio", t.network ? nets : ""],
      ["Cast", castNames.map(c => `<a href="#/search?q=${slug(c)}">${esc(c)}</a>`).join(", ")],
      ["Constellations", cs.map(c => `<a href="#/constellations/${c.id}">${esc(c.name)}</a>`).join(", ")],
      ["Awards", t.awards ? esc(t.awards) : ""],
    ].filter(([, v]) => v);
    const factLine = [t.year, t.runtime, t.status, (t.genres || []).slice(0, 2).join(", ")].filter(Boolean).map(esc).join(" · ");
    return `<button class="back-link" data-action="back">${icons.left} Back</button>
    ${t.backdrop ? `<div class="m-amb" style="background-image:url('${esc(t.backdrop)}')" aria-hidden="true"></div>` : ""}
    <section class="detail-hero" id="detailHero">
      <div class="detail-bg" id="detailBg">${wideHTML(t, true)}</div>
      <div class="hero-controls"><button class="icon-btn" id="detailMute" aria-label="Unmute trailer" hidden>${icons.muted}</button></div>
      <div class="detail-inner">
        <div class="detail-poster">${posterHTML(t, true)}</div>
        <div>
          <p class="eyebrow">${esc(typeLabel(t))}${t.status && !["Released", "Ended", "Returning Series"].includes(t.status) ? ` · ${esc(t.status)}` : ""}</p>
          ${titleOrLogo(t, "detail")}
          <div class="meta">${[t.year, t.runtime, t.rated].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('<span class="dot"></span>')}${(t.genres || []).length ? `<span class="dot"></span><span>${esc(t.genres.slice(0, 2).join(", "))}</span>` : ""}<span class="dot"></span><span style="color:var(--accent)">${match(t)}% your vibe</span></div>
          ${t.tagline ? `<p class="tagline">“${esc(t.tagline)}”</p>` : ""}
          <p class="detail-syn">${esc(t.synopsis || "No synopsis yet.")}</p>
          ${scoreChips(t) || aw ? `<div class="score-row">${scoreChips(t)}${aw ? `<span class="chip" title="${esc(t.awards)}">${icons.trophy} ${esc(aw)}</span>` : ""}</div>` : ""}
          <div class="hero-actions">
            ${LIVE && t.tmdbId ? `<a class="btn btn-primary" href="#/watch/${esc(t.key)}">${icons.play} Play</a>` : ""}
            ${t.trailer ? `<button class="btn btn-ghost" data-action="trailer" data-yt="${esc(t.trailer)}">${icons.play} Trailer</button>` : ""}
            <a class="btn btn-ghost" href="${watchHref}" ${watchHref.startsWith("http") ? 'target="_blank" rel="noopener"' : 'data-action="jump"'}>${icons.ext} Where to watch</a>
            <button class="btn btn-ghost" data-save="${esc(t.key)}">${saved ? icons.check + " On My List" : icons.plus + " Add to My List"}</button>
            <button class="icon-btn" data-action="download" data-id="${esc(t.key)}" aria-label="Download ${esc(t.title)}" title="Download">${icons.download}</button>
          </div>
        </div>
      </div>
    </section>
    <section class="m-card" aria-label="About ${esc(t.title)}">
      <h2>${esc(t.title)}</h2>
      ${factLine ? `<p class="m-facts">${factLine}</p>` : ""}
      ${scoreChips(t) || aw ? `<div class="m-scores">${scoreChips(t)}${aw ? `<span class="pv-award">${icons.trophy} ${esc(aw)}</span>` : ""}</div>` : ""}
      <p class="m-syn clamp">${esc(t.synopsis || "No synopsis yet.")}</p>
      ${(t.synopsis || "").length > 160 ? `<button class="text-btn m-more" data-action="expand-syn">Read more</button>` : ""}
      ${castNames.length ? `<p class="m-row"><b>Starring:</b> ${castNames.slice(0, 3).map(c => `<a href="#/search?q=${slug(c)}">${esc(c)}</a>`).join(", ")}</p>` : ""}
      ${t.by ? `<p class="m-row"><b>${esc(t.byRole === "Directed by" ? "Director" : "Created by")}:</b> ${esc(t.by)}</p>` : ""}
    </section>
    ${prov ? `<section class="section" id="providers">
      <div class="section-head"><h2>Where to watch</h2><a href="${esc(prov.link)}" target="_blank" rel="noopener">All options</a></div>
      <div class="providers">${prov.list.map(p => `<a class="provider" href="${esc(prov.link)}" target="_blank" rel="noopener"><img src="${esc(p.logo)}" alt=""><span><b>${esc(p.name)}</b><small>${p.how}</small></span></a>`).join("")}</div>
      <p class="fine">Availability in ${region()} from JustWatch via TMDB. Change region in Account.</p>
    </section>` : ""}
    ${t.seasons?.length ? `<section class="section" id="episodes">
      <div class="section-head"><h2>Episodes</h2><div class="episode-tools" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn btn-ghost episode-ratings-btn" data-action="episode-ratings" data-key="${esc(t.key)}">★ Episode ratings</button>
        <select class="select" id="seasonSel" aria-label="Season">${t.seasons.map(s => `<option value="${s.n}">${esc(s.name)} · ${s.count} ep${s.year ? ` · ${s.year}` : ""}</option>`).join("")}</select>
      </div></div>
      <div class="episodes" id="epList"></div>
    </section>` : ""}
    ${t.castFull?.length ? `<section class="section"><div class="section-head"><h2>Cast</h2></div>
      <div class="row cast-row">${t.castFull.map(c => `<a class="person" href="${c.id ? `#/person/${c.id}` : `#/search?q=${slug(c.name)}`}">
        <span class="person-ph">${c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy">` : esc(c.name[0])}</span><b>${esc(c.name)}</b><small>${esc(c.role || "")}</small></a>`).join("")}</div></section>` : ""}
    <section class="section"><div class="section-head"><h2>More details</h2></div>
      <dl class="details-grid">${detailRows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl></section>
    ${t.reviews?.length ? `<section class="section"><div class="section-head"><h2>Reviews</h2></div>
      <div class="reviews">${t.reviews.map(r => `<article class="review">
        <header><span class="avatar" style="background:${AV_COLORS[hash(r.author) % AV_COLORS.length]}">${esc(r.author[0]?.toUpperCase() || "?")}</span>
          <div><b>${esc(r.author)}</b><small>${esc(fmtDate(r.date))}</small></div>${r.rating ? `<span class="chip">★ ${r.rating}/10</span>` : ""}</header>
        <p class="clamp">${esc(r.content)}</p>
        <button class="text-btn" data-action="expand">Read more</button>
      </article>`).join("")}</div></section>` : ""}
    ${row("You Might Also Like", similar)}
    ${LIVE ? asyncRow("Trending Now", null, async () => (await data.row({ path: "trending/all/week" })).filter(x => x.key !== t.key)) : ""}`;
  }
  // IMDb episode ratings, one OMDb request per season (needs the OMDb key).
  async function omdbSeasonRatings(t, total) {
    if (!FEAT.omdb || !t.imdb) return null;
    const nums = (t.seasons || []).map(s => s.n).slice(0, total);
    const seasons = {};
    await Promise.all(nums.map(async n => {
      const url = SERVER ? `/api/omdb?i=${encodeURIComponent(t.imdb)}&Season=${n}`
        : `https://www.omdbapi.com/?i=${encodeURIComponent(t.imdb)}&Season=${n}&apikey=${encodeURIComponent(CFG.omdbKey)}`;
      try {
        const o = await fetch(url).then(r => r.json());
        if (o.Response === "True") seasons[n] = (o.Episodes || []).map(e => ({ episode_number: Number(e.Episode), rating: e.imdbRating && e.imdbRating !== "N/A" ? Number(e.imdbRating) : null }));
      } catch {}
    }));
    return { imdbId: t.imdb, seasons };
  }

  async function openEpisodeRatings(t) {
    const total = Math.max(1, Number(t.seasons?.length || 1));
    modal(`<div class="episode-ratings-head"><div><p class="eyebrow">SERIES GUIDE</p><h2>Episode Ratings</h2><p>${esc(t.title)} · IMDb ratings where available, otherwise TMDB</p></div><button class="icon-btn" data-close aria-label="Close ratings">×</button></div>
      <div class="episode-ratings-legend"><span><i class="excellent"></i>9.0+</span><span><i class="great"></i>8.0–8.9</span><span><i class="good"></i>7.0–7.9</span><span><i class="average"></i>6.0–6.9</span><span><i class="low"></i>Below 6</span><span><i class="unrated"></i>Not rated</span></div>
      <div class="episode-ratings-content" id="episodeRatingsContent"><div class="ratings-loading"><span class="spinner"></span>Loading episode ratings…</div></div>
      <style>
        .episode-ratings-modal{width:min(94vw,980px);max-height:88vh;overflow:auto}.episode-ratings-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.episode-ratings-head h2{margin:3px 0 5px}.episode-ratings-head p:not(.eyebrow){margin:0;color:var(--muted);font-size:13px}.episode-ratings-legend{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0;font-size:11px;color:var(--muted)}.episode-ratings-legend span{display:flex;align-items:center;gap:5px}.episode-ratings-legend i{width:9px;height:9px;border-radius:3px;background:#555}.episode-ratings-legend .excellent{background:#1c9b63}.episode-ratings-legend .great{background:#59a86b}.episode-ratings-legend .good{background:#a4ad4a}.episode-ratings-legend .average{background:#c28b38}.episode-ratings-legend .low{background:#b85d55}.episode-ratings-legend .unrated{background:#626875}.episode-ratings-scroll{overflow:auto;border:1px solid var(--line);border-radius:10px}.episode-ratings-grid{display:grid;grid-auto-flow:row;grid-auto-rows:40px;min-width:max-content}.episode-ratings-grid>div{display:flex;align-items:center;justify-content:center;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:12px}.episode-ratings-grid .season-head,.episode-ratings-grid .ep-label,.episode-ratings-grid .avg-label{font-weight:700;color:var(--muted);background:var(--panel)}.episode-ratings-grid .ep-label{position:sticky;left:0;z-index:1}.episode-ratings-grid .rating-cell{font-weight:700}.episode-ratings-grid .excellent{background:#1c9b6330;color:#61d69b}.episode-ratings-grid .great{background:#59a86b30;color:#9bd49e}.episode-ratings-grid .good{background:#a4ad4a30;color:#c6d17c}.episode-ratings-grid .average{background:#c28b3830;color:#e6b768}.episode-ratings-grid .low{background:#b85d5530;color:#e58d82}.episode-ratings-grid .unrated{color:var(--muted)}.ratings-loading{display:flex;align-items:center;gap:10px;color:var(--muted);padding:28px 0}.episode-ratings-note{font-size:12px;color:var(--muted);margin-top:12px}.episode-ratings-note a{color:var(--accent)}
      </style>`, async (back, close) => {
      const box = back.querySelector("#episodeRatingsContent");
      const ratingClass = rating => !rating ? "unrated" : rating >= 9 ? "excellent" : rating >= 8 ? "great" : rating >= 7 ? "good" : rating >= 6 ? "average" : "low";
      try {
        const [imdbResult, seasonResults] = await Promise.all([
          omdbSeasonRatings(t, total),
          Promise.all(Array.from({ length: total }, (_, i) => {
            const n = Number(t.seasons?.[i]?.n || i + 1);
            return tmdb(`tv/${t.tmdbId}/season/${n}`).then(x => [n, x.episodes || []]).catch(() => [n, []]);
          }))
        ]);
        if (!box.isConnected) return;
        const seasons = Object.fromEntries(seasonResults);
        const seasonNumbers = Object.keys(seasons).sort((a,b) => Number(a)-Number(b));
        const maxEpisodes = Math.max(0, ...Object.values(seasons).map(x => x.length));
        const imdb = imdbResult?.seasons || {};
        const getRating = (sn, ep) => {
          if (!ep) return { rating: null, source: null, votes: null };
          const item = (imdb[sn] || []).find(x => Number(x.episode_number) === Number(ep.episode_number));
          if (item?.rating) return { rating: Number(item.rating), source: "IMDb", votes: item.votes };
          const score = Number(ep.vote_average);
          return score > 0 ? { rating: score, source: "TMDB", votes: null } : { rating: null, source: null, votes: null };
        };
        const cols = `70px repeat(${seasonNumbers.length},64px)`;
        let cells = `<div class="season-head"></div>${seasonNumbers.map(n => `<div class="season-head">S${n}</div>`).join("")}`;
        for (let epNo = 1; epNo <= maxEpisodes; epNo++) {
          cells += `<div class="ep-label">E${epNo}</div>`;
          for (const sn of seasonNumbers) {
            const ep = (seasons[sn] || []).find(x => Number(x.episode_number) === epNo);
            const r = getRating(sn, ep);
            const value = r.rating ? r.rating.toFixed(1) : "—";
            const title = ep ? `${ep.name || `Episode ${epNo}`} · ${r.rating ? `${value} (${r.source}${r.votes ? `, ${Number(r.votes).toLocaleString()} votes` : ""})` : "Not rated"}` : "Episode not available";
            cells += `<div class="rating-cell ${ratingClass(r.rating)}" title="${esc(title)}">${value}</div>`;
          }
        }
        cells += `<div class="avg-label">AVG</div>`;
        for (const sn of seasonNumbers) {
          const values = (seasons[sn] || []).map(ep => getRating(sn, ep).rating).filter(x => Number.isFinite(x) && x > 0);
          const avg = values.length ? values.reduce((a,b) => a+b, 0) / values.length : null;
          cells += `<div class="rating-cell ${ratingClass(avg)}">${avg ? avg.toFixed(1) : "—"}</div>`;
        }
        const imdbCount = Object.values(imdb).reduce((n, arr) => n + (arr || []).filter(x => x.rating).length, 0);
        const imdbLink = imdbResult?.imdbId ? ` · <a href="https://www.imdb.com/title/${encodeURIComponent(imdbResult.imdbId)}/episodes" target="_blank" rel="noopener noreferrer">View on IMDb</a>` : "";
        box.innerHTML = `<div class="episode-ratings-scroll"><div class="episode-ratings-grid" style="grid-template-columns:${cols}">${cells}</div></div><p class="episode-ratings-note">${imdbCount ? `IMDb ratings available for ${imdbCount} episodes; remaining scores use TMDB when available.` : "IMDb ratings are currently unavailable; showing TMDB episode scores where available."}${imdbLink}</p>`;
      } catch (err) {
        if (box.isConnected) box.innerHTML = `<p class="fine">Couldn't load episode ratings right now. Please try again later.</p>`;
      }
    }, "episode-ratings-modal");
  }

  async function loadSeason(t, n) {
    const box = document.getElementById("epList"); if (!box) return;
    box.innerHTML = `<div class="ep skel" style="height:120px"></div><div class="ep skel" style="height:120px"></div>`;
    try {
      const s = await tmdb(`tv/${t.tmdbId}/season/${n}`);
      if (!document.getElementById("epList")) return;
      box.innerHTML = (s.episodes || []).map(e => `<article class="ep">
        <div class="ep-still">${e.still_path ? `<img src="${IMG}w300${e.still_path}" alt="" loading="lazy">` : `<span>${e.episode_number}</span>`}
          ${e.vote_average ? `<span class="ep-rate">TMDB ${e.vote_average.toFixed(1)}</span>` : ""}${e.runtime ? `<span class="ep-dur">${e.runtime}m</span>` : ""}</div>
        <div><b>${e.episode_number}. ${esc(e.name)}</b>
          <div class="meta" style="color:var(--muted);font-size:12.5px;margin:4px 0 6px">${e.air_date ? `<span>${esc(fmtDate(e.air_date))}</span>` : ""}${e.runtime ? `<span class="dot"></span><span>${e.runtime}m</span>` : ""}${e.vote_average ? `<span class="dot"></span><span>★ ${e.vote_average.toFixed(1)}</span>` : ""}</div>
          <p>${esc(e.overview || "No description yet.")}</p>
        </div></article>`).join("") || empty("No episodes listed", "");
    } catch { box.innerHTML = failBox(); }
  }

  async function pageWatch(key, params) {
    const t = await detail(key);
    if (!t || !LIVE || !t.tmdbId) {
      return `<div class="page"><button class="back-link" data-action="back">${icons.left} Back</button>
        <section class="panel"><h1>Playback unavailable</h1><p>This title needs a live TMDB record before it can be played.</p></section></div>`;
    }

    const kind = t.kind === "tv" ? "tv" : "movie";
    const season = kind === "tv" ? Math.max(1, Number(params.get("season")) || t.seasons?.[0]?.n || 1) : null;
    const episode = kind === "tv" ? Math.max(1, Number(params.get("episode")) || 1) : null;
    const path = kind === "movie"
      ? `/playback/movie/${encodeURIComponent(t.tmdbId)}`
      : `/playback/tv/${encodeURIComponent(t.tmdbId)}?season=${season}&episode=${episode}`;

    let playback;
    let error = "";
    try {
      const response = await fetch(`${PLAYBACK_API}${path}`, { headers: { accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Playback API ${response.status}`);
      playback = payload;
    } catch (e) {
      error = e.message || "Couldn't load playback providers.";
      playback = { providers: [] };
    }

    const providers = playback.providers || [];
    const active = providers[0] || null;
    const saved = findSavedProgress(kind, t.tmdbId, season, episode);
    const resumeAt = saved && saved.timestamp >= 30 && (saved.progress ?? 0) < .95
      ? Math.max(0, saved.timestamp - 5) : null;
    const episodeLabel = kind === "tv" ? ` · S${season} E${episode}` : "";
    return `<div class="page watch-page" id="watchPage" data-watch-type="${kind}" data-watch-id="${esc(t.tmdbId)}" data-watch-season="${season || ""}" data-watch-episode="${episode || ""}" data-watch-resume="${resumeAt || ""}">
      <a class="back-link" href="#/title/${esc(t.key)}">${icons.left} Back to details</a>
      <header class="watch-heading">
        <div><p class="eyebrow">NOW PLAYING</p><h1>${esc(t.title)}${episodeLabel}</h1>
          ${kind === "tv" ? `<p>Season ${season}, Episode ${episode}</p>` : ""}
        </div>
      </header>
      <div class="watch-player-wrap" id="watchPlayer">
        ${active
          ? `<iframe id="watchFrame" src="${esc(withResume(active.url, resumeAt))}" title="${esc(t.title)} player" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`
          : `<div class="watch-empty"><div class="empty-icon">${icons.play}</div><h2>No playback provider available</h2><p>${error ? esc(error) : "There is currently no configured playback provider for this title."}</p></div>`}
        ${active ? `<button class="watch-fullscreen" data-action="watch-fullscreen" aria-label="Fullscreen in this tab" title="Fullscreen in this tab"${isFrameXTVProvider(active.id, active.name) ? "" : " hidden"}>${icons.ext}<span>Fullscreen here</span></button>` : ""}
      </div>
      ${providers.length ? `<section class="watch-servers">
        <div class="section-head"><h2>Playback servers</h2><span class="fine">Choose a server</span></div>
        <div class="watch-server-list">${providers.map((p, i) => { const canResume = Boolean(resumeParamFor(p.url)); return `<button class="btn ${i === 0 ? "btn-primary" : "btn-ghost"} watch-server" data-action="watch-server" data-url="${esc(withResume(p.url, resumeAt))}" data-start-url="${esc(p.url)}" data-provider="${esc(p.id)}" data-provider-name="${esc(p.name)}" data-resume-supported="${canResume}" aria-pressed="${i === 0}"><span class="watch-server-name">${icons.play} ${esc(p.name)}</span><small class="server-resume-status ${canResume ? "supported" : "unsupported"}">${canResume ? "Resume supported" : "Manual seek"}</small></button>`; }).join("")}</div>
      </section>` : ""}
      ${resumeAt && active ? `<div class="watch-resume" id="watchResume"><span aria-hidden="true">↻</span> <span>${resumeParamFor(active.url) ? `Continue from <b>${formatWatchTime(resumeAt)}</b>` : `You stopped at <b>${formatWatchTime(resumeAt)}</b>. This server can't resume automatically.`}</span>${providers.filter(p => p.id !== active.id && resumeParamFor(p.url)).map(p => `<button class="text-btn" data-action="watch-resume-server" data-url="${esc(withResume(p.url, resumeAt))}" data-provider="${esc(p.id)}">Resume on ${esc(p.name)}</button>`).join("")}<button class="text-btn" data-action="watch-start-over" data-url="${esc(active.url)}">Start over</button></div>` : ""}
      ${error && providers.length ? `<p class="fine">${esc(error)}</p>` : ""}
      ${t.synopsis ? `<p class="watch-description">${esc(t.synopsis)}</p>` : ""}
    </div>
    <style>
      .watch-page{max-width:1180px;margin:0 auto;padding:34px 0 70px}
      .watch-heading{display:flex;justify-content:space-between;align-items:end;margin:18px 0 22px}
      .watch-heading h1{margin:4px 0;font-size:clamp(25px,4vw,38px)}
      .watch-player-wrap{position:relative;aspect-ratio:16/9;background:#050608;border:1px solid var(--line);border-radius:16px;overflow:hidden}
      .watch-player-wrap iframe{width:100%;height:100%;border:0;display:block}
      .watch-empty{height:100%;min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;color:var(--muted)}
      .watch-empty h2{color:var(--text);margin:14px 0 4px}
      .watch-fullscreen[hidden]{display:none!important}.watch-fullscreen{position:absolute;right:14px;bottom:14px;z-index:5;border:1px solid #ffffff55;border-radius:9px;padding:10px 12px;background:#111d;color:white;cursor:pointer;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:650}.watch-fullscreen:hover{background:#263044}.watch-servers{margin-top:26px}.watch-server-list{display:flex;flex-wrap:wrap;gap:10px}.watch-server{display:flex;flex-direction:column;align-items:flex-start;gap:4px}.watch-server-name{display:flex;align-items:center;gap:7px}.server-resume-status{font-size:10px;line-height:1.2;opacity:.9;padding-left:23px}.server-resume-status.supported{color:#70d6a0}.server-resume-status.unsupported{color:#e9b56f}.watch-resume{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;color:var(--muted);font-size:13px}.watch-resume b{color:var(--text)}
      .watch-description{max-width:850px;color:var(--muted);line-height:1.7;margin-top:24px}
      @media(max-width:700px){.watch-page{padding:22px 16px 50px}.watch-heading{margin:12px 0 16px}.watch-player-wrap{border-radius:10px}}
    </style>`;
  }


  // Account
  const REGIONS = [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["IE", "Ireland"], ["NZ", "New Zealand"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"], ["SE", "Sweden"], ["IN", "India"], ["NG", "Nigeria"], ["ZA", "South Africa"], ["JP", "Japan"], ["KR", "South Korea"], ["BR", "Brazil"], ["MX", "Mexico"]];
  function exportVesperaBackup() {
    const payload = {
      app: "Vespera", version: 1, exportedAt: new Date().toISOString(),
      data: {
        profiles: store.get("profiles", []), current: store.get("current", null), lists: store.get("lists", {}),
        perf: store.get("perf", false), autoplay: store.get("autoplay", true), region: store.get("region", CFG.region || "US"),
        lang: store.get("lang", "English"), watchProgress: readWatchProgress()
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `vespera-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Vespera backup exported");
  }
  function importVesperaBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "")); const d = payload?.data;
        if (payload?.app !== "Vespera" || !d || !Array.isArray(d.profiles) || !d.lists || typeof d.lists !== "object") throw new Error("invalid backup");
        modal(`<h2>Import Vespera backup?</h2><p>This replaces the profiles, lists and settings currently saved in this browser.</p><p class="fine">Backup date: ${esc(payload.exportedAt ? fmtDate(payload.exportedAt.slice(0,10)) : "Unknown")}</p><div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="confirmBackupImport">Import backup</button></div>`, (back, close) => {
          back.querySelector("#confirmBackupImport").onclick = () => {
            hydrating = true;
            try {
              ["profiles", "current", "lists", "perf", "autoplay", "region", "lang"].forEach(k => { if (d[k] !== undefined) localStorage.setItem("vespera." + k, JSON.stringify(d[k])); });
              if (Array.isArray(d.watchProgress)) localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(d.watchProgress));
            } finally { hydrating = false; }
            ensureGuestProfile(); close(); toast("Backup imported"); render();
          };
        });
      } catch { toast("That file isn't a valid Vespera backup"); }
    };
    reader.onerror = () => toast("Couldn't read that backup file");
    reader.readAsText(file);
  }

  function pageAccount() {
    const tog = (act, on, label, hint) => `<button class="pref" data-action="${act}" role="switch" aria-checked="${on}"><span><b>${label}</b><small>${hint}</small></span><span class="switch ${on ? "on" : ""}"></span></button>`;
    return `<div class="page account">
      <div class="page-head"><div><h1>Settings</h1><p>Profiles, preferences and your Vespera data.</p></div></div>
      <div class="acct-grid">
        <section class="panel"><h2>Profiles</h2>
          <div class="acct-profiles">${state.profiles.map(p => `<button class="who-mini ${p.id === state.currentId ? "on" : ""}" data-switch="${p.id}">${avatar(p)}<span>${esc(p.name)}</span></button>`).join("")}
            ${state.profiles.length < 5 ? `<button class="who-mini" data-action="add-profile"><span class="add-av">+</span><span>Add</span></button>` : ""}</div>
          <a class="btn btn-ghost" href="#/who/manage" style="margin-top:14px">${icons.users} Manage profiles</a>
        </section>
        <section class="panel"><h2>Preferences</h2>
          <label class="pref-sel"><span><b>Language</b><small>Interface language.</small></span>${langSel()}</label>
          <label class="pref-sel"><span><b>Region</b><small>Used for “Where to watch”.</small></span>
            <select class="select" id="regionSel">${REGIONS.map(([c, n]) => `<option value="${c}" ${region() === c ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          ${tog("autoplay", state.autoplay, "Autoplay trailers", "Play muted trailers in heroes.")}
          ${tog("perf", state.perf, "Performance mode", "Fewer animations, no background video.")}
        </section>
        <section class="panel"><h2>Move Vespera between devices</h2>
          <p class="fine" style="padding:0;margin:0 0 14px">No account or sign-up required. Export a Vespera backup on this device, then import that file on another device to transfer profiles, My Lists, settings and Continue Watching progress.</p>
          <div class="hero-actions"><button class="btn btn-primary" data-action="backup-export">${icons.ext} Export backup</button>
            <button class="btn btn-ghost" data-action="backup-import">Import backup</button></div>
          <input id="backupFile" type="file" accept="application/json,.json" hidden>
          <p class="fine" style="margin-top:12px">Backups are stored wherever you save the file. Importing replaces the Vespera data on this device.</p>
        </section>
        <section class="panel"><h2>Your data</h2><p class="fine" style="padding:0;margin:0 0 14px">Your profiles, lists and viewing progress are stored locally in this browser unless you export a backup.</p>
          <button class="btn btn-ghost" data-action="clear-list">Clear ${esc(state.current?.name || "current profile")}’s list</button>
        </section>
      </div></div>`;
  }

  // ---------- gate / sign-in / profiles ----------
  const brandHTML = `<a class="brand" href="#/" aria-label="Vespera"><img src="vespera-logo-minimal.png" alt="Vespera" style="width:190px;height:50px;object-fit:contain;display:block"></a>`;
  const langSel = () => `<select class="lang" id="lang" aria-label="Language">${["English", "Español", "Français", "Deutsch", "日本語"].map(l => `<option ${store.get("lang", "English") === l ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const legal = `<p class="legal">By continuing you agree to the Vespera <a href="#" data-action="privacy">Privacy Policy</a>.</p>`;

  function pageWelcome() {
    return `<div class="gate"><div class="gate-card">
      ${brandHTML}
      <p class="eyebrow">After Dark</p>
      <h1>A screening guide for the few</h1>
      <p class="lead">Vespera is invitation only. If someone saved you a seat, step inside.</p>
      <p class="hint">Already have an invitation?</p>
      <a class="btn btn-primary btn-block" href="#/signin">Sign in</a>
      ${legal}${langSel()}
    </div></div>`;
  }
  function pageSignin(params) {
    const step = params.get("step") || "email"; const email = params.get("email") || "";
    if (step === "code") {
      return `<div class="gate"><div class="gate-card">
        ${brandHTML}
        <h1>Check your inbox</h1>
        <p class="lead">We sent a 6-digit code to <b style="color:var(--text)">${esc(email)}</b>. It expires in 10 minutes.</p>
        ${params.get("dev") ? `<p class="notice-box">Email isn't set up yet, so the code is printed in the server window.</p>` : ""}
        <form id="codeForm" novalidate>
          <div class="field"><label class="label" for="code">Sign-in code</label>
            <input class="input code" id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" required>
            <p class="error" id="err" role="alert"></p></div>
          <button class="btn btn-primary btn-block" id="codeBtn" disabled>Continue</button>
        </form>
        ${SERVER ? `<button class="text-btn" data-action="resend">Send a new code</button><br>` : ""}
        <button class="text-btn" data-go="#/signin?email=${encodeURIComponent(email)}">Use a different email</button>
        ${legal}
      </div></div>`;
    }
    return `<div class="gate"><div class="gate-card">
      ${brandHTML}
      <h1>Sign in to Vespera</h1>
      <p class="lead">${FEAT.google ? "Continue with Google or get a code by email." : "We'll email you a 6-digit code."}</p>
      ${SIGNIN_ERRORS[params.get("error")] ? `<p class="notice-box error-box">${SIGNIN_ERRORS[params.get("error")]}</p>` : ""}
      ${FEAT.google || !SERVER ? `<button class="btn btn-ghost btn-block" data-action="google">Continue with ${icons.google}</button>
      <div class="divider">OR</div>` : ""}
      <form id="emailForm" novalidate>
        <div class="field"><label class="label" for="email">Enter your email</label>
          <input class="input" id="email" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(email)}" required>
          <p class="error" id="err" role="alert"></p></div>
        <button class="btn btn-primary btn-block" id="sendBtn">Send sign-in code</button>
      </form>
      ${legal}${langSel()}
    </div></div>`;
  }
  const SIGNIN_ERRORS = {
    not_invited: "That email isn't on the guest list yet. Ask the person who invited you to add it.",
    google_failed: "Google sign-in didn't complete. Try again, or use an email code.",
    google_unavailable: "Google sign-in isn't set up yet — use an email code.",
    bad_email: "Enter a valid email address.",
    slow_down: "Too many attempts. Wait a few minutes and try again.",
    wrong_code: "That code isn't right.",
    expired: "That code has expired. Send a new one.",
    too_many_tries: "Too many wrong codes. Send a new one.",
  };
  async function signIn(email) {
    if (!SERVER) store.set("auth", { email, since: store.get("auth", null)?.since || new Date().toISOString() });
    await ensureGenres().catch(() => {});
    if (!state.profiles.length) {
      const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 16) || "You";
      state.profiles = [{ id: "p" + Date.now().toString(36), name, color: 0 }];
    }
    if (state.profiles.length === 1) { state.currentId = state.profiles[0].id; location.hash = "#/"; }
    else location.hash = "#/who";
  }
  function pageWho(manage) {
    const ps = state.profiles;
    return `<div class="who"><div>
      ${brandHTML.replace('class="brand"', 'class="brand" style="margin-bottom:34px;display:inline-flex"')}
      <h1>${manage ? "Manage profiles" : "Who's here tonight?"}</h1>
      <div class="who-grid">
        ${ps.map(p => `<button class="who-item" data-${manage ? "edit" : "pick"}="${p.id}">
          ${avatar(p)}${manage ? `<span class="del">${icons.pen}</span>` : ""}<span>${esc(p.name)}</span></button>`).join("")}
        ${ps.length < 5 ? `<button class="who-item" data-action="add-profile"><span class="add-av">+</span><span>Add profile</span></button>` : ""}
      </div>
      ${manage ? `<a class="btn btn-primary" href="${state.current ? "#/" : "#/who"}">Done</a>` : `<a class="btn btn-ghost" href="#/who/manage">Manage profiles</a>`}
    </div></div>`;
  }

  // ---------- AI assistant ----------
  const AI_STARTERS = ["Something like Dark, but lighter", "A feel-good film for tonight", "Best anime of the last five years", "A gripping limited series"];
  let aiMsgs = []; let aiBusy = false;
  try { aiMsgs = JSON.parse(sessionStorage.getItem("vespera.ai") || "[]"); } catch {}
  const saveAi = () => { try { sessionStorage.setItem("vespera.ai", JSON.stringify(aiMsgs.slice(-30))); } catch {} };
  function aiPanel() {
    let el = document.getElementById("aiPanel");
    if (el) return el;
    el = document.createElement("aside");
    el.id = "aiPanel"; el.className = "ai-panel"; el.setAttribute("aria-label", "Ask Vespera"); el.hidden = true;
    el.innerHTML = `<header><span class="ai-title">${icons.spark} Ask Vespera</span>
        <button class="text-btn" data-action="ai-clear">New chat</button>
        <button class="icon-btn" data-action="ai-close" aria-label="Close assistant">${icons.left}</button></header>
      <div class="ai-log" id="aiLog" aria-live="polite"></div>
      <form class="ai-form" id="aiForm"><input id="aiInput" maxlength="600" autocomplete="off" placeholder="Ask for a recommendation…" aria-label="Message">
        <button class="btn btn-primary" id="aiSend" aria-label="Send">${icons.right}</button></form>
      <p class="ai-fine">AI suggestions can be wrong — check the title page.</p>`;
    document.body.appendChild(el);
    el.querySelector("#aiForm").onsubmit = e => { e.preventDefault(); const i = el.querySelector("#aiInput"); aiSend(i.value); i.value = ""; };
    return el;
  }
  function aiRender() {
    const log = document.getElementById("aiLog"); if (!log) return;
    const pickCard = p => { const t = items.get(p.key); if (!t) return "";
      return `<div class="ai-pick" data-preview="${esc(t.key)}" role="button" tabindex="0">
        <span class="ai-thumb">${posterHTML(t)}</span>
        <span class="ai-pick-body"><b>${esc(t.title)}</b><small>${esc(typeLabel(t))}${t.year ? " · " + t.year : ""}${t.vote ? ` · ★ ${t.vote.toFixed(1)}` : ""}</small><em>${esc(p.why)}</em></span>
        <button class="icon-btn" data-save="${esc(t.key)}" aria-label="Add to My List">${state.isSaved(t.key) ? icons.check : icons.plus}</button></div>`; };
    log.innerHTML = (aiMsgs.length ? "" : `<div class="ai-hello"><p>Tell me what you're in the mood for, or name something you loved.</p>
        <div class="ai-starters">${AI_STARTERS.map(s => `<button class="pill" data-ai-ask="${esc(s)}">${esc(s)}</button>`).join("")}
        <button class="pill" data-action="surprise">Surprise me</button></div></div>`)
      + aiMsgs.map(m => m.role === "user" ? `<div class="ai-msg me">${esc(m.content)}</div>`
        : `<div class="ai-msg bot ${m.error ? "err" : ""}">${esc(m.content)}</div>${(m.picks || []).length ? `<div class="ai-picks">${m.picks.map(pickCard).join("")}</div>` : ""}`).join("")
      + (aiBusy ? `<div class="ai-msg bot typing"><i></i><i></i><i></i></div>` : "");
    log.scrollTop = log.scrollHeight;
  }
  function openAssistant(prompt) {
    const el = aiPanel(); el.hidden = false; document.body.classList.add("ai-open"); aiRender();
    if (prompt) aiSend(prompt); else setTimeout(() => el.querySelector("#aiInput").focus(), 50);
  }
  function closeAssistant() { const el = document.getElementById("aiPanel"); if (el) el.hidden = true; document.body.classList.remove("ai-open"); }
  async function aiSend(text) {
    text = (text || "").trim(); if (!text || aiBusy) return;
    aiMsgs.push({ role: "user", content: text }); aiBusy = true; aiRender();
    // Send titles back as text so Claude remembers what it already suggested.
    const history = aiMsgs.filter(m => !m.error).map(m => ({ role: m.role,
      content: m.role === "assistant" && m.picks?.length ? `${m.content}\n(Suggested: ${m.picks.map(p => { const t = items.get(p.key); return t ? `${t.title} (${t.year || "?"})` : ""; }).filter(Boolean).join(", ")})` : m.content }));
    try {
      const r = await api("assistant", "POST", { messages: history });
      const picks = (r.picks || []).map(p => { const t = fromTmdb(p.result); return t ? { key: t.key, why: p.why } : null; }).filter(Boolean);
      aiMsgs.push({ role: "assistant", content: r.reply || "Here's what I found.", picks });
    } catch (e) {
      aiMsgs.push({ role: "assistant", error: true, content: e.code === "slow_down" ? "You're asking quickly — give me a minute and try again."
        : e.code === "assistant_not_configured" ? "The assistant isn't set up on this server yet." : "Something went wrong. Try asking again." });
      if (e.status === 401) signedOut(true);
    }
    aiBusy = false; saveAi(); aiRender();
  }

  // ---------- modals ----------
  function modal(html, onMount, cls = "") {
    const back = document.createElement("div");
    back.className = "modal-back"; back.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    back.addEventListener("click", e => { if (e.target === back || e.target.closest("[data-close]")) close(); });
    onMount?.(back, close);
    back.querySelector("input, button")?.focus();
  }
  // Flixstar download integration: Wing provides movie/episode links; Flixstar API provides TV episode lists.
  const FLIXSTAR_API = "https://flixstar-api.onrender.com/api";
  const WING_DOWNLOADS = "https://downloads.wing.st";
  const downloadStyle = document.createElement("style");
  downloadStyle.textContent = `
    /* Download dialog styles are fully namespaced to Vespera's download modal. */
    .modal-back:has(.ves-download-shell){
      background:rgba(5,7,12,.78);
      -webkit-backdrop-filter:blur(9px);
      backdrop-filter:blur(9px);
      padding:18px;
    }
    .modal.ves-download-shell{
      width:min(720px,calc(100vw - 28px));
      max-width:720px;
      max-height:min(88vh,820px);
      overflow:hidden;
      padding:0;
      border:1px solid color-mix(in srgb,var(--line) 78%,transparent);
      border-radius:18px;
      background:var(--bg,var(--panel));
      color:var(--text);
      box-shadow:0 28px 90px rgba(0,0,0,.48);
    }
    .ves-download-modal{max-height:min(88vh,820px);overflow:auto;padding:clamp(18px,3vw,28px);}
    .ves-download-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin:0 0 20px;}
    .ves-download-heading{min-width:0;}
    .ves-download-kicker{margin:0 0 7px;color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;}
    .ves-download-head h2{margin:0;color:var(--text);font-size:clamp(19px,3vw,24px);font-weight:750;line-height:1.2;overflow-wrap:anywhere;}
    .ves-download-subtitle{margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.5;}
    .ves-download-close{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:11px;font-size:22px;line-height:1;cursor:pointer;transition:background .18s,color .18s,border-color .18s;}
    .ves-download-close:hover{background:color-mix(in srgb,var(--accent) 12%,var(--panel));color:var(--text);border-color:var(--accent);}
    .ves-download-selectors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 16px;}
    .ves-download-selectors label{display:block;min-width:0;}
    .ves-download-selectors select{display:block;width:100%;min-width:0;appearance:auto;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:11px;padding:12px 13px;font:inherit;font-size:13px;outline:none;}
    .ves-download-selectors select:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent);}
    .ves-download-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-block:1px solid var(--line);padding:13px 0;margin:0 0 14px;color:var(--muted);font-size:12px;}
    #vesDownloadCount{font-weight:650;}
    .ves-download-filters{display:flex;gap:6px;flex-wrap:wrap;}
    .ves-download-filters button{min-width:54px;border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:999px;padding:7px 12px;font:inherit;font-size:11px;font-weight:650;cursor:pointer;transition:background .18s,color .18s,border-color .18s;}
    .ves-download-filters button:hover{border-color:var(--accent);color:var(--text);}
    .ves-download-filters button.active{background:var(--accent);color:#fff;border-color:var(--accent);}
    .ves-download-list{display:grid;gap:9px;}
    .ves-download-item{display:flex;align-items:center;justify-content:space-between;gap:14px;min-width:0;padding:14px;border:1px solid var(--line);border-radius:13px;background:var(--panel);transition:border-color .18s,transform .18s;}
    .ves-download-item:hover{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));}
    .ves-download-item>div:first-child{min-width:0;}
    .ves-download-item strong{display:block;color:var(--text);font-size:13px;font-weight:750;overflow-wrap:anywhere;}
    .ves-download-meta,.ves-download-name{margin-top:5px;color:var(--muted);font-size:11px;line-height:1.45;overflow-wrap:anywhere;}
    .ves-download-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto;}
    .ves-download-actions button,.ves-download-actions a{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;border:1px solid var(--line);border-radius:9px;padding:8px 11px;color:var(--text);background:transparent;text-decoration:none;cursor:pointer;font:inherit;font-size:11px;font-weight:700;white-space:nowrap;transition:background .18s,border-color .18s,transform .18s;}
    .ves-download-actions button:hover{background:color-mix(in srgb,var(--accent) 10%,var(--panel));border-color:var(--accent);}
    .ves-download-actions a{background:var(--accent);color:#fff;border-color:var(--accent);}
    .ves-download-actions a:hover{filter:brightness(1.08);transform:translateY(-1px);}
    .ves-download-actions svg{width:14px;height:14px;}
    .ves-download-message{margin:0;color:var(--muted);font-size:13px;line-height:1.6;padding:24px 8px;text-align:center;border:1px dashed var(--line);border-radius:12px;background:color-mix(in srgb,var(--panel) 65%,transparent);}
    .ves-download-error{color:#ff8a8a;border-color:color-mix(in srgb,#ff6666 40%,var(--line));}
    .ves-download-modal button:focus-visible,.ves-download-modal a:focus-visible{outline:2px solid var(--accent);outline-offset:3px;}
    @media(max-width:560px){
      .modal-back:has(.ves-download-shell){padding:10px;}
      .modal.ves-download-shell{width:calc(100vw - 20px);max-height:92vh;border-radius:15px;}
      .ves-download-modal{max-height:92vh;padding:18px 15px;}
      .ves-download-selectors{grid-template-columns:1fr;gap:8px;}
      .ves-download-item{align-items:flex-start;flex-direction:column;gap:12px;}
      .ves-download-actions{width:100%;}
      .ves-download-actions button,.ves-download-actions a{flex:1;}
      .ves-download-toolbar{align-items:flex-start;flex-direction:column;}
    }
  `;
  document.head.appendChild(downloadStyle);

  function openDownloadModal(it) {
    const kind = it.kind === "tv" ? "tv" : "movie";
    const id = it.tmdbId || String(it.key || "").split("-")[1];
    if (!id) { toast("Download links aren't available for this title"); return; }
    const seasons = (it.seasons || []).filter(x => Number(x.n) > 0);
    let season = seasons[0]?.n || 1, episode = 1, links = [], filter = "all", closed = false;
    const seasonOptions = seasons.length ? seasons.map(x => `<option value="${x.n}">Season ${x.n}</option>`).join("") : `<option value="1">Season 1</option>`;
    modal(`<div class="ves-download-modal"><header class="ves-download-head"><div class="ves-download-heading"><p class="ves-download-kicker">VESPERA · DOWNLOADS</p><h2>${esc(it.title)}</h2><p class="ves-download-subtitle">Choose an available source and quality to download</p></div><button class="ves-download-close" data-close aria-label="Close">×</button></header>${kind === "tv" ? `<div class="ves-download-selectors"><label><span class="sr-only">Season</span><select id="vesDownloadSeason">${seasonOptions}</select></label><label><span class="sr-only">Episode</span><select id="vesDownloadEpisode"><option value="1">Episode 1</option></select></label></div>` : ""}<div class="ves-download-toolbar"><span id="vesDownloadCount">Finding links…</span><div class="ves-download-filters">${[["all","All"],["4k","4K"],["1080p","1080p"]].map(([v,l])=>`<button type="button" data-dl-filter="${v}" class="${v===filter?"active":""}">${l}</button>`).join("")}</div></div><p class="ves-download-message" id="vesDownloadMessage">Loading download options…</p><div class="ves-download-list" id="vesDownloadList"></div></div>`, back => {
      const root=back.querySelector(".ves-download-modal"), count=root.querySelector("#vesDownloadCount"), message=root.querySelector("#vesDownloadMessage"), list=root.querySelector("#vesDownloadList"), seasonSel=root.querySelector("#vesDownloadSeason"), episodeSel=root.querySelector("#vesDownloadEpisode");
      const visible=()=>links.filter(x=>filter==="4k"?Number(x.quality)>=2160:filter==="1080p"?Number(x.quality)===1080:true);
      const renderLinks=()=>{const filtered=visible();count.textContent=`Found ${links.length} links`;list.innerHTML=filtered.map((link,i)=>`<article class="ves-download-item"><div><strong>${esc(link.source||link.provider||"Download")}</strong><div class="ves-download-meta">${esc(link.quality?`${link.quality}p`:"Quality unavailable")}${link.size?` · ${esc(link.size)}`:""}</div><div class="ves-download-name">${esc(link.name||link.filename||link.provider||"")}</div></div><div class="ves-download-actions"><button type="button" data-copy-dl="${i}">${icons.share} Copy</button><a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${icons.download} Download</a></div></article>`).join("");message.hidden=filtered.length>0;if(!filtered.length)message.textContent=links.length?"No links match this quality filter.":"No download links are available for this selection.";};
      const loadLinks=async()=>{links=[];message.hidden=false;message.textContent="Loading download options…";message.classList.remove("ves-download-error");count.textContent="Finding links…";list.innerHTML="";try{const url=kind==="tv"?`${WING_DOWNLOADS}/tv/${encodeURIComponent(id)}/${season}/${episode}`:`${WING_DOWNLOADS}/movie/${encodeURIComponent(id)}`;const r=await fetch(url);if(!r.ok)throw new Error(`Download service returned ${r.status}`);const data=await r.json();if(!Array.isArray(data.links))throw new Error("Unexpected download response.");links=data.links;renderLinks();}catch(e){message.hidden=false;message.classList.add("ves-download-error");message.textContent=e.message==="Failed to fetch"?"Couldn't reach the download service. It may be temporarily unavailable or block browser requests.":e.message;count.textContent="Download links unavailable";}};
      const loadEpisodes=async()=>{message.hidden=false;message.textContent="Loading episodes…";try{const r=await fetch(`${FLIXSTAR_API}/tv/${encodeURIComponent(id)}/season/${encodeURIComponent(season)}`);if(!r.ok)throw new Error(`Episode list returned ${r.status}`);const data=await r.json();const eps=data.episodes||[];episodeSel.innerHTML=eps.map(x=>`<option value="${Number(x.episode_number)}">Episode ${Number(x.episode_number)}${x.name?` · ${esc(x.name)}`:""}</option>`).join("")||`<option value="1">Episode 1</option>`;episode=Number(episodeSel.value)||1;await loadLinks();}catch(e){message.hidden=false;message.textContent=`Couldn't load episodes: ${e.message}`;}};
      root.querySelectorAll("[data-dl-filter]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.dlFilter;root.querySelectorAll("[data-dl-filter]").forEach(x=>x.classList.toggle("active",x===b));renderLinks();}));
      root.addEventListener("click",async e=>{const b=e.target.closest("[data-copy-dl]");if(!b)return;const url=visible()[Number(b.dataset.copyDl)]?.url;if(!url)return;try{await navigator.clipboard.writeText(url);toast("Download link copied");}catch{window.prompt("Copy this download link:",url);}});
      if(seasonSel)seasonSel.addEventListener("change",()=>{season=Number(seasonSel.value)||1;loadEpisodes();});if(episodeSel)episodeSel.addEventListener("change",()=>{episode=Number(episodeSel.value)||1;loadLinks();});
      if(kind==="tv")loadEpisodes();else loadLinks();
      const mo=new MutationObserver(()=>{if(!document.body.contains(back)){closed=true;mo.disconnect();}});mo.observe(document.body,{childList:true});
    },"ves-download-shell");
  }

  // Main characters shown first for each franchise (wiki page names; redirects are followed).
  const AV_MAIN_CHARACTERS = {
    "Harry Potter": ["Harry Potter", "Hermione Granger", "Ronald Weasley", "Tom Riddle", "Severus Snape", "Minerva McGonagall", "Rubeus Hagrid", "Albus Dumbledore", "Draco Malfoy", "Sirius Black", "Luna Lovegood", "Neville Longbottom", "Ginevra Weasley", "Bellatrix Lestrange", "Remus Lupin", "Dobby", "Hedwig", "Fawkes", "Sorting Hat", "Dementor"],
    "Game of Thrones": ["Jon Snow", "Daenerys Targaryen", "Tyrion Lannister", "Arya Stark", "Sansa Stark", "Cersei Lannister", "Jaime Lannister", "Eddard Stark", "Bran Stark", "Joffrey Baratheon", "Sandor Clegane", "Brienne of Tarth", "Petyr Baelish", "Varys", "Night King", "Theon Greyjoy"],
    "House of the Dragon": ["Rhaenyra Targaryen", "Daemon Targaryen", "Alicent Hightower", "Viserys I Targaryen", "Otto Hightower", "Aegon II Targaryen", "Aemond Targaryen", "Corlys Velaryon", "Rhaenys Targaryen", "Criston Cole"],
    "Star Wars": ["Luke Skywalker", "Leia Organa", "Han Solo", "Darth Vader", "Yoda", "Obi-Wan Kenobi", "Chewbacca", "R2-D2", "C-3PO", "Palpatine", "Rey Skywalker", "Kylo Ren", "Din Djarin", "Grogu", "Ahsoka Tano", "Boba Fett", "Padmé Amidala", "Mace Windu"],
    "Marvel": ["Peter Parker (Earth-616)", "Anthony Stark (Earth-616)", "Steven Rogers (Earth-616)", "Thor Odinson (Earth-616)", "Bruce Banner (Earth-616)", "Natalia Romanova (Earth-616)", "T'Challa (Earth-616)", "Wade Wilson (Earth-616)", "James Howlett (Earth-616)", "Stephen Strange (Earth-616)", "Loki Laufeyson (Earth-616)", "Thanos (Earth-616)"],
    "The Lord of the Rings": ["Frodo Baggins", "Samwise Gamgee", "Gandalf", "Aragorn", "Legolas", "Gimli", "Boromir", "Gollum", "Bilbo Baggins", "Sauron", "Saruman", "Galadriel", "Arwen", "Éowyn", "Meriadoc Brandybuck", "Peregrin Took"],
    "Stranger Things": ["Eleven", "Mike Wheeler", "Dustin Henderson", "Lucas Sinclair", "Will Byers", "Max Mayfield", "Steve Harrington", "Nancy Wheeler", "Jonathan Byers", "Jim Hopper", "Joyce Byers", "Robin Buckley", "Eddie Munson", "Vecna"],
    "The Walking Dead": ["Rick Grimes", "Daryl Dixon", "Michonne", "Negan", "Glenn Rhee", "Maggie Greene", "Carol Peletier", "Carl Grimes", "Eugene Porter", "Shane Walsh"],
    "Breaking Bad": ["Walter White", "Jesse Pinkman", "Skyler White", "Hank Schrader", "Saul Goodman", "Gustavo Fring", "Mike Ehrmantraut", "Marie Schrader", "Walter White Jr.", "Tuco Salamanca"],
    "The Witcher": ["Geralt of Rivia", "Yennefer of Vengerberg", "Cirilla Fiona Elen Riannon", "Jaskier", "Triss Merigold", "Vesemir"],
    "Friends": ["Rachel Green", "Monica Geller", "Phoebe Buffay", "Joey Tribbiani", "Chandler Bing", "Ross Geller", "Gunther", "Janice Litman Goralnik"],
    "The Office": ["Michael Scott", "Dwight Schrute", "Jim Halpert", "Pam Beesly", "Andy Bernard", "Angela Martin", "Kevin Malone", "Oscar Martinez", "Stanley Hudson", "Kelly Kapoor", "Creed Bratton", "Toby Flenderson"],
    "Pokémon": ["Pikachu", "Ash Ketchum", "Charizard", "Bulbasaur", "Squirtle", "Eevee", "Mewtwo", "Jigglypuff", "Meowth", "Gengar", "Snorlax", "Lucario"],
    "Avatar: The Last Airbender": ["Aang", "Katara", "Sokka", "Zuko", "Toph Beifong", "Iroh", "Azula", "Appa", "Momo", "Ozai"],
    "SpongeBob": ["SpongeBob SquarePants", "Patrick Star", "Squidward Tentacles", "Eugene H. Krabs", "Sandy Cheeks", "Sheldon J. Plankton", "Gary the Snail", "Mrs. Puff"],
    "Dragon Ball": ["Goku", "Vegeta", "Gohan", "Piccolo", "Trunks", "Frieza", "Cell", "Majin Buu", "Bulma", "Krillin", "Beerus", "Broly"],
    "Naruto": ["Naruto Uzumaki", "Sasuke Uchiha", "Sakura Haruno", "Kakashi Hatake", "Itachi Uchiha", "Hinata Hyūga", "Gaara", "Jiraiya", "Madara Uchiha", "Shikamaru Nara", "Rock Lee", "Orochimaru"],
    "One Piece": ["Monkey D. Luffy", "Roronoa Zoro", "Nami", "Usopp", "Sanji", "Tony Tony Chopper", "Nico Robin", "Franky", "Brook", "Jinbe", "Shanks", "Portgas D. Ace"],
    "The Simpsons": ["Homer Simpson", "Marge Simpson", "Bart Simpson", "Lisa Simpson", "Maggie Simpson", "Ned Flanders", "Moe Szyslak", "Charles Montgomery Burns", "Krusty the Clown", "Milhouse Van Houten", "Apu Nahasapeemapetilon", "Waylon Smithers"],
    "Rick and Morty": ["Rick Sanchez", "Morty Smith", "Summer Smith", "Beth Smith", "Jerry Smith", "Mr. Meeseeks", "Birdperson", "Squanchy", "Mr. Poopybutthole", "Evil Morty"],
    "Peaky Blinders": ["Thomas Shelby", "Arthur Shelby", "Polly Gray", "John Shelby", "Ada Thorne", "Michael Gray", "Alfie Solomons", "Grace Shelby"],
    "The Boys": ["Billy Butcher", "Hughie Campbell", "Homelander", "Starlight", "Kimiko Miyashiro", "Frenchie", "Mother's Milk", "Queen Maeve", "The Deep", "A-Train", "Soldier Boy", "Stormfront"],
    "Supernatural": ["Dean Winchester", "Sam Winchester", "Castiel", "Bobby Singer", "Crowley", "Lucifer", "Jack Kline", "Rowena MacLeod"],
    "Attack on Titan": ["Eren Yeager", "Mikasa Ackermann", "Armin Arlert", "Levi Ackermann", "Erwin Smith", "Hange Zoë", "Reiner Braun", "Annie Leonhart", "Historia Reiss", "Jean Kirstein", "Sasha Braus", "Zeke Yeager"],
    "Demon Slayer": ["Tanjiro Kamado", "Nezuko Kamado", "Zenitsu Agatsuma", "Inosuke Hashibira", "Giyu Tomioka", "Kyojuro Rengoku", "Shinobu Kocho", "Muzan Kibutsuji", "Tengen Uzui", "Mitsuri Kanroji"],
    "My Hero Academia": ["Izuku Midoriya", "Katsuki Bakugo", "Shoto Todoroki", "Ochaco Uraraka", "All Might", "Tenya Ida", "Shota Aizawa", "Tomura Shigaraki", "Eijiro Kirishima", "Endeavor"],
    "The Hunger Games": ["Katniss Everdeen", "Peeta Mellark", "Gale Hawthorne", "Haymitch Abernathy", "Effie Trinket", "Coriolanus Snow", "Primrose Everdeen", "Finnick Odair", "Cinna", "Johanna Mason"],
    "The Matrix": ["Neo", "Trinity", "Morpheus", "Agent Smith", "The Oracle", "Niobe", "The Merovingian", "Cypher"],
  };
  // Franchises with character portraits (from each franchise's Fandom wiki).
  const AV_FRANCHISES = [
    ["Harry Potter","harrypotter"], ["Game of Thrones","gameofthrones"], ["House of the Dragon","gameofthrones"], ["Star Wars","starwars"],
    ["Marvel","marvel"], ["DC","dc"], ["The Lord of the Rings","lotr"], ["Stranger Things","strangerthings"],
    ["The Walking Dead","walkingdead"], ["Breaking Bad","breakingbad"], ["The Witcher","witcher"], ["Friends","friends"],
    ["The Office","theoffice"], ["Pokémon","pokemon"], ["Avatar: The Last Airbender","avatar"], ["SpongeBob","spongebob"],
    ["Dragon Ball","dragonball"], ["Naruto","naruto"], ["One Piece","onepiece"], ["The Simpsons","simpsons"],
    ["Rick and Morty","rickandmorty"], ["Peaky Blinders","peakyblinders"], ["The Boys","theboys"], ["Supernatural","supernatural"],
    ["The Big Bang Theory","bigbangtheory"], ["Sailor Moon","sailormoon"], ["Attack on Titan","attackontitan"], ["Demon Slayer","kimetsunoyaiba"],
    ["My Hero Academia","myheroacademia"], ["The Hunger Games","thehungergames"], ["Twilight","twilightsaga"], ["The Matrix","matrix"], ["Jurassic Park","jurassicpark"],
  ].map(([name, wiki]) => ({ name, wiki, chars: AV_MAIN_CHARACTERS[name] || null }));

  // Full-screen character picker. Calls onPick(imageUrl, name) or closes on Skip.
  function openCharacterPicker(onPick) {
    const el = document.createElement("div");
    el.className = "cp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Choose your avatar");
    el.innerHTML = `
      <header class="cp-top">
        <h2>Choose your avatar</h2>
        <label class="cp-search">${icons.search}<input id="cpQ" type="search" placeholder="Search a franchise, or press Enter to search TMDB" autocomplete="off" aria-label="Search franchises"></label>
      </header>
      <nav class="cp-chips" id="cpChips" aria-label="Franchises"></nav>
      <main class="cp-body">
        <h3 class="cp-heading" id="cpHeading"></h3>
        <div class="cp-grid" id="cpGrid"></div>
        <p class="cp-status" id="cpStatus"></p>
        <div class="cp-more" id="cpMoreWrap" hidden><button type="button" class="btn btn-ghost" id="cpMore">Load more characters</button></div>
        <div class="cp-alt"><button type="button" class="cp-link" id="cpMode">Browse show characters from TMDB</button></div>
      </main>
      <footer class="cp-foot"><button type="button" class="cp-skip" id="cpSkip">Skip</button></footer>`;
    document.body.appendChild(el);
    document.body.classList.add("cp-open");
    const $ = id => el.querySelector("#" + id);
    const q = $("cpQ"), chips = $("cpChips"), grid = $("cpGrid"), heading = $("cpHeading"), status = $("cpStatus"), moreWrap = $("cpMoreWrap"), more = $("cpMore"), modeBtn = $("cpMode");
    let mode = "fandom", active = null, cont = null, loading = false, seq = 0;

    const close = () => { el.remove(); document.body.classList.remove("cp-open"); removeEventListener("keydown", onKey, true); };
    const onKey = e => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
    addEventListener("keydown", onKey, true);
    $("cpSkip").onclick = close;

    const circle = (src, name, sub) => `<button type="button" class="cp-face" data-src="${esc(src)}" data-name="${esc(name)}" title="${esc(name)}${sub ? ` · ${esc(sub)}` : ""}">
      <span class="cp-ring"><img src="${esc(src)}" alt="" loading="lazy"></span><small>${esc(name)}</small></button>`;
    const renderChips = () => {
      const term = q.value.trim().toLowerCase();
      const list = AV_FRANCHISES.filter(f => !term || f.name.toLowerCase().includes(term));
      chips.innerHTML = list.map(f => `<button type="button" class="pill ${active?.name === f.name ? "on" : ""}" data-f="${esc(f.name)}">${esc(f.name)}</button>`).join("")
        || `<span class="cp-hint">No franchise matches — press Enter to search TMDB.</span>`;
    };
    async function loadFandom(f, append) {
      if (loading) return; loading = true; const my = ++seq;
      if (!append) { active = f; cont = null; grid.innerHTML = Array.from({ length: 12 }, () => `<span class="cp-face skel-face"><span class="cp-ring skel"></span></span>`).join(""); heading.textContent = f.name; renderChips(); }
      status.textContent = ""; moreWrap.hidden = true;
      try {
        const api = params => fetch(`https://${f.wiki}.fandom.com/api.php?${new URLSearchParams({ action: "query", prop: "pageimages", piprop: "thumbnail", pithumbsize: "400", format: "json", origin: "*", ...params })}`).then(r => r.json());
        const label = t => t.replace(/ \((Earth-\d+|.*?)\)$/, "");
        let pages = [];
        if (!append) f.catState = null;
        if (!append && f.chars) {
          // Main characters, in the order listed (follows wiki redirects).
          const d = await api({ titles: f.chars.join("|"), redirects: "1" });
          const alias = {}; [...(d.query?.normalized || []), ...(d.query?.redirects || [])].forEach(r => alias[r.from] = r.to);
          const byTitle = Object.fromEntries(Object.values(d.query?.pages || {}).map(x => [x.title, x]));
          const resolve = t => { let x = t; for (let i = 0; i < 3 && alias[x]; i++) x = alias[x]; return byTitle[x]; };
          pages = f.chars.map(resolve).filter(x => x?.thumbnail?.source);
          f.catState = null; // "Load more" will continue from the wiki's character categories
        } else {
          // More characters from the first category this wiki actually uses.
          const st = f.catState || (f.catState = { cats: ["Main Characters", "Main characters", "Characters", "Individuals", "Humans", "Males", "Females"], i: 0, cont: null });
          while (st.i < st.cats.length && !pages.length) {
            const d = await api({ generator: "categorymembers", gcmtitle: "Category:" + st.cats[st.i], gcmtype: "page", gcmlimit: "48", ...(st.cont || {}) });
            pages = Object.values(d.query?.pages || {}).filter(x => x.thumbnail?.source);
            st.cont = d.continue || null;
            if (!st.cont) { st.i++; st.cont = null; }
          }
          const shown = new Set([...grid.querySelectorAll(".cp-face[data-name]")].map(b => b.dataset.name));
          pages = pages.filter(x => !shown.has(label(x.title)));
        }
        if (my !== seq) return;
        const html = pages.map(x => circle(x.thumbnail.source, label(x.title))).join("");
        if (append) grid.insertAdjacentHTML("beforeend", html); else grid.innerHTML = html;
        if (!grid.children.length && !append) { loading = false; return loadFandom(f, true); } // no named list → go straight to categories
        if (!grid.children.length) status.textContent = `No portraits found for ${f.name}. Try another franchise or browse TMDB.`;
        const st = f.catState; moreWrap.hidden = !!st && st.i >= st.cats.length;
      } catch {
        if (my === seq) { if (!append) grid.innerHTML = ""; status.textContent = `Couldn't reach the ${f.name} character wiki right now. Try another franchise or browse TMDB.`; }
      } finally { loading = false; }
    }
    async function searchTmdb(term) {
      if (!LIVE) { status.textContent = "TMDB isn't connected — add a key in config.js."; return; }
      const my = ++seq; mode = "tmdb"; active = null; renderChips(); moreWrap.hidden = true;
      heading.textContent = `Shows & films matching “${term}”`; status.textContent = ""; grid.innerHTML = "";
      try {
        const res = (await tmdb("search/multi", { query: term })).results?.filter(r => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path).slice(0, 12) || [];
        if (my !== seq) return;
        grid.innerHTML = res.map(r => `<button type="button" class="cp-title" data-kind="${r.media_type}" data-id="${r.id}" data-name="${esc(r.title || r.name)}">
          <img src="${IMG}w185${esc(r.poster_path)}" alt="" loading="lazy"><small>${esc(r.title || r.name)}</small></button>`).join("");
        if (!res.length) status.textContent = "Nothing found on TMDB. Try another title.";
      } catch { if (my === seq) status.textContent = "TMDB search failed. Try again."; }
    }
    async function loadCredits(kind, id, name) {
      const my = ++seq; heading.textContent = name; grid.innerHTML = ""; status.textContent = "Loading characters…";
      try {
        const d = await tmdb(kind === "tv" ? `tv/${id}/aggregate_credits` : `movie/${id}/credits`);
        if (my !== seq) return;
        const cast = (d.cast || []).filter(c => c.profile_path).slice(0, 36);
        grid.innerHTML = cast.map(c => { const role = c.character || c.roles?.[0]?.character || ""; return circle(`${IMG}w342${c.profile_path}`, role || c.name, role ? c.name : ""); }).join("");
        status.textContent = cast.length ? "Character photos from TMDB (the actors who played them)." : "No character photos on TMDB for this title.";
      } catch { if (my === seq) status.textContent = "Couldn't load characters from TMDB."; }
    }
    chips.addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; mode = "fandom"; modeBtn.textContent = "Browse show characters from TMDB"; loadFandom(AV_FRANCHISES.find(f => f.name === b.dataset.f)); });
    grid.addEventListener("click", e => {
      const face = e.target.closest(".cp-face[data-src]");
      if (face) { onPick(face.dataset.src, face.dataset.name); close(); return; }
      const title = e.target.closest(".cp-title"); if (title) loadCredits(title.dataset.kind, title.dataset.id, title.dataset.name);
    });
    more.onclick = () => active && loadFandom(active, true);
    q.addEventListener("input", renderChips);
    q.addEventListener("keydown", e => {
      if (e.key !== "Enter") return; e.preventDefault();
      const term = q.value.trim(); if (!term) return;
      const exact = AV_FRANCHISES.find(f => f.name.toLowerCase() === term.toLowerCase());
      if (exact && mode !== "tmdb") loadFandom(exact); else searchTmdb(term);
    });
    modeBtn.onclick = () => {
      if (mode === "tmdb") { mode = "fandom"; modeBtn.textContent = "Browse show characters from TMDB"; q.value = ""; renderChips(); loadFandom(AV_FRANCHISES[0]); return; }
      mode = "tmdb"; modeBtn.textContent = "Back to franchise characters";
      q.placeholder = "Search a show or film on TMDB, then press Enter"; q.value = ""; q.focus();
      heading.textContent = "Characters from TMDB"; grid.innerHTML = ""; moreWrap.hidden = true; status.textContent = "Search for a show or film above to see its characters.";
    };
    renderChips(); loadFandom(AV_FRANCHISES[0]);
    setTimeout(() => q.focus({ preventScroll: true }), 50);
  }

  function profileModal(existing) {
    let color = existing ? existing.color : state.profiles.length % AV_COLORS.length;
    let photo = existing?.avatar || null;
    let emoji = existing?.avatarEmoji || null;
    const previewProfile = () => ({ name: existing?.name || "You", color, avatar: photo, avatarEmoji: emoji });
    const presetGrid = () => AV_PRESETS.map((em, i) => `<button type="button" class="av-choice ${!photo && emoji === em ? "on" : ""}" data-avatar-emoji="${em}"><span class="av-emoji" style="background:${AV_COLORS[i % AV_COLORS.length]}">${em}</span></button>`).join("");
    modal(`<div class="avatar-picker">
      <h2>${existing ? "Edit profile" : "Add a profile"}</h2>
      <p>${existing ? "Update the name, picture or colour." : "Each profile gets its own picture, list and picks."}</p>
      <div class="av-preview">${avatar(previewProfile())}<div><b id="avPreviewName">${esc(existing?.name || "New profile")}</b><small class="fine" style="display:block;margin:3px 0 0">Profile picture preview</small></div></div>
      <form id="pf">
        <div class="field"><label class="label" for="pname">Name</label><input class="input" id="pname" maxlength="16" value="${esc(existing?.name || "")}" required></div>
        <button type="button" class="av-browse" id="avatarBrowse"><span class="av-browse-faces" aria-hidden="true">🧙🦸🧝🤖</span><span><b>Choose a character avatar</b><small>Harry Potter, Star Wars, Marvel, anime and more — or any show on TMDB</small></span>${icons.right}</button>
        <div class="field"><span class="label">Or upload a photo</span><div class="av-tools">
          <label class="btn btn-ghost av-upload">${icons.share} Upload photo<input type="file" id="avatarFile" accept="image/png,image/jpeg,image/webp,image/gif"></label>
          <button type="button" class="btn btn-ghost" id="avatarRemove" ${photo || emoji ? "" : "disabled"}>Remove picture</button>
        </div></div>
        <div class="av-section-title">Or pick a classic</div><div class="av-grid">${presetGrid()}</div>
        <div class="field"><span class="label">Avatar colour</span><div class="swatches">${AV_COLORS.map((c, i) => `<button type="button" class="swatch ${i === color ? "on" : ""}" style="background:${c}" data-c="${i}" aria-label="Colour ${i + 1}"></button>`).join("")}</div></div>
        <div class="modal-actions">
          ${existing && state.profiles.length > 1 ? `<button type="button" class="btn btn-ghost" id="pdel" style="margin-right:auto;color:#ff9b8a">Delete</button>` : ""}
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-primary">${existing ? "Save" : "Add"}</button>
        </div>
      </form>
    </div>`, (el, close) => {
      const preview = el.querySelector(".av-preview");
      const refreshPreview = () => {
        preview.innerHTML = `${avatar(previewProfile())}<div><b id="avPreviewName">${esc(el.querySelector("#pname").value.trim() || "New profile")}</b><small class="fine" style="display:block;margin:3px 0 0">Profile picture preview</small></div>`;
        el.querySelectorAll("[data-avatar-emoji]").forEach(b => b.classList.toggle("on", b.dataset.avatarEmoji === emoji && !photo));
        el.querySelector("#avatarRemove").disabled = !photo && !emoji;
      };
      el.querySelector("#pname").addEventListener("input", refreshPreview);
      el.querySelectorAll("[data-c]").forEach(b => b.onclick = () => {
        color = +b.dataset.c; el.querySelectorAll("[data-c]").forEach(x => x.classList.toggle("on", x === b)); refreshPreview();
      });
      el.querySelectorAll("[data-avatar-emoji]").forEach(b => b.onclick = () => { photo = null; emoji = b.dataset.avatarEmoji; refreshPreview(); });
      el.querySelector("#avatarRemove").onclick = () => { photo = null; emoji = null; refreshPreview(); };
      el.querySelector("#avatarBrowse").onclick = () => openCharacterPicker((src, name) => { photo = src; emoji = null; refreshPreview(); toast(`${name || "Character"} selected`); });
      el.querySelector("#avatarFile").addEventListener("change", async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 8 * 1024 * 1024) { toast("Choose a PNG, JPG, WEBP or GIF under 8 MB"); e.target.value = ""; return; }
        try {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onerror = reject;
            reader.onload = () => {
              const img = new Image(); img.onerror = reject;
              img.onload = () => {
                const size = 256, canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
                const ctx = canvas.getContext("2d");
                const side = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
                ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
                resolve(canvas.toDataURL("image/jpeg", .78));
              }; img.src = reader.result;
            }; reader.readAsDataURL(file);
          });
          photo = data; emoji = null; refreshPreview();
        } catch { toast("Couldn't read that image"); }
      });
      el.querySelector("#pdel")?.addEventListener("click", () => {
        state.profiles = state.profiles.filter(p => p.id !== existing.id);
        const lists = store.get("lists", {}); delete lists[existing.id]; store.set("lists", lists);
        if (state.currentId === existing.id) state.currentId = null;
        close(); toast("Profile deleted"); render();
      });
      el.querySelector("#pf").onsubmit = e => {
        e.preventDefault(); const name = el.querySelector("#pname").value.trim(); if (!name) return;
        if (existing) state.profiles = state.profiles.map(p => p.id === existing.id ? { ...p, name, color, avatar: photo, avatarEmoji: emoji } : p);
        else state.profiles = [...state.profiles, { id: "p" + Date.now().toString(36), name, color, avatar: photo, avatarEmoji: emoji }];
        close(); toast(existing ? "Profile updated" : `${name} added`); render();
      };
    }, "avatar-modal");
  }

  function ensureGuestProfile() {
    let profiles = store.get("profiles", []);
    if (!Array.isArray(profiles) || !profiles.length) {
      const p = { id: "p" + Date.now().toString(36), name: "Guest", color: 0 };
      profiles = [p]; store.set("profiles", profiles); store.set("current", p.id);
    } else {
      const current = store.get("current", null);
      if (!profiles.some(p => p.id === current)) store.set("current", profiles[0].id);
    }
  }

  // ---------- router ----------
  const PUBLIC = [];
  let renderSeq = 0;
  let watchProgressCleanup = null;
  async function render() {
    if (watchProgressCleanup) { watchProgressCleanup(); watchProgressCleanup = null; }
    clearInterval(heroTimer); clearInterval(rotTimer); clipObserver?.disconnect(); lazyJobs.clear();
    const seq = ++renderSeq;
    document.documentElement.classList.toggle("perf", state.perf);
    const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
    const params = new URLSearchParams(qs || "");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const route = parts[0] || "";

    if (route === "welcome" || route === "signin") { location.replace("#/"); return; }

    const setTitle = s => document.title = s ? `${s} · Vespera` : "Vespera · Films & Series";
    if (route === "welcome") { $app.innerHTML = pageWelcome(); setTitle(); return mountPage(route, params); }
    if (route === "signin") { $app.innerHTML = pageSignin(params); setTitle("Sign in"); return mountPage(route, params); }
    if (route === "who") { $app.innerHTML = pageWho(parts[1] === "manage"); setTitle("Profiles"); return; }

    if (LIVE) { try { await ensureGenres(); } catch { toast(SERVER ? "Couldn't reach the catalog — is the server running?" : "Couldn't reach TMDB — check config.js"); } }
    if (seq !== renderSeq) return;

    let inner, title = "";
    switch (route) {
      case "": inner = pageHome(); break;
      case "movies": case "series": case "anime": inner = pageSection(route, params); title = BROWSE[route].h; break;
      case "constellations": inner = parts[1] ? pageCollection(parts[1]) : pageCollections(); title = "Constellations"; break;
      case "clips": inner = pageClips(); title = "Clips"; break;
      case "pairings": inner = pagePairings(); title = "Pairings"; break;
      case "list": inner = pageList(params); title = "My List"; break;
      case "search": inner = pageSearch(params); title = "Search"; break;
      case "account": inner = pageAccount(); title = "Account"; break;
      case "title": inner = pageTitle(parts[1]); break;
      case "watch": inner = pageWatch(parts[1], params); title = "Watch"; break;
      case "person": inner = pagePerson(parts[1], params); title = "People"; break;
      case "genre": inner = pageGenre(parts[1] || ""); title = parts[1]; break;
      case "network": inner = pageNetwork(parts[1] || ""); title = "Network"; break;
      default: inner = notFound();
    }
    const isAsync = inner instanceof Promise;
    const keepScroll = route === "list" && render.keepScroll; render.keepScroll = false; const y = scrollY;
    $app.innerHTML = shell(route, isAsync ? `<div class="page"><div class="loading-spot skel"></div></div>` : inner);
    setTitle(title);
    window.scrollTo({ top: keepScroll ? y : 0, behavior: "instant" });
    if (isAsync) {
      let html; try { html = await inner; } catch { html = `<div class="page">${failBox()}</div>`; }
      if (seq !== renderSeq) return;
      document.getElementById("main").innerHTML = html;
      if (route === "title") { const t = items.get(parts[1]); if (t) setTitle(t.title); }
      if (route === "person") { const h = document.querySelector(".person-head h1"); if (h) setTitle(h.textContent); }
    }
    mountPage(route, params, parts);
  }

  function mountPage(route, params, parts = []) {
    if (route === "watch") watchProgressCleanup = mountWatchProgress(parts[1], params);
    if (route === "") {
      mountHero(() => data.row((LIVE ? window.VESPERA_TMDB_ROWS : window.VESPERA_ROWS)[0]), "Tonight's pick");
      liveColls(document.getElementById("homeColls"));
    }
    if (["movies", "series", "anime"].includes(route)) {
      if (document.getElementById("grid")) loadBrowse(false);
      else { const s = data.section(route); mountHero(() => data.load(s.hero), BROWSE[route].hero); }
    }
    if (route === "constellations") {
      if (parts[1]) liveColls(document.getElementById("collPage"));
      else {
        mountHero(constellationHeroItems, "Across every universe");
        const q = document.getElementById("constellationSearch");
        if (q) q.addEventListener("input", () => {
          const term = q.value.trim().toLowerCase();
          document.querySelectorAll("#constellationShelves .section").forEach(section => {
            section.hidden = !!term && !section.querySelector(".section-head h2")?.textContent.toLowerCase().includes(term);
          });
        });
      }
    }
    if (route === "clips") mountClips();
    if (route === "title") {
      const t = items.get(parts[1]);
      const sel = document.getElementById("seasonSel");
      if (t && sel) { sel.onchange = () => loadSeason(t, sel.value); loadSeason(t, sel.value); }
      if (t?.trailer) setTimeout(() => { const bg = document.getElementById("detailBg"); if (bg && location.hash.includes(t.key)) mountBgVideo(bg, t.trailer, document.getElementById("detailMute")); }, 1800);
    }
    if (route === "list") {
      const q = document.getElementById("listQ");
      if (q) q.oninput = () => { const s = q.value.trim().toLowerCase(); let n = 0;
        document.querySelectorAll("#listGrid .card").forEach(c => { const on = !s || c.dataset.title.includes(s); c.hidden = !on; n += on; });
        document.getElementById("listEmpty").hidden = n > 0; };
    }
    if (route === "search") {
      const rot = document.getElementById("rot"); let ri = 0;
      if (!state.perf) rotTimer = setInterval(() => { if (!document.body.contains(rot)) return clearInterval(rotTimer);
        rot.classList.add("out"); setTimeout(() => { ri = (ri + 1) % ROT_WORDS.length; rot.textContent = ROT_WORDS[ri]; rot.classList.remove("out"); }, 280); }, 2600);
      const q = document.getElementById("q");
      q.focus(); q.setSelectionRange(q.value.length, q.value.length);
      q.addEventListener("input", () => {
        const p = new URLSearchParams(location.hash.split("?")[1] || "");
        q.value ? p.set("q", q.value) : p.delete("q");
        history.replaceState(null, "", "#/search" + (p.toString() ? "?" + p : ""));
        clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, LIVE ? 300 : 0);
      });
      runSearch();
    }
    if (route === "account") {
      const r = document.getElementById("regionSel");
      if (r) r.onchange = () => { store.set("region", r.value); toast(`Region set to ${r.options[r.selectedIndex].text}`); };
    }
    const ef = document.getElementById("emailForm");
    if (ef) ef.onsubmit = async e => {
      e.preventDefault(); const v = document.getElementById("email").value.trim(); const err = document.getElementById("err");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { err.textContent = SIGNIN_ERRORS.bad_email; return; }
      if (!SERVER) { location.hash = `#/signin?step=code&email=${encodeURIComponent(v)}`; return; }
      const btn = document.getElementById("sendBtn"); btn.disabled = true; btn.textContent = "Sending…"; err.textContent = "";
      try {
        const r = await api("auth/start", "POST", { email: v });
        location.hash = `#/signin?step=code&email=${encodeURIComponent(v)}${r.dev ? "&dev=1" : ""}`;
      } catch (x) { err.textContent = SIGNIN_ERRORS[x.code] || "Couldn't send a code. Try again."; btn.disabled = false; btn.textContent = "Send sign-in code"; }
    };
    const cf = document.getElementById("codeForm");
    if (cf) {
      const code = document.getElementById("code"), btn = document.getElementById("codeBtn"), err = document.getElementById("err");
      code.addEventListener("input", () => { code.value = code.value.replace(/\D/g, ""); btn.disabled = code.value.length !== 6; err.textContent = ""; });
      code.focus();
      cf.onsubmit = async e => {
        e.preventDefault(); if (code.value.length !== 6) return;
        const email = new URLSearchParams(location.hash.split("?")[1]).get("email");
        if (!SERVER) return signIn(email); // local preview: no real verification
        btn.disabled = true; btn.textContent = "Checking…";
        try { hydrate(await api("auth/verify", "POST", { email, code: code.value })); await signIn(email); }
        catch (x) {
          err.textContent = (SIGNIN_ERRORS[x.code] || "Couldn't sign you in. Try again.") + (x.code === "wrong_code" && x.data?.left >= 0 ? ` ${x.data.left} tries left.` : "");
          btn.textContent = "Continue"; btn.disabled = false; code.select();
        }
      };
    }
    const lang = document.getElementById("lang");
    if (lang) lang.onchange = () => { store.set("lang", lang.value); toast(`Language set to ${lang.value}`); };
    mountLazy();
  }

  // ---------- global events ----------
  function closeMenus() {
    document.getElementById("pmenu")?.classList.remove("open");
    document.getElementById("avatarBtn")?.setAttribute("aria-expanded", "false");
    document.getElementById("nav")?.classList.remove("open");
  }
  function refreshSaved(key) {
    document.querySelectorAll(`.card[data-key="${CSS.escape(key)}"]`).forEach(c => { const it = items.get(key); if (it) c.outerHTML = card(it); });
    document.querySelectorAll(`button[data-save="${CSS.escape(key)}"]:not(.icon-btn)`).forEach(b => {
      const on = state.isSaved(key);
      b.innerHTML = b.classList.contains("btn-primary") ? (on ? icons.check + " On My List" : icons.plus + " Add to My List") : (on ? icons.check + " On My List" : icons.plus + " My List");
    });
  }
  const setParam = (k, v) => {
    const p = new URLSearchParams(location.hash.split("?")[1] || "");
    v ? p.set(k, v) : p.delete(k);
    const q = document.getElementById("q"); if (q?.value) p.set("q", q.value);
    location.hash = location.hash.split("?")[0] + (p.toString() ? "?" + p : "");
  };

  function mountWatchProgress(key, params) {
    const page = document.getElementById("watchPage");
    if (!page) return null;
    const type = page.dataset.watchType, id = page.dataset.watchId;
    const season = page.dataset.watchSeason, episode = page.dataset.watchEpisode;
    const t = items.get(key) || {};
    const watchedItem = {
      key, id: String(id), type, title: t.title || "Untitled", name: t.title || "Untitled",
      poster: t.poster || null, backdrop: t.backdrop || null,
      timestamp: 0, duration: 0, progress: 0,
      ...(type === "tv" ? { season: Number(season) || 1, episode: Number(episode) || 1 } : {})
    };
    const handlePlayerMessage = event => {
      let message = event.data;
      if (typeof message === "string") { try { message = JSON.parse(message); } catch { return; } }
      if (!message || typeof message !== "object") return;
      if (message.type && message.type !== "PLAYER_EVENT") return;
      let data = message.data ?? message;
      if (typeof data === "string") { try { data = JSON.parse(data); } catch { return; } }
      if (!data || typeof data !== "object") return;
      const timestamp = Number(data.player_progress ?? data.timestamp ?? data.currentTime ?? data.position ?? data.seconds ?? data.time);
      const duration = Number(data.player_duration ?? data.duration ?? data.totalDuration);
      if (!Number.isFinite(timestamp) || !Number.isFinite(duration) || duration <= 0 || timestamp < 0) return;
      const fraction = Math.min(1, Math.max(0, timestamp / duration));
      const item = { ...watchedItem, timestamp, duration, progress: fraction };
      if (fraction >= .95) { removeWatchProgress(item); return; }
      if (timestamp < WATCH_PROGRESS_MIN_SECONDS) return;
      saveWatchProgress(item);
    };
    window.addEventListener("message", handlePlayerMessage);
    return () => window.removeEventListener("message", handlePlayerMessage);
  }

  function refreshContinueWatching() {
    const mount = document.getElementById("continueWatchingMount");
    if (!mount) return;
    const wasManaging = Boolean(mount.querySelector("#continueWatching.cw-managing"));
    mount.innerHTML = continueWatchingSection();
    if (wasManaging) {
      const section = mount.querySelector("#continueWatching");
      const button = section?.querySelector("[data-action=continue-manage]");
      const clear = section?.querySelector("[data-action=continue-clear]");
      section?.classList.add("cw-managing");
      button?.setAttribute("aria-pressed", "true");
      if (button) button.textContent = "Done";
      if (clear) clear.hidden = false;
    }
  }
  window.addEventListener("vespera-watch-progress", refreshContinueWatching);
  window.addEventListener("storage", e => { if (e.key === WATCH_PROGRESS_KEY) refreshContinueWatching(); });

  document.addEventListener("click", e => {
    const t = e.target;
    const moreInfo = t.closest("[data-preview-more]");
    if (moreInfo) { e.preventDefault(); moreInfo.closest(".modal-back")?.remove(); location.hash = moreInfo.getAttribute("href"); return; }
    const preview = t.closest("[data-preview]");
    if (preview && !t.closest("[data-save], [data-action], [data-preview-more]")) { e.preventDefault(); e.stopPropagation(); preview.closest(".modal-back")?.remove(); openTitlePreview(preview.dataset.preview); return; }
    const save = t.closest("[data-save]");
    if (save) {
      e.preventDefault(); e.stopPropagation();
      const it = items.get(save.dataset.save); if (!it) return;
      const added = state.toggleSave(it);
      toast(added ? `Added “${it.title}” to My List` : "Removed from My List");
      if (location.hash.startsWith("#/list")) { render.keepScroll = true; render(); } else refreshSaved(it.key);
      if (!document.getElementById("aiPanel")?.hidden) aiRender();
      return;
    }
    const ask = t.closest("[data-ai-ask]");
    if (ask) { aiSend(ask.dataset.aiAsk); return; }
    if (t.closest("#avatarBtn")) {
      const m = document.getElementById("pmenu"); const open = !m.classList.contains("open");
      closeMenus(); m.classList.toggle("open", open); t.closest("#avatarBtn").setAttribute("aria-expanded", open); return;
    }
    if (t.closest("#menuToggle")) { const n = document.getElementById("nav"); n.classList.toggle("open"); t.closest("#menuToggle").setAttribute("aria-expanded", n.classList.contains("open")); return; }
    if (!t.closest("#pmenu")) closeMenus();

    const sw = t.closest("[data-switch]");
    if (sw) { state.currentId = sw.dataset.switch; toast(`Switched to ${state.current.name}`); render(); return; }
    const pick = t.closest("[data-pick]");
    if (pick) { state.currentId = pick.dataset.pick; location.hash = "#/"; return; }
    const edit = t.closest("[data-edit]");
    if (edit) { profileModal(state.profiles.find(p => p.id === edit.dataset.edit)); return; }

    const scr = t.closest("[data-scroll]");
    if (scr) { const r = scr.parentElement.querySelector(".row"); r.scrollBy({ left: +scr.dataset.scroll * r.clientWidth * .85, behavior: "smooth" }); return; }

    const ty = t.closest("[data-type]");
    if (ty) {
      // Search tabs switch in place: update the address, the active tab and the results without reloading the page.
      if (document.getElementById("q") && location.hash.startsWith("#/search")) {
        const p = new URLSearchParams(location.hash.split("?")[1] || "");
        ty.dataset.type ? p.set("type", ty.dataset.type) : p.delete("type");
        const q = document.getElementById("q").value.trim(); q ? p.set("q", q) : p.delete("q");
        history.replaceState(null, "", "#/search" + (p.toString() ? "?" + p : ""));
        document.querySelectorAll(".tabs .tab").forEach(b => { const on = b === ty; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
        runSearch();
      } else setParam("type", ty.dataset.type);
      return;
    }

    const act = t.closest("[data-action]");
    if (act) {
      const a = act.dataset.action;
      if (a !== "jump") e.preventDefault();
      if (a === "assistant") openAssistant();
      if (a === "ai-close") closeAssistant();
      if (a === "ai-clear") { aiMsgs = []; saveAi(); aiRender(); }
      if (a === "ask-ai") { const q = document.getElementById("q")?.value.trim(); openAssistant(q || ""); }
      if (a === "add-profile") { closeMenus(); profileModal(null); }
      if (a === "perf") { state.perf = !state.perf; document.documentElement.classList.toggle("perf", state.perf);
        act.querySelector(".switch").classList.toggle("on", state.perf); act.setAttribute("aria-checked", state.perf);
        if (state.perf) { clearInterval(heroTimer); document.querySelectorAll(".bg-video").forEach(v => v.remove()); }
        toast(state.perf ? "Performance mode on — motion reduced" : "Performance mode off"); }
      if (a === "autoplay") { state.autoplay = !state.autoplay; act.querySelector(".switch").classList.toggle("on", state.autoplay); act.setAttribute("aria-checked", state.autoplay);
        toast(state.autoplay ? "Trailers will autoplay (muted)" : "Trailer autoplay off"); }
      if (a === "backup-export") exportVesperaBackup();
      if (a === "backup-import") document.getElementById("backupFile")?.click();
      if (a === "clear-list") modal(`<h2>Clear ${esc(state.current?.name)}'s list?</h2><p>This removes every saved title from this profile. It can't be undone.</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="confirmClear">Clear list</button></div>`,
        (el, close) => el.querySelector("#confirmClear").onclick = () => { state.clearList(); close(); toast("List cleared"); });
      if (a === "surprise") data.random().then(r => { if (r) location.hash = `#/title/${r.key}`; }).catch(() => toast("Couldn't pick one — try again"));
      if (a === "play-title") { location.hash = act.getAttribute("href") || `#/watch/${act.dataset.key || ""}`; }
      if (a === "continue-manage") {
        const section = document.getElementById("continueWatching");
        if (section) {
          const managing = !section.classList.contains("cw-managing");
          section.classList.toggle("cw-managing", managing);
          act.setAttribute("aria-pressed", String(managing));
          act.textContent = managing ? "Done" : "Manage";
          const clear = section.querySelector(".cw-clear"); if (clear) clear.hidden = !managing;
        }
      }
      if (a === "continue-remove") {
        const item = readWatchProgress().find(x => progressKey(x) === act.dataset.progressKey);
        if (item) removeWatchProgress(item);
      }
      if (a === "continue-clear") {
        try { localStorage.removeItem(WATCH_PROGRESS_KEY); } catch {}
        window.dispatchEvent(new Event("vespera-watch-progress"));
      }
      if (a === "watch-resume-server" || a === "watch-server") {
        const frame = document.getElementById("watchFrame");
        if (frame && act.dataset.url) frame.src = act.dataset.url;
        const fullscreenButton = document.querySelector(".watch-fullscreen");
        const resumeProvider = document.querySelector(`.watch-server[data-provider="${CSS.escape(act.dataset.provider || "")}"]`);
        const providerName = act.dataset.providerName || resumeProvider?.dataset.providerName || "";
        if (fullscreenButton) fullscreenButton.hidden = !isFrameXTVProvider(act.dataset.provider, providerName);
        document.querySelectorAll(".watch-server").forEach(b => {
          const selected = b.dataset.provider === act.dataset.provider;
          b.classList.toggle("btn-primary", selected); b.classList.toggle("btn-ghost", !selected);
          b.setAttribute("aria-pressed", String(selected));
        });
      }
      if (a === "watch-start-over") {
        const frame = document.getElementById("watchFrame");
        const server = document.querySelector('.watch-server[aria-pressed="true"]');
        const url = server?.dataset.startUrl || act.dataset.url;
        if (frame && url) frame.src = url;
        document.getElementById("watchResume")?.remove();
      }
      if (a === "watch-fullscreen") {
        const player = document.getElementById("watchPlayer");
        const request = player?.requestFullscreen || player?.webkitRequestFullscreen;
        if (document.fullscreenElement) {
          (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
        } else if (request) {
          try { const result = request.call(player); result?.catch?.(() => {}); }
          catch (err) { console.warn("Fullscreen is unavailable in this browser", err); }
        } else toast("Use the player’s own fullscreen control on this browser");
      }
      if (a === "back") { history.length > 1 ? history.back() : (location.hash = "#/"); }
      if (a === "more" && browseState) { browseState.page++; loadBrowse(true); }
      if (a === "search-more") searchMore(act);
      if (a === "person-more" && personState) {
        const next = personState.list.slice(personState.shown, personState.shown + 40); personState.shown += next.length;
        document.getElementById("personGrid")?.insertAdjacentHTML("beforeend", next.map(card).join(""));
        const left = personState.list.length - personState.shown; act.hidden = left <= 0; act.textContent = `Load more · ${left} left`;
      }
      if (a === "expand-bio") { const p = act.previousElementSibling; p.classList.toggle("clamp"); act.textContent = p.classList.contains("clamp") ? "Read more" : "Show less"; }
      if (a === "expand-syn") { const p = act.parentElement.querySelector(".m-syn"); p.classList.toggle("clamp"); act.textContent = p.classList.contains("clamp") ? "Read more" : "Show less"; }
      if (a === "toggle-filters") { const p = document.getElementById("filtersPanel"); p.hidden = !p.hidden; act.setAttribute("aria-expanded", !p.hidden); }
      if (a === "clear-filters") { const p = new URLSearchParams(location.hash.split("?")[1] || ""); ["genre", "year", "rating", "sort"].forEach(k => p.delete(k));
        location.hash = "#/search" + (p.toString() ? "?" + p : ""); }
      if (a === "clip-prev") clipStep(-1);
      if (a === "clip-next") clipStep(1);
      if (a === "expand") { const p = act.previousElementSibling; p.classList.toggle("clamp"); act.textContent = p.classList.contains("clamp") ? "Read more" : "Show less"; }
      if (a === "jump") { e.preventDefault(); document.getElementById("providers")?.scrollIntoView({ behavior: "smooth" }); }
      if (a === "episode-ratings") {
        detail(act.dataset.key).then(title => { if (title?.tmdbId) openEpisodeRatings(title); }).catch(() => toast("Couldn't load series details"));
      }
      if (a === "privacy") modal(`<h2>Privacy</h2><p>Vespera stores your profiles, lists and settings in this browser. Use Settings → Export backup to move them to another device. Title data and images come from TMDB${FEAT.omdb ? " and OMDb" : ""}; trailers are embedded from YouTube.</p><div class="modal-actions"><button class="btn btn-primary" data-close>Got it</button></div>`);
      if (a === "trailer") { document.querySelectorAll(".bg-video iframe").forEach(f => ytCmd(f, "pauseVideo"));
        modal(`<div class="video"><iframe src="${ytSrc(act.dataset.yt).replace("mute=1", "mute=0")}" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`, null, "modal-video"); }
      if (a === "download") { const it = items.get(act.dataset.id); if (it) detail(it.key).then(full => openDownloadModal(full || it)).catch(() => openDownloadModal(it)); }
      if (a === "share") { const url = location.href.split("#")[0] + "#/title/" + act.dataset.id;
        (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast("Link copied"), () => toast(url)); }
      return;
    }

    const go = t.closest("[data-go]");
    if (go) { location.hash = go.dataset.go; if (go.closest("#aiPanel") && innerWidth < 900) closeAssistant(); }
  });

  document.addEventListener("change", e => {
    if (e.target?.id === "backupFile") { const file = e.target.files?.[0]; if (file) importVesperaBackup(file); e.target.value = ""; return; }
    const s = e.target.closest("[data-param]"); if (!s) return;
    setParam(s.dataset.param, s.value);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeMenus(); if (!document.querySelector(".modal-back")) closeAssistant(); }
    if (e.key === "Enter" && e.target.matches("[data-preview]")) openTitlePreview(e.target.dataset.preview);
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "/" && state.current) { e.preventDefault(); location.hash = "#/search"; }
    if (document.getElementById("clips") && ["ArrowDown", "ArrowUp", "j", "k"].includes(e.key)) { e.preventDefault(); clipStep(e.key === "ArrowDown" || e.key === "j" ? 1 : -1); }
  });
  addEventListener("scroll", () => document.getElementById("topbar")?.classList.toggle("scrolled", scrollY > 10), { passive: true });
  addEventListener("hashchange", render);

  async function boot() {
    // If this browser had an older signed-in Vespera session, pull its latest
    // data once before switching to guest mode so existing records are retained.
    if (SERVER && store.get("auth", null)) { try { hydrate(await api("me")); } catch {} }
    try { localStorage.removeItem("vespera.auth"); } catch {}
    ensureGuestProfile();
    if (SERVER) { try { FEAT = { ...FEAT, ...(await api("features")) }; } catch {} }
    render();
  }
  boot();
})();
