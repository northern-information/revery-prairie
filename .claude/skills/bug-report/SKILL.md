---
name: bug-report
description: Investigate and specify a bug fix via the harness pipeline
user_invocable: true
arg: description of the bug
---

# /bug-report

Conversational skill for investigating bugs, specifying the correct behavior, and planning fixes through the harness pipeline.

**All file writes must happen in a worktree.** After investigation (steps 1-2), enter a worktree before writing any files. Use the Agent tool with `isolation: "worktree"` for all steps that create or modify files (spec drafting, plan drafting, validation, execution). Never write specs, plans, or code directly on main.

**Always rebase before pushing or opening a PR.** Run `git fetch origin main && git rebase origin/main` in the worktree before pushing. Squash-merged PRs from other worktrees can silently diverge from your branch — rebasing ensures your changes apply cleanly on top of the latest main and prevents regressions from stale bases.

## Flow

### 1. Gather reproduction details

Ask clarifying questions:

- How do you reproduce the bug? (steps, inputs, game state)
- What is the expected behavior vs actual behavior?
- Which system do you suspect? (engine, hooks, components, rendering)

Wait for answers before proceeding.

### 2. Investigate the root cause

Explore the codebase to locate the root cause:

1. Start with the engine layer (`src/engine/`) — check the relevant action, state mutation, or logic
2. If not in engine, check hooks (`src/hooks/`) for stale closures, missing deps, or state sync issues
3. If not in hooks, check components (`src/components/`) for rendering or event handling bugs

For each finding, provide:

- File path and line number
- Code snippet
- Explanation of the mechanism (how this code causes the bug)

### 3. Enter a worktree

Before writing any files, enter a worktree. All subsequent file-writing steps happen inside this worktree.

### 4. Draft a spec

Create `harness/specs/{bug-id}.yaml` with:

- `behaviors`: describe the **correct** behavior (what it should do after the fix)
- `failure_conditions`: include the bug trigger as a failure condition with the correct expected outcome
- `edge_cases`: include the reproduction scenario
- `verification`: point to existing test file if one exists, or the file where the regression test will live

### 5. Validate the spec

Run `npm run spec:validate`. Fix and re-validate until clean.

### 6. Draft a plan

Create `harness/plans/{bug-id}.yaml` with tasks to:

1. Fix the root cause in the source file(s)
2. Add a regression test that fails before the fix and passes after

Each task should have narrow context and output files.

### 7. Present findings for review

Show the user:

- Root cause: file:line + snippet + mechanism explanation
- The spec (correct behavior + failure condition)
- The plan (fix tasks + regression test)

Do not proceed until the user approves.

### 8. Execute (optional, only on approval)

Ask the user before running. Report results from the run summary.

## Anti-rationalizations

When the agent feels the urge to take a shortcut, it will narrate one of these. Don't.

| Excuse the agent will tell itself | Rebuttal |
| --- | --- |
| "This bug is obvious — skip the investigation step." | No. Step 2 requires file:line + snippet + mechanism. Pattern-matching against training data is not evidence. |
| "I'll add the regression test after the fix lands." | The plan must include the failing test as a task before (or alongside) the fix task. The test must fail on `main` and pass on the branch — that's how you know the fix actually fixed it. |
| "The fix is one line — no spec needed." | One-line fixes still imply a behavior. Write the 1-behavior spec describing the correct behavior; the failing-then-passing test depends on it. |
| "I'll mock `Math.random` to make this test pass." | Mocking random controls *which path* the code takes, not *whether tiles are valid*. If the test needs a valid tile, prepare terrain (`clearAroundPlayer()` or set tiles to dirt). See CLAUDE.md testing section. |
| "The existing tests cover this — no regression test needed." | If they covered it, the bug wouldn't exist. Add the regression test that would have caught it. |
| "I can fix this adjacent thing while I'm here." | No. Touch only the root cause. Adjacent issues are separate `/bug-report` runs. |

## Exit criterion

Spec and plan committed in a worktree, `npm run spec:validate` clean, user approved both, regression test fails on `main` and passes on the branch, harness:run summary surfaced (or user explicitly declined to run).
