---
name: churn
description: Pick the next precis item from docs/precis-status.yaml and route to the right harness skill, so you can churn through the backlog without deciding what's next
user_invocable: true
arg: optional — `skip` to surface the next candidate instead of the top one
---

# /churn

Setup wrapper that removes the "what's next?" decision. Reads `docs/precis-status.yaml`, auto-picks one item, asks you the route (feature vs change), and hands off to the right harness skill with the precis summary as the description.

`/churn` flips the picked item to `in-progress` on main and commits before handing off, so parallel `/churn` sessions can't pick the same item. The downstream skill still owns spec/plan/worktree/PR — `/churn`'s only write is the one-line status flip.

## Flow

### 1. Load the backlog

Read `docs/precis-status.yaml`. For every entry, capture `id`, `name`, `summary`, `depends_on`, `status`, `spec`, `plan`, `pr`, `notes`, and the line number where its `status:` field lives (needed for step 5's edit).

Before picking, verify the working tree is on `main` and clean (`git status --porcelain` empty, `git rev-parse --abbrev-ref HEAD` is `main`). If not, abort with a message explaining why — the flip-and-commit step requires a clean main. The user may need to stash, switch, or finish in-flight work first.

Field shape and the "NEXT = all deps shipped" rule are defined in `tools/precis/data.ts` — mirror that logic when reading the YAML, but do not import the module.

### 1b. Detect suspected-in-flight work from git/gh state

YAML status can lag reality — a worktree or PR can exist before the `todo → in-progress` flip lands, or after the flip got reverted. Gather three deterministic signals and join them against the precis ids loaded in step 1.

Run these in parallel:

- `git worktree list --porcelain` — local worktrees
- `git for-each-ref --format='%(refname:short)' refs/remotes/origin` — remote branches (do not run `git fetch`; use what's already there)
- `gh pr list --state open --json number,headRefName,title --limit 100` — open PRs

For each branch name, worktree branch, or PR head ref, apply this regex to extract a precis id:

```
^(?:worktree-)?precis-(\d+[a-z]?)-
```

Drop names that don't match (e.g. `precis-thinktank-v10-round-2`, `churn-immediate-flip`). For matches, build a per-id evidence list naming the source(s): `worktree:<path>`, `remote-branch:<name>`, `open-pr:#<n>`.

An id has evidence if it appears in any of the three lists. Reconcile against YAML status:

- YAML `in-progress` + evidence → confirmed in-flight (no surprise).
- YAML `todo` + evidence → **suspected in-flight** (the gap this step exists to catch). Promote into the in-flight bucket in step 2.
- YAML `shipped` + evidence → **stale branch/worktree suspected**. Do not promote. Surface as a one-line warning at the end of step 3 suggesting `/git-cleanup`.
- No YAML match → ignore (not a precis item).

### 2. Auto-pick one item

Apply this order, first match wins:

a. **In-flight wins.** Any item that is either `status: in-progress` in the YAML *or* flagged suspected-in-flight in step 1b, sorted by id ascending (alpha-suffix convention: `8a < 8b < 9 < 10`). If any exist, surface the lowest. Finishing in-flight work outranks starting new work.

b. **Otherwise, NEXT candidates.** Items with `status: todo` whose `depends_on` ids all resolve to `status: shipped` in the same file, and which were not already promoted in (a). Sort by id ascending. Take the lowest.

c. **If neither bucket yields a candidate**, report "no eligible items — everything is blocked or shipped" and exit. Suggest `/maintain-backlog` in case shipped items haven't been reconciled against merged PRs.

If the user passed `skip` (or `next`) as an argument, exclude any previously-surfaced ids in this conversation and pick the next candidate by the same rules. Cap at three skips per invocation, then stop and ask the user to run `npm run backlog` for a wider view.

### 3. Present the pick

Show a compact block:

- `precis-{id}` — `{name}`
- The full `summary`, verbatim
- `depends_on:` resolved to names, with shipped status confirmed (e.g. `['0' Reclaim Revery ✓, '1' Multi-species Flora ✓]`)
- First two paragraphs of `notes` if present, truncated with `…` if longer
- Spec/plan status: whether the paths in `spec:` / `plan:` are populated, and whether the files exist on disk
- Existing `pr:` link, if any
- **In-flight evidence** if the pick was promoted in step 1b: list the sources (e.g. `worktree:.claude/worktrees/precis-23-time-lapse-camera, open-pr:#440`). Call out the YAML mismatch explicitly if YAML still says `todo` — the user may want to resume the existing worktree rather than start fresh.

After the pick block, if step 1b flagged any **stale** ids (YAML `shipped` + evidence), append a one-line warning per id naming the branch/worktree/PR and suggesting `/git-cleanup`.

End with: "Run `/churn skip` to try the next candidate, or pick a route below."

### 3b. Suggest a session rename

Build a short kebab-case slug from the precis `name`: lowercase, hyphen-separated, drop articles and short prepositions, target 2–4 words. Examples:

- `name: "Time-lapse Camera"` → `time-lapse-camera`
- `name: "Angels are passages"` → `angels-passages`
- `name: "Reclaim Revery"` → `reclaim-revery`

Combine as `precis-{id}-{slug}` and emit one line to the user, verbatim formatting:

```
Suggested session name — run `/rename precis-{id}-{slug}` to label this session in the prompt bar.
```

`/churn` does not call `/rename` itself — built-in slash commands are user-only. The user types it (or skips it) before routing. Do not block on this; flow continues straight into step 4.

### 4. Ask the routing question

Use `AskUserQuestion` with two options:

- `/new-feature` — adds new behavior to the game *(Recommended)*
- `/change-request` — modifies existing documented behavior

Precis items are roadmap features, so `/new-feature` is the default. The "Other" affordance lets the user pick `/bug-report` or `/quick-fix` on the rare occasion that a precis item turns out to be a fix in disguise.

### 5. Flip and commit on main

Before handing off, claim the item by flipping its status on main:

1. If the picked item is already `in-progress`, skip this step entirely (no edit, no commit).
2. Otherwise, edit `docs/precis-status.yaml` at the line captured in step 1: change `status: todo` → `status: in-progress`. Leave every other entry untouched.
3. Stage just that file: `git add docs/precis-status.yaml`.
4. Commit with a one-line subject: `Mark precis-{id} in-progress` (no body, no co-author trailer needed — this is a status claim, not a feature commit).
5. Do not push. The downstream skill's branch will be cut from this commit on main.

If the commit fails (pre-commit hook, lint, etc.), stop and surface the error — do not retry, do not bypass with `--no-verify`. The user has to resolve before churn can hand off.

### 6. Hand off

Synthesize a description string with these parts, in order:

1. One sentence naming the precis id and name. Example: `Implement precis-13 (Angels are passages).`
2. The full precis `summary`, verbatim.
3. A one-line "deps:" trailer naming the shipped dependencies (for context).
4. A one-line note: `Status already flipped to in-progress on main (commit {sha}). Do not re-flip inside the worktree.`

5. **If the pick has in-flight evidence from step 1b**, append a "resume context" trailer listing each evidence source verbatim, so the downstream skill knows to enter the existing worktree (`EnterWorktree path:<path>`) rather than create a new one. Example: `Resume context: an existing worktree at .claude/worktrees/precis-23-time-lapse-camera and open PR #440 already exist for this id — enter the existing worktree instead of creating a new one.`

Invoke the chosen skill via the `Skill` tool, passing the synthesized description as `args`. Control transfers to the downstream skill; `/churn` is done.

## Anti-rationalizations

| Excuse the agent will tell itself | Rebuttal |
| --- | --- |
| "The user said 'don't make me decide' — skip the routing question too." | The route (feature vs change) is a product decision the user wants to keep. `/churn` removes the *picking* decision, not the *scoping* one. |
| "I'll delegate the flip to the downstream worktree to keep main clean." | No. The flip must land on main *before* handoff so parallel `/churn` runs see the item as claimed. The collision risk outranks the worktree-purity preference for this one-line status edit. |
| "Main isn't clean — I'll stash and proceed." | No. Abort and surface the dirty state to the user. Auto-stashing hides in-flight work and the recovery is not obvious. |
| "This precis item is huge — I'll suggest carving it into a slice." | The user explicitly opted out of scoping prompts. Pass the summary through verbatim. The downstream skill's own clarifying questions will surface scope if needed. |
| "Multiple `in-progress` items exist — I'll ask the user which to finish." | No. Auto-pick the lowest id. The user said "no menu." If they want a different one, they'll redirect. |
| "I'll search merged PRs to confirm `shipped` deps are really shipped." | The YAML is the source of truth for status. `/maintain-backlog` reconciles against PRs — don't duplicate that work here. |
| "The downstream skill always re-asks for a description — I'll skip steps 3–6." | The presented block is your evidence to the user that the right item was picked, and the flip on main is what prevents collisions. Without steps 3–4 they can't redirect; without step 5 a parallel `/churn` will collide. Keep all four steps. |
| "Worktree-detection found something but YAML disagrees — I'll fix the YAML before flipping." | The step-5 flip already moves YAML `todo` → `in-progress` for suspected-in-flight picks. Don't pre-edit YAML in step 1b or step 3 — surface the mismatch in the pick block, let step 5 do the single write. For YAML `shipped` + evidence (stale), do not flip at all; emit the `/git-cleanup` warning and move on. |
| "I'll `git fetch` before checking remote branches so the signal is fresh." | No. Fetching can be slow and has side effects on the user's local state. Use what's already there and note potential staleness if it matters. |
| "Multiple worktrees match the same precis id — I'll pick the newest one." | Don't pick. List both in the evidence trailer (and in the handoff "resume context") and let the user choose which to enter. |

## Exit criterion

Either:

- The picked item is `in-progress` on main (either by the new commit from step 5, or because it was already in-progress when picked), the downstream harness skill is now running with the precis description in its working context, and the user has approved the route; or
- No eligible candidates exist, reported clearly with `/maintain-backlog` as the suggested next action; or
- Main was not clean / not checked out, and `/churn` aborted with a message explaining why.
