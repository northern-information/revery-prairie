---
type: bug-report
author: Tyler
date: 2026-05-30
---

# `npm run harness:run` cannot generate code (stub LLM + repair coercion)

Two latent defects in the harness make `npm run harness:run` unable to autonomously execute any plan. Discovered while running RP-15 through `/new-feature`.

## 1. The LLM client is a stub

`harness/src/plan-cli.ts:22-28` defines:

```ts
const stubLlm: LlmClient = {
  generate: (prompt: string) => {
    console.log('\n[stub LLM] received prompt (%d chars). returning empty response.', prompt.length)
    console.log('[stub LLM] replace this with a real LlmClient implementation.\n')
    return Promise.resolve('')
  },
}
```

This is the only client wired to the executor (`opts.llm: stubLlm` at line 87). There is no Anthropic SDK call, no `ANTHROPIC_API_KEY` read, no provider configuration. Every prompt returns the empty string. Every task that does reach the attempt loop fails the output-boundary or verification check.

Fix sketch: wire a real `LlmClient` against the Anthropic SDK (Claude Opus / Sonnet 4.6 per CLAUDE.md). Read the API key from env. Stream or block as the executor expects. Surface model + token counts in `attempts[].response` for run logs.

## 2. `repair: skip` / `repair: retry` shorthand silently breaks the attempt loop

Every plan file in `harness/plans/` uses the scalar shorthand:

```yaml
repair: skip      # or
repair: retry
```

The TypeScript type expects an object: `RepairPolicy { strategy: RepairStrategy; max_retries: number }` (`harness/src/types.ts:148-151`). `harness/src/plan-parser.ts` casts the tasks array directly (`(tasks as TaskDefinition[]) ?? []`) without normalizing this field. At runtime, `task.repair` is the string `"skip"` or `"retry"`, so:

- `task.repair.strategy` is `undefined`
- `task.repair.max_retries` is `undefined`
- `executor.ts:164` becomes `maxAttempts = undefined === 'skip' ? 1 : undefined + 1 = NaN`
- The attempt loop `for (let n = 1; n <= NaN; n++)` never iterates
- The result records `attempts: []`, `passed: false`, `status: 'failed'`

The first run blocks every downstream task with `status: 'blocked'`. The RP-15 harness run (2026-05-30) reproduced this exactly: passed=0, failed=1, blocked=7.

`retry` isn't even a member of the `RepairStrategy` const (`harness/src/types.ts:60-66` — only `fix-in-place`, `rollback-and-retry`, `skip`). So the shorthand never had a valid object form to coerce to.

Fix sketch: normalize the parser. Map `repair: skip` → `{ strategy: 'skip', max_retries: 0 }`, `repair: retry` → `{ strategy: 'fix-in-place', max_retries: 1 }`. Reject invalid shorthand at parse time. Leave the object form working as-is so existing externally-authored plans keep parsing.

## Impact

These two bugs make the documented `/new-feature` step 9 ("ready to execute? `npm run harness:run --`...") aspirational. The spec + plan are still useful as scaffolding — they're the authored contract — but the actual code generation has to happen by hand in a Claude Code session against the plan, which is how RP-15 ultimately shipped.

Until both are fixed, `/new-feature` should treat step 9 as documentation only and not offer to invoke the harness.
