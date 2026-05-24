import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { isPromotedByEvidence, type InFlightScan } from './scan.js'

export type Status = 'todo' | 'in-progress' | 'shipped'
export type DerivedStatus = Status | 'next'

export interface Feature {
  id: string
  name: string
  summary: string
  depends_on: string[]
  status: Status
  spec: string | null
  plan: string | null
  pr: string | null
  notes: string
}

export interface FeaturesFile {
  features: Feature[]
}

export const STATUS_COLUMNS: DerivedStatus[] = ['todo', 'next', 'in-progress', 'shipped']

// Statuses that can actually appear in the YAML. `next` is derived from deps, never written.
export const WRITABLE_STATUSES: Status[] = ['todo', 'in-progress', 'shipped']

export const COLUMN_LABEL: Record<DerivedStatus, string> = {
  todo: 'TODO',
  next: 'NEXT',
  'in-progress': 'IN PROGRESS',
  shipped: 'SHIPPED',
}

export const loadFeatures = (path: string): Feature[] => {
  const raw = readFileSync(path, 'utf8')
  const parsed = parse(raw) as FeaturesFile
  if (!parsed.features || !Array.isArray(parsed.features)) {
    throw new Error(`Expected top-level "features:" array in ${path}`)
  }
  return parsed.features
}

export const deriveStatus = (feature: Feature, all: Feature[]): DerivedStatus => {
  if (feature.status !== 'todo') return feature.status
  if (feature.depends_on.length === 0) return 'next'
  const byId = new Map(all.map((f) => [f.id, f]))
  const allShipped = feature.depends_on.every((depId) => byId.get(depId)?.status === 'shipped')
  return allShipped ? 'next' : 'todo'
}

// Mirrors /churn step 1b: a YAML `todo` item with any in-flight evidence
// is shown in IN PROGRESS. Other statuses are unchanged.
export const effectiveStatus = (
  feature: Feature,
  all: Feature[],
  scan: InFlightScan | null,
): DerivedStatus => {
  const base = deriveStatus(feature, all)
  if (scan && isPromotedByEvidence(feature, scan)) return 'in-progress'
  return base
}

export const groupByColumn = (
  features: Feature[],
  scan: InFlightScan | null = null,
): Record<DerivedStatus, Feature[]> => {
  const groups: Record<DerivedStatus, Feature[]> = {
    todo: [],
    next: [],
    'in-progress': [],
    shipped: [],
  }
  for (const f of features) {
    groups[effectiveStatus(f, features, scan)].push(f)
  }
  return groups
}

// Replace just the `status:` line of the feature with the given id. Preserves
// comments, blank lines, field order, and all other formatting in the YAML.
//
// The YAML uses a stable format: each feature block starts with `  - id: '<id>'`
// and contains a `    status: <value>` line two-spaces deeper than the list marker.
// We locate the matching block, then swap that one line.
//
// Throws if the id is not found or the block has no status line.
export const setStatusInYamlText = (raw: string, id: string, newStatus: Status): string => {
  const lines = raw.split('\n')
  const idPattern = new RegExp(`^  - id: ['"]?${escapeRegex(id)}['"]?\\s*$`)

  let blockStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (idPattern.test(lines[i]!)) {
      blockStart = i
      break
    }
  }
  if (blockStart === -1) {
    throw new Error(`Feature id ${JSON.stringify(id)} not found in YAML`)
  }

  // Block ends at the next `  - id:` line (any id) or end of file.
  const nextItemPattern = /^  - id: /
  let blockEnd = lines.length
  for (let i = blockStart + 1; i < lines.length; i++) {
    if (nextItemPattern.test(lines[i]!)) {
      blockEnd = i
      break
    }
  }

  const statusPattern = /^(\s{4}status:\s*).*$/
  for (let i = blockStart + 1; i < blockEnd; i++) {
    const match = statusPattern.exec(lines[i]!)
    if (match) {
      lines[i] = `${match[1]}${newStatus}`
      return lines.join('\n')
    }
  }

  throw new Error(`Feature id ${JSON.stringify(id)} has no status line`)
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const depSummary = (feature: Feature, all: Feature[]): { id: string; status: Status }[] => {
  const byId = new Map(all.map((f) => [f.id, f]))
  return feature.depends_on.map((id) => ({
    id,
    status: byId.get(id)?.status ?? 'todo',
  }))
}
