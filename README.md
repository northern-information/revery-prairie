# Revery Prairie

```txt
To make a prairie it takes a clover and one bee,
One clover, and a bee.
And revery.
The revery alone will do,
If bees are few.

— Emily Dickinson
```

## How This Is Built

Revery Prairie is hand-crafted by Tyler Etters and others along with Claude (Anthropic) as a coding partner. Design, voice, and decisions are ours. Boilerplate, refactors, and a lot of the test scaffolding are often Claude's. The workflow is documented openly in `CLAUDE.md` and `docs/claude/`. We're transparent about it because it's true and because the workflow is part of the project.

## Setup

```zsh
npm install
npm run dev
```

Node version is pinned to an exact patch in `.node-version` and `.nvmrc` — both must stay in sync. See `CLAUDE.md` for details.

## Deploy

Multiplayer ships as a single Cloudflare Worker that serves both the React SPA and the `/api/*` endpoints from one origin (no CORS, no second deploy URL).

```zsh
cd worker && npx wrangler login   # first time only, opens browser
cd ..                             # back to repo root
npm run deploy                    # vite build + wrangler deploy
```

Worker URL is printed by wrangler on success — share that origin with friends to play together. See the `multiplayer` section of `CLAUDE.md` for the architecture and wire protocol.

## How Development Works

All game features flow through a spec-driven harness. The human decides what to build and gates every transition. The AI investigates, drafts, codes, and verifies.

### Roles

**Human:**

- Describes what to build, change, or fix
- Reviews and approves specs before planning begins
- Reviews and approves plans before execution begins
- Approves or rejects each pipeline transition — nothing auto-advances
- Playtests in the browser (the AI cannot)
- Updates `CLAUDE.md` when game systems change

**AI:**

- Investigates the codebase to understand the problem
- Drafts specs and plans from the human's description
- Runs `npm run spec:validate` and fixes errors
- Writes code and tests during plan execution
- Runs verification commands (`build`, `test`, `lint`) and repairs failures
- Detects spec-code drift via `/maintain-harness`

### Entry Points

Slash commands start the pipeline. Each is conversational — the AI gathers requirements, then drives spec → plan → execute with human approval at each gate.

- `/new-feature <description>` — add a new feature
- `/change-request <description>` — modify existing behavior
- `/bug-report <description>` — investigate and fix a bug
- `/maintain-harness` — check for spec-code drift
- `/maintain-manual` — audit prairie manual for gaps

### The Pipeline

1. **Spec** — AI drafts a YAML spec in `harness/specs/{id}.yaml`. Human reviews and approves.
2. **Validate** — AI runs `npm run spec:validate`, fixes errors, repeats until clean.
3. **Plan** — AI drafts a YAML plan in `harness/plans/{id}.yaml`. Human reviews and approves.
4. **Execute** — AI runs `npm run harness:run --plan harness/plans/{id}.yaml`. Verification runs after each task; failures trigger repair.
5. **Maintain** — AI runs `/maintain-harness` to detect drift. Human decides which updates to accept.

### Key Directories

- `harness/specs/` — feature specs (YAML)
- `harness/plans/` — execution plans (YAML)
- `harness/src/` — harness tooling
- `.claude/skills/` — slash command definitions

### Sequencing the Precis

The long-running precis rollout (24 features and counting, from "delete the four player-cast spells" through the Revery, controlled burn, genetics, egregoric flora, and failure-state biomes) is sequenced separately from any single harness spec:

- `docs/precis-thinktank-v3.md` — locked doctrine: vocabulary, cosmology, time, genetics decision, the sequence + dependency graph
- `docs/precis-thinktank-v4.md` — additive doctrine on top of v3: heat-death cosmology, wear as a universal mechanic, tenure handoff, lineage multiplayer
- `docs/precis-status.yaml` — running state: each feature's status, spec/plan/pr links, notes
- `npm run backlog` — terminal kanban (TODO / NEXT / IN PROGRESS / SHIPPED) rendered from the YAML. Live-reloads when you edit it

Start each feature by checking the dashboard's NEXT column, then run `/new-feature` (or `/change-request` / `/bug-report`) and reference v3 + v4 for doctrine.

## Commands

| Command                   | Description                              |
| ------------------------- | ---------------------------------------- |
| `npm run dev`             | Start dev server                         |
| `npm run build`           | Type-check + production build            |
| `npm run typecheck`       | Type-check only, no build                |
| `npm run lint`            | ESLint (strict, type-checked)            |
| `npm run format`          | Prettier write                           |
| `npm run format:check`    | Prettier check                           |
| `npm run test`            | Run tests once                           |
| `npm run test:watch`      | Run tests in watch mode                  |
| `npm run test:engine`     | Engine tests only                        |
| `npm run test:components` | Component tests only                     |
| `npm run test:harness`    | Harness tests only                       |
| `npm run verify`          | Type-check + lint + test                 |
| `npm run preview`         | Preview production build                 |
| `npm run deploy`          | Build + ship to Cloudflare (multiplayer) |
| `npm run spec:validate`   | Validate harness specs                   |
| `npm run harness:run`     | Execute a harness plan                   |
| `npm run harness:check`   | Detect spec-code drift                   |
| `npm run backlog`         | Terminal kanban for the precis backlog   |

## License

AGPL-3.0. See `LICENSE`. You're free to read, fork, modify, and host this code. If you run a modified version as a public service, you must publish your changes.
