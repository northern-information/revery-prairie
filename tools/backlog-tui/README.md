# Precis dashboard

Terminal kanban for the backlog. Doctrine: `docs/backlog-thinktank-v3.md`. Current state: `docs/backlog.yaml`.

## Run

```
npm run backlog
```

## Keys

- `←` `→` — move between columns
- `↑` `↓` — move within a column
- `enter` / `space` — expand the detail pane (shows `notes` if present)
- `m` — move the selected card to a different status (opens a confirm prompt that writes the YAML and opens a draft PR)
- `r` — reload `docs/backlog.yaml`
- `q` — quit

The TUI also watches the YAML file and reloads on save automatically (debounced 120 ms).

## Moving a card

Press `m` on a selected card to open the move picker. Choose a target status (`todo`, `in-progress`, or `shipped`), press `enter`, then confirm with `y`. The TUI will:

1. Fetch `origin/main` and create a worktree under `.claude/worktrees/` branched from `origin/main`.
2. Rewrite just the matching `status:` line in `docs/backlog.yaml` (preserving comments, blank lines, and field order).
3. Commit, push, and open a draft PR via `gh`.
4. Show the PR URL. Press `o` to open it in the browser, or `enter` to dismiss.

`next` is a derived column — it isn't a writable status. Moving from `next` writes whichever underlying status you pick.

Requires `gh` (`brew install gh`) authenticated via `gh auth login`.

## Editing by hand

You can still edit `docs/backlog.yaml` directly:

```yaml
- id: '0'
  status: shipped     # todo | in-progress | shipped
  spec: harness/specs/reclaim-revery.yaml   # optional
  plan: harness/plans/reclaim-revery.yaml   # optional
  pr: 'https://github.com/.../pull/123'     # optional
  notes: 'anything you want to remember'    # optional
```

The `NEXT` column is computed — any `todo` whose dependencies are all `shipped`. Don't set `status: next` by hand.

## Why a TUI, not a web page

Zero servers, no browser, no game-bundle pollution. The whole tool is one directory (`tools/backlog-tui/`) plus the YAML. Lives outside `src/`, so it doesn't affect typecheck, lint, or test runs for the game itself.
