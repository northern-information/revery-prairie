---
name: churn
description: Pick the next precis item from docs/precis-status.yaml and route to the right harness skill, so you can churn through the backlog without deciding what's next
user_invocable: true
arg: optional — `skip` to surface the next candidate instead of the top one
---

# /churn

Setup wrapper that removes the "what's next?" decision. Reads `docs/precis-status.yaml`, auto-picks one item, asks you the route (feature vs change), and hands off to the right harness skill with the precis summary as the description.

`/churn` itself writes nothing. The downstream skill owns spec/plan/worktree/PR. The precis status flip (`todo` → `in-progress`) is delegated into the downstream worktree, never applied on main.

## Flow

### 1. Load the backlog

Read `docs/precis-status.yaml`. For every entry, capture `id`, `name`, `summary`, `depends_on`, `status`, `spec`, `plan`, `pr`, `notes`, and the line number where its `status:` field lives (needed for step 5).

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

### 5. Hand off

Synthesize a description string with these parts, in order:

1. One sentence naming the precis id and name. Example: `Implement precis-13 (Angels are passages).`
2. The full precis `summary`, verbatim.
3. A one-line "deps:" trailer naming the shipped dependencies (for context).
4. This exact instruction block, so the downstream skill sees it as a checklist:

   ```
   As part of this branch (after entering the worktree, before drafting the spec):
   1. Edit docs/precis-status.yaml at line {N}: flip `status: todo` → `status: in-progress`. If the item is already `in-progress`, leave it alone.
   2. Verify the YAML still parses by running `npm run backlog` and quitting with `q`.
   ```

   `{N}` is the line number captured in step 1.

Invoke the chosen skill via the `Skill` tool, passing the synthesized description as `args`. Control transfers to the downstream skill; `/churn` is done.

## Anti-rationalizations

| Excuse the agent will tell itself | Rebuttal |
| --- | --- |
| "The user said 'don't make me decide' — skip the routing question too." | The route (feature vs change) is a product decision the user wants to keep. `/churn` removes the *picking* decision, not the *scoping* one. |
| "I'll pre-flip the YAML in `/churn` itself before handing off." | No. `/churn` runs on main; the status flip belongs in the downstream worktree. Bake it into the handoff description instead. |
| "This precis item is huge — I'll suggest carving it into a slice." | The user explicitly opted out of scoping prompts. Pass the summary through verbatim. The downstream skill's own clarifying questions will surface scope if needed. |
| "Multiple `in-progress` items exist — I'll ask the user which to finish." | No. Auto-pick the lowest id. The user said "no menu." If they want a different one, they'll redirect. |
| "I'll search merged PRs to confirm `shipped` deps are really shipped." | The YAML is the source of truth for status. `/maintain-backlog` reconciles against PRs — don't duplicate that work here. |
| "The downstream skill always re-asks for a description — I'll skip steps 3–5." | The presented block is your evidence to the user that the right item was picked. Without it they can't redirect before the handoff. Keep all three steps. |

## Exit criterion

Either:

- The downstream harness skill is now running, with the precis description and YAML-flip instructions in its working context, and the user has approved the route; or
- No eligible candidates exist, reported clearly with `/maintain-backlog` as the suggested next action.
