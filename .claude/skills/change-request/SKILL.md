---
name: change-request
description: Modify existing behavior via spec updates and the harness pipeline
user_invocable: true
arg: description of the change
---

# /change-request

Conversational skill for modifying existing game behavior through spec updates and the harness pipeline.

**All file writes must happen in a worktree.** After gathering requirements (step 1), enter a worktree before writing any files. Use the Agent tool with `isolation: "worktree"` for all steps that create or modify files (spec updates, plan drafting, validation, execution). Never write specs, plans, or code directly on main.

**Always rebase before pushing or opening a PR.** Run `git fetch origin main && git rebase origin/main` in the worktree before pushing. Squash-merged PRs from other worktrees can silently diverge from your branch — rebasing ensures your changes apply cleanly on top of the latest main and prevents regressions from stale bases.

## Flow

### 1. Gather requirements

Ask clarifying questions:

- What behavior is changing? What stays the same?
- Are there downstream effects? (other systems that depend on this behavior)
- Any new edge cases introduced by the change?

Wait for answers before proceeding.

### 2. Enter a worktree

Before writing any files, enter a worktree. All subsequent file-writing steps happen inside this worktree.

### 3. Identify affected specs

Search `harness/specs/` for existing specs that cover the behavior being changed:

- Search by spec `id` and `source_files`
- Read the matched specs to understand current documented behavior

If no spec exists for the affected behavior, note this — you may need to create one first.

### 4. Draft spec updates

Modify the affected spec(s):

- Update `behaviors` — change descriptions, inputs, outputs, state_changes as needed
- Add new `edge_cases` for any new scenarios the change introduces
- Update `failure_conditions` if the failure modes change
- Update `verification` if test file or pattern changes

Preserve behaviors that are not changing.

### 5. Validate updated specs

Run `npm run spec:validate`. Fix and re-validate until clean.

### 6. Draft a plan

Create `harness/plans/{change-id}.yaml` targeting only the changed behaviors:

- Tasks should modify only the files affected by the change
- Incremental rebuild (checksum caching) handles unchanged tasks automatically
- Include regression tests for the new behavior

### 7. Present the diff for review

Show the user:

- What changed in the spec (old vs new behaviors, edge cases)
- The plan (tasks, verification)

Do not proceed until the user approves.

### 8. Execute (optional, only on approval)

Ask the user before running. Report results from the run summary.

## Anti-rationalizations

When the agent feels the urge to take a shortcut, it will narrate one of these. Don't.

| Excuse the agent will tell itself                                         | Rebuttal                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| "This change is small — I'll skip updating the spec."                     | The spec is the source of truth for the next `/maintain-harness` run. Drift here costs you future time. Update it.                         |
| "I can refactor adjacent code while I'm in here."                         | No. Touch only what the change requires. Adjacent cleanup belongs in its own change-request.                                               |
| "The downstream effects are obvious — skip step 1."                       | Ask the question. The user knows things about gameplay intent that the code doesn't show.                                                  |
| "No spec exists for this behavior — I'll just edit the code and move on." | If step 3 finds no spec, you have a gap. Either create one (escalate to `/new-feature`) or tell the user the gap exists before proceeding. |
| "I'll preserve the old behavior with a feature flag, just in case."       | No. Don't add backwards-compat shims for hypothetical needs. CLAUDE.md says so.                                                            |

## Exit criterion

Updated spec(s) and new plan committed in a worktree, `npm run spec:validate` clean, user approved the spec diff and the plan, harness:run summary surfaced (or user explicitly declined to run).
