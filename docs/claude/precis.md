# precis dashboard

referenced from `CLAUDE.md`. read when picking up a precis feature, editing `docs/precis-status.yaml`, or working with the kanban TUI.

terminal kanban for the precis sequencing — the 13-feature rollout described in `docs/precis-thinktank-v3.md`. v3 is the doctrine (locked design decisions, vocabulary, cosmology, sequence + dependency graph). `docs/precis-status.yaml` is the running state (status, spec/plan/pr links, notes). the dashboard renders the YAML as a TODO / NEXT / IN PROGRESS / SHIPPED kanban so the next unblocked feature is always one glance away.

`npm run backlog` launches it. lives at `tools/precis/` (Ink TUI, run via `tsx`). dev-only — not bundled with the game, not in any tsconfig project, eslint-ignored.

when picking up a precis feature:

1. open the dashboard: `npm run backlog`. the NEXT column shows everything whose dependencies are all `shipped`.
2. pick one and run `/new-feature` (or `/change-request` / `/bug-report`) in claude code, referencing v3 by section for the doctrine.
3. once the spec and plan land, set `spec:` / `plan:` on the feature in `docs/precis-status.yaml` and flip `status: in-progress`.
4. once the PR ships, set `pr:` and flip `status: shipped`. dependents automatically appear in NEXT.

editing the YAML while the dashboard is open auto-reloads it (debounced 120ms). status is hand-edited — never derived from git or PR state. `NEXT` is the only computed bucket.

when v3 changes (rare — locked decisions), the rule is: spec contradicts v3 → spec is wrong. v3 is canonical.
