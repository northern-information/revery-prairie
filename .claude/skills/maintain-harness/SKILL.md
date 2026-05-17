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

### 1. Scan specs

Read all specs in `harness/specs/`.

### 2. Check each spec against source code

For each spec:

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

## Anti-rationalizations

When the agent feels the urge to take a shortcut, it will narrate one of these. Don't.

| Excuse the agent will tell itself                                                        | Rebuttal                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The spec mostly matches — close enough."                                                | Close enough is drift. Either it matches or it needs a patch. Document the gap.                                                                                     |
| "This new GameState field doesn't need a spec."                                          | Adding to `EXPECTED_FIELDS` in `schema.test.ts` is not the same as having behavior coverage. Spec it (or escalate to `/new-feature` if it's substantial).           |
| "I'll apply the obvious patches without showing them."                                   | Step 6 is a hard checkpoint. Always present diffs for approval — even the obvious ones. The user is calibrating their trust in this skill by seeing your reasoning. |
| "These four specs are all stale in the same way — I'll bundle them into one mega-patch." | Present them separately so the user can accept/reject each. Bundled patches force all-or-nothing decisions.                                                         |
| "I don't need to read every file in `source_files` — I can tell from the spec."          | Read every file. The point of this skill is comparing spec to reality; skipping reads defeats it.                                                                   |

## Exit criterion

Drift report presented to user, proposed spec patches shown as diffs, user approval recorded for each patch (accepted, rejected, or deferred). Accepted patches committed in a worktree with `npm run spec:validate` clean.
