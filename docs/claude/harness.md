# harness

referenced from `CLAUDE.md`. read when writing specs, plans, or interacting with `npm run harness:*` or the CI gate.

spec-driven development pipeline. see `README.md` for the workflow, roles, and entry points.

## writing a spec

file: `harness/specs/{id}.yaml`. schema: `harness/specs/spec-schema.json`.

required top-level fields:

- `id` — kebab-case, unique
- `name` — human-readable title
- `priority` — `critical`, `high`, `medium`, `low`
- `layer` — `engine`, `component`, or `integration`
- `source_files` — array of file paths this feature touches
- `dependencies` — (optional) array of other spec ids
- `behaviors` — array, at least one. each behavior has:
  - `id` — kebab-case
  - `description` — what happens (min 10 chars)
  - `inputs` — array of triggering conditions
  - `outputs` — array of observable results
  - `state_changes` — array of `{ field, effect }` pairs
  - `determinism` — `deterministic`, `probabilistic`, or `time-based`
- `edge_cases` — array of `{ id, description, expected }`
- `failure_conditions` — array of `{ trigger, expected }`
- `verification` — `{ test_file, test_pattern, command }`

## writing a plan

file: `harness/plans/{id}.yaml`.

top-level:

- `plan.id` — matches the spec id
- `plan.title` — what the plan accomplishes
- `plan.created` — date (YYYY-MM-DD)
- `plan.global_verification` — array of commands run after all tasks. scope to the touched layer:
  - **default** (single-component or narrow change): `npm run typecheck`, `npm run lint`, plus the spec's `verification.command` (the targeted vitest run)
  - **cross-cutting** (engine layer, integration layer, multiple layers, `shared/` wire protocol changes, or anything that mutates `GameState` shape): `npm run typecheck`, `npm run test`, `npm run lint`
  - the full suite (`npm run test`) takes ~60s and runs in CI on PR open. local iteration stays fast when scoped.

each task in `tasks[]`:

- `id` — kebab-case
- `title` — what the task does
- `spec_id` — which spec this implements
- `spec_sections` — array of behavior ids from the spec (scopes context)
- `context_files` — files the task needs to read
- `output_files` — files the task will modify
- `depends_on` — array of task ids that must complete first
- `verification` — array of commands to confirm the task worked
- `repair` — `retry` or `skip`
- `tags` — optional array (e.g. `[engine]`, `[test]`, `[hook]`)

## harness execution

`npm run harness:run` delegates tasks to an LLM agent that may produce zero edits, causing tasks to fail with 0 attempts. when executing a plan, implement the tasks manually following the plan's task order and dependency graph. the harness is useful for validation and structure, not autonomous execution.

## harness commands

```
npm run spec:validate    # validate all specs against schema
npm run harness:run      # execute a plan (--plan harness/plans/{id}.yaml)
npm run harness:check    # gate the current branch against origin/main
```

## harness gate (CI)

`npm run harness:check` enforces that significant product changes go through `/new-feature`, `/bug-report`, or `/change-request`. it runs in CI on every PR and can be run locally.

**gate triggers** (PR fails unless it includes both a `harness/specs/*.yaml` and a `harness/plans/*.yaml` change):

- any new file added under `src/`, `worker/src/`, or `shared/src/` (excluding tests)
- more than 150 LOC changed (added + removed) across product paths in the same trees

**always skipped** (no spec required):

- test files (`**/__tests__/**`, `*.test.ts(x)`)
- `harness/`, `.github/workflows/`, `.claude/`
- root config and docs (`package.json`, `tsconfig*`, `vite*`, `eslint*`, `prettier*`, `*.md`, `.gitignore`, `.editorconfig`)
- assets and anything else outside the product trees

**override**: add a `Skip-Harness: <reason>` trailer to the most recent commit on the branch (or set `SKIP_HARNESS=<reason>` in CI). the reason is logged in CI output so reviewers see it. use sparingly — for emergency patches or genuinely-uncategorizable changes that the gate misclassifies.

**how to satisfy the gate**: run `/new-feature`, `/bug-report`, or `/change-request` before starting work. these skills produce both a spec and a plan, which the gate looks for in the diff against `origin/main`.
