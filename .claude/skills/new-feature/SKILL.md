---
name: new-feature
description: Add a new game feature via spec-driven harness workflow
user_invocable: true
arg: description of the feature
---

# /new-feature

Conversational skill for adding new game features through the spec-driven harness pipeline. Do not skip steps or auto-execute without approval.

**All file writes must happen in a worktree.** After gathering requirements (step 1), enter a worktree before writing any files. Use the Agent tool with `isolation: "worktree"` for all steps that create or modify files (spec drafting, plan drafting, validation, execution). Never write specs, plans, or code directly on main.

**Always rebase before pushing or opening a PR.** Run `git fetch origin main && git rebase origin/main` in the worktree before pushing. Squash-merged PRs from other worktrees can silently diverge from your branch — rebasing ensures your changes apply cleanly on top of the latest main and prevents regressions from stale bases.

## Flow

### 1. Gather requirements

Ask the user 2-3 clarifying questions:

- What systems does this touch? (engine, components, hooks)
- What should the player see or experience?
- Any edge cases or failure modes you already know about?

Wait for answers before proceeding.

### 1b. Suggest a session rename

Derive a short kebab-case label for this session:

- If the input description names a precis id (matches `precis-(\d+[a-z]?)` and an item name), use `precis-{id}-{2-4-word-slug-of-name}`. Example: `precis-23-time-lapse-camera`.
- Otherwise, slug from the feature description: lowercase, hyphen-separated, 2–4 words, drop articles and short prepositions. Example: a "shooting-star meteor shower" description → `shooting-star-shower`.

Emit one line to the user, verbatim formatting:

```
Suggested session name — run `/rename {label}` to label this session in the prompt bar.
```

Do not block on this. The skill cannot invoke `/rename` itself (built-in slash commands are user-only); the user runs it (or ignores it) and flow continues to step 2.

### 2. Enter a worktree

Before writing any files, enter a worktree. All subsequent file-writing steps (spec, plan, validation, execution) happen inside this worktree.

### 3. Draft the spec

Create `harness/specs/{feature-id}.yaml` following the spec format:

- `id`: kebab-case, descriptive
- `layer`: `engine`, `component`, or `integration`
- `source_files`: files that will be created or modified
- `behaviors`: at least one, with concrete inputs/outputs/state_changes. no vague language.
- `edge_cases`: at least one, with specific description and expected outcome
- `failure_conditions`: at least one, with trigger and expected outcome
- `verification`: test file path, test pattern, and `npx vitest run` command
- `determinism`: mark probabilistic behaviors explicitly

Refer to `harness/specs/player-movement.yaml` as the canonical example.

### 4. Validate the spec

Run `npm run spec:validate`. If there are errors, fix them and re-validate. Repeat until clean.

### 5. Present spec for review

Show the user the complete spec. Iterate on feedback. Do not proceed until the user approves.

### 6. Draft the plan

Create `harness/plans/{feature-id}.yaml` with:

- `plan.id`, `plan.title`, `plan.created` (today's date)
- `plan.global_verification`: scope to the touched layer.
  - **Default** (single-component or narrow change): `["npm run typecheck", "npm run lint", <the spec's verification.command>]`
  - **Cross-cutting** (engine layer, integration layer, multiple layers, `shared/` wire protocol changes, or anything that mutates `GameState` shape): `["npm run typecheck", "npm run test", "npm run lint"]`
  - The full suite (`npm run test`) takes ~60s and runs in CI on PR open. Local iteration stays fast when scoped.
- `tasks`: ordered list with `id`, `title`, `spec_id`, `output_files`, `depends_on`, `spec_sections`, `context_files`, `verification` commands, `repair` policy, `tags`

Each task should:

- Have narrow `context_files` (only what the LLM needs to read)
- Have narrow `output_files` (only what the LLM should modify)
- Include `npx tsc -b --noEmit` in verification
- Include relevant unit test commands in verification

### 7. Validate plan references

Verify that:

- All `spec_id` values reference existing specs
- All `context_files` exist on disk
- Task dependency graph is acyclic
- `output_files` don't overlap between tasks in the same tier

### 8. Present plan for review

Show the user the complete plan. Iterate on feedback. Do not proceed until the user approves.

### 9. Execute (optional, only on approval)

Ask the user: "ready to execute? (`npm run harness:run -- --plan harness/plans/{feature-id}.yaml`)"

Only run if they confirm. Report results from the run summary.

## Anti-rationalizations

When the agent feels the urge to take a shortcut, it will narrate one of these. Don't.

| Excuse the agent will tell itself                                                 | Rebuttal                                                                                                                            |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| "This feature is too small to need a spec."                                       | The harness gate exists for a reason. Even a 1-behavior, 1-edge-case spec satisfies it and forces you to think about failure modes. |
| "The user already approved the description verbally — skip the spec review step." | No. Step 5 is a hard checkpoint. Show the spec, wait for approval.                                                                  |
| "I'll add the eslint-disable to ship faster."                                     | Never. Fix the underlying type. The repo's eslint config is `strictTypeChecked`; disable comments are not a tool.                   |
| "I'll write the lore for the new manual entry."                                   | Never write lore. Use `{ lore: 'TODO' }` in `MANUAL_LORE`. Lore is human-authored.                                                  |
| "Canvas rendering is untestable — skip the test."                                 | Flag it explicitly to the user before skipping. CLAUDE.md says so. Untestable ≠ silent skip.                                        |
| "I'll add a Skip-Harness trailer to bypass the gate."                             | The gate is the point. `Skip-Harness` is for emergency patches, not "I don't want to write a spec."                                 |

## Exit criterion

Spec and plan committed in a worktree, `npm run spec:validate` clean, user approved both, harness:run summary surfaced (or user explicitly declined to run).
