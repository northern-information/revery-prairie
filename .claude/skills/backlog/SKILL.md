---
name: backlog
description: Log an idea to the backlog for collaborators to review
user_invocable: true
arg: short summary of the idea (optional)
---

# /backlog

Conversational skill for logging ideas, bugs, and change requests to the `backlog/` directory.

## Flow

### 1. Gather details

If the user provided a summary as an argument, use it as a starting point. Ask:

- **Type**: Is this a `feature`, `bug-report`, or `change-request`?
- **Author**: Who is filing this? (name or handle)
- **Description**: What's the idea? Get enough detail to be actionable — a few sentences is fine.

If the arg already makes the type obvious (e.g. "the clover flickers when..."), infer the type and confirm rather than asking.

Wait for answers before proceeding.

### 2. Write the issue file

Create the file at `backlog/{date}-{slug}.md` where:

- `{date}` is today's date in `YYYY-MM-DD` format
- `{slug}` is a short kebab-case slug derived from the description (3-5 words max)

Use the template from `backlog/ISSUE-TEMPLATE.md`:

```markdown
---
type: feature|bug-report|change-request
author: their name
date: YYYY-MM-DD
---

# short title

Description details here.
```

The `type` field must be exactly one of: `feature`, `bug-report`, `change-request`. These map to the `/new-feature`, `/bug-report`, and `/change-request` skills respectively.

### 3. Confirm

Show the user the file path and contents. Done — no further action needed.
