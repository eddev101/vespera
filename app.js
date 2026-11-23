/* Vespera — single-page front end with movie and TV playback.
   Data: live from TMDB (+ optional OMDb) when keys are set in config.js,
   otherwise the built-in sample catalog in data.js.
   Hash routes:
     #/welcome  #/signin  #/who  #/who/manage  #/account
     #/  #/movies  #/series  #/anime   (add ?view=all for the full filterable grid)
     #/constellations  #/constellations/:id  #/clips  #/pairings  #/list
     #/search?q=&type=&genre=&year=&rating=&sort=
     #/title/:key  #/watch/:key  #/network/:id  #/genre/:name
   Auth here is front-end only (localStorage) so the UI can be built and
   reviewed before a real backend is wired in. */
(() => {
  "use strict";

  const CFG = window.VESPERA_CONFIG || {};
  // SERVER: served by server.js (keys stay server-side, real sign-in, synced data).
  // Otherwise "static" mode (e.g. GitHub Pages): browser calls TMDB directly with the key in config.js,
  // profiles and lists live in this browser. config.server "auto" detects which one at startup.
  let SERVER = CFG.server === true;
  let LIVE = SERVER || !!(CFG.tmdbKey && CFG.tmdbKey.trim());
  async function detectMode() {
    if (CFG.server !== "auto") return;
    try {
      const r = await fetch("/api/features", { headers: { accept: "application/json" } });
      SERVER = r.ok && (r.headers.get("content-type") || "").includes("json");
    } catch { SERVER = false; }
    LIVE = SERVER || !!(CFG.tmdbKey && CFG.tmdbKey.trim());
  }
  let FEAT = { omdb: !!(CFG.omdbKey && CFG.omdbKey.trim()), google: false, mail: false };
  const TITLES = window.VESPERA_TITLES;
  const COLLS = window.VESPERA_COLLECTIONS;
  const SECTIONS = window.VESPERA_SECTIONS;
  const byId = Object.fromEntries(TITLES.map(t => [t.id, t]));
  const $app = document.getElementById("app");
  const IMG = "https://image.tmdb.org/t/p/";
  const PLAYBACK_API = (CFG.playbackApi || "https://flixstar-api.onrender.com/api").replace(/\/$/, "");
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
  function queueSync(k) {
    if (!SERVER || hydrating || !SYNC_KEYS.includes(k)) return;
    clearTimeout(syncTimer); syncTimer = setTimeout(pushData, 600);
  }
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
      vote: r.vote_average ?? prev.vote, votes: r.vote_count ?? prev.votes });
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
    it.castFull = (d.credits?.cast || []).slice(0, 14).map(c => ({ name: c.name, role: c.character, photo: c.profile_path ? IMG + "w185" + c.profile_path : null }));
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
    async search({ q, type, genre, year, rating, sort }) {
      let out;
      if (!LIVE) {
        const s = (q || "").toLowerCase();
        out = TITLES.filter(t => (!type || t.type === type) && (!s || [t.title, t.by, t.network, ...t.genres, ...t.cast, String(t.year)].join(" ").toLowerCase().includes(s))).map(t => items.get(t.id));
      } else if (q) {
        const yr = year ? +year : undefined;
        const calls = type === "movie" ? [tmdb("search/movie", { query: q, primary_release_year: yr }).then(j => listOf(j, "movie"))]
          : type === "tv" || type === "anime" ? [tmdb("search/tv", { query: q, first_air_date_year: yr }).then(j => listOf(j, "tv"))]
          : [tmdb("search/multi", { query: q }).then(async j => {
              const l = listOf(j);
              // If a well-known person matches, lead with their best-known work.
              const p = (j.results || []).filter(r => r.media_type === "person").sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
              if (p && (p.popularity || 0) > 3) {
                try {
                  const c = await tmdb(`person/${p.id}/combined_credits`);
                  const credits = [...(c.cast || []), ...(c.crew || []).filter(x => ["Director", "Creator", "Writer", "Screenplay"].includes(x.job))]
                    .filter(x => (x.vote_count || 0) > 50).sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
                  const top = uniq(credits.map(x => fromTmdb(x)).filter(Boolean)).slice(0, 16);
                  return [...top, ...l];
                } catch {}
              }
              return l;
            }), tmdb("search/multi", { query: q, page: 2 }).then(j => listOf(j)).catch(() => [])];
        out = uniq((await Promise.all(calls)).flat());
        if (type) out = out.filter(it => it.type === type);
      } else {
        // filters only → discover
        const kinds = type === "movie" ? ["movie"] : type === "tv" || type === "anime" ? ["tv"] : ["movie", "tv"];
        const lists = await Promise.all(kinds.map(k => {
          const p = { ...discoverSort(k, sort || "popular"), "vote_count.gte": 100 };
          const ids = genre ? genreIds(k, genre) : [];
          if (genre && !ids.length) return [];
          if (ids.length) p.with_genres = ids.join("|");
          if (type === "anime") { p.with_genres = ["16", ...ids].join(","); p.with_original_language = "ja"; }
          if (year) p[k === "movie" ? "primary_release_year" : "first_air_date_year"] = year;
          if (rating) p["vote_average.gte"] = rating;
          return tmdb(`discover/${k}`, p).then(j => listOf(j, k));
        }));
        out = []; for (let i = 0; i < 20; i++) lists.forEach(l => l[i] && out.push(l[i]));
      }
      if (genre) out = out.filter(it => (it.genres || []).includes(genre));
      if (year) out = out.filter(it => String(it.year) === String(year));
      if (rating && LIVE) out = out.filter(it => (it.vote || 0) >= +rating);
      return sort ? sortItems(out, sort) : out;
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
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    google: '<svg class="g-icon" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
  };

  const avatar = (p, cls = "") => p ? `<span class="avatar ${cls}" style="background:${AV_COLORS[p.color % AV_COLORS.length]}" aria-hidden="true">${esc((p.name || "?")[0].toUpperCase())}</span>` : "";
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
    return `<div class="card" role="link" tabindex="0" data-go="#/title/${esc(t.key)}" data-key="${esc(t.key)}" data-title="${esc((t.title || "").toLowerCase())}" aria-label="${esc(t.title)}">
      ${posterHTML(t)}
      ${badge(t)}
      ${saved ? `<span class="saved-mark" title="On My List">${icons.check}</span>` : ""}
      <div class="card-hover">
        <b>${esc(t.title)}</b>
        <div class="meta">${t.year ? `<span>${t.year}</span><span class="dot"></span>` : ""}<span>${esc((t.genres || []).slice(0, 2).join(", ") || typeLabel(t))}</span>${t.vote ? `<span class="dot"></span><span>★ ${t.vote.toFixed(1)}</span>` : ""}</div>
        <div class="row-btns">
          <span class="btn btn-light">${icons.info} Details</span>
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
            <div class="hero-actions"><a class="btn btn-light" href="#/title/${esc(t.key)}">${icons.info} Details</a>
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
      <a class="brand" href="#/" aria-label="Vespera home"><img src="star.svg" alt=""><span>Vespera</span></a>
      <nav class="nav" id="nav" aria-label="Main">
        ${NAV.map(([h, l]) => `<a href="${h}" class="${active(h)}">${l}</a>`).join("")}
        <a href="#/search" class="nav-search ${active("#/search")}" aria-label="Search">${icons.search}</a>
      </nav>
      <div class="top-right">
        <button class="avatar" id="avatarBtn" aria-haspopup="menu" aria-expanded="false" aria-label="Profile menu"
          style="background:${AV_COLORS[(p?.color || 0) % AV_COLORS.length]}">${esc((p?.name || "?")[0].toUpperCase())}</button>
        <div class="pmenu" id="pmenu" role="menu">
          <div class="pmenu-current">${avatar(p)}<div><b>${esc(p?.name)}</b><small>Browsing now</small></div></div>
          <div class="pmenu-profiles">
            ${others.map(o => `<button data-switch="${o.id}" title="Switch to ${esc(o.name)}">${avatar(o)}<span>${esc(o.name)}</span></button>`).join("")}
            ${state.profiles.length < 5 ? `<button data-action="add-profile"><span class="add-av">+</span><span>Add</span></button>` : ""}
          </div>
          <hr>
          <a class="pmenu-item" href="#/account" role="menuitem">${icons.user} Account</a>
          <a class="pmenu-item" href="#/who/manage" role="menuitem">${icons.users} Manage profiles</a>
          <button class="pmenu-item" data-action="perf" role="menuitemcheckbox" aria-checked="${state.perf}">${icons.gauge} Performance mode <span class="switch ${state.perf ? "on" : ""}"></span></button>
          <hr>
          <button class="pmenu-item pmenu-signout" data-action="signout" role="menuitem">${icons.out} Sign out</button>
        </div>
      </div>
    </header>
    <main id="main" class="route-${route || "home"}">${inner}</main>
    ${route === "clips" ? "" : `<footer>
      <a class="brand" href="#/"><img src="star.svg" alt="" style="width:16px;height:16px"><span style="font-size:18px">Vespera</span></a>
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
          <a class="btn btn-light" href="#/title/${esc(t.key)}">${icons.info} More details</a>
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
  const sortsFor = () => LIVE ? { popular: "Popular", top: "Top rated", new: "Newest", old: "Oldest", az: "A–Z" } : { popular: "Featured", new: "Newest", old: "Oldest", az: "A–Z" };

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
    const SORTS = sortsFor();
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

  function pageCollections() {
    const fr = LIVE ? window.VESPERA_FRANCHISES.map(n => asyncRow(n, null, async () => (await data.franchise(n)).list)) : [];
    return `<div class="page" id="collPage"><div class="page-head"><div><h1>Constellations</h1><p>Hand-picked universes — by maker, place or idea${LIVE ? ", plus every major franchise in order" : ""}.</p></div></div>
      <div class="coll-grid">${COLLS.map(c => collCard(c)).join("")}</div></div>
      ${fr.length ? `<div class="section-intro" style="margin-top:46px"><div><h1 style="font-size:clamp(26px,3.4vw,38px)">Franchises</h1><p>Every film in release order.</p></div></div>${fr.join("")}` : ""}`;
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
        <a class="spot" href="#/title/${esc(b.key)}">
          <div class="spot-art">${wideHTML(b)}<span>${esc(b.title)}</span></div>
          <div class="spot-body"><small>If you loved ${esc(a.title)}</small>
          <p>${esc(b.synopsis)}</p>
          <div class="meta" style="margin-top:12px;color:var(--muted)"><span>${esc(typeLabel(b))}</span>${b.year ? `<span class="dot"></span><span>${b.year}</span>` : ""}${(b.genres || []).length ? `<span class="dot"></span><span>${esc(b.genres.slice(0, 2).join(" + "))}</span>` : ""}</div></div>
        </a>`).join("")}</div></div>`;
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
            <a class="btn btn-light" href="#/title/${esc(t.key)}">${icons.info} More info</a>
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
    if (!f.q && !anyFilter) {
      lazyJobs.clear();
      if (LIVE) {
        const rows = [["Trending Today", { path: "trending/all/day" }], ["Popular Films", { path: "movie/popular", kind: "movie" }], ["Popular Series", { path: "tv/popular", kind: "tv" }],
          ["Airing This Week", { path: "tv/on_the_air", kind: "tv" }], ["Coming Soon", { path: "movie/upcoming", kind: "movie" }], ["Top Rated Films", { path: "movie/top_rated", kind: "movie" }], ["Top Rated Series", { path: "tv/top_rated", kind: "tv" }]]
          .filter(([, r]) => !f.type || f.type === (r.kind || f.type));
        res.innerHTML = `<h2 class="sub-h">Browse genres</h2><div class="filters">${allGenreNames().map(g => `<a class="pill pill-link" href="#/genre/${slug(g)}">${esc(g)}</a>`).join("")}</div>
          <div class="bleed">${rows.map(([l, r]) => asyncRow(l, null, () => data.row(r))).join("")}</div>`;
      } else {
        res.innerHTML = `<h2 class="sub-h">Browse genres</h2><div class="filters">${allGenreNames().map(g => `<a class="pill pill-link" href="#/genre/${slug(g)}">${esc(g)}</a>`).join("")}</div>
          <div class="bleed">${row("Popular on Vespera", window.VESPERA_ROWS[1].pick.map(id => items.get(id)))}</div>`;
      }
      mountLazy(); return;
    }
    res.innerHTML = `<div class="grid">${Array.from({ length: 6 }, () => `<div class="card skel"></div>`).join("")}</div>`;
    try {
      const hits = await data.search(f); if (seq !== searchSeq) return;
      res.innerHTML = hits.length
        ? `<p style="color:var(--muted);margin:0 0 16px">${hits.length} result${hits.length > 1 ? "s" : ""}</p><div class="grid">${hits.map(card).join("")}</div>`
        : empty(f.q ? `Nothing for “${esc(f.q)}”` : "No matches", "Check the spelling, loosen a filter, or try a person or year.",
          FEAT.assistant && f.q ? `<button class="btn btn-primary" data-action="ask-ai" style="margin-top:18px">${icons.spark} Ask the AI instead</button>` : "");
    } catch (err) { console.warn("Vespera search failed:", err); if (seq === searchSeq) res.innerHTML = failBox(); }
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
    return `<button class="back-link" data-action="back">${icons.left} Back</button>
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
            ${LIVE && t.tmdbId ? `<a class="btn btn-primary" href="#/watch/${esc(t.key)}${t.kind === "tv" ? `?season=${t.seasons?.[0]?.n || 1}&episode=1` : ""}">${icons.play} Play</a>` : ""}
            ${t.trailer ? `<button class="btn btn-ghost" data-action="trailer" data-yt="${esc(t.trailer)}">${icons.play} Trailer</button>` : ""}
            <button class="btn btn-ghost" data-save="${esc(t.key)}">${saved ? icons.check + " On My List" : icons.plus + " Add to My List"}</button>
            <button class="icon-btn" data-action="share" data-id="${esc(t.key)}" aria-label="Copy link">${icons.share}</button>
          </div>
        </div>
      </div>
    </section>
    ${prov ? `<section class="section" id="providers">
      <div class="section-head"><h2>Where to watch</h2><a href="${esc(prov.link)}" target="_blank" rel="noopener">All options</a></div>
      <div class="providers">${prov.list.map(p => `<a class="provider" href="${esc(prov.link)}" target="_blank" rel="noopener"><img src="${esc(p.logo)}" alt=""><span><b>${esc(p.name)}</b><small>${p.how}</small></span></a>`).join("")}</div>
      <p class="fine">Availability in ${region()} from JustWatch via TMDB. Change region in Account.</p>
    </section>` : ""}
    ${t.seasons?.length ? `<section class="section" id="episodes">
      <div class="section-head"><h2>Episodes</h2>
        <select class="select" id="seasonSel" aria-label="Season">${t.seasons.map(s => `<option value="${s.n}">${esc(s.name)} · ${s.count} ep${s.year ? ` · ${s.year}` : ""}</option>`).join("")}</select></div>
      <div class="episodes" id="epList"></div>
    </section>` : ""}
    ${t.castFull?.length ? `<section class="section"><div class="section-head"><h2>Cast</h2></div>
      <div class="row cast-row">${t.castFull.map(c => `<a class="person" href="#/search?q=${slug(c.name)}">
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
    const episodeLabel = kind === "tv" ? ` · S${season} E${episode}` : "";
    return `<div class="page watch-page">
      <a class="back-link" href="#/title/${esc(t.key)}">${icons.left} Back to details</a>
      <header class="watch-heading">
        <div><p class="eyebrow">NOW PLAYING</p><h1>${esc(t.title)}${episodeLabel}</h1>
          ${kind === "tv" ? `<p>Season ${season}, Episode ${episode}</p>` : ""}
        </div>
      </header>
      <div class="watch-player-wrap" id="watchPlayer">
        ${active
          ? `<iframe id="watchFrame" src="${esc(active.url)}" title="${esc(t.title)} player" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`
          : `<div class="watch-empty"><div class="empty-icon">${icons.play}</div><h2>No playback provider available</h2><p>${error ? esc(error) : "There is currently no configured playback provider for this title."}</p></div>`}
        ${active ? `<button class="watch-fullscreen" data-action="watch-fullscreen" aria-label="Toggle fullscreen" title="Fullscreen">${icons.ext}</button>` : ""}
      </div>
      ${providers.length ? `<section class="watch-servers">
        <div class="section-head"><h2>Playback servers</h2><span class="fine">Choose a server</span></div>
        <div class="watch-server-list">${providers.map((p, i) => `<button class="btn ${i === 0 ? "btn-primary" : "btn-ghost"} watch-server" data-action="watch-server" data-url="${esc(p.url)}" aria-pressed="${i === 0}">${icons.play} ${esc(p.name)}</button>`).join("")}</div>
      </section>` : ""}
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
      .watch-fullscreen{position:absolute;right:14px;bottom:14px;border:0;border-radius:9px;padding:10px;background:#111c;color:white;cursor:pointer}
      .watch-servers{margin-top:26px}.watch-server-list{display:flex;flex-wrap:wrap;gap:10px}
      .watch-description{max-width:850px;color:var(--muted);line-height:1.7;margin-top:24px}
      @media(max-width:700px){.watch-page{padding:22px 16px 50px}.watch-heading{margin:12px 0 16px}.watch-player-wrap{border-radius:10px}}
    </style>`;
  }

  async function loadSeason(t, n) {
    const box = document.getElementById("epList"); if (!box) return;
    box.innerHTML = `<div class="ep skel" style="height:120px"></div><div class="ep skel" style="height:120px"></div>`;
    try {
      const s = await tmdb(`tv/${t.tmdbId}/season/${n}`);
      if (!document.getElementById("epList")) return;
      box.innerHTML = (s.episodes || []).map(e => `<article class="ep">
        <div class="ep-still">${e.still_path ? `<img src="${IMG}w300${e.still_path}" alt="" loading="lazy">` : `<span>${e.episode_number}</span>`}</div>
        <div><b>${e.episode_number}. ${esc(e.name)}</b>
          <div class="meta" style="color:var(--muted);font-size:12.5px;margin:4px 0 6px">${e.air_date ? `<span>${esc(fmtDate(e.air_date))}</span>` : ""}${e.runtime ? `<span class="dot"></span><span>${e.runtime}m</span>` : ""}${e.vote_average ? `<span class="dot"></span><span>★ ${e.vote_average.toFixed(1)}</span>` : ""}</div>
          <p>${esc(e.overview || "No description yet.")}</p>
          <a class="btn btn-primary" style="display:inline-flex;margin-top:10px" href="#/watch/${esc(t.key)}?season=${encodeURIComponent(n)}&episode=${encodeURIComponent(e.episode_number)}">${icons.play} Play episode</a>
        </div></article>`).join("") || empty("No episodes listed", "");
    } catch { box.innerHTML = failBox(); }
  }

  // Account
  const REGIONS = [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["IE", "Ireland"], ["NZ", "New Zealand"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"], ["SE", "Sweden"], ["IN", "India"], ["NG", "Nigeria"], ["ZA", "South Africa"], ["JP", "Japan"], ["KR", "South Korea"], ["BR", "Brazil"], ["MX", "Mexico"]];
  function pageAccount() {
    const a = state.auth || {};
    const since = a.since ? new Date(a.since).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "—";
    const tog = (act, on, label, hint) => `<button class="pref" data-action="${act}" role="switch" aria-checked="${on}"><span><b>${label}</b><small>${hint}</small></span><span class="switch ${on ? "on" : ""}"></span></button>`;
    return `<div class="page account">
      <div class="page-head"><div><h1>Account</h1><p>Membership, profiles and preferences.</p></div></div>
      <div class="acct-grid">
        <section class="panel"><h2>Membership</h2>
          ${SERVER ? `<div class="acct-row"><span>Email</span><b>${esc(a.email)}</b></div>
          <div class="acct-row"><span>Membership</span><b>Invited member</b></div>` : `<div class="acct-row"><span>Account</span><b>Saved in this browser</b></div>`}
          <div class="acct-row"><span>Member since</span><b>${esc(since)}</b></div>
          <div class="acct-row"><span>Catalog</span><b>${LIVE ? "Live · TMDB" + (FEAT.omdb ? " + OMDb" : "") : "Sample"}</b></div>
        </section>
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
        <section class="panel"><h2>Your data</h2>
          <p class="fine" style="padding:0;margin:0 0 14px">${SERVER ? "Profiles, lists and preferences are saved to your account and sync across your devices." : "Profiles, lists and preferences are stored in this browser."}</p>
          <div class="hero-actions"><button class="btn btn-ghost" data-action="clear-list">Clear ${esc(state.current?.name)}'s list</button>
          <button class="btn btn-ghost" data-action="signout">${icons.out} Sign out</button></div>
        </section>
      </div></div>`;
  }

  // ---------- gate / sign-in / profiles ----------
  const brandHTML = `<a class="brand" href="#/welcome" aria-label="Vespera"><img src="star.svg" alt=""><span>Vespera</span></a>`;
  const langSel = () => `<select class="lang" id="lang" aria-label="Language">${["English", "Español", "Français", "Deutsch", "日本語"].map(l => `<option ${store.get("lang", "English") === l ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const legal = `<p class="legal">By continuing you agree to the Vespera <a href="#" data-action="privacy">Privacy Policy</a>.</p>`;

  function pageWelcome() {
    return `<div class="gate"><div class="gate-card">
      ${brandHTML}
      <p class="eyebrow">After Dark</p>
      ${SERVER ? `<h1>A screening guide for the few</h1>
      <p class="lead">Vespera is invitation only. If someone saved you a seat, step inside.</p>
      <p class="hint">Already have an invitation?</p>
      <a class="btn btn-primary btn-block" href="#/signin">Sign in</a>`
      : `<h1>A screening guide for after dark</h1>
      <p class="lead">Films, series and anime worth your night — what they are, who made them, and where to watch.</p>
      <a class="btn btn-primary btn-block" href="#/signin">Step inside</a>`}
      ${legal}${langSel()}
    </div></div>`;
  }
  function pageSignin(params) {
    if (!SERVER) { // static hosting: no accounts, just a profile kept in this browser
      return `<div class="gate"><div class="gate-card">
        ${brandHTML}
        <h1>Who's watching?</h1>
        <p class="lead">Pick a name for your profile. Your list and settings are saved in this browser.</p>
        <form id="nameForm" novalidate>
          <div class="field"><label class="label" for="pname0">Your name</label>
            <input class="input" id="pname0" maxlength="16" autocomplete="nickname" placeholder="e.g. Alex" required>
            <p class="error" id="err" role="alert"></p></div>
          <button class="btn btn-primary btn-block">Continue</button>
        </form>
        ${legal}${langSel()}
      </div></div>`;
    }
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
      return `<div class="ai-pick" data-go="#/title/${esc(t.key)}" role="link" tabindex="0">
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
  function profileModal(existing) {
    let color = existing ? existing.color : state.profiles.length % AV_COLORS.length;
    modal(`<h2>${existing ? "Edit profile" : "Add a profile"}</h2>
      <p>${existing ? "Change the name or color." : "Each profile gets its own list and picks."}</p>
      <form id="pf">
        <div class="field"><label class="label" for="pname">Name</label><input class="input" id="pname" maxlength="16" value="${esc(existing?.name || "")}" required></div>
        <div class="field"><span class="label">Color</span><div class="swatches">${AV_COLORS.map((c, i) => `<button type="button" class="swatch ${i === color ? "on" : ""}" style="background:${c}" data-c="${i}" aria-label="Color ${i + 1}"></button>`).join("")}</div></div>
        <div class="modal-actions">
          ${existing && state.profiles.length > 1 ? `<button type="button" class="btn btn-ghost" id="pdel" style="margin-right:auto;color:#ff9b8a">Delete</button>` : ""}
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-primary">${existing ? "Save" : "Add"}</button>
        </div>
      </form>`, (el, close) => {
      el.querySelectorAll("[data-c]").forEach(b => b.onclick = () => {
        color = +b.dataset.c; el.querySelectorAll("[data-c]").forEach(x => x.classList.toggle("on", x === b));
      });
      el.querySelector("#pdel")?.addEventListener("click", () => {
        state.profiles = state.profiles.filter(p => p.id !== existing.id);
        const lists = store.get("lists", {}); delete lists[existing.id]; store.set("lists", lists);
        if (state.currentId === existing.id) state.currentId = null;
        close(); toast("Profile deleted"); render();
      });
      el.querySelector("#pf").onsubmit = e => {
        e.preventDefault(); const name = el.querySelector("#pname").value.trim(); if (!name) return;
        if (existing) state.profiles = state.profiles.map(p => p.id === existing.id ? { ...p, name, color } : p);
        else state.profiles = [...state.profiles, { id: "p" + Date.now().toString(36), name, color }];
        close(); toast(existing ? "Profile updated" : `${name} added`); render();
      };
    });
  }

  // ---------- router ----------
  const PUBLIC = ["welcome", "signin"];
  let renderSeq = 0;
  async function render() {
    clearInterval(heroTimer); clearInterval(rotTimer); clipObserver?.disconnect(); lazyJobs.clear();
    const seq = ++renderSeq;
    document.documentElement.classList.toggle("perf", state.perf);
    const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
    const params = new URLSearchParams(qs || "");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const route = parts[0] || "";

    if (!state.auth && !PUBLIC.includes(route)) { location.replace("#/welcome"); return; }
    if (state.auth && PUBLIC.includes(route)) { location.replace("#/"); return; }
    if (state.auth && route !== "who" && !state.current) { location.replace("#/who"); return; }

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
    }
    mountPage(route, params, parts);
  }

  function mountPage(route, params, parts = []) {
    if (route === "") mountHero(() => data.row((LIVE ? window.VESPERA_TMDB_ROWS : window.VESPERA_ROWS)[0]), "Tonight's pick");
    if (["movies", "series", "anime"].includes(route)) {
      if (document.getElementById("grid")) loadBrowse(false);
      else { const s = data.section(route); mountHero(() => data.load(s.hero), BROWSE[route].hero); }
    }
    if (route === "" ) liveColls(document.getElementById("homeColls"));
    if (route === "constellations") liveColls(document.getElementById("collPage"));
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
    const nf = document.getElementById("nameForm");
    if (nf) {
      const inp = document.getElementById("pname0"); inp.focus();
      nf.onsubmit = async e => {
        e.preventDefault(); const name = inp.value.trim();
        if (!name) { document.getElementById("err").textContent = "Enter a name."; return; }
        store.set("auth", { local: true, since: store.get("auth", null)?.since || new Date().toISOString() });
        if (!state.profiles.length) state.profiles = [{ id: "p" + Date.now().toString(36), name: name.slice(0, 16), color: 0 }];
        state.currentId = state.profiles[0].id;
        await ensureGenres().catch(() => {});
        location.hash = state.profiles.length > 1 ? "#/who" : "#/";
      };
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

  document.addEventListener("click", e => {
    const t = e.target;
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
    if (ty) { setParam("type", ty.dataset.type); return; }

    const act = t.closest("[data-action]");
    if (act) {
      const a = act.dataset.action;
      if (a !== "jump") e.preventDefault();
      if (a === "signout") {
        closeMenus(); clearTimeout(syncTimer);
        if (SERVER) api("auth/logout", "POST").catch(() => {}).finally(() => { signedOut(); toast("Signed out"); });
        else { store.del("auth"); state.currentId = null; location.hash = "#/welcome"; toast("Signed out"); }
      }
      if (a === "assistant") openAssistant();
      if (a === "ai-close") closeAssistant();
      if (a === "ai-clear") { aiMsgs = []; saveAi(); aiRender(); }
      if (a === "ask-ai") { const q = document.getElementById("q")?.value.trim(); openAssistant(q || ""); }
      if (a === "resend") {
        const email = new URLSearchParams(location.hash.split("?")[1]).get("email");
        api("auth/start", "POST", { email }).then(() => toast("New code sent"), x => toast(SIGNIN_ERRORS[x.code] || "Couldn't send a code"));
      }
      if (a === "add-profile") { closeMenus(); profileModal(null); }
      if (a === "perf") { state.perf = !state.perf; document.documentElement.classList.toggle("perf", state.perf);
        act.querySelector(".switch").classList.toggle("on", state.perf); act.setAttribute("aria-checked", state.perf);
        if (state.perf) { clearInterval(heroTimer); document.querySelectorAll(".bg-video").forEach(v => v.remove()); }
        toast(state.perf ? "Performance mode on — motion reduced" : "Performance mode off"); }
      if (a === "autoplay") { state.autoplay = !state.autoplay; act.querySelector(".switch").classList.toggle("on", state.autoplay); act.setAttribute("aria-checked", state.autoplay);
        toast(state.autoplay ? "Trailers will autoplay (muted)" : "Trailer autoplay off"); }
      if (a === "clear-list") modal(`<h2>Clear ${esc(state.current?.name)}'s list?</h2><p>This removes every saved title from this profile. It can't be undone.</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="confirmClear">Clear list</button></div>`,
        (el, close) => el.querySelector("#confirmClear").onclick = () => { state.clearList(); close(); toast("List cleared"); });
      if (a === "surprise") data.random().then(r => { if (r) location.hash = `#/title/${r.key}`; }).catch(() => toast("Couldn't pick one — try again"));
      if (a === "back") { history.length > 1 ? history.back() : (location.hash = "#/"); }
      if (a === "more" && browseState) { browseState.page++; loadBrowse(true); }
      if (a === "toggle-filters") { const p = document.getElementById("filtersPanel"); p.hidden = !p.hidden; act.setAttribute("aria-expanded", !p.hidden); }
      if (a === "clear-filters") { const p = new URLSearchParams(location.hash.split("?")[1] || ""); ["genre", "year", "rating", "sort"].forEach(k => p.delete(k));
        location.hash = "#/search" + (p.toString() ? "?" + p : ""); }
      if (a === "clip-prev") clipStep(-1);
      if (a === "clip-next") clipStep(1);
      if (a === "expand") { const p = act.previousElementSibling; p.classList.toggle("clamp"); act.textContent = p.classList.contains("clamp") ? "Read more" : "Show less"; }
      if (a === "jump") { e.preventDefault(); document.getElementById("providers")?.scrollIntoView({ behavior: "smooth" }); }
      if (a === "watch-server") {
        const frame = document.getElementById("watchFrame");
        if (frame && act.dataset.url) frame.src = act.dataset.url;
        document.querySelectorAll(".watch-server").forEach(b => {
          const selected = b === act;
          b.classList.toggle("btn-primary", selected);
          b.classList.toggle("btn-ghost", !selected);
          b.setAttribute("aria-pressed", String(selected));
        });
      }
      if (a === "watch-fullscreen") {
        const player = document.getElementById("watchPlayer");
        if (player) {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else player.requestFullscreen?.().catch(() => {});
        }
      }
      if (a === "google") { if (SERVER && FEAT.google) location.href = "/api/auth/google"; else toast("Google sign-in isn't set up yet — use an email code"); }
      if (a === "privacy") modal(`<h2>Privacy</h2><p>${SERVER ? "Vespera saves your email, profiles, list and preferences to your account so they follow you between devices. A sign-in cookie keeps you signed in for 30 days." : "Vespera keeps your profiles, list and preferences in this browser."} Title data and images come from TMDB${FEAT.omdb ? " and OMDb" : ""}; trailers are embedded from YouTube.</p><div class="modal-actions"><button class="btn btn-primary" data-close>Got it</button></div>`);
      if (a === "trailer") { document.querySelectorAll(".bg-video iframe").forEach(f => ytCmd(f, "pauseVideo"));
        modal(`<div class="video"><iframe src="${ytSrc(act.dataset.yt).replace("mute=1", "mute=0")}" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`, null, "modal-video"); }
      if (a === "share") { const url = location.href.split("#")[0] + "#/title/" + act.dataset.id;
        (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast("Link copied"), () => toast(url)); }
      return;
    }

    const go = t.closest("[data-go]");
    if (go) { location.hash = go.dataset.go; if (go.closest("#aiPanel") && innerWidth < 900) closeAssistant(); }
  });

  document.addEventListener("change", e => {
    const s = e.target.closest("[data-param]"); if (!s) return;
    setParam(s.dataset.param, s.value);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeMenus(); if (!document.querySelector(".modal-back")) closeAssistant(); }
    if (e.key === "Enter" && e.target.matches(".card[data-go]")) location.hash = e.target.dataset.go;
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "/" && state.current) { e.preventDefault(); location.hash = "#/search"; }
    if (document.getElementById("clips") && ["ArrowDown", "ArrowUp", "j", "k"].includes(e.key)) { e.preventDefault(); clipStep(e.key === "ArrowDown" || e.key === "j" ? 1 : -1); }
  });
  addEventListener("scroll", () => document.getElementById("topbar")?.classList.toggle("scrolled", scrollY > 10), { passive: true });
  addEventListener("hashchange", render);

  async function boot() {
    await detectMode();
    if (!SERVER && store.get("auth", null)?.email && !store.get("auth", null)?.local) store.del("auth"); // stale server sign-in
    if (SERVER) {
      try { FEAT = { ...FEAT, ...(await api("features")) }; } catch {}
      try { hydrate(await api("me")); }
      catch (e) { if (e.status === 401) { hydrating = true; ["auth", "profiles", "lists", "current"].forEach(k => store.del(k)); hydrating = false; } }
    }
    render();
  }
  boot();
})();
