import type { ScanCommitResult } from '../scan'
import type { GameState } from '../types'

export interface TickSystem {
  id: string
  intervalMs: number
  zone: 'overworld' | 'cave' | 'ruin' | 'always'
  /** Which game phase this system runs in. Defaults to 'gameplay'. */
  phase?: 'genesis' | 'gameplay' | 'always'
  priority?: number
  fn: (state: GameState, time: number) => void
}

export interface GameLoopCallbacks {
  onRefreshUI?: () => void
  onBeeDeath?: (worldX: number, worldY: number) => void
  onAutoHidePanel?: () => void
  // RP-6 / #8a — fires from tick when a held [f] scan reaches 100% and
  // commits successfully. The React layer reads the discriminated
  // ScanCommitResult and routes to the right surface: flora opens the
  // ceremonial gel modal in gold, egregore in purple, oak opens the
  // manual to the entity:oak entry (no modal).
  onScanComplete?: (result: ScanCommitResult) => void
  onFrame?: (time: number) => void
}
