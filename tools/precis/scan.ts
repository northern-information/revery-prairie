import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { parse } from 'yaml'
import type { Feature, FeaturesFile, Status } from './data.js'

// Mirror of `/churn` step 1b. Three external name-based signals plus a
// per-worktree internal file scan, reconciled into per-id evidence.

export interface IdEvidence {
  worktrees: string[]
  remoteBranches: string[]
  openPrs: number[]
  specs: { worktree: string; file: string }[]
  plans: { worktree: string; file: string }[]
  yamlFlips: { worktree: string; from: Status; to: Status }[]
}

export interface ThinktankActivity {
  worktree: string
  file: string
}

export interface InFlightScan {
  byId: Map<string, IdEvidence>
  // Worktrees doing thinktank-only doc work — no precis id derivable.
  unmappedThinktank: ThinktankActivity[]
  // ids whose YAML status is `shipped` but evidence still exists. Surface as
  // a "stale worktree/branch/PR" warning; do not promote.
  stale: string[]
  // ids whose branch matches `precis-N-` but the worktree has no internal-scan
  // evidence. Still promoted but flagged "no harness work started yet."
  branchOnly: Set<string>
  // Errors encountered during the scan (gh missing, parse failures). Empty
  // when everything ran cleanly.
  warnings: string[]
}

interface RunResult {
  ok: boolean
  stdout: string
  stderr: string
}

const run = (cmd: string, args: string[], cwd?: string): RunResult => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return {
    ok: r.status === 0,
    stdout: (r.stdout ?? '').toString().trim(),
    stderr: (r.stderr ?? '').toString().trim(),
  }
}

const findMainCheckout = (startDir: string): string => {
  const r = run('git', ['rev-parse', '--git-common-dir'], startDir)
  if (!r.ok) throw new Error(`git rev-parse failed: ${r.stderr}`)
  return dirname(resolve(startDir, r.stdout))
}

const PRECIS_BRANCH_RE = /^(?:worktree-)?precis-(\d+[a-z]?)-/
const SPEC_FILE_RE = /^harness\/specs\/precis-(\d+[a-z]?)-/
const PLAN_FILE_RE = /^harness\/plans\/precis-(\d+[a-z]?)-/
const THINKTANK_FILE_RE = /^docs\/precis-thinktank-v\d+/

const extractPrecisId = (name: string): string | null => {
  const m = PRECIS_BRANCH_RE.exec(name)
  return m ? m[1]! : null
}

interface Worktree {
  path: string
  branch: string
}

const listWorktrees = (mainCheckout: string): Worktree[] => {
  const r = run('git', ['worktree', 'list', '--porcelain'], mainCheckout)
  if (!r.ok) return []
  const out: Worktree[] = []
  let path = ''
  let branch = ''
  const flush = () => {
    if (path) out.push({ path, branch })
    path = ''
    branch = ''
  }
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush()
      path = line.slice('worktree '.length)
    } else if (line.startsWith('branch ')) {
      branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    }
  }
  flush()
  return out
}

const listRemoteBranches = (mainCheckout: string): string[] => {
  const r = run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], mainCheckout)
  if (!r.ok) return []
  return r.stdout
    .split('\n')
    .map((s) => s.replace(/^origin\//, ''))
    .filter((s) => s && s !== 'HEAD')
}

interface OpenPr {
  number: number
  headRefName: string
  title: string
}

const listOpenPrs = (mainCheckout: string, warnings: string[]): OpenPr[] => {
  const check = run('gh', ['--version'])
  if (!check.ok) {
    warnings.push('gh CLI not found — open-PR signal skipped. `brew install gh` to enable.')
    return []
  }
  const r = run(
    'gh',
    ['pr', 'list', '--state', 'open', '--json', 'number,headRefName,title', '--limit', '100'],
    mainCheckout,
  )
  if (!r.ok) {
    warnings.push(`gh pr list failed: ${r.stderr || r.stdout}`)
    return []
  }
  try {
    const parsed = JSON.parse(r.stdout) as OpenPr[]
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    warnings.push(`gh pr list returned unparseable JSON: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

interface WorktreeScan {
  specs: { id: string; file: string }[]
  plans: { id: string; file: string }[]
  yamlFlips: { id: string; from: Status; to: Status }[]
  thinktank: string[]
  hasInternalEvidence: boolean
}

// Status field name from data.ts FeaturesFile. We re-parse the YAML here
// (rather than reuse loadFeatures) so we can pull `main`'s version via
// `git show` without filesystem reads.
const parseStatuses = (yamlText: string): Map<string, Status> => {
  try {
    const parsed = parse(yamlText) as FeaturesFile
    if (!parsed.features) return new Map()
    return new Map(parsed.features.map((f: Feature) => [f.id, f.status]))
  } catch {
    return new Map()
  }
}

const scanWorktreeFiles = (worktreePath: string, warnings: string[]): WorktreeScan => {
  const empty: WorktreeScan = {
    specs: [],
    plans: [],
    yamlFlips: [],
    thinktank: [],
    hasInternalEvidence: false,
  }

  // Skip the main checkout itself — its diff vs main is empty by definition.
  const diff = run('git', ['-C', worktreePath, 'diff', '--name-only', 'main'])
  const status = run('git', ['-C', worktreePath, 'status', '--porcelain'])

  if (!diff.ok && !status.ok) {
    return empty
  }

  const paths = new Set<string>()
  if (diff.ok) {
    for (const line of diff.stdout.split('\n')) {
      if (line) paths.add(line)
    }
  }
  if (status.ok) {
    for (const rawLine of status.stdout.split('\n')) {
      if (!rawLine) continue
      // Porcelain v1 format: 'XY <path>' (status is 2 chars + space).
      // Rename: 'R  <orig> -> <new>' — we want <new>.
      const pathPart = rawLine.slice(3)
      const renameIdx = pathPart.indexOf(' -> ')
      const path = renameIdx === -1 ? pathPart : pathPart.slice(renameIdx + 4)
      if (path) paths.add(path)
    }
  }

  const specs: { id: string; file: string }[] = []
  const plans: { id: string; file: string }[] = []
  const thinktank: string[] = []
  let yamlChanged = false

  for (const p of paths) {
    const specMatch = SPEC_FILE_RE.exec(p)
    if (specMatch) specs.push({ id: specMatch[1]!, file: p })
    const planMatch = PLAN_FILE_RE.exec(p)
    if (planMatch) plans.push({ id: planMatch[1]!, file: p })
    if (p === 'docs/precis-status.yaml') yamlChanged = true
    if (THINKTANK_FILE_RE.test(p)) thinktank.push(p)
  }

  let yamlFlips: { id: string; from: Status; to: Status }[] = []
  if (yamlChanged) {
    const mainYaml = run('git', ['-C', worktreePath, 'show', 'main:docs/precis-status.yaml'])
    if (mainYaml.ok) {
      const mainStatuses = parseStatuses(mainYaml.stdout)
      try {
        const wtPath = resolve(worktreePath, 'docs/precis-status.yaml')
        const wtStatuses = parseStatuses(readFileSync(wtPath, 'utf8'))
        for (const [id, to] of wtStatuses) {
          const from = mainStatuses.get(id)
          if (from && from !== to) {
            yamlFlips.push({ id, from, to })
          }
        }
      } catch (err) {
        warnings.push(
          `read ${worktreePath}/docs/precis-status.yaml failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  const hasInternalEvidence = specs.length > 0 || plans.length > 0 || yamlFlips.length > 0
  return { specs, plans, yamlFlips, thinktank, hasInternalEvidence }
}

const ensureEntry = (byId: Map<string, IdEvidence>, id: string): IdEvidence => {
  let e = byId.get(id)
  if (!e) {
    e = { worktrees: [], remoteBranches: [], openPrs: [], specs: [], plans: [], yamlFlips: [] }
    byId.set(id, e)
  }
  return e
}

export const hasAnyEvidence = (e: IdEvidence): boolean =>
  e.worktrees.length > 0 ||
  e.remoteBranches.length > 0 ||
  e.openPrs.length > 0 ||
  e.specs.length > 0 ||
  e.plans.length > 0 ||
  e.yamlFlips.length > 0

const hasInternalEvidence = (e: IdEvidence): boolean =>
  e.specs.length > 0 || e.plans.length > 0 || e.yamlFlips.length > 0

const hasExternalEvidence = (e: IdEvidence): boolean =>
  e.worktrees.length > 0 || e.remoteBranches.length > 0 || e.openPrs.length > 0

export const scanInFlight = (startDir: string, features: Feature[]): InFlightScan => {
  const warnings: string[] = []
  const byId = new Map<string, IdEvidence>()
  const unmappedThinktank: ThinktankActivity[] = []
  const branchOnly = new Set<string>()
  const knownIds = new Set(features.map((f) => f.id))

  let mainCheckout: string
  try {
    mainCheckout = findMainCheckout(startDir)
  } catch (err) {
    warnings.push(`scan aborted: ${err instanceof Error ? err.message : String(err)}`)
    return { byId, unmappedThinktank, stale: [], branchOnly, warnings }
  }

  const worktrees = listWorktrees(mainCheckout)
  const remoteBranches = listRemoteBranches(mainCheckout)
  const openPrs = listOpenPrs(mainCheckout, warnings)

  // External signals — branch-name regex.
  for (const wt of worktrees) {
    if (!wt.branch) continue
    const id = extractPrecisId(wt.branch)
    if (id && knownIds.has(id)) {
      ensureEntry(byId, id).worktrees.push(wt.path)
    }
  }
  for (const name of remoteBranches) {
    const id = extractPrecisId(name)
    if (id && knownIds.has(id)) {
      ensureEntry(byId, id).remoteBranches.push(name)
    }
  }
  for (const pr of openPrs) {
    const id = extractPrecisId(pr.headRefName)
    if (id && knownIds.has(id)) {
      ensureEntry(byId, id).openPrs.push(pr.number)
    }
  }

  // Internal signals — per-worktree file scan.
  for (const wt of worktrees) {
    // Skip the main checkout — diff vs main is empty.
    if (wt.path === mainCheckout) continue
    const scan = scanWorktreeFiles(wt.path, warnings)
    for (const s of scan.specs) {
      if (knownIds.has(s.id)) {
        ensureEntry(byId, s.id).specs.push({ worktree: wt.path, file: s.file })
      }
    }
    for (const p of scan.plans) {
      if (knownIds.has(p.id)) {
        ensureEntry(byId, p.id).plans.push({ worktree: wt.path, file: p.file })
      }
    }
    for (const flip of scan.yamlFlips) {
      if (knownIds.has(flip.id)) {
        ensureEntry(byId, flip.id).yamlFlips.push({
          worktree: wt.path,
          from: flip.from,
          to: flip.to,
        })
      }
    }
    if (scan.thinktank.length > 0) {
      const branchId = wt.branch ? extractPrecisId(wt.branch) : null
      if (!branchId || !knownIds.has(branchId)) {
        for (const file of scan.thinktank) {
          unmappedThinktank.push({ worktree: wt.path, file })
        }
      }
    }
  }

  // Branch-only: a precis id matches a worktree/branch/PR by name, but no
  // internal evidence (specs/plans/yamlFlips) is attributed to that id.
  // Computed after both passes so unrelated yamlFlips in the same worktree
  // (e.g. precis-23 worktree happens to also flip precis-18's status) don't
  // mask the fact that #23 itself has no harness work.
  for (const [id, ev] of byId) {
    if (hasExternalEvidence(ev) && !hasInternalEvidence(ev)) {
      branchOnly.add(id)
    }
  }

  // Stale: YAML `shipped` + any evidence.
  const stale: string[] = []
  const statusById = new Map(features.map((f) => [f.id, f.status]))
  for (const [id, ev] of byId) {
    if (statusById.get(id) === 'shipped' && hasAnyEvidence(ev)) {
      stale.push(id)
    }
  }
  stale.sort()

  return { byId, unmappedThinktank, stale, branchOnly, warnings }
}

// True iff the id should be displayed in IN PROGRESS even though the YAML
// still says todo. Used by data.ts effectiveStatus.
export const isPromotedByEvidence = (
  feature: Feature,
  scan: InFlightScan | null,
): boolean => {
  if (!scan) return false
  if (feature.status !== 'todo') return false
  const ev = scan.byId.get(feature.id)
  if (!ev) return false
  return hasAnyEvidence(ev)
}

export const evidenceSourceLines = (ev: IdEvidence): string[] => {
  const out: string[] = []
  for (const path of ev.worktrees) out.push(`worktree:${path}`)
  for (const name of ev.remoteBranches) out.push(`remote-branch:${name}`)
  for (const n of ev.openPrs) out.push(`open-pr:#${n}`)
  for (const s of ev.specs) out.push(`spec:${s.worktree}:${s.file}`)
  for (const p of ev.plans) out.push(`plan:${p.worktree}:${p.file}`)
  for (const f of ev.yamlFlips) out.push(`yaml-flipped:${f.worktree}:${f.from}→${f.to}`)
  return out
}

// Helper used by App.tsx to decide whether a promoted id is "branch-only"
// (no spec/plan/yaml evidence yet).
export const isBranchOnly = (id: string, scan: InFlightScan | null): boolean => {
  if (!scan) return false
  return scan.branchOnly.has(id)
}

// Helper to check internal evidence presence on the IdEvidence shape for
// consumers that already hold the evidence object.
export { hasInternalEvidence, hasExternalEvidence }
