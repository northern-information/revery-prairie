import type { Direction, ScreenAxisKey } from './types'

/**
 * Map a raw key string to a screen-axis key, or null if it's not a
 * movement key. Projection-agnostic — the same w/up/W/ArrowUp always
 * maps to "up" in screen-axis terms; the projection-aware translation
 * to a world Direction happens later in resolveHeldDirection.
 */
const KEY_MAP: Record<string, ScreenAxisKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
}

export const keyToScreenAxis = (key: string): ScreenAxisKey | null => KEY_MAP[key] ?? null

/**
 * Resolve a set of held screen-axis keys to a world Direction (or null
 * if the set is empty / cancels out / produces an invalid combo).
 *
 * Cancellation: holding both up+down (or left+right) cancels that axis.
 * Combos: holding two non-opposing keys produces the diagonal direction
 * for that screen-axis combination, naturally working in both ortho
 * and iso modes via the projection mapping.
 */
export const resolveHeldDirection = (
  keys: Set<ScreenAxisKey>,
  isometric: boolean,
): Direction | null => {
  // Reduce opposing pairs.
  const up = keys.has('up') && !keys.has('down')
  const down = keys.has('down') && !keys.has('up')
  const left = keys.has('left') && !keys.has('right')
  const right = keys.has('right') && !keys.has('left')

  // Pure cardinals first (single-key or both-on-one-axis after cancellation).
  if (up && !left && !right) return isometric ? 'upLeft' : 'up'
  if (down && !left && !right) return isometric ? 'downRight' : 'down'
  if (left && !up && !down) return isometric ? 'downLeft' : 'left'
  if (right && !up && !down) return isometric ? 'upRight' : 'right'

  // Two-key combos (diagonals on screen). In ortho these become true
  // 8-way moves; in iso they collapse to a stronger world-axis combination
  // (effectively pure cardinal world motion appearing as straight-on screen).
  if (up && left) return isometric ? 'left' : 'upLeft'
  if (up && right) return isometric ? 'up' : 'upRight'
  if (down && left) return isometric ? 'down' : 'downLeft'
  if (down && right) return isometric ? 'right' : 'downRight'

  return null
}
