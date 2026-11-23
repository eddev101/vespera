# Vespera

A guide to films, series and anime. Details only — Vespera never hosts or streams video.

Vespera runs two ways:

| | **GitHub Pages** (static) | **With `server.js`** (full) |
|---|---|---|
| Catalog, posters, ratings, trailers, where to watch | ✓ | ✓ |
| Profiles and My List | Saved in each visitor's browser | Saved to their account, synced across devices |
| Invite-only sign-in (email codes, Google) | — | ✓ |
| AI assistant | — | ✓ |
| API keys | **Public** in `config.js` | Private in `.env` |

The site detects which one it's running on — no switch needed.

## Publish on GitHub Pages

1. **Never upload `.env` or the `data/` folder.** They hold private keys and member data.
2. Put your TMDB key (and optionally OMDb) in `config.js` → `tmdbKey: "..."`, `omdbKey: "..."`. These are visible to anyone, so use keys made just for this site.
3. Upload the files to the repo (or `git push`).
4. In the repo on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
5. After a minute or two the site is live at `https://<your-username>.github.io/<repo-name>/`. Every new upload updates it.

## Run the full version (with the server)

```powershell
npm install
node server.js
```

Open http://localhost:5173. Settings live in `.env` (copy `.env.example` if you're starting fresh). **Never share or commit `.env`.**

## Invite people

```powershell
node server.js invite friend@example.com
node server.js invites
node server.js uninvite friend@example.com
```

## Where sign-in codes appear

Until email is set up (below), each code is printed in the window running `node server.js`, like:

```
09:41:02 [dev] sign-in code for friend@example.com: 482913
```

The sign-in screen says so too. Codes expire after 10 minutes; five wrong tries cancel a code.

## Set up email codes (Resend)

1. Create an account at https://resend.com and add your domain under **Domains** (it gives you DNS records to add at your domain registrar). Wait until it shows **Verified**.
2. Under **API Keys**, create a key with **Sending access**.
3. In `.env`:
   ```
   RESEND_API_KEY=re_...
   MAIL_FROM=Vespera <signin@yourdomain.com>
   ```
4. Restart the server. The startup line should say `Email on`.

## Set up Google sign-in

1. Go to https://console.cloud.google.com/apis/credentials, create a project if asked, then **Create credentials → OAuth client ID → Web application**. (If prompted, configure the consent screen first: External, app name "Vespera", your email.)
2. Under **Authorised redirect URIs** add `<PUBLIC_URL>/api/auth/google/callback`, for example:
   - `http://localhost:5173/api/auth/google/callback` (testing)
   - `https://vespera.yourdomain.com/api/auth/google/callback` (live)
3. In `.env`:
   ```
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   ```
4. Restart. The "Continue with Google" button appears. Google accounts still have to be invited.

## Set up the AI assistant

1. Create a key at https://platform.claude.com/settings/keys.
2. In `.env`: `ANTHROPIC_API_KEY=sk-ant-...`
3. Restart. The ✦ button (bottom right) and **Ask AI** in search become the assistant.

It uses Claude Opus 5.5 at low effort for quick replies; each message costs a fraction of a cent. Members are limited to 30 messages per 10 minutes. Set `ASSISTANT_MODEL` to use a different model.

## Put the full version online (optional)

GitHub Pages can't run `server.js`. To host the full version, use any host that runs Node 18+ (Render, Railway, Fly.io, a small VPS…). You need:

- **HTTPS.** Set `PUBLIC_URL=https://your-address` — sign-in cookies switch to secure mode automatically.
- **A persistent disk for `data/`** — it holds members, sessions and invites. Back it up.
- **Environment variables** — the same keys as `.env` (most hosts have a settings page for them).
- `HOST=0.0.0.0` so the host can reach the server, and the `PORT` your host gives you.
- If the host sits behind a proxy/load balancer, `TRUST_PROXY=true` so rate limits see real visitor IPs.
- `DATA_DIR` pointing at the persistent disk, and `INVITES=a@x.com,b@y.com` if the host has no command line for `node server.js invite`.

Then update the Google redirect URI to the live address.

## Files

| File | What it is |
|---|---|
| `server.js` | Server: site, TMDB/OMDb proxy, sign-in, synced data, AI assistant |
| `index.html`, `app.js`, `styles.css`, `data.js`, `star.svg` | The site |
| `config.js` | Public front-end settings (no keys) |
| `.env` | Private keys and settings |
| `data/` | Members, sessions, invites (created automatically) |

Data and images from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB.
