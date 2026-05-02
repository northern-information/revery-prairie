import type { Direction, ScreenAxisKey } from './types'

/**
 * Map a raw key string to a screen-axis key, or null if it's not a
 * movement key. The same w/up/W/ArrowUp always maps to "up" in
 * screen-axis terms; the translation to a world Direction happens
 * later in resolveHeldDirection.
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
 * Single-key presses produce diagonal world directions; two-key combos
 * collapse to a cardinal world direction (appearing as straight-on
 * screen motion).
 */
export const resolveHeldDirection = (keys: Set<ScreenAxisKey>): Direction | null => {
  // Reduce opposing pairs.
  const up = keys.has('up') && !keys.has('down')
  const down = keys.has('down') && !keys.has('up')
  const left = keys.has('left') && !keys.has('right')
  const right = keys.has('right') && !keys.has('left')

  // Pure cardinals (single-key or both-on-one-axis after cancellation).
  if (up && !left && !right) return 'upLeft'
  if (down && !left && !right) return 'downRight'
  if (left && !up && !down) return 'downLeft'
  if (right && !up && !down) return 'upRight'

  // Two-key combos (diagonals on screen) collapse to a stronger
  // world-axis combination, appearing as pure cardinal world motion.
  if (up && left) return 'left'
  if (up && right) return 'up'
  if (down && left) return 'down'
  if (down && right) return 'right'

  return null
}
