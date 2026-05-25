import { cosmicFormation } from './01-cosmicFormation'
import { landAccretion } from './02-landAccretion'
import { tectonicUplift } from './03-tectonicUplift'
import { lavaEra } from './04-lavaEra'
import { crustCooling } from './05-crustCooling'
import { firstWater } from './06-firstWater'
import { emergenceOfLife } from './07-emergenceOfLife'
import { fireSeason } from './08-fireSeason'
import { regrowth } from './09-regrowth'
import { iceAge } from './10-iceAge'
import { postGlacialDieOff } from './11-postGlacialDieOff'
import { warmPeriod } from './12-warmPeriod'
import { riseOfCivilizations } from './13-riseOfCivilizations'
import { fallOfCivilizations } from './14-fallOfCivilizations'
import { presentDay } from './15-presentDay'

import type { GenesisEpoch } from '../../genesisTypes'

// Preserve the source-file's GENESIS_EPOCHS playback order exactly:
// cosmicFormation, landAccretion, lavaEra, crustCooling, tectonicUplift,
// firstWater, ... The numeric prefix on the file name reflects the
// canonical epoch index (Plan order) but the runtime sequence puts
// lavaEra and crustCooling before tectonicUplift.
export const GENESIS_EPOCHS: GenesisEpoch[] = [
  cosmicFormation,
  landAccretion,
  lavaEra,
  crustCooling,
  tectonicUplift,
  firstWater,
  emergenceOfLife,
  fireSeason,
  regrowth,
  iceAge,
  postGlacialDieOff,
  warmPeriod,
  riseOfCivilizations,
  fallOfCivilizations,
  presentDay,
]
