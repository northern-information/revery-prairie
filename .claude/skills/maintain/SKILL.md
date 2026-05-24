---
name: maintain
description: Run all maintain-* skills in parallel and aggregate into one combined report. Read-only audit pass across harness, backlog, manual, and tests.
user_invocable: true
---

# /maintain

Macro skill. Spawns each `maintain-*` skill as a parallel sub-agent, then stitches their reports together. Use this at the start of a session, after a big merge, or before a release to get a single health snapshot of the project.

This skill is read-only. Sub-agents run the **audit phase** of each child skill — they do not enter worktrees, do not edit files, and do not open PRs. The output is a combined report; the user decides which child skill to run for real to apply fixes.

## Children

The following `maintain-*` skills are composed:

- `/maintain-harness` — spec/code drift, harness module test coverage
- `/maintain-backlog` — `docs/backlog.yaml` vs merged PRs and on-disk specs/plans
- `/maintain-manual` — manual lore gaps, dangling cross-refs, entry preview
- `/maintain-tests` — vitest runtime, parallelization risks, coverage

If a new `maintain-*` skill is added under `.claude/skills/`, update this list.

## Flow

### 1. Discover child skills

```bash
ls .claude/skills/ | grep '^maintain-'
```

Confirm the list matches the **Children** section above. If a new `maintain-*` exists that isn't listed here, surface it at the top of the report and ask whether to include it this run. If a listed skill is missing on disk, surface that too.

### 2. Spawn parallel sub-agents

Issue one `Agent` call per child skill, **all in a single message** so they run concurrently. Use the general-purpose subagent. Each prompt must:

- Tell the agent which SKILL.md to read in full (`.claude/skills/<name>/SKILL.md`)
- Restrict it to the **audit / report phase only** — explicitly forbid worktrees, file edits, commits, and PRs
- Ask for the report in the exact format the child skill defines
- Cap response length where the child skill is verbose (e.g. `/maintain-manual` table can be summarized — full entry preview omitted from the macro report)

Example prompt skeleton (adapt per child):

> Read `.claude/skills/maintain-harness/SKILL.md` in full and execute steps 1–3 (scan specs, check each spec, check harness health). Do **not** draft patches, do **not** enter a worktree, do **not** edit files. Return the drift report in the exact format the skill describes, plus a one-line summary at the top. Cite file:line evidence for every finding. If `npm run spec:validate` fails, include its output verbatim.

For `/maintain-tests`, allow the agent to run `npm test` and (if `@vitest/coverage-v8` is installed) `npm test -- --coverage`. These reads are part of the audit.

### 3. Aggregate

When all four sub-agents return, assemble a single Markdown report with this structure:

```
# /maintain — combined audit (<date>)

## Top-line
- Harness drift: <N specs need updates> / <N total>
- Backlog: <N proposed status changes>, <N flags>
- Manual: <N missing lore>, <N dangling cross-refs>
- Tests: <N slow tests>, <N parallelization risks>, <coverage %>

## Harness drift
<verbatim section from maintain-harness sub-agent>

## Backlog reconciliation
<verbatim section from maintain-backlog sub-agent>

## Manual gaps
<verbatim section from maintain-manual sub-agent>

## Test suite
<verbatim section from maintain-tests sub-agent>

## Suggested next steps
<ordered list — which child skill to run for real, and why>
```

Do not editorialize within each section. The child skill's report is the source of truth; the macro stitches and ranks, it does not rewrite.

### 4. Rank next steps

In the **Suggested next steps** section, order child skills by urgency:

1. Anything that breaks CI or blocks shipping (failing `spec:validate`, failing tests, malformed YAML)
2. Drift between code and contract (harness specs vs source, backlog vs merged PRs)
3. Content gaps (manual lore, cross-refs)
4. Quality improvements (test perf, coverage)

Cite the concrete finding that drives each ranking. "Run `/maintain-backlog` first — 3 merged PRs are unlinked" is useful; "Run `/maintain-backlog` first" is not.

### 5. Stop

Do not prompt to apply fixes from the macro. The user runs the individual child skill (`/maintain-harness`, etc.) when they want to actually patch something. The macro's job is the snapshot, not the surgery.

## Anti-rationalizations

| Excuse the agent will tell itself | Rebuttal |
| --- | --- |
| "I'll run the children sequentially — easier to reason about." | Parallel is the point. The user picked this shape. Run them in one message of four `Agent` calls. |
| "Sub-agent N is slow, I'll just summarize from the skill description instead of waiting." | Wait for the agent. A skipped child is a lie in the combined report. |
| "I'll start applying obvious fixes from the report while the user reads." | Macro is read-only. Stop at the report. |
| "Three child skills are clean — I'll skip them in the report." | Include every section, even the empty ones. The user is checking that all four ran. A missing section reads as a missing run. |
| "I'll merge the four sub-agent reports into prose for readability." | Keep child sections verbatim. The user knows the child report format; rewriting it loses cited evidence and breaks trust between this skill and its children. |
| "Test coverage isn't installed — I'll install it before spawning /maintain-tests." | The child skill handles that decision (report-only). Don't pre-empt it. |

## Exit criterion

Combined Markdown report presented covering all four child skills, with a top-line summary, verbatim child sections, and an ordered next-steps list citing concrete findings. No worktree entered, no files modified, no PRs opened.
