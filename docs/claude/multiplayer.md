# multiplayer

referenced from `CLAUDE.md`. read when touching `worker/`, `shared/`, `src/network/`, or any multiplayer flow.

three-tier deploy bundled as a single Cloudflare Worker: React SPA + worker fetch handler + one Durable Object per prairie. the SPA is served via the worker's `[assets]` binding, the fetch handler routes `/api/*` to the DO, and everything else falls through to static assets with SPA-style `not_found_handling`. same origin in production — no CORS.

## workspace layout

- `shared/` — wire protocol, `ColorId`, `PLAYER_COLORS`. consumed by both client and worker via `@revery-prairie/shared` (npm workspaces). never imports from `src/`, `worker/`, or React.
- `worker/` — Cloudflare Worker code. `worker/src/PrairieDO.ts` is the Durable Object (one instance per prairie, websocket hibernation API); `worker/src/index.ts` is the HTTP/WS router; `worker/wrangler.toml` configures the deploy.
- `src/network/` — React-side network layer. `client.ts` is the websocket client; `types.ts` holds client-only types like `NetworkClientStatus`.

## url routing

- `/` — offline mode. `NamePrompt` → `GameScreen`. localStorage save/load active.
- `/p/new` — create a prairie. `NetworkConnect` POSTs `/api/prairies`, server returns `{ prairieId, ownerToken }`, client stores `ownerToken` under `prairie:{prairieId}:ownerToken` in localStorage, browser navigates to `/p/{prairieId}`.
- `/p/{prairieId}` — visit a prairie. opens a websocket to `/api/prairies/{prairieId}/connect`, sends `hello`, receives `welcome` (with sessionId, isOwner, world.genesisSeed, peers).

## wire protocol

defined in `shared/src/protocol.ts`. summary:

- HTTP `POST /api/prairies` with `{ stewardName, color }` → `{ prairieId, ownerToken }`
- WS `/api/prairies/{id}/connect`
  - client → server: `hello` (once), `position` (per movement)
  - server → client: `welcome` (once), `peer-joined` / `peer-position` / `peer-left`, `error`
- close codes (4xxx range): 4001 malformed hello, 4002 invalid color, 4003 prairie not found, 4500 server error

## sync scope

position-only in the foundation spec (`multiplayer-foundation`). mutations (harvest, drop, combine) and entity ticks (bees, ghosts, weather) are deferred to follow-up specs (`multiplayer-mutations`, `multiplayer-entity-tick`, etc.).

server-side game ticks only run while at least one websocket is open. there is no Cron Trigger or `alarm()` keeping the world ticking 24/7 — true 24/7 persistence is a follow-up spec.

## state shape

new fields on `GameState`:

- `multiplayerSession: MultiplayerSession | null` — `prairieId`, `ownerToken`, `sessionId`, `color`, `role` (`'host' | 'visitor'`), `status`. null in offline mode.
- `remotePlayers: Map<string, RemotePlayer>` — keyed by sessionId. populated from `welcome.peers`, mutated on `peer-joined` / `peer-position` / `peer-left`.
- `onPlayerMoved: (() => void) | null` — engine callback fired after every successful `movePlayer`. wired to `NetworkClient.sendPosition` in online mode by `useGameEngine`.

## colors

avatars are rendered as `@` glyphs colored from `PLAYER_COLORS` (8 entries, hot pink excluded). the local player picks a color in `NetworkConnect`; remote players' colors come from their `peer-joined` / `welcome.peers` entries. last-used color autofills the next session via `prairie:lastColor` in localStorage.

## deploy

`npm run deploy` builds the SPA into `dist/` then runs `wrangler deploy` from `worker/`. the worker's `[assets]` block points at `../dist`. `wrangler login` is required once interactively before the first deploy.

`VITE_WORKER_URL` env var:

- unset (default in production builds) — same origin
- empty string — same origin (explicit)
- non-empty url — point at a remote worker (used in `npm run dev` to talk to the deployed worker from `localhost:5173`)

## local dev

two paths:

- `npm run dev` against a deployed worker — set `VITE_WORKER_URL=https://...workers.dev` in `.env.local`
- `npm run dev` against a local worker — `cd worker && npx wrangler dev` separately (wrangler v4 detects the workspace root and refuses to run there), then set `VITE_WORKER_URL=http://localhost:8787` in `.env.local`
