import type { Direction } from './types'

// WASD/arrow keys map to screen-axis motion. Forward projection:
//   world +x → screen (+cw, +cH/2)  (down-right)
//   world +y → screen (-cw, +cH/2)  (down-left)
// Therefore:
//   screen up    = world (-1, -1) → upLeft   (NW on original map)
//   screen down  = world (+1, +1) → downRight (SE)
//   screen left  = world (-1, +1) → downLeft (SW)
//   screen right = world (+1, -1) → upRight  (NE)
const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'upLeft',
  ArrowDown: 'downRight',
  ArrowLeft: 'downLeft',
  ArrowRight: 'upRight',
  w: 'upLeft',
  s: 'downRight',
  a: 'downLeft',
  d: 'upRight',
  W: 'upLeft',
  S: 'downRight',
  A: 'downLeft',
  D: 'upRight',
}

export const keyToDirection = (key: string): Direction | null => KEY_MAP[key] ?? null

// --- Keybinding registry (source of truth for manual + docs) ---

export interface KeyBinding {
  key: string
  action: string
  context?: string
}

export const KEYBINDINGS: KeyBinding[] = [
  { key: 'wasd', action: 'move', context: 'single keys move diagonally; combine for cardinals' },
  { key: 'e', action: 'interact', context: 'talk, pick up, open, break wall' },
  { key: 'f', action: 'harvest', context: 'facing clover tile' },
  { key: 'r', action: 'rotate / reveries', context: 'rotate hovered item in pack, otherwise toggle reveries screen' },
  { key: 'x', action: 'drop item', context: 'pack open, hovering item' },
  { key: '1-4', action: 'cast revery', context: 'hold to preview, release to cast at facing tile' },
  { key: 'tab', action: 'toggle pack' },
  { key: 'q', action: 'toggle manual' },
  { key: 'c', action: 'toggle divination', context: 'overworld only, requires coins' },
  { key: 'esc', action: 'close screen / open system' },
  { key: 'shift', action: 'toggle sprint', context: 'double movement speed' },
  { key: 'shift+click', action: 'queue waypoints' },
]
