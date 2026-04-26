# revery prairie

```txt
To make a prairie it takes a clover and one bee,
One clover, and a bee.
And revery.
The revery alone will do,
If bees are few.

— Emily Dickinson
```

a browser-based game about tending a prairie. ASCII on canvas now, isometric sprites later.

each new game begins with a geological genesis sequence — a billion years of planetary history compressed into 25 seconds. magma cools, oceans form, life emerges, glaciers advance and recede, wildfires sweep the plains, civilizations rise and fall. the soil you tend is the sum of all these forces.

prairies can be tended alone or shared with friends. visit `/p/new` to plant a prairie hosted on a Cloudflare Worker; share the resulting `/p/{id}` URL and other stewards walk the same land.

## setup

```zsh
npm install
npm run dev
```

## deploy

multiplayer ships as a single Cloudflare Worker that serves both the React SPA and the `/api/*` endpoints from one origin (no CORS, no second deploy URL).

```zsh
cd worker && npx wrangler login   # first time only, opens browser
cd ..                             # back to repo root
npm run deploy                    # vite build + wrangler deploy
```

worker URL is printed by wrangler on success — share that origin with friends to play together. see CLAUDE.md `multiplayer` section for the architecture and wire protocol.

## how development works

all game features flow through a spec-driven harness. the human decides what to build and gates every transition. the AI investigates, drafts, codes, and verifies.

### roles

**human:**

- describes what to build, change, or fix
- reviews and approves specs before planning begins
- reviews and approves plans before execution begins
- approves or rejects each pipeline transition — nothing auto-advances
- playtests in the browser (the AI cannot)
- updates CLAUDE.md when game systems change

**AI:**

- investigates the codebase to understand the problem
- drafts specs and plans from the human's description
- runs `npm run spec:validate` and fixes errors
- writes code and tests during plan execution
- runs verification commands (`build`, `test`, `lint`) and repairs failures
- detects spec-code drift via `/maintain-harness`

### entry points

slash commands start the pipeline. each is conversational — the AI gathers requirements, then drives spec → plan → execute with human approval at each gate.

- `/new-feature <description>` — add a new feature
- `/change-request <description>` — modify existing behavior
- `/bug-report <description>` — investigate and fix a bug
- `/maintain-harness` — check for spec-code drift
- `/maintain-manual` — audit prairie manual for gaps

### the pipeline

1. **spec** — AI drafts a YAML spec in `harness/specs/{id}.yaml`. human reviews and approves.
2. **validate** — AI runs `npm run spec:validate`, fixes errors, repeats until clean.
3. **plan** — AI drafts a YAML plan in `harness/plans/{id}.yaml`. human reviews and approves.
4. **execute** — AI runs `npm run harness:run --plan harness/plans/{id}.yaml`. verification runs after each task; failures trigger repair.
5. **maintain** — AI runs `/maintain-harness` to detect drift. human decides which updates to accept.

### key directories

- `harness/specs/` — feature specs (YAML)
- `harness/plans/` — execution plans (YAML)
- `harness/src/` — harness tooling
- `.claude/skills/` — slash command definitions

## commands

| command              | description                   |
| -------------------- | ----------------------------- |
| `npm run dev`        | start dev server                          |
| `npm run build`      | type-check + production build             |
| `npm run lint`       | eslint                                    |
| `npm run format`     | prettier                                  |
| `npm run test`       | run tests                                 |
| `npm run test:watch` | run tests in watch mode                   |
| `npm run preview`    | preview production build                  |
| `npm run deploy`     | build + ship to Cloudflare (multiplayer)  |
