// RP-8b — Egregoric flora (mechanical biome).
//
// Parallel genome type for egregoric flora. Distinct from the native
// `TraitBag` shape from RP-3: egregores have trait axes natives lack
// (allelopathy, spreadVelocity), and the `__kind` discriminator lets
// `canCross` reject native × egregore pairs at the type-shape level. This
// is the v3 doctrine "the cosmological boundary rendered as data shape."

import { sha256Sync } from '@/engine/crypto'
import type { TraitBag } from './index'

export interface EgregoreGenome {
  __kind: 'egregore'
  // SHA256 hex identity, derived from (steward, position). Stable per
  // (x, y, steward).
  identity: string
  // Suppression effect on adjacent native flora — value in [0, 1].
  allelopathy: number
  // Bias toward spread when the lifecycle ticker fires — value in [0, 1].
  spreadVelocity: number
}

// Seed bytes 0–3 and 4–7 from the SHA256 identity produce two
// uncorrelated values in [0, 1). We bias each one toward the species'
// trait-bias as `(derived + bias) / 2` so both species poles read clearly
// but per-plant variation remains visible.
const hashBytesToUnit = (identity: string, byteOffset: number): number => {
  const hex = identity.slice(byteOffset * 2, byteOffset * 2 + 8)
  const n = parseInt(hex, 16) >>> 0
  return n / 0x100000000
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

export interface EgregoreSpeciesBias {
  allelopathy: number
  spreadVelocity: number
}

export const generateEgregoreGenome = (
  x: number,
  y: number,
  stewardName: string,
  bias: EgregoreSpeciesBias
): EgregoreGenome => {
  const identity = sha256Sync(`egregore:${stewardName}:${String(x)}:${String(y)}`)
  const a = hashBytesToUnit(identity, 0)
  const s = hashBytesToUnit(identity, 4)
  return {
    __kind: 'egregore',
    identity,
    allelopathy: clamp01((a + bias.allelopathy) / 2),
    spreadVelocity: clamp01((s + bias.spreadVelocity) / 2),
  }
}

// Type-only narrowing helper used by canCross. Treats a missing __kind
// as native (TraitBag) — defensive for any legacy TraitBag instances
// constructed before the discriminator existed.
export const isEgregoreGenome = (g: TraitBag | EgregoreGenome): g is EgregoreGenome =>
  (g as { __kind?: string }).__kind === 'egregore'
