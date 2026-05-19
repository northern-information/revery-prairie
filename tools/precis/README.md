# Precis dashboard

Terminal kanban for the 13-feature precis rollout. Doctrine: `docs/precis-thinktank-v3.md`. Current state: `docs/precis-status.yaml`.

## Run

```
npm run backlog
```

## Keys

- `←` `→` — move between columns
- `↑` `↓` — move within a column
- `enter` / `space` — expand the detail pane (shows `notes` if present)
- `r` — reload `docs/precis-status.yaml`
- `q` — quit

The TUI also watches the YAML file and reloads on save automatically (debounced 120 ms).

## Editing

The dashboard is read-only. To change status, edit `docs/precis-status.yaml`:

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

Zero servers, no browser, no game-bundle pollution. The whole tool is one directory (`tools/precis/`) plus the YAML. Lives outside `src/`, so it doesn't affect typecheck, lint, or test runs for the game itself.
