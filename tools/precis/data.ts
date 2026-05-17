import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

export type Status = 'todo' | 'in-progress' | 'shipped'
export type DerivedStatus = Status | 'next'
export type Size = 'XS' | 'S' | 'S/M' | 'M' | 'M/L' | 'L'

export interface Feature {
  id: string
  name: string
  summary: string
  size: Size
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

export const groupByColumn = (features: Feature[]): Record<DerivedStatus, Feature[]> => {
  const groups: Record<DerivedStatus, Feature[]> = {
    todo: [],
    next: [],
    'in-progress': [],
    shipped: [],
  }
  for (const f of features) {
    groups[deriveStatus(f, features)].push(f)
  }
  return groups
}

export const depSummary = (feature: Feature, all: Feature[]): { id: string; status: Status }[] => {
  const byId = new Map(all.map((f) => [f.id, f]))
  return feature.depends_on.map((id) => ({
    id,
    status: byId.get(id)?.status ?? 'todo',
  }))
}
