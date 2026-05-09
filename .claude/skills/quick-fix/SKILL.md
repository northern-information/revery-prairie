---
name: quick-fix
description: Lightweight fix path for trivial visual or copy bugs — skips spec/plan, still requires regression test and worktree
user_invocable: true
arg: description of the bug
---

# /quick-fix

Lightweight alternative to `/bug-report` for trivial visual fixes (a Tailwind class, a padding value, a copy correction). Skips spec + plan ceremony but keeps the rigor that matters: root-cause investigation, regression test, worktree, draft PR.

**Use this skill when** the fix is a one-to-three-line change to styling, layout, or copy that does not change behavior.

**Use `/bug-report` instead when** the fix touches state mutations, race conditions, control flow, or anything in the engine layer. If you're unsure, default to `/bug-report` — its rigor is the right shape for non-trivial bugs.

**All file writes must happen in a worktree.** Never write directly on main.

**Always rebase before pushing or opening a PR.** Run `git fetch origin main && git rebase origin/main` in the worktree before pushing. Squash-merged PRs from other worktrees can silently diverge from your branch.

## Flow

### 1. Gather reproduction details

Ask clarifying questions:

- How do you reproduce the bug? (a screenshot is often enough)
- What is the expected appearance vs actual?

Wait for answers before proceeding.

### 2. Investigate the root cause

Locate the offending file and line. Provide:

- File path and line number
- Code snippet
- One-sentence mechanism (why this CSS/markup produces the wrong result)

If the investigation reveals the bug is **not** trivial — e.g. it's a state-driven render issue, a stale closure, or anything beyond styling — stop and recommend `/bug-report` instead.

### 3. Propose the fix

Show the user:

- Root cause (file:line + snippet + mechanism)
- The proposed change (one-line diff or close to it)
- A note on what regression test will be added

Wait for approval before proceeding.

### 4. Enter a worktree

Use `EnterWorktree` to create an isolated branch. All subsequent file writes happen inside the worktree. Use **relative paths** for Read/Edit/Write — absolute paths can silently land in the main checkout.

### 5. Add a regression test (red)

Add a focused test asserting the fixed behavior. Run it — it should fail on current code. If it passes, the test isn't actually exercising the bug; rework it before applying the fix.

### 6. Apply the fix (green)

Make the change. Run the same test — it should pass.

### 7. Run scoped verification

Run **only what's relevant**, not the full suite:

- `npm run typecheck`
- `npm run lint`
- The targeted test file (`npx vitest run path/to/affected.test.tsx`)

CI will run the full suite on PR open. Local iteration stays fast.

### 8. Commit, rebase, push, open draft PR

- `git fetch origin main && git rebase origin/main`
- Commit with a sentence-case title summarizing the fix
- Push the branch
- `gh pr create --draft` with a bulleted summary in the body
- Surface the PR URL to the user

## Anti-rationalizations

| Excuse the agent will tell itself | Rebuttal |
| --- | --- |
| "It's a one-line CSS change — no regression test needed." | The test is what stops the bug from coming back. Even a `className` assertion ("does not include `overflow-hidden`") is enough. Skip it and the next refactor will silently re-introduce the clip. |
| "I don't need to enter a worktree for something this small." | Yes you do. The worktree isolates the fix and prevents stray edits to the main checkout. Per project convention, all code changes happen in worktrees. |
| "The targeted test passed without my fix — close enough." | If the test passed before the fix, it isn't the right test. Rework it so it fails red on `main` and passes green on the branch. |
| "This is actually a state bug, but I'm already here — I'll just fix it." | No. Stop and switch to `/bug-report`. State and control-flow bugs need a spec. |
| "Skip the rebase — I just branched." | No. Squash-merged PRs from other worktrees can silently diverge. Always rebase before pushing. |

## Exit criterion

Worktree branch contains: a regression test that failed before the fix and passes after, the fix itself, scoped verification clean (typecheck + lint + the targeted test). Draft PR opened on GitHub with the URL surfaced to the user.
