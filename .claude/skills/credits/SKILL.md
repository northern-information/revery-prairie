---
name: credits
description: Add a person and their role to the in-game Credits modal
user_invocable: true
arg: optional "Name — Role" or just a name
---

# /credits

Conversational skill for appending a person + role to `src/engine/credits.ts`, the data source for the in-game Credits modal (sys menu → Credits).

## Flow

### 1. Gather details

If the user provided an argument, parse it:

- `Name — Role` or `Name - Role` or `Name: Role` → use both fields
- bare name → ask for the role

Otherwise, ask:

- **Name**: who should be credited? (preserve their preferred casing)
- **Role**: what's their contribution? (Title Case, e.g. `Playtester`, `Sound Design`)

If either field is missing or ambiguous, ask one clarifying question. Don't infer silently.

### 2. Read the current credits

Read `src/engine/credits.ts`. Parse the `CREDITS` array literal — each entry is `{ name: string; role: string }`.

### 3. Decide: append or merge

- If the array contains an entry whose `name` matches the new name **exactly (case-sensitive)**, merge: append `, {newRole}` to the existing `role` string. Do not duplicate a role they already have (compare role strings split on `, ` and trimmed).
- Otherwise, append a new entry to the end of the array.

The order of existing entries must be preserved.

### 4. Write the file

Use the `Edit` tool to update `src/engine/credits.ts`. Keep the file's existing formatting:

- one entry per line inside the array literal
- trailing comma after every entry
- preserve the `as const satisfies readonly Credit[]` suffix
- don't reorder or reformat untouched entries

### 5. Verify

Run `npx tsc -b --noEmit` to confirm the file still compiles. If it fails, show the user the error and offer to revert.

### 6. Confirm

Tell the user what changed:

- new entry: `Added: {Name} — {Role}`
- merged entry: `Updated: {Name} — {existing roles}, {Role}`

Done. The next time the player opens the Credits modal, the new entry is visible.

## Notes

- This skill edits the source file directly. There is no runtime API for adding credits — `CREDITS` is a compile-time constant.
- Casing for `name` is preserved as the user provides it. `role` should be Title Case per the project writing style (CLAUDE.md).
- Do not add a Credit for a role the person already has (case-insensitive substring match on the role list).
- Never invent a name or role. If the user gives only one half, ask.
