import { readFileSync } from 'node:fs'
import { topoSortTiers } from './topo-sort.ts'
import { parse } from 'yaml'

import type { PlanDefinition, TaskDefinition } from './types.ts'

export interface PlanParseError {
  field: string
  message: string
}

export interface PlanParseResult {
  valid: boolean
  plan: PlanDefinition | null
  tiers: string[][]
  errors: PlanParseError[]
}

const error = (field: string, message: string): PlanParseError => ({
  field,
  message,
})

// --- Parse raw YAML into PlanDefinition ---

const parseRawPlan = (raw: string): { plan: PlanDefinition | null; errors: PlanParseError[] } => {
  let doc: Record<string, unknown>
  try {
    doc = parse(raw) as Record<string, unknown>
  } catch (e) {
    return {
      plan: null,
      errors: [error('', `YAML parse error: ${e instanceof Error ? e.message : String(e)}`)],
    }
  }

  const errors: PlanParseError[] = []
  const planSection = doc.plan as Record<string, unknown> | undefined
  const tasks = doc.tasks as unknown[] | undefined

  if (!planSection) {
    errors.push(error('plan', 'missing top-level "plan" key'))
  }
  if (!tasks || !Array.isArray(tasks)) {
    errors.push(error('tasks', 'missing or non-array top-level "tasks" key'))
  }
  if (errors.length > 0) return { plan: null, errors }

  const plan: PlanDefinition = {
    id: (planSection?.id as string) ?? '',
    title: (planSection?.title as string) ?? '',
    created: (planSection?.created as string) ?? '',
    global_verification: (planSection?.global_verification as string[]) ?? [],
    tasks: (tasks as TaskDefinition[]) ?? [],
  }

  if (!plan.id) errors.push(error('plan.id', 'plan id is required'))
  if (!plan.title) errors.push(error('plan.title', 'plan title is required'))
  if (plan.tasks.length === 0) errors.push(error('tasks', 'plan must have at least one task'))

  return { plan: errors.length > 0 ? null : plan, errors }
}

// --- Validate task references and structure ---

const validateTasks = (plan: PlanDefinition): PlanParseError[] => {
  const errors: PlanParseError[] = []
  const taskIds = new Set(plan.tasks.map(t => t.id))

  // check for duplicate task IDs
  const seen = new Map<string, number>()
  for (const task of plan.tasks) {
    seen.set(task.id, (seen.get(task.id) ?? 0) + 1)
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      errors.push(error(`tasks.${id}`, `duplicate task id "${id}"`))
    }
  }

  // check task fields and dependency references
  for (const task of plan.tasks) {
    if (!task.id) errors.push(error('tasks.?.id', 'task is missing an id'))
    if (!task.title) errors.push(error(`tasks.${task.id}.title`, 'task is missing a title'))
    if (!task.output_files || task.output_files.length === 0)
      errors.push(error(`tasks.${task.id}.output_files`, 'task must specify at least one output file'))

    for (const dep of task.depends_on ?? []) {
      if (!taskIds.has(dep)) {
        errors.push(error(`tasks.${task.id}.depends_on`, `dependency "${dep}" not found among task IDs`))
      }
    }
  }

  return errors
}

// --- Main parse function ---

export const parsePlan = (planPath: string): PlanParseResult => {
  const raw = readFileSync(planPath, 'utf-8')
  return parsePlanYaml(raw)
}

export const parsePlanYaml = (raw: string): PlanParseResult => {
  const { plan, errors: parseErrors } = parseRawPlan(raw)

  if (!plan) {
    return { valid: false, plan: null, tiers: [], errors: parseErrors }
  }

  const taskErrors = validateTasks(plan)
  const allErrors = [...parseErrors, ...taskErrors]

  if (allErrors.length > 0) {
    return { valid: false, plan, tiers: [], errors: allErrors }
  }

  // topological sort into tiers
  const { tiers, cycleParticipants } = topoSortTiers(plan.tasks)

  if (cycleParticipants.length > 0) {
    allErrors.push(error('tasks', `dependency cycle among tasks: ${cycleParticipants.join(', ')}`))
    return { valid: false, plan, tiers: [], errors: allErrors }
  }

  return { valid: true, plan, tiers, errors: [] }
}
