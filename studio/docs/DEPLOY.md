# Deploying Professor Studio (DEPLOY-01, DEPLOY-02)

Studio is a **static SPA**. `npm run build` produces `studio/dist/` that works from any static host,
from a sub-path, and offline-ish behind a CDN. It needs **no server** and **no secrets** — BYOK keys
live in the browser and the local agent bridge is an optional, local-only extra.

> **Verification legend:** ✅ = executed and verified locally while writing this doc ·
> 📖 = read from the live void.cloud docs on 2026-10-15 (linked) · ⚠️ = unverified/caveat.

---

## 1. Build (DEPLOY-01) ✅

```bash
cd studio
npm install
npm run build          # → studio/dist/
```

The build uses a **relative base** (`base: './'` in `vite.config.js`) and **hash routing**, so every
asset is referenced as `./assets/…` and deep links (`#/course/:id/lesson/2`) survive refresh with no
server rewrite rules.

Verified locally:

- ✅ `npx vite preview` serves `studio/dist` from `/` — `index.html` and hashed assets return `200`.
- ✅ `studio/dist/index.html` references `./assets/…` (relative), so the same build also works when
  served from a sub-path (e.g. `https://host/professor-studio/`).

Sanity check from a sub-path:

```bash
cd studio/dist
python3 -m http.server 8090        # open http://localhost:8090/index.html — assets load, routes work
```

### Hash routing vs clean paths

Studio ships hash routes deliberately: the fragment is never sent to the server, so refresh and
deep links "just work" on *any* host with zero config. If you later want clean paths
(`/course/abc`), you must enable SPA fallback on the host:

- **void.cloud:** set `inference.appType: 'spa'` (already in `studio/void.config.ts`) — non-file paths
  fall back to `index.html` with a 200. 📖
- **Cloudflare Pages:** add `_redirects` with `/* /index.html 200`.
- **Netlify:** add `_redirects` with `/* /index.html 200`.

---

## 2. Deploy to void.cloud (DEPLOY-02)

[Void](https://void.cloud) (by VoidZero) is a Vite-native deploy platform that ships to **your own
Cloudflare account** (Workers + static assets). Static hosting is effectively Cloudflare Workers
Free (static assets free/unlimited, 100k requests/day). 📖

> ⚠️ Void is young and evolving (described as a private/beta platform in the stack research). Treat it
> as a good long-term bet, but keep the build host-agnostic (it already is) so you can fall back to
> Cloudflare Pages / Netlify at any time.

### Configure

A minimal `studio/void.config.ts` is committed. Move it to the **repository root** (Void reads
`void.config.ts` from the project root, next to `package.json`): 📖

```ts
// void.config.ts  (project root)
import { defineConfig } from 'void/config';

export default defineConfig({
  inference: { appType: 'spa', outputDir: 'studio/dist' },
  cloudflare: { name: 'professor-studio' },
});
```

- `inference.appType: 'spa'` — static output with SPA fallback to `index.html` (HTTP 200). 📖
- `inference.outputDir` — only used for `spa`/`static` app types; defaults to `dist`, set to
  `studio/dist`. 📖
- `cloudflare.name` — the Worker name in your Cloudflare account. 📖

### Deploy

```bash
npm install -D void@latest
npx void init                         # optional: scaffolds config / links a target
npx void connect --platform cloudflare   # opens a browser to sign in to your CF account
npx void deploy --platform cloudflare --dir studio/dist --spa
```

- `--dir <path>` — "Deploy a pre-built static directory (skips build)". ✅ flag verified in the live
  CLI reference (📖). This keeps Studio's own `vite build` untouched.
- `--spa` — "Use SPA mode instead of SSG for static deploys". 📖
- Alternatively, with the root `void.config.ts` above: `npx void deploy` (Void runs the build itself
  via `inference.build` if set) — ⚠️ we did **not** run `void deploy` here because it requires a
  Cloudflare login and account; the flags were verified against the official docs, not executed.

After a successful deploy, Void prints the deployment URL. Later deploys reuse the saved
Cloudflare target, so `npx void deploy --platform cloudflare` is enough. 📖

### Notes / caveats (⚠️ unverified against a real account)

- **Migrations:** Void applies SQL migrations from `db/migrations/` (or `sourceDir/db/migrations`). 📖
  Studio keeps its D1-compatible migrations in `studio/migrations/`. For the **SaaS** milestone, point
  Void at them (set `sourceDir`, or copy/symlink `studio/migrations/*.sql` to `db/migrations/`) and
  run `void db generate` — the tracking table name (`d1_migrations`) is intentionally wrangler/D1
  compatible. This static deploy needs **no** database.
- **Secrets:** none required for the static build (BYOK). Public build-time values would be supplied
  as `VITE_*` in the build environment. 📖
- **`void.lock.json` / `void.config.ts`** should be committed once Void creates them. 📖
- **Non-Cloudflare targets** (`inference.target: 'node' | 'bun' | 'deno'`) are possible but disable
  Cloudflare bindings. 📖

---

## 3. Fallbacks (host-agnostic) ✅

Because the build is plain static files with relative paths, `studio/dist` deploys verbatim to any
static host:

- **Cloudflare Pages / Netlify / GitHub Pages:** publish the `studio/dist` directory; add the
  `/* /index.html 200` redirect only if you switch away from hash routing (not needed today).
- **Any web server:** serve `studio/dist` as static files.

---

## 4. Running the bridge (DEPLOY-04)

The optional local agent bridge is documented in [`../README.md`](../README.md):

```bash
npx course-professor web     # or: cd web && node server.js
```

It binds to loopback, enforces a `STUDIO_ORIGINS` allowlist and an `X-Studio-Token` pairing token on
every `/api/studio/*` route, and never passes `--dangerously-skip-permissions`. On a **deployed
https** Studio, Chrome gates `localhost` requests behind Local Network Access and Safari/Firefox may
block them — this is a documented limitation, not a bug.
