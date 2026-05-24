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

### 2. Auto-pick one item

Apply this order, first match wins:

a. **In-progress wins.** Any item with `status: in-progress`, sorted by id ascending (alpha-suffix convention: `8a < 8b < 9 < 10`). If any exist, surface the lowest. Finishing in-flight work outranks starting new work.

b. **Otherwise, NEXT candidates.** Items with `status: todo` whose `depends_on` ids all resolve to `status: shipped` in the same file. Sort by id ascending. Take the lowest.

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

End with: "Run `/churn skip` to try the next candidate, or pick a route below."

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

## Exit criterion

Either:

- The picked item is `in-progress` on main (either by the new commit from step 5, or because it was already in-progress when picked), the downstream harness skill is now running with the precis description in its working context, and the user has approved the route; or
- No eligible candidates exist, reported clearly with `/maintain-backlog` as the suggested next action; or
- Main was not clean / not checked out, and `/churn` aborted with a message explaining why.
