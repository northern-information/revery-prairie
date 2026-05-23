---
name: maintain-tests
description: Audit the vitest suite for performance, parallelization risks, and coverage gaps. Report only — no writes.
user_invocable: true
---

# /maintain-tests

Audit skill for keeping the vitest suite healthy. Reports on runtime, parallelization risks, and coverage. Does not modify config or test files — every change is surfaced for the user to apply.

This skill is report-only. No worktree, no commits, no edits. The output is a written report.

`vitest.config.ts` carries intentional, hard-won tuning (`pool: 'forks'`, `maxWorkers: 2`, RPC heartbeat workaround). Treat that config as load-bearing — never propose bumping workers or changing the pool without explicit user direction. Flag opportunities; let the user decide.

## Flow

### 1. Baseline run

Capture timing and project breakdown:

```bash
npm test -- --reporter=verbose 2>&1 | tail -200
```

Record:
- Total wall-clock time
- Per-project (`engine`, `harness`, `tools`, `ui`) wall-clock and test counts
- Top 20 slowest individual tests (vitest prints slow tests by default; if not, rerun with `--reporter=verbose`)

If the run fails, stop and report the failure. Do not proceed to coverage on a broken suite.

### 2. Parallelization audit

Read `vitest.config.ts` first so the report cites the current values, not assumptions.

Look for patterns that block safe parallelization. Search the suite for:

- **Global mutation without restore** — `vi.spyOn(Math, 'random')`, `vi.spyOn(Date, 'now')`, `vi.useFakeTimers()` without a matching `vi.restoreAllMocks()` / `vi.useRealTimers()` in a `finally` or `afterEach`. Use:
  ```bash
  rg -n "vi\.(spyOn|useFakeTimers)" src/ harness/ tools/
  ```
  Cross-reference with `restoreAllMocks` / `useRealTimers` calls in the same file.
- **Module-level mutable state in test files** — `let` or `const` at module scope that's mutated inside `it` blocks. These prevent file-level parallel execution if vitest is ever moved off `forks`.
- **Cross-file file-system writes** — tests that write to a shared path (e.g. `harness/` artifacts) without unique temp directories. Use `rg -n "fs\.(write|append|mkdir)Sync|writeFile" src/ harness/ tools/` and flag any non-temp paths.
- **Tests in the wrong project** — a test file under `src/engine/` that imports React, or a test under `src/components/` that doesn't need jsdom. Mis-routed tests inflate the slow project and waste the fast one.

For each finding, cite `file:line` and a one-line excerpt. No "looks risky" — every flag traces to a concrete pattern.

### 3. Slow-test hot spots

From step 1's slowest-test list, group by directory. A directory with disproportionate runtime is the highest-leverage place to optimize. Identify whether the cost is:

- Setup-heavy (`createGameState` calls per `it` instead of per `describe`)
- I/O-heavy (real filesystem, real network, real timers waiting on `setTimeout`)
- Computation-heavy (genome generation, large grid iteration, SHA256 in a loop)

Cite specific tests with their measured duration.

### 4. Coverage — static cross-reference

Before running coverage, do a fast static pass:

```bash
# List source files
find src/engine src/components src/hooks src/network harness/src tools -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.ts' ! -name '*.test.tsx' ! -path '*/__tests__/*'

# List test files
find src/engine src/components src/hooks src/network harness tools -type f \( -name '*.test.ts' -o -name '*.test.tsx' \)
```

For each source file, check whether a colocated `*.test.ts(x)` exists, or a sibling under `__tests__/`. List source files with zero matching tests, grouped by directory. This is the headline gap list — files entirely uncovered.

### 5. Coverage — real run

Check `package.json` for `@vitest/coverage-v8`. If it's not a direct dependency:

```bash
grep -E '"@vitest/coverage-v8"' package.json || echo "NOT INSTALLED"
```

If not installed, **do not** install it — report that it must be added (`npm install -D @vitest/coverage-v8`) and stop the coverage step. Continue to step 6 with whatever you have.

If installed, run:

```bash
npm test -- --coverage --coverage.reporter=text --coverage.reporter=json-summary 2>&1 | tail -200
```

Parse the summary. Report:
- Overall % lines / branches / functions
- Per-directory % for `src/engine`, `src/components`, `src/hooks`, `src/network`, `harness/src`, `tools`
- Top 10 files with the lowest line coverage (excluding the zero-coverage files from step 4 — those are already flagged)

### 6. Present the report

Output a single Markdown report with these sections:

```
# Test suite audit

## Runtime
- Total: <Ns>
- engine: <Ns> (<N> tests)
- harness: <Ns> (<N> tests)
- tools: <Ns> (<N> tests)
- ui: <Ns> (<N> tests)

## Slowest tests
1. <file:line> "<name>" — <Ns>
...

## Parallelization risks
Current config: pool=forks, maxWorkers=2 (intentional — see vitest.config.ts:8-22).

- <file:line>: <pattern> (e.g. "vi.spyOn(Math, 'random') with no restore")
...

## Mis-routed tests
- <file>: appears in <project> but should be in <other-project> because <reason>

## Coverage — zero-test source files
src/engine/foo.ts
src/engine/bar.ts
...

## Coverage — vitest run
Overall: <N%> lines / <N%> branches / <N%> functions
src/engine: <N%>
src/components: <N%>
...

Lowest-coverage files (with some tests):
1. <file>: <N%>
...

## Recommendations
- <ordered list of suggested fixes, each citing a finding above>
```

End with a one-line summary: total tests, total time, overall coverage %, count of zero-coverage files, count of parallelization flags.

## Anti-rationalizations

| Excuse the agent will tell itself | Rebuttal |
| --- | --- |
| "Bumping `maxWorkers` to 4 is the obvious win." | The config comment in `vitest.config.ts:8-22` documents specific RPC heartbeat failures at higher concurrency. Do not propose worker bumps without reading and citing that comment. |
| "I'll skip the static cross-ref and trust coverage output." | Coverage output only covers files that get imported by tests. A source file with no test file at all may not appear in coverage at all. The static pass catches what coverage misses. |
| "Installing `@vitest/coverage-v8` is a one-line change — I'll just do it." | Skill is report-only. Report the missing dep; let the user install it. |
| "The slowest test is slow but it's testing something complex — leave it alone." | Cite the duration anyway. The user decides whether complexity justifies the cost. |
| "I'll bundle parallelization risks and coverage gaps into one finding." | Separate sections. They have different fixes and different urgencies. |
| "Coverage % is low but the file is mostly types — that's fine." | Report the number. Annotation belongs in the recommendation section, not in suppressing the data. |

## Exit criterion

Markdown report presented covering: runtime breakdown, slowest tests, parallelization risks with file:line evidence, mis-routed tests, zero-test source files, vitest coverage % (or a note that `@vitest/coverage-v8` is missing), and ordered recommendations. No files modified.
