---
name: new-feature
description: Add a new game feature via spec-driven harness workflow
user_invocable: true
arg: description of the feature
---

# /new-feature

Conversational skill for adding new game features through the spec-driven harness pipeline. Do not skip steps or auto-execute without approval.

## Flow

### 1. Gather requirements

Ask the user 2-3 clarifying questions:
- What systems does this touch? (engine, components, hooks)
- What should the player see or experience?
- Any edge cases or failure modes you already know about?

Wait for answers before proceeding.

### 2. Draft the spec

Create `harness/specs/{feature-id}.yaml` following the spec format:
- `id`: kebab-case, descriptive
- `status`: `planned` for new features
- `layer`: `engine`, `component`, or `integration`
- `source_files`: files that will be created or modified
- `behaviors`: at least one, with concrete inputs/outputs/state_changes. no vague language.
- `edge_cases`: at least one, with specific description and expected outcome
- `failure_conditions`: at least one, with trigger and expected outcome
- `verification`: test file path, test pattern, and `npx vitest run` command
- `determinism`: mark probabilistic behaviors explicitly

Refer to `harness/specs/player-movement.yaml` as the canonical example.

### 3. Validate the spec

Run `npm run spec:validate`. If there are errors, fix them and re-validate. Repeat until clean.

### 4. Present spec for review

Show the user the complete spec. Iterate on feedback. Do not proceed until the user approves.

### 5. Draft the plan

Create `harness/plans/{feature-id}.yaml` with:
- `plan.id`, `plan.title`, `plan.created` (today's date)
- `plan.global_verification`: `["npm run build", "npm run test", "npm run lint"]`
- `tasks`: ordered list with `id`, `title`, `spec_id`, `output_files`, `depends_on`, `spec_sections`, `context_files`, `verification` commands, `repair` policy, `tags`

Each task should:
- Have narrow `context_files` (only what the LLM needs to read)
- Have narrow `output_files` (only what the LLM should modify)
- Include `npx tsc -b --noEmit` in verification
- Include relevant unit test commands in verification

### 6. Validate plan references

Verify that:
- All `spec_id` values reference existing specs
- All `context_files` exist on disk
- Task dependency graph is acyclic
- `output_files` don't overlap between tasks in the same tier

### 7. Present plan for review

Show the user the complete plan. Iterate on feedback. Do not proceed until the user approves.

### 8. Execute (optional, only on approval)

Ask the user: "ready to execute? (`npm run harness:run -- --plan harness/plans/{feature-id}.yaml`)"

Only run if they confirm. Report results from the run summary.
