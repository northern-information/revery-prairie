import type { GameState } from '@/engine/types'

/**
 * JSON-safe replacer for GameState serialization.
 * - Map -> { __type: 'Map', entries: [...] }
 * - Set -> { __type: 'Set', values: [...] }
 * - Function -> null
 */
export const serializeReplacer = (_key: string, value: unknown): unknown => {
  if (value instanceof Map) {
    return { __type: 'Map', entries: [...value.entries()] }
  }
  if (value instanceof Set) {
    return { __type: 'Set', values: [...value.values()] }
  }
  if (typeof value === 'function') {
    return null
  }
  return value
}

/**
 * JSON reviver that restores Map and Set from serialized form.
 */
export const deserializeReviver = (_key: string, value: unknown): unknown => {
  if (
    value !== null &&
    typeof value === 'object' &&
    '__type' in value
  ) {
    const tagged = value as { __type: string }
    if (tagged.__type === 'Map') {
      return new Map(
        (value as unknown as { entries: [string, unknown][] }).entries,
      )
    }
    if (tagged.__type === 'Set') {
      return new Set(
        (value as unknown as { values: unknown[] }).values,
      )
    }
  }
  return value
}

/**
 * Serialize a GameState to a JSON string.
 * Functions become null. Maps and Sets are tagged for round-trip.
 */
export const serializeState = (state: GameState): string =>
  JSON.stringify(state, serializeReplacer, 2)

/**
 * Deserialize a JSON string back to a GameState-shaped object.
 * Maps and Sets are restored. Functions remain null.
 */
export const deserializeState = (json: string): GameState =>
  JSON.parse(json, deserializeReviver) as GameState

/**
 * Fields that are functions and will be null after deserialization.
 * Tests can use this to exclude them from round-trip equality checks.
 */
export const FUNCTION_FIELDS: (keyof GameState)[] = [
  'previewFn',
  'pendingAction',
]
