---
name: bug-report
description: Investigate and specify a bug fix via the harness pipeline
user_invocable: true
arg: description of the bug
---

# /bug-report

Conversational skill for investigating bugs, specifying the correct behavior, and planning fixes through the harness pipeline.

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

### 3. Draft a spec

Create `harness/specs/{bug-id}.yaml` with:
- `status: partial` (the feature exists but has a bug)
- `behaviors`: describe the **correct** behavior (what it should do after the fix)
- `failure_conditions`: include the bug trigger as a failure condition with the correct expected outcome
- `edge_cases`: include the reproduction scenario
- `verification`: point to existing test file if one exists, or the file where the regression test will live

### 4. Validate the spec

Run `npm run spec:validate`. Fix and re-validate until clean.

### 5. Draft a plan

Create `harness/plans/{bug-id}.yaml` with tasks to:
1. Fix the root cause in the source file(s)
2. Add a regression test that fails before the fix and passes after

Each task should have narrow context and output files.

### 6. Present findings for review

Show the user:
- Root cause: file:line + snippet + mechanism explanation
- The spec (correct behavior + failure condition)
- The plan (fix tasks + regression test)

Do not proceed until the user approves.

### 7. Execute (optional, only on approval)

Ask the user before running. Report results from the run summary.
