---
name: thinktank
description: Stage a new round of the precis thinktank — Astrid, Boon, Calla, Delta argue a design question, then append the round to a `docs/precis-thinktank-v*.md` doc
user_invocable: true
---

# /thinktank

Conversational skill for running a new round of the precis thinktank. The thinktank is the editorial back-and-forth where design decisions get hashed out before they become specs. See `docs/precis-thinktank-v4.md` for the running document; v1–v3 are the archive.

## The cast

These voices are stable across versions. Honor them.

- **Astrid** — vision purist. Defends precis themes literally. Tests every proposal against the five-line cosmology (heat death is the antagonist; tending is the verb; the tenure is the unit; the lineage is the medium; the inventory is the character sheet). Quotes Dickinson, points at tone. Says "no" when a mechanic would humanize what the cosmology forbids.
- **Boon** — systems-first. Every loop should compound. Talks in substrate, dependencies, perf budgets, file paths, LOC. Names the smallest spec that earns its keep. Will scope a thing down before scoping it up.
- **Calla** — player-experience pragmatist. Asks "what does the next session feel like?" Separates mastery / commitment / loss when they get conflated. Will defend a feeling against a system if the feeling is load-bearing.
- **Delta** — late-arriving frame-breaker. Joined in v4. Renames things. Says the unfashionable true thing. Coins the line the round ends up being remembered by ("permanence is a capitalist assumption", "the camera does not know"). Often the one who pushes a round toward consensus by reframing the question.

A round usually has all four. If a round is narrower, drop the voices that have nothing to add — don't pad. Tyler is **never** a voice in the round body; Tyler's contribution is the seed quote at the top.

## Flow

### 1. Pick the target doc

List `docs/precis-thinktank-v*.md` (newest first). Ask the user which doc to append to. Default to the highest-numbered one. If the highest is closed (has a `## Verification` section that reads like a sign-off), offer to start a new version — `docs/precis-thinktank-v{N+1}.md` — and seed it with a short preamble that references the previous version the same way v4's preamble references v2/v3.

Wait for the answer before continuing.

### 2. Gather the round

Ask conversationally — don't dump all the questions at once. Get the seed first, then layer in the rest only if the user hasn't already volunteered them.

- **The seed.** What did Tyler bring to the room? A question, a worry, an offhand observation. This becomes the `_Tyler: "…"_` epigraph under the round heading. Quote him verbatim if he gave you a sentence; paraphrase faithfully and confirm if he gave you a sketch.
- **Who's in the room.** Default: all four. Ask only if the seed obviously narrows it (e.g. a pure perf question may not need Astrid).
- **What's already locked.** If the seed touches a system that already has shipped specs or v3/v4 locks, name them so the round doesn't relitigate settled ground. Skim `docs/precis-status.yaml` and the target doc's top-matter ("Locked in v4" / "Open in v4") for context.
- **Optional sub-sections.** Long rounds (see Round 7 and 8 in v4) organize the dialogue under `###` sub-headings. If the seed has multiple distinct facets, suggest a sub-section spine and confirm.

### 3. Find the next round number

Grep the target doc for `^## Round ` and pick `max + 1`. Rounds are numbered globally per doc, not per arc.

### 4. Draft the round

Match the established format exactly:

```markdown
## Round N: short evocative title

_Tyler: "the seed quote, verbatim or faithful paraphrase."_

> **Astrid:** Her line.

> **Boon:** His line.

> **Calla:** Her line.

> **Delta:** His line.

### Consensus

- Bulleted decisions. Each bullet is something that could be acted on.

### Tracked as

- **`#NN Title (short)`** — size, deps, one sentence on what it is. New items get the next free integer id in `docs/precis-status.yaml`.
- **Amendment to `#NN`:** if a round modifies the scope of an already-tracked item, say so explicitly.

### Open questions deferred to specs

- Bullet, with the character whose worry it is in parens. Only include if the round genuinely left questions open. Don't manufacture them.
```

Voice discipline:

- Each character's paragraph should sound like that character. Astrid quotes the cosmology and gets italicized aphorisms. Boon names files, LOC, perf, and dependency edges. Calla talks about session-shape and feeling. Delta delivers the line the round gets remembered by.
- Use the long-paragraph blockquote style of the existing rounds — these are not Slack messages. A character's turn is usually 3–6 sentences and may carry an italicized refrain.
- Italicize Tyler-style asides and aphorisms with `_..._` inside the blockquote, matching v4 prose.
- Sentence case for prose. Backticks around identifiers, file paths, and item ids like `#23`. Don't escape backticks anywhere.
- Don't invent new lore. Don't author EVA tokens, pierce words, or any Voynich content. Don't write manual lore. If the round implies a need for any of those, flag it as an open question for a human to author.

Sub-sections, if used, look like Round 8 — short headed segments with the same blockquote style inside each. End with `### Consensus`, then `### Tracked as`, then `### Open questions deferred to specs`.

### 5. Show and confirm

Show the user the drafted round in chat before writing. Ask for revisions. Iterate until they accept it. Voices are easy to get slightly wrong — expect at least one pass.

### 6. Append

Append the round to the target doc just above the `## Verification` section if one exists, otherwise at the bottom. Add a blank line and a horizontal rule (`---`) before the new round if the previous round didn't already end with one (the v4 rounds use `---` separators between rounds).

### 7. Update `docs/precis-status.yaml`

For every new `#NN` item in the round's `### Tracked as` section, append an entry to `features:` in `docs/precis-status.yaml`. **Field order is locked** (per the header comment in the YAML) — match it exactly:

```yaml
  - id: 'NN'
    name: Title (matches the round's "Tracked as" line)
    summary: >
      Block-scalar prose, ~3–6 lines, wrapped narrow. Describe the mechanic
      itself, not its motivation. Motivation goes in notes.
    size: XS|S|M|L
    depends_on: ['NN', 'NN']   # or [] if none
    status: todo
    spec: null
    plan: null
    pr: null
    notes: >
      Block-scalar prose. Always start with the thinktank reference:
      "v{N} thinktank round {R} ({YYYY-MM-DD})." Then capture the round's
      reasoning — the line the room locked, which character's worry
      shaped the scope, any open questions deferred to spec.
```

Rules:

- New entries always start at `status: todo`, with `spec`, `plan`, `pr` all `null`. The thinktank doesn't ship code; it stages it.
- `size` reflects the room's sense of scope. If the round didn't agree on a size, default to `S` and note "size TBD at spec" in `notes`.
- `depends_on` is whatever the round named as a precondition. Use string ids in single quotes — `'23'`, not `23`. Items like `#8b` keep the letter.
- Use the `>` block-scalar form for both `summary` and `notes`. Match the wrap width of nearby entries (~60–70 chars). Don't use `>-` or `|`.
- Insert the new entry at the end of `features:`, after the highest existing id. Don't try to keep ids sorted — the file is roughly chronological, not numeric.

For **amendments** to already-tracked items (round says `**Amendment to #NN:**`), don't add a new entry. Instead, append a paragraph to the existing item's `notes` field starting with the thinktank reference. If the amendment changes scope, also update `summary`, `size`, or `depends_on` in place — but flag those changes in your end-of-flow summary so the user sees them.

For **status changes** (a round confirms an item shipped, or moves something to `in-progress`), update `status` and add a `notes` paragraph with the thinktank reference. Don't fabricate PR urls; if the round mentions a PR number, use it, otherwise leave `pr: null`.

### 8. Update the doc's top-matter Locked / Open lists

If the target doc has a `## Open and locked` section (v4 does), and the round produced:

- A new lock — add a bullet under `**Locked in v{N}:**` (or create a `**Locked in round {R}:**` subsection if the round itself produced multiple locks worth grouping, the way v4 Round 4 did).
- A resolution of a previously-open question — remove the matching bullet from `**Open in v{N}:**` and add the resolution under Locked.
- A new open question — add a bullet under `**Open in v{N}:**` with the same one-sentence framing the existing bullets use.

If the doc has no top-matter Locked/Open section, skip this step.

### 9. Done

Show the user:

- The file path of the target thinktank doc and a one-line summary of the round (number + title).
- The list of new `#NN` entries added to `precis-status.yaml`.
- Any in-place edits to existing entries (amendments, status changes).
- Any top-matter Locked/Open list changes.

That's the paperwork done. The user can `npm run backlog` to see the new items in the TUI.

## Constraints

- Never write lore, EVA tokens, pierce words, or Voynich content (see `docs/claude/egregores.md`, `docs/claude/manual.md`). The thinktank can _name_ a need for those; humans author them.
- Never voice Tyler in the round body. The seed quote is the only Tyler surface.
- Never relitigate items that are marked locked in the target doc's top-matter without explicit user direction. If a round needs to amend a lock, mark it `**Amendment to v3:**` (or appropriate version) the way v4 does.
- The word "invasive" is banned player-facing and is also worth avoiding in thinktank prose about egregores; use "metabolic" or "of-but-not-of" as v4's Round 8 established.
