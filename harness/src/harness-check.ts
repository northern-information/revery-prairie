import { execFileSync } from 'node:child_process'

export type Classification = 'product' | 'test' | 'harness-pipeline' | 'ignored'

export interface ChangedFile {
  path: string
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | 'X' | 'B'
  added: number
  removed: number
  classification: Classification
}

export interface CheckInput {
  files: ChangedFile[]
  skipReason?: string
}

export type CheckOutcome =
  | { kind: 'skip'; reason: string }
  | { kind: 'minor' }
  | { kind: 'gated-pass'; triggers: string[] }
  | { kind: 'gated-fail'; triggers: string[]; missing: ('spec' | 'plan')[] }

export const PRODUCT_PREFIXES = ['src/', 'worker/src/', 'shared/src/']
export const HARNESS_PREFIXES = ['harness/', '.github/workflows/', '.claude/']
export const ROOT_CONFIG_PATTERNS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^tsconfig.*\.json$/,
  /^vite\.config\.[cm]?[jt]s$/,
  /^vitest\.config\.[cm]?[jt]s$/,
  /^vitest\.workspace\.[cm]?[jt]s$/,
  /^eslint\.config\.[cm]?[jt]s$/,
  /^\.eslintrc.*$/,
  /^prettier\.config\.[cm]?[jt]s$/,
  /^\.prettierrc.*$/,
  /^\.prettierignore$/,
  /^\.editorconfig$/,
  /^\.gitignore$/,
  /^\.gitattributes$/,
  /^\.nvmrc$/,
  /^.*\.md$/,
]

export const PRODUCT_LOC_THRESHOLD = 150

const TEST_PATH_RE = /(^|\/)__tests__\//
const TEST_FILE_RE = /\.test\.[cm]?[jt]sx?$/

export const classifyPath = (path: string): Classification => {
  if (TEST_PATH_RE.test(path) || TEST_FILE_RE.test(path)) return 'test'
  for (const prefix of PRODUCT_PREFIXES) {
    if (path.startsWith(prefix)) return 'product'
  }
  for (const prefix of HARNESS_PREFIXES) {
    if (path.startsWith(prefix)) return 'harness-pipeline'
  }
  for (const re of ROOT_CONFIG_PATTERNS) {
    if (re.test(path)) return 'harness-pipeline'
  }
  return 'ignored'
}

export const evaluate = (input: CheckInput): CheckOutcome => {
  if (input.skipReason !== undefined && input.skipReason.length > 0) {
    return { kind: 'skip', reason: input.skipReason }
  }

  const product = input.files.filter((f) => f.classification === 'product')
  const newProductFiles = product.filter((f) => f.status === 'A')
  const productLoc = product.reduce((sum, f) => sum + f.added + f.removed, 0)

  const triggers: string[] = []
  if (newProductFiles.length > 0) {
    triggers.push(
      `${String(newProductFiles.length)} new product file(s): ${newProductFiles
        .map((f) => f.path)
        .join(', ')}`
    )
  }
  if (productLoc > PRODUCT_LOC_THRESHOLD) {
    triggers.push(
      `${String(productLoc)} product LOC changed (threshold ${String(PRODUCT_LOC_THRESHOLD)})`
    )
  }

  if (triggers.length === 0) return { kind: 'minor' }

  const hasSpec = input.files.some(
    (f) => f.path.startsWith('harness/specs/') && f.status !== 'D'
  )
  const hasPlan = input.files.some(
    (f) => f.path.startsWith('harness/plans/') && f.status !== 'D'
  )

  const missing: ('spec' | 'plan')[] = []
  if (!hasSpec) missing.push('spec')
  if (!hasPlan) missing.push('plan')

  if (missing.length === 0) return { kind: 'gated-pass', triggers }
  return { kind: 'gated-fail', triggers, missing }
}

export const formatReport = (outcome: CheckOutcome): string => {
  switch (outcome.kind) {
    case 'skip':
      return `harness check: skipped (reason: ${outcome.reason})`
    case 'minor':
      return 'harness check: minor PR, no spec required'
    case 'gated-pass':
      return [
        'harness check: gated PR, spec + plan present — pass',
        ...outcome.triggers.map((t) => `  trigger: ${t}`),
      ].join('\n')
    case 'gated-fail':
      return [
        'harness check: gated PR, missing harness artifacts — fail',
        ...outcome.triggers.map((t) => `  trigger: ${t}`),
        ...outcome.missing.map(
          (m) =>
            `  missing: harness/${m === 'spec' ? 'specs' : 'plans'}/ change in this PR`
        ),
        '',
        'every gated PR must go through /new-feature, /bug-report, or /change-request.',
        'if this is intentionally not a feature change, add a `Skip-Harness: <reason>` trailer to the most recent commit.',
      ].join('\n')
  }
}

const runGit = (args: string[]): string => {
  return execFileSync('git', args, { encoding: 'utf8' })
}

const refExists = (ref: string): boolean => {
  try {
    runGit(['rev-parse', '--verify', '--quiet', ref])
    return true
  } catch {
    return false
  }
}

export const collectFiles = (base: string): ChangedFile[] => {
  const status = runGit(['diff', '--name-status', `${base}...HEAD`])
  const numstat = runGit(['diff', '--numstat', `${base}...HEAD`])

  const numstatByPath = new Map<string, { added: number; removed: number }>()
  for (const line of numstat.split('\n')) {
    if (line.length === 0) continue
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const [a, r, p] = parts
    const added = a === '-' ? 0 : Number.parseInt(a, 10)
    const removed = r === '-' ? 0 : Number.parseInt(r, 10)
    numstatByPath.set(p, { added, removed })
  }

  const files: ChangedFile[] = []
  for (const line of status.split('\n')) {
    if (line.length === 0) continue
    const parts = line.split('\t')
    const code = parts[0]
    const path = parts[parts.length - 1]
    const status = code.charAt(0) as ChangedFile['status']
    const counts = numstatByPath.get(path) ?? { added: 0, removed: 0 }
    files.push({
      path,
      status,
      added: counts.added,
      removed: counts.removed,
      classification: classifyPath(path),
    })
  }
  return files
}

export const readSkipReason = (): string | undefined => {
  const env = process.env.SKIP_HARNESS
  if (env !== undefined && env.trim().length > 0) return env.trim()
  try {
    const message = runGit(['log', '-1', '--pretty=%B', 'HEAD'])
    for (const line of message.split('\n')) {
      const match = /^Skip-Harness:\s*(.+)$/.exec(line.trim())
      if (match !== null && match[1].trim().length > 0) return match[1].trim()
    }
  } catch {
    return undefined
  }
  return undefined
}

const main = (): void => {
  const base = process.env.HARNESS_BASE ?? 'origin/main'

  if (!refExists(base)) {
    console.error(
      `harness check: base ref "${base}" not found. run \`git fetch origin main\` first, or set HARNESS_BASE.`
    )
    process.exit(2)
  }

  const skipReason = readSkipReason()
  const files = collectFiles(base)
  const outcome = evaluate({ files, skipReason })
  console.log(formatReport(outcome))
  if (outcome.kind === 'gated-fail') process.exit(1)
}

const isEntrypoint =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith('harness-check.ts')

if (isEntrypoint) main()
