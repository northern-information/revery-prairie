import { tickDormantGardenDecay } from '../ruins'

import type { TickSystem } from './types'
import type { GameState } from '../types'

export const ruinSystems = (): TickSystem[] => [
  {
    id: 'ruin-dormant-garden',
    intervalMs: 1000,
    zone: 'ruin',
    fn: (state: GameState, _time: number) => {
      tickDormantGardenDecay(state, 1000)
    },
  },
]
