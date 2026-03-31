---
name: change-request
description: Modify existing behavior via spec updates and the harness pipeline
user_invocable: true
arg: description of the change
---

# /change-request

Conversational skill for modifying existing game behavior through spec updates and the harness pipeline.

## Flow

### 1. Gather requirements

Ask clarifying questions:

- What behavior is changing? What stays the same?
- Are there downstream effects? (other systems that depend on this behavior)
- Any new edge cases introduced by the change?

Wait for answers before proceeding.

### 2. Identify affected specs

Search `harness/specs/` for existing specs that cover the behavior being changed:

- Search by spec `id` and `source_files`
- Read the matched specs to understand current documented behavior

If no spec exists for the affected behavior, note this — you may need to create one first.

### 3. Draft spec updates

Modify the affected spec(s):

- Update `behaviors` — change descriptions, inputs, outputs, state_changes as needed
- Add new `edge_cases` for any new scenarios the change introduces
- Update `failure_conditions` if the failure modes change
- Update `verification` if test file or pattern changes
- Keep `status` as-is unless the change makes it `partial`

Preserve behaviors that are not changing.

### 4. Validate updated specs

Run `npm run spec:validate`. Fix and re-validate until clean.

### 5. Draft a plan

Create `harness/plans/{change-id}.yaml` targeting only the changed behaviors:

- Tasks should modify only the files affected by the change
- Incremental rebuild (checksum caching) handles unchanged tasks automatically
- Include regression tests for the new behavior

### 6. Present the diff for review

Show the user:

- What changed in the spec (old vs new behaviors, edge cases)
- The plan (tasks, verification)

Do not proceed until the user approves.

### 7. Execute (optional, only on approval)

Ask the user before running. Report results from the run summary.
