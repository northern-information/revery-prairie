---
name: churn
description: Pick the next backlog item from docs/backlog.yaml and route to the right harness skill, so you can churn through the backlog without deciding what's next
user_invocable: true
arg: optional — `skip` to surface the next candidate instead of the top one
---

# /churn

Setup wrapper that removes the "what's next?" decision. Reads `docs/backlog.yaml`, auto-picks one _new_ item to start, asks you the route (feature vs change), and hands off to the right harness skill with the backlog item summary as the description.

`/churn` only suggests **new** work — never in-progress or suspected-in-flight items. The user already knows what's in flight (their active worktrees and open PRs); they don't need `/churn` to redirect them to finish it. Finishing in-flight work is a separate session-management concern, not a queueing decision.

`/churn` flips the picked item to `in-progress` on main and commits before handing off, so parallel `/churn` sessions can't pick the same item. The downstream skill still owns spec/plan/worktree/PR — `/churn`'s only write is the one-line status flip.

## Flow

### 1. Load the backlog

Read `docs/backlog.yaml`. For every entry, capture `id`, `name`, `summary`, `depends_on`, `status`, `spec`, `plan`, `pr`, `notes`, and the line number where its `status:` field lives (needed for step 5's edit).

Before picking, verify the working tree is on `main` and clean (`git status --porcelain` empty, `git rev-parse --abbrev-ref HEAD` is `main`). If not, abort with a message explaining why — the flip-and-commit step requires a clean main. The user may need to stash, switch, or finish in-flight work first.

Field shape and the "NEXT = all deps shipped" rule are defined in `tools/backlog-tui/data.ts` — mirror that logic when reading the YAML, but do not import the module.

### 1b. Detect suspected-in-flight work from git/gh state

YAML status can lag reality — a worktree or PR can exist before the `todo → in-progress` flip lands, or after the flip got reverted. We detect this not to _pick_ in-flight items (we never do), but to (i) exclude them from the NEXT pool so we don't propose starting fresh on something that already has a worktree, and (ii) emit a stale-branch warning when a `shipped` item has lingering artifacts.

Gather signals from two layers (external name-based, and per-worktree file-based) and join them against the backlog ids loaded in step 1.

**External signals — run in parallel:**

- `git worktree list --porcelain` — local worktrees with their paths
- `git for-each-ref --format='%(refname:short)' refs/remotes/origin` — remote branches (do not run `git fetch`; use what's already there)
- `gh pr list --state open --json number,headRefName,title --limit 100` — open PRs

For each branch name, worktree branch, or PR head ref, apply this regex to extract a backlog item id:

```
(?:^|\/|-)RP-(\d+[a-z]?)(?:-|$)
```

Drop names that don't match (e.g. `backlog-thinktank-v10-round-2`, `churn-immediate-flip`). For matches, record per-id evidence naming the source(s): `worktree:<path>`, `remote-branch:<name>`, `open-pr:#<n>`.

**Per-worktree internal scan — for each local worktree from the list above:**

Branch names lie (renames, typos, ad-hoc names) but the artifacts being edited don't. For each worktree path, gather changed files from both committed and uncommitted state:

- `git -C <path> diff --name-only main` — files modified relative to main
- `git -C <path> status --porcelain` — uncommitted working-tree changes

From the union of those paths, extract evidence:

- Filename matches `^harness/(specs|plans)/RP-(\d+[a-z]?)-` → strongest signal; the id is in the path. Record `spec:<path>:<file>` or `plan:<path>:<file>`.
- `docs/backlog.yaml` is in the changed set → read the worktree's copy and compare each entry's `status` against `main`'s copy (use `git -C <path> show main:docs/backlog.yaml`). Any id whose status differs is evidence; record `yaml-flipped:<path>:<id>:<old>→<new>`.
- Any `docs/backlog-thinktank-v*.md` is in the changed set → weak signal of active doc work. Record `thinktank:<path>:<file>` but do **not** derive a backlog item id from it (thinktank rounds aren't backlog items).

Use `git -C <path>` so each scan runs against the worktree, not the main checkout. Do not `cd` into the worktree.

**Reconcile against YAML status — build two sets of ids:**

- `inFlightIds` — ids to exclude from the NEXT pool:
  - YAML `in-progress` (any item, with or without evidence).
  - YAML `todo` + any backlog-id evidence (external or internal). YAML lags reality.
  - Branch matches the regex but the worktree has no internal-scan evidence → still treat as in-flight (`branch-only`); the user may want to finish or abandon it manually.
- `staleIds` — ids to warn about:
  - YAML `shipped` + any backlog-id evidence — _unless_ the only evidence for that worktree is `thinktank:`, in which case the worktree is doing legitimate non-backlog doc work; suppress the warning.

Thinktank-only evidence with no branch-name match → ignore for backlog-id purposes. No YAML match → ignore (not a backlog item).

### 2. Auto-pick one NEW item

Apply this order, first match wins:

a. **NEXT candidates.** Items with `status: todo` whose `depends_on` ids all resolve to `status: shipped` in the same file, and whose id is **not** in `inFlightIds` from step 1b. Sort by id ascending (alpha-suffix convention: `8a < 8b < 9 < 10`). Take the lowest.

b. **If no candidate**, report "no eligible new items — everything is blocked, in-flight, or shipped." If `inFlightIds` is non-empty, list them so the user knows what to finish before churn can suggest something new. Otherwise suggest `/maintain-backlog` in case shipped items haven't been reconciled against merged PRs.

If the user passed `skip` (or `next`) as an argument, exclude any previously-surfaced ids in this conversation and pick the next candidate by the same rules. Cap at three skips per invocation, then stop and ask the user to run `npm run backlog` for a wider view.

### 3. Present the pick

Show a compact block:

- `RP-{id}` — `{name}`
- The full `summary`, verbatim
- `depends_on:` resolved to names, with shipped status confirmed (e.g. `['0' Reclaim Revery ✓, '1' Multi-species Flora ✓]`)
- First two paragraphs of `notes` if present, truncated with `…` if longer
- Spec/plan status: whether the paths in `spec:` / `plan:` are populated, and whether the files exist on disk
- Existing `pr:` link, if any (should be `null` for a NEW pick — flag if not)

After the pick block:

- If `inFlightIds` is non-empty, append one line: "Also in flight (not picked): {comma-separated id+name list}." The user can redirect to one of these if they'd rather finish than start new.
- If `staleIds` is non-empty, append a one-line warning per id naming the branch/worktree/PR and suggesting `/git-cleanup`.

End with: "Run `/churn skip` to try the next candidate, or pick a route below."

### 3b. Suggest a session rename

Build a short kebab-case slug from the backlog item `name`: lowercase, hyphen-separated, drop articles and short prepositions, target 2–4 words. Examples:

- `name: "Time-lapse Camera"` → `time-lapse-camera`
- `name: "Angels are passages"` → `angels-passages`
- `name: "Reclaim Revery"` → `reclaim-revery`

Combine as `RP-{id}-{slug}` and emit one line to the user, verbatim formatting:

```
Suggested session name — run `/rename RP-{id}-{slug}` to label this session in the prompt bar.
```

`/churn` does not call `/rename` itself — built-in slash commands are user-only. The user types it (or skips it) before routing. Do not block on this; flow continues straight into step 4.

### 4. Ask the routing question

Use `AskUserQuestion` with two options:

- `/new-feature` — adds new behavior to the game _(Recommended)_
- `/change-request` — modifies existing documented behavior

Backlog items are roadmap features, so `/new-feature` is the default. The "Other" affordance lets the user pick `/bug-report` or `/quick-fix` on the rare occasion that a backlog item item turns out to be a fix in disguise.

### 5. Flip and commit on main

Before handing off, claim the item by flipping its status on main. The pick is always a `todo` (in-flight items are excluded in step 2), so the flip is unconditional:

1. Edit `docs/backlog.yaml` at the line captured in step 1: change `status: todo` → `status: in-progress`. Leave every other entry untouched.
2. Stage just that file: `git add docs/backlog.yaml`.
3. Commit with a one-line subject: `Mark RP-{id} in-progress` (no body, no co-author trailer needed — this is a status claim, not a feature commit).
4. Do not push. The downstream skill's branch will be cut from this commit on main.

If the commit fails (pre-commit hook, lint, etc.), stop and surface the error — do not retry, do not bypass with `--no-verify`. The user has to resolve before churn can hand off.

### 6. Hand off

Synthesize a description string with these parts, in order:

1. One sentence naming the backlog item id and name. Example: `Implement RP-13 (Angels are passages).`
2. The full backlog item `summary`, verbatim.
3. A one-line "deps:" trailer naming the shipped dependencies (for context).
4. A one-line note: `Status already flipped to in-progress on main (commit {sha}). Do not re-flip inside the worktree.`

Invoke the chosen skill via the `Skill` tool, passing the synthesized description as `args`. Control transfers to the downstream skill; `/churn` is done.

## Anti-rationalizations

| Excuse the agent will tell itself                                                               | Rebuttal                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Finishing in-flight work should win over starting new work — I'll surface the in-flight item." | No. `/churn` is for picking _new_ work to start. The user already sees their worktrees and open PRs; they don't need `/churn` to nag them about finishing. Surfacing in-flight as the pick treats finishing as a queueing decision, which it isn't.            |
| "The user said 'don't make me decide' — skip the routing question too."                         | The route (feature vs change) is a product decision the user wants to keep. `/churn` removes the _picking_ decision, not the _scoping_ one.                                                                                                                    |
| "I'll delegate the flip to the downstream worktree to keep main clean."                         | No. The flip must land on main _before_ handoff so parallel `/churn` runs see the item as claimed. The collision risk outranks the worktree-purity preference for this one-line status edit.                                                                   |
| "Main isn't clean — I'll stash and proceed."                                                    | No. Abort and surface the dirty state to the user. Auto-stashing hides in-flight work and the recovery is not obvious.                                                                                                                                         |
| "This backlog item is huge — I'll suggest carving it into a slice."                             | The user explicitly opted out of scoping prompts. Pass the summary through verbatim. The downstream skill's own clarifying questions will surface scope if needed.                                                                                             |
| "I'll search merged PRs to confirm `shipped` deps are really shipped."                          | The YAML is the source of truth for status. `/maintain-backlog` reconciles against PRs — don't duplicate that work here.                                                                                                                                       |
| "The downstream skill always re-asks for a description — I'll skip steps 3–6."                  | The presented block is your evidence to the user that the right item was picked, and the flip on main is what prevents collisions. Without steps 3–4 they can't redirect; without step 5 a parallel `/churn` will collide. Keep all four steps.                |
| "An in-flight item has YAML `todo` — I'll fix the YAML during 1b."                              | No. `/churn` doesn't pick in-flight items, so it doesn't need to flip their YAML status either. Leave the mismatch alone — the worktree where that work lives will reconcile its own YAML when it's done. Only the picked item's YAML gets touched, in step 5. |
| "I'll `git fetch` before checking remote branches so the signal is fresh."                      | No. Fetching can be slow and has side effects on the user's local state. Use what's already there and note potential staleness if it matters.                                                                                                                  |
| "The branch name already identifies the backlog id — skip the internal file scan."              | The branch name is a hint, not proof. A renamed branch, a typo'd branch, or a branch where someone started a different backlog item after creating the worktree all break the regex assumption. The spec/plan filenames embed the id directly; scan them.      |
| "I'll `cd` into each worktree to run the diff."                                                 | No. Use `git -C <path>` so each command operates on the worktree without changing the session's working directory. `cd`-ing into a worktree mid-scan and forgetting to `cd` back leaves later commands operating on the wrong tree.                            |
| "The worktree has thinktank changes only — flag it."                                            | No. Thinktank rounds don't map to a backlog id, so there's nothing to flag. Treat thinktank-only evidence as a "this worktree is alive" marker that suppresses the stale warning, nothing more.                                                                |

## Exit criterion

Either:

- The picked NEW item is `in-progress` on main (by the commit from step 5), the downstream harness skill is now running with the backlog item description in its working context, and the user has approved the route; or
- No eligible new candidates exist, reported clearly — listing in-flight ids if any, and suggesting `/maintain-backlog` if everything else is shipped; or
- Main was not clean / not checked out, and `/churn` aborted with a message explaining why.
