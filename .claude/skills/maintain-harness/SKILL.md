---
name: maintain-harness
description: Check spec-code drift and harness health, propose spec updates
user_invocable: true
---

# /maintain-harness

Periodic skill for keeping specs in sync with code and verifying harness health. Run after merging features that touch engine code, or at the start of a session to check for drift.

This skill produces spec updates, not new specs or plans. It is a sync check.

**All file writes must happen in a worktree.** Before writing any spec updates, enter a worktree. Use the Agent tool with `isolation: "worktree"` for all steps that modify files. Never write spec changes directly on main.

**Always rebase before pushing or opening a PR.** Run `git fetch origin main && git rebase origin/main` in the worktree before pushing. Squash-merged PRs from other worktrees can silently diverge from your branch — rebasing ensures your changes apply cleanly on top of the latest main and prevents regressions from stale bases.

## Flow

### 1. Scan implemented specs

Read all specs in `harness/specs/` with `status: implemented`.

### 2. Check each spec against source code

For each implemented spec:

1. Read every file in `source_files`
2. Compare actual function signatures, parameters, return types, and state mutations against the spec's `behaviors`
3. Check that `edge_cases` still make sense given the current code
4. Check that `failure_conditions` still apply

Flag drift:

- **Behavior in code but not in spec** — function or state mutation exists in source that has no corresponding behavior entry
- **Spec behavior that no longer matches code** — described behavior doesn't match what the function actually does (signature changed, state mutation changed, return value changed)
- **New GameState fields without spec coverage** — compare `Object.keys(createGameState(...))` against fields referenced across all specs

### 3. Check harness health

- Does `npm run spec:validate` pass? Run it and report.
- Are any specs stale? (referencing deleted `source_files` or `test_file`)
- Are all harness modules tested? Check for test files in `harness/__tests__/` covering: validator, plan-parser, topo-sort, checksum, prompt-assembler, executor, logger

### 4. Draft spec updates

For any drift found, draft updated spec YAML:

- Update changed behaviors with correct descriptions, state_changes, etc.
- Add new behaviors for undocumented code paths
- Remove or mark obsolete behaviors

### 5. Validate updates

Run `npm run spec:validate` on the updated specs. Fix and re-validate until clean.

### 6. Present drift report

Show the user a summary:

- **Drift found**: list of specs with mismatches, what changed
- **Harness health**: validation status, stale specs, missing test coverage
- **Proposed patches**: the spec updates, presented as diffs

Do not apply changes without approval. The user reviews and decides what to accept.
