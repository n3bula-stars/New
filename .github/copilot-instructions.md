## PeteZahGames — Copilot instructions for automated coding agents

These notes are targeted at AI coding agents (Copilot-style) to help you be productive quickly in this repository. Keep changes conservative: prefer small, well-scoped edits and preserve existing runtime behavior.

High-level architecture
- This is an Express-based web app (see `server.js`) that mainly serves static files from `public/` and exposes a few API endpoints under `/api/*` implemented in `server/api/*.js`.
- A lightweight HTTP "bare" router (from `@tomphttp/bare-server-node`) and related MercuryWorkshop transports (epoxy, bare-mux, scramjet, ultraviolet) are mounted to support proxying and service-worker-based proxy functionality. Look at `server.js` lines that mount `/bare/`, `/baremux/`, `/epoxy/`, `/scram/`, and the Scramjet service worker in `public/sw.js`.
- Supabase is used for auth/storage: see `server.js` and `server/api/*.js`. Environment variables `SUPABASE_URL`, `SUPABASE_KEY`, and `SESSION_SECRET` are required for auth flows.
- The app bundles many static pages and an iframe-driven UI under `public/pages/` and assets under `public/storage/`.
- Deployment templates and examples: `Dockerfile` (multi-stage), `cloudbuild.yaml`, `render.yaml`, `amplify.yml`, `netlify.toml`, `.replit`, `.gitpod.yml`, and `.devcontainer/devcontainer.json`.

Developer workflows & important commands
- Node engine: package.json declares `"type": "module"` and requires Node >= 22. Use pnpm when possible (project has pnpm manifests). Typical commands:
  - Development / run: `pnpm install` then `pnpm start` (Procfile runs `node server.js` directly; many platforms use `pnpm start`).
  - Build step: some deployment configs expect `pnpm build` (railway/netlify templates include `pnpm build`) but there is no `build` script in package.json—avoid adding one unless you implement a concrete bundling step. If you need to add a build script, document it clearly.
- Environment files: `.env.<NODE_ENV>` may be loaded. `vercel.json`, and `netlify.toml` include samples and required env vars. Do not commit secrets.
- If Agent Mode is in use for testing changes open a container using the provided Dockerfile

Project-specific conventions & patterns
- Static-first: prefer editing files in `public/` for UI changes. `server.js` only contains a small API and proxies; avoid changing static file paths unless you update `server.js` routes (e.g., `auth-callback.html`).
- Service-worker proxying: `public/sw.js` implements Scramjet service worker logic and exposes a message API for playground data. When modifying proxy behavior, verify both server bare routes and the service worker cooperate.
- External transports: The repository relies on packages from `@mercuryworkshop/*` and `@titaniumnetwork-dev/ultraviolet`. Changes touching transport integration must preserve the mounted static paths in `server.js` (e.g., `/scram/`, `/baremux/`, `/epoxy/`).
- Auth flow: `/api/signin`, `/api/signup`, `/api/set-session`, and OAuth endpoints in `server.js` use Supabase methods and express-session. When changing session handling, keep `req.session.user` and `req.session.access_token` semantics.

Integration points & external dependencies
- Supabase: check `SUPABASE_URL`, `SUPABASE_KEY` env vars and usage in `server/api/*.js`. Storage buckets (example: `profile-pics`) are referenced directly in the code.
- Third-party transports and libraries: `@mercuryworkshop/*`, `@titaniumnetwork-dev/ultraviolet`, and Scramjet are core to proxying. They expose file paths used by `express.static(...)` in `server.js`.
- External APIs: DuckDuckGo instant answers are used for search suggestions (`/results/:query`). Keep CORS and fetch handling robust.

Examples of typical edits to implement
- Add a new API route: prefer creating a new file in `server/api/` exporting a named handler (like `signin.js`) and wire it in `server.js` with `app.post('/api/your-route', yourHandler)`.
- Add a static page: place it under `public/pages/...` and link from `public/index.html` or add an iframe target. No backend changes required for simple pages.
- Change proxy routing: update `bare` routes or Scramjet config. If you change service worker behavior, update `public/sw.js` and static assets served under `/scram/`.

Safety and testing guidance
- When altering runtime behavior, run locally with `pnpm install` then `pnpm start` and visit `http://localhost:3000`. Use `NODE_ENV=development` when iterating on env file loading.
Files and places to inspect when working on a change
- Core server: `server.js`
- API handlers: `server/api/*.js` (e.g., `signin.js`, `signup.js`)
- Static UI and assets: `public/` (especially `public/index.html`, `public/sw.js`, `public/pages/`, and `public/storage/`)
- Build and deployment hints: `package.json`, `Procfile`, `railway.json`, `vercel.json`, `netlify.toml`

Don'ts / gotchas
- Don't assume a `build` npm script exists; the repo is static-first and the start command runs the server directly.
- Avoid committing secrets or real Supabase keys. Use the provided placeholder envs in `railway.json`/`netlify.toml`.
- Service worker and bare routes are tightly coupled — changing one without the other may break proxying; update both and test.

If anything here is unclear or you want more detail about a specific component (e.g., Scramjet integration, Supabase schema expectations, or deployment to a specific provider), tell me which area and I'll expand the instructions or add examples.
