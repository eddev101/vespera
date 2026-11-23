// Vespera front-end configuration. This file is PUBLIC - anyone can read it.
//
//  server   - "auto": use server.js when it's running (full version: private keys,
//             invite-only sign-in, synced lists, AI assistant); otherwise run in
//             static mode, e.g. on GitHub Pages.
//  tmdbKey  - static mode only. Your TMDB "API Key" (v3). Because this file is public,
//             the key is visible to visitors.
//             https://www.themoviedb.org/settings/api
//  omdbKey  - static mode only, optional (IMDb / Rotten Tomatoes / Metacritic scores
//             and awards). Also visible to visitors. https://www.omdbapi.com/apikey.aspx
//  region   - default country for "Where to watch" (changeable in Account).
window.VESPERA_CONFIG = {
  server: "auto",
  tmdbKey: "5ec279387e9aa9488ef4d00b22acc451",
  omdbKey: "97334eb9",
  region: "US",
};
