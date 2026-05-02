import type { CharMetrics, GameState } from '../types'

// Render pass registry. The render frame is composed of an ordered list
// of named passes, not a single monolithic function. See
// harness/specs/renderer.yaml `pass-registry` behavior.
//
// Slot ordering (top to bottom of every frame):
//   1. bg-cache       — static tile-bg + cube edges
//   2. world-overlay  — earth scan, ruin halo, lightning range, angel aura, prairie halo
//   3. tile-glyph     — terrain glyphs, clover lifecycle, glints, twinkling stars, cursor inversion
//   4. entity         — items, bees, characters, shooting stars, meteorites, lightning bolts, player
//   5. effect         — path/hover preview, pickup bloom, crumble, wildfire, weather rain, deep time burning
//   6. screen-overlay — cursor highlight, screen flashes, edge indicators, ejection fade, RTS box
//
// Adding a new entity / overlay / effect = add a pass module and register
// it here. The dispatch loop in renderer.ts walks this registry in slot
// order and calls each active pass's draw function.
//
// This module currently exports the shape only. The dispatch walk is
// added when the slot extractions land — see
// harness/plans/render-architecture.yaml for the staged rollout.

export const RENDER_PASS_SLOTS = [
  'bg-cache',
  'world-overlay',
  'tile-glyph',
  'entity',
  'effect',
  'screen-overlay',
] as const

export type RenderPassSlot = (typeof RENDER_PASS_SLOTS)[number]

export interface RenderPass {
  id: string
  slot: RenderPassSlot
  isActive: (state: GameState) => boolean
  draw: (
    ctx: CanvasRenderingContext2D,
    state: GameState,
    metrics: CharMetrics,
    time: number,
  ) => void
}

const slotOrder = new Map<RenderPassSlot, number>(
  RENDER_PASS_SLOTS.map((slot, index) => [slot, index]),
)

const registry: RenderPass[] = []

export const registerPass = (pass: RenderPass): void => {
  registry.push(pass)
  registry.sort((a, b) => {
    const sa = slotOrder.get(a.slot) ?? 0
    const sb = slotOrder.get(b.slot) ?? 0
    return sa - sb
  })
}

export const getPasses = (): readonly RenderPass[] => registry

export const runPasses = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  time: number,
): void => {
  for (const pass of registry) {
    if (!pass.isActive(state)) continue
    pass.draw(ctx, state, metrics, time)
  }
}
