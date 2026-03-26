import type { GameState } from './types'

export const AURA_RADIUS: Record<string, number> = {
  rain: 6,
}

export const getTileEffects = (state: GameState, x: number, y: number): string[] => {
  const seen = new Set<string>()
  for (const c of state.characters) {
    if (!c.aura) continue
    const r = AURA_RADIUS[c.aura]
    if (r === undefined) continue
    const dx = x - c.pos.x
    const dy = y - c.pos.y
    if (dx * dx + dy * dy <= r * r) {
      seen.add(c.aura)
    }
  }
  return [...seen]
}
