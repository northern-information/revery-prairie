import { angelSystems } from './angels'
import { celestialSystems } from './celestial'
import { chronicleSystems } from './chronicle'
import { cleanupSystems } from './cleanup'
import { creatureSystems } from './creatures'
import { egregoreSystems } from './egregore'
import { floraSystems } from './flora'
import { interactionSystems } from './interaction'
import { lifecycleSystems } from './lifecycle'
import { movementSystems } from './movement'
import { ruinSystems } from './ruins'
import { weatherSystems } from './weather'

import type { GameLoopCallbacks, TickSystem } from './types'

export { AUTO_HIDE_THRESHOLD } from './movement'

export const createDefaultSystems = (callbacks: GameLoopCallbacks): TickSystem[] => [
  ...lifecycleSystems(callbacks),
  ...movementSystems(callbacks),
  ...creatureSystems(callbacks),
  ...celestialSystems(),
  ...weatherSystems(callbacks),
  ...floraSystems(),
  ...egregoreSystems(),
  ...interactionSystems(callbacks),
  ...cleanupSystems(),
  ...angelSystems(callbacks),
  ...ruinSystems(),
  ...chronicleSystems(),
]
