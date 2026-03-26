import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TaskDefinition, FeatureSpec, Behavior, EdgeCase } from './types.ts'

export interface PromptInput {
  task: TaskDefinition
  specs: FeatureSpec[]
  repoRoot: string
  repairStderr?: string
}

// --- Resolve spec sections ---
// spec_sections are formatted as "spec-id/behavior-id" or "spec-id/edge-case-id"

const resolveSpecSections = (
  specSections: string[],
  specs: FeatureSpec[],
): string => {
  const specMap = new Map(specs.map((s) => [s.id, s]))
  const lines: string[] = []

  for (const section of specSections) {
    const [specId, sectionId] = section.split('/')
    const spec = specMap.get(specId)
    if (!spec) {
      lines.push(`[spec "${specId}" not found]`)
      continue
    }

    if (!sectionId) {
      // whole spec — include all behaviors, edge cases, failure conditions
      lines.push(formatSpec(spec))
      continue
    }

    const behavior = spec.behaviors.find((b) => b.id === sectionId)
    if (behavior) {
      lines.push(formatBehavior(behavior))
      continue
    }

    const edgeCase = spec.edge_cases.find((ec) => ec.id === sectionId)
    if (edgeCase) {
      lines.push(formatEdgeCase(edgeCase))
      continue
    }

    lines.push(`[section "${sectionId}" not found in spec "${specId}"]`)
  }

  return lines.join('\n\n')
}

const formatBehavior = (b: Behavior): string =>
  [
    `Behavior: ${b.id}`,
    `  ${b.description}`,
    b.inputs.length > 0 ? `  Inputs: ${b.inputs.join(', ')}` : null,
    b.outputs.length > 0 ? `  Outputs: ${b.outputs.join(', ')}` : null,
    b.state_changes.length > 0
      ? `  State changes:\n${b.state_changes.map((sc) => `    - ${sc.field}: ${sc.effect}`).join('\n')}`
      : null,
    `  Determinism: ${b.determinism}`,
  ]
    .filter(Boolean)
    .join('\n')

const formatEdgeCase = (ec: EdgeCase): string =>
  [`Edge case: ${ec.id}`, `  ${ec.description}`, `  Expected: ${ec.expected}`].join(
    '\n',
  )

const formatSpec = (spec: FeatureSpec): string => {
  const parts: string[] = [`Spec: ${spec.id} — ${spec.name}`]

  for (const b of spec.behaviors) {
    parts.push(formatBehavior(b))
  }
  for (const ec of spec.edge_cases) {
    parts.push(formatEdgeCase(ec))
  }
  for (const fc of spec.failure_conditions) {
    parts.push(`Failure condition: ${fc.trigger}\n  Expected: ${fc.expected}`)
  }

  return parts.join('\n\n')
}

// --- Read context files ---

const readContextFiles = (
  contextFiles: string[],
  repoRoot: string,
): string => {
  const sections: string[] = []

  for (const filePath of contextFiles) {
    const fullPath = resolve(repoRoot, filePath)
    if (!existsSync(fullPath)) {
      sections.push(`--- ${filePath} ---\n[file not found]`)
      continue
    }
    const contents = readFileSync(fullPath, 'utf-8')
    sections.push(`--- ${filePath} ---\n${contents}`)
  }

  return sections.join('\n\n')
}

// --- Assemble prompt ---

export const assemblePrompt = (input: PromptInput): string => {
  const { task, specs, repoRoot, repairStderr } = input

  const sections: string[] = []

  // system
  sections.push(
    [
      '=== SYSTEM ===',
      'You are implementing a feature for a browser-based ASCII game.',
      'Conventions: no enums, ES6 arrows, engine must not import React.',
      `You MUST only modify: ${task.output_files.join(', ')}`,
    ].join('\n'),
  )

  // specification
  const specContent = resolveSpecSections(task.spec_sections, specs)
  if (specContent) {
    sections.push(`=== SPECIFICATION ===\n${specContent}`)
  }

  // existing code
  const contextContent = readContextFiles(task.context_files, repoRoot)
  if (contextContent) {
    sections.push(`=== EXISTING CODE (read-only) ===\n${contextContent}`)
  }

  // task
  sections.push(
    `=== TASK ===\n${task.title}. Produce complete contents per output file.`,
  )

  // repair (retries only)
  if (repairStderr) {
    sections.push(`=== REPAIR ===\nPrevious attempt failed:\n${repairStderr}`)
  }

  return sections.join('\n\n')
}
