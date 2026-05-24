---
name: maintain-backlog
description: Reconcile `docs/backlog.yaml` (the `npm run backlog` TUI's data) against merged PRs and on-disk spec/plan files. Propose status updates for review.
user_invocable: true
---

# /maintain-backlog

Audit skill for keeping the backlog item backlog (`docs/backlog.yaml`) in sync with reality. `npm run backlog` is read-only — this skill is how the YAML gets corrected when items ship.

This skill produces a proposed patch for the YAML, not a code change. The user reviews and accepts each item.

**All file writes must happen in a worktree.** Before writing any YAML updates, enter a worktree. Use the Agent tool with `isolation: "worktree"` for the patch step. Never edit `docs/backlog.yaml` directly on main.

**Always rebase before pushing or opening a PR.** Run `git fetch origin main && git rebase origin/main` in the worktree before pushing. Squash-merged PRs from other worktrees can silently diverge — rebasing keeps the patch applying cleanly.

## Flow

### 1. Load the backlog

Read `docs/backlog.yaml`. Parse every entry's `id`, `name`, `status`, `pr`, `spec`, `plan`. Record the line ranges so the proposed patch can show exact diffs.

### 2. Reconcile each item against ground truth

For each item, run the checks below and record what you find. Do not mutate the YAML yet.

**A. PR field reconciliation**
- If `pr:` is set, run `gh pr view <url> --json state,mergedAt,title` and capture state.
- If the PR is `MERGED` and `status: shipped` — OK.
- If the PR is `MERGED` and status is anything else — propose `status: shipped`.
- If the PR is `OPEN` and `status: in-progress` — OK.
- If the PR is `OPEN` and `status: todo` — propose `status: in-progress`.
- If the PR is `CLOSED` (not merged) — flag for user review; do not auto-propose.

**B. Search for unlinked merged PRs**
- For any item with `pr: null`, run `gh pr list --state merged --search "<id>" --json number,title,url,mergedAt`.
- Also try `gh pr list --state merged --search "<name>" --json number,title,url,mergedAt` as a fallback when id-search returns nothing.
- If exactly one merged PR matches, propose populating `pr:` with its URL and setting `status: shipped`.
- If multiple match, list them and ask the user to pick — do not guess.

**C. On-disk spec/plan presence**
- For each item, check whether `spec:` and `plan:` paths exist on disk (`ls -1 <path>`).
- If the paths are populated but the files are missing — flag as stale reference.
- If a spec/plan file exists in `harness/specs/` or `harness/plans/` matching `<id>-*` but isn't referenced in the YAML — propose populating the field.
- Spec/plan presence on disk does **not** by itself imply `shipped`; it only implies the work has been scoped.

**D. in-progress items without a PR**
- Any item with `status: in-progress` and `pr: null` — flag for user review. Either it needs a PR link or the status should revert to `todo`.

### 3. Present the reconciliation report

Show the user a compact table grouped by proposed action:

```
PROPOSED STATUS CHANGES
id   | name                       | current      | proposed     | evidence
-----+----------------------------+--------------+--------------+--------------------------------
4    | Reverie phase machine      | todo         | shipped      | PR #348 (merged 2026-05-14)
7    | Soil health v2             | in-progress  | shipped      | PR #353 (merged 2026-05-19)

PROPOSED FIELD ADDITIONS
id   | field   | proposed value
-----+---------+----------------------------------------------------
6    | spec    | harness/specs/RP-6-hex-grid-renderer.yaml
6    | plan    | harness/plans/RP-6-hex-grid-renderer.yaml

FLAGS (no auto-proposal — user decision)
id   | issue
-----+----------------------------------------------------------------
9    | status: in-progress but pr: null
12   | spec: harness/specs/RP-12-foo.yaml referenced but file missing
```

For each proposed change, the evidence column must cite the concrete signal (PR number + merge date, or filename). No "looks shipped to me" — every proposal traces to a verifiable fact.

### 4. Apply approved patches

For each accepted change, edit `docs/backlog.yaml` in a worktree. Preserve:
- field order (`id, name, summary, depends_on, status, spec, plan, pr, notes`)
- existing `notes:` text — never rewrite or remove notes without explicit approval
- existing blank lines between entries (the file is diff-tuned)
- exact indentation (two spaces)

After edits, verify the file still parses by running the TUI briefly: `npm run backlog` and quitting (`q`) immediately. If it crashes, the YAML is malformed — fix and retry.

### 5. Commit and PR

In the worktree, commit with a message like:

```
Maintain backlog: mark RP-N shipped, populate RP-M PR link

Reconciled docs/backlog.yaml against merged PRs.
```

Open a draft PR per the user's standard git/PR conventions.

## Anti-rationalizations

| Excuse the agent will tell itself | Rebuttal |
| --- | --- |
| "The PR title obviously matches this item — I'll mark it shipped." | Cite the PR url and merged date. Title-matching is an evidence step, not a conclusion. |
| "Spec file exists, so it must be shipped." | Spec presence ≠ shipped. It only means scoping happened. Only a merged PR justifies `status: shipped`. |
| "I'll bundle all the status flips into one patch since they're all obvious." | Present each item as a separate proposed change in the report. The user may want to accept some and reject others. |
| "I'll rewrite the `notes:` field while I'm in there — it's stale." | Never touch `notes:` unprompted. The user owns that field. If a note is stale, surface it as a flag. |
| "I can edit the YAML directly on main since it's just a status flip." | All writes go through a worktree. Even one-line YAML changes. |
| "The TUI will catch malformed YAML — I don't need to verify after editing." | Run `npm run backlog` and quit. A crash before the dashboard renders is the only proof the parse succeeded. |

## Exit criterion

Reconciliation report presented with PR-cited evidence for each proposed change, user approval recorded per item, accepted patches applied in a worktree, YAML re-parsed cleanly via `npm run backlog`, draft PR opened.
