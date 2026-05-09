import { autoAssignRevery } from './actionBar'
import { storeAngelCanto } from './angels'
import { getCharacterDefinition, getCharacterDialog } from './characters'
import { ComponentType } from './ecs/types'
import { spawnPickupBloom } from './effects'
import { setMapTile } from './map'
import { recordDiscovery } from './manual'
import { queueEvent } from './ruins'
import { invalidateMapCache } from './tileBgCache'
import { CARDINAL, DIRECTIONS, isInBounds, isWalkableTile, posKey } from './position'
import { getReveryDefinition } from './reveries'
import { CoyoteMode, MainQuestPhase, TileType, Zone } from './types'
import { RuinRole } from './genesisTypes'
import { getCurrentEntityZone, spatialAtInCurrentZone } from './zone'

import type { GameState, Position, ReveryDefinition } from './types'

export const isInteractableAt = (state: GameState, x: number, y: number): boolean => {
  if (
    spatialAtInCurrentZone(state, x, y).some(eid => {
      const tag = state.world.getComponent(eid, ComponentType.EntityTag)
      return tag === 'character'
    })
  ) {
    return true
  }
  // Angel body tiles — not in spatial index, check MultiPosition
  const key = posKey(x, y)
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.MultiPosition)) {
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (multi?.positions.some(p => posKey(p.x, p.y) === key)) return true
  }
  if (
    state.currentZone === Zone.Cave &&
    !state.caveRevealed &&
    isInBounds(x, y, state.mapWidth, state.mapHeight) &&
    state.map[y][x].type === TileType.CaveBreakableWall
  ) {
    return true
  }
  if (
    state.currentZone === Zone.Ruin &&
    isInBounds(x, y, state.mapWidth, state.mapHeight) &&
    state.map[y][x].type === TileType.RuinDoorLocked
  ) {
    return true
  }
  if (isInBounds(x, y, state.mapWidth, state.mapHeight) && state.map[y][x].type === TileType.Clover) {
    return true
  }
  return false
}

export const updateFacingEntity = (state: GameState): void => {
  // Prefer the interactable in the facing direction
  const d = DIRECTIONS[state.playerFacing]
  const fx = state.player.x + d.x
  const fy = state.player.y + d.y
  if (isInteractableAt(state, fx, fy)) {
    state.facingEntityPos = { x: fx, y: fy }
    return
  }
  // Fall back to any cardinally adjacent interactable
  for (const cd of CARDINAL) {
    const nx = state.player.x + cd.x
    const ny = state.player.y + cd.y
    if (isInteractableAt(state, nx, ny)) {
      state.facingEntityPos = { x: nx, y: ny }
      return
    }
  }
  state.facingEntityPos = null
}

export const getAdjacentCharacter = (
  state: GameState
): { definitionId: string; pos: { x: number; y: number } } | null => {
  const px = state.player.x
  const py = state.player.y

  const findCharAt = (x: number, y: number): { definitionId: string; pos: { x: number; y: number } } | null => {
    for (const eid of spatialAtInCurrentZone(state, x, y)) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'character') continue
      const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
      const pos = state.world.getComponent(eid, ComponentType.Position)
      if (identity && pos) return { definitionId: identity.definitionId, pos: { x: pos.x, y: pos.y } }
    }
    return null
  }

  // Prefer the character in the facing direction
  const d = DIRECTIONS[state.playerFacing]
  const facing = findCharAt(px + d.x, py + d.y)
  if (facing) return facing
  // Fall back to any cardinally adjacent character
  for (const cd of CARDINAL) {
    const character = findCharAt(px + cd.x, py + cd.y)
    if (character) return character
  }

  // Check angel body tiles — player can be adjacent to or standing under
  const checkTiles = [
    { x: px, y: py }, // standing under
    { x: px + DIRECTIONS[state.playerFacing].x, y: py + DIRECTIONS[state.playerFacing].y }, // facing
    ...CARDINAL.map(cd => ({ x: px + cd.x, y: py + cd.y })), // adjacent
  ]
  for (const eid of state.world.query(
    ComponentType.AngelData,
    ComponentType.MultiPosition,
    ComponentType.CharacterIdentity
  )) {
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!multi || !identity || !pos) continue
    const bodyKeys = new Set(multi.positions.map(p => posKey(p.x, p.y)))
    for (const t of checkTiles) {
      if (bodyKeys.has(posKey(t.x, t.y))) {
        return { definitionId: identity.definitionId, pos: { x: pos.x, y: pos.y } }
      }
    }
  }
  return null
}

export const interactWithCharacter = (
  state: GameState
): { opened: boolean; gift: ReveryDefinition | null; coyoteToggled: boolean } => {
  const character = getAdjacentCharacter(state)
  if (!character) return { opened: false, gift: null, coyoteToggled: false }
  recordDiscovery(state, `character:${character.definitionId}`)

  // Coyote has no dialog — mode is controlled via the command panel
  if (character.definitionId === 'coyote') {
    return { opened: false, gift: null, coyoteToggled: false }
  }

  state.activeDialog = {
    characterId: character.definitionId,
    lineIndex: 0,
    typingIndex: 0,
    typingDone: false,
    transitioning: false,
    transitionStartTime: 0,
  }

  // Store angel canto on first interaction with this angel
  if (character.definitionId.startsWith('angel-')) {
    storeAngelCanto(state, character.definitionId)
  }

  return { opened: true, gift: null, coyoteToggled: false }
}

export const advanceDialog = (
  state: GameState,
  time?: number
): { continuing: boolean; gift: ReveryDefinition | null } => {
  if (!state.activeDialog) return { continuing: false, gift: null }

  // If still typing, reveal the full line instantly
  if (!state.activeDialog.typingDone) {
    const dialog = getCharacterDialog(state, state.activeDialog.characterId)
    const line = dialog[state.activeDialog.lineIndex]
    state.activeDialog.typingIndex = line.length
    state.activeDialog.typingDone = true
    return { continuing: true, gift: null }
  }

  // If transitioning between lines, ignore
  if (state.activeDialog.transitioning) return { continuing: true, gift: null }

  const dialog = getCharacterDialog(state, state.activeDialog.characterId)
  if (state.activeDialog.lineIndex < dialog.length - 1) {
    state.activeDialog.transitioning = true
    state.activeDialog.transitionStartTime = performance.now()
    return { continuing: true, gift: null }
  }

  const characterId = state.activeDialog.characterId
  state.activeDialog = null

  // Give initial gift when completing the initial dialog
  if (!state.giftsReceived.has(characterId)) {
    const gift = giveCharacterGift(state, characterId, time)
    return { continuing: false, gift }
  }

  // Give one-time postGift when completing postGiftDialog
  const def = getCharacterDefinition(characterId)
  if (def.postGift && !state.postGiftActionsCompleted.has(characterId)) {
    const gift = givePostGift(state, characterId, time)
    state.postGiftActionsCompleted.add(characterId)
    return { continuing: false, gift }
  }

  return { continuing: false, gift: null }
}

const DIALOG_TRANSITION_MS = 300

export const tickDialogTransition = (state: GameState, now: number): void => {
  if (!state.activeDialog?.transitioning) return
  if (now - state.activeDialog.transitionStartTime < DIALOG_TRANSITION_MS) return
  state.activeDialog.lineIndex++
  state.activeDialog.typingIndex = 0
  state.activeDialog.typingDone = false
  state.activeDialog.transitioning = false
}

const DIALOG_TYPING_MS = 40

export const tickDialogTyping = (state: GameState, now: number): void => {
  if (!state.activeDialog || state.activeDialog.typingDone || state.activeDialog.transitioning) return
  if (now - state.lastDialogTypingTick < DIALOG_TYPING_MS) return

  const dialog = getCharacterDialog(state, state.activeDialog.characterId)
  const line = dialog[state.activeDialog.lineIndex]
  state.activeDialog.typingIndex++
  if (state.activeDialog.typingIndex >= line.length) {
    state.activeDialog.typingDone = true
  }
  state.lastDialogTypingTick = now
}

export { DIALOG_TRANSITION_MS }

export const giveCharacterGift = (state: GameState, characterId: string, time?: number): ReveryDefinition | null => {
  const def = getCharacterDefinition(characterId)
  if (!def.gift) return null
  if (state.giftsReceived.has(characterId)) return null

  if (def.gift.kind === 'revery') {
    const reveryDef = getReveryDefinition(def.gift.id)
    state.reveries.push(def.gift.id)
    autoAssignRevery(state, def.gift.id)
    state.giftsReceived.add(characterId)
    recordDiscovery(state, `revery:${def.gift.id}`)
    recordDiscovery(state, `event:${characterId}-gift`)
    if (time !== undefined) {
      spawnPickupBloom(state, state.player.x, state.player.y, time)
    }
    return reveryDef
  }

  // Item gifts — deferred
  return null
}

export const givePostGift = (state: GameState, characterId: string, time?: number): ReveryDefinition | null => {
  const def = getCharacterDefinition(characterId)
  if (!def.postGift) return null

  if (def.postGift.kind === 'revery') {
    const reveryDef = getReveryDefinition(def.postGift.id)
    state.reveries.push(def.postGift.id)
    autoAssignRevery(state, def.postGift.id)
    recordDiscovery(state, `revery:${def.postGift.id}`)
    recordDiscovery(state, `event:${characterId}-deep-time`)
    if (time !== undefined) {
      spawnPickupBloom(state, state.player.x, state.player.y, time)
    }
    return reveryDef
  }

  return null
}

/** If the player faces a RuinDoorLocked tile and has at least one
 * aqueductKey in their backpack, consume one key and convert every
 * door tile in the current ruin to RuinDoorOpen. Returns true if the
 * door was unlocked. The door spans the full south wall of the vault
 * (mirrors the cave breakable wall pattern), so all connected door
 * tiles open atomically.
 */
export const unlockRuinDoor = (state: GameState): boolean => {
  if (state.currentZone !== Zone.Ruin) return false
  const d = DIRECTIONS[state.playerFacing]
  const fx = state.player.x + d.x
  const fy = state.player.y + d.y
  if (!isInBounds(fx, fy, state.mapWidth, state.mapHeight)) return false
  if (state.map[fy][fx].type !== TileType.RuinDoorLocked) return false
  const keyItem = state.backpack.items.find((i) => i.definitionId === 'aqueductKey')
  if (!keyItem) return false
  state.backpack.items = state.backpack.items.filter((i) => i.uid !== keyItem.uid)

  // Open every door tile in the current ruin atomically. Always include
  // the facing tile as a fallback in case dormantGarden.doorPositions is
  // unset (older saves, non-dormant-garden archetypes, or test stubs that
  // override state.map directly).
  const interior =
    state.currentRuinIndex !== null ? state.ruinInteriors[state.currentRuinIndex] : null
  const positions: Position[] = [{ x: fx, y: fy }]
  if (interior?.dormantGarden) {
    for (const dp of interior.dormantGarden.doorPositions) {
      positions.push(dp)
    }
  }
  const seen = new Set<string>()
  for (const pos of positions) {
    const key = posKey(pos.x, pos.y)
    if (seen.has(key)) continue
    seen.add(key)
    if (!isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight)) continue
    if (state.map[pos.y][pos.x].type !== TileType.RuinDoorLocked) continue
    setMapTile(state, pos.x, pos.y, { type: TileType.RuinDoorOpen })
  }

  // Clear any action bar slot that referenced the now-consumed key, if no
  // more keys remain in the backpack.
  const stillHasKey = state.backpack.items.some((i) => i.definitionId === 'aqueductKey')
  if (!stillHasKey) {
    for (let i = 0; i < state.actionBar.length; i++) {
      const slot = state.actionBar[i]
      if (slot?.kind === 'item' && slot.id === 'aqueductKey') {
        state.actionBar[i] = null
      }
    }
  }
  recordDiscovery(state, 'event:ruin-door-unlocked')

  // If this is the coyote ruin and the player hasn't yet rescued the coyote,
  // fire the rescue sequence: switch coyote to Follow, teleport adjacent to
  // the player, queue toast + bloom + manual entries, advance quest phase.
  // Guarded on mainQuestPhase so re-unlocks (or complex-mode ruins without
  // a role) never re-fire it.
  const ruin = state.currentRuinIndex !== null ? state.civilizationRuins[state.currentRuinIndex] : null
  if (ruin?.role === RuinRole.Coyote && state.mainQuestPhase === MainQuestPhase.AwaitingCoyote) {
    rescueCoyote(state)
  }

  updateFacingEntity(state)
  return true
}

const rescueCoyote = (state: GameState): void => {
  // Find the coyote entity (placed at the vault on first ruin entry).
  let coyoteEid: number | null = null
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (ident?.definitionId === 'coyote') {
      coyoteEid = eid
      break
    }
  }

  if (coyoteEid !== null) {
    // Teleport coyote to a walkable tile adjacent to the player.
    const target = pickAdjacentWalkableTile(state, state.player.x, state.player.y)
    if (target) {
      const pos = state.world.getComponent(coyoteEid, ComponentType.Position)
      if (pos) {
        state.world.spatial.move(coyoteEid, pos.x, pos.y, target.x, target.y)
        pos.x = target.x
        pos.y = target.y
      }
    }
    // Switch behavior to follow.
    state.world.addComponent(coyoteEid, ComponentType.Behavior, { type: 'follow' })
    // Move the coyote into the current zone so it gets carried out on exit.
    state.world.addComponent(coyoteEid, ComponentType.EntityZone, getCurrentEntityZone(state))
  }

  state.coyoteMode = CoyoteMode.Follow
  state.coyoteCargo = null
  state.coyotePath = null

  queueEvent(state, 'Rescued Coyote!', 'C', '#D4A054')
  spawnPickupBloom(state, state.player.x, state.player.y, performance.now())
  recordDiscovery(state, 'character:coyote')
  recordDiscovery(state, 'event:rescue-coyote')

  state.mainQuestPhase = MainQuestPhase.Gathering
}

const pickAdjacentWalkableTile = (state: GameState, px: number, py: number): Position | null => {
  for (const d of CARDINAL) {
    const nx = px + d.x
    const ny = py + d.y
    if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
    if (!isWalkableTile(state.map[ny][nx].type)) continue
    return { x: nx, y: ny }
  }
  return null
}

/** Called after a successful bee+clover combine. If the player is on the
 *  overworld and has not yet been sealed, teleport Gron adjacent to the
 *  player, advance mainQuestPhase to Sealed, and auto-open Gron's dialog.
 *  Combines in the cave or inside a ruin are silently no-ops — the next
 *  overworld combine will fire the beat. */
export const triggerStewardSeal = (state: GameState): void => {
  if (state.currentZone !== Zone.Overworld) return
  if (state.mainQuestPhase === MainQuestPhase.Sealed) return

  let gronEid: number | null = null
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (ident?.definitionId === 'gron') {
      gronEid = eid
      break
    }
  }

  if (gronEid !== null) {
    const target = pickAdjacentWalkableTile(state, state.player.x, state.player.y)
    if (target) {
      const pos = state.world.getComponent(gronEid, ComponentType.Position)
      if (pos) {
        state.world.spatial.move(gronEid, pos.x, pos.y, target.x, target.y)
        pos.x = target.x
        pos.y = target.y
      }
    }
  }

  state.mainQuestPhase = MainQuestPhase.Sealed
  recordDiscovery(state, 'event:steward-sealed')

  state.activeDialog = {
    characterId: 'gron',
    lineIndex: 0,
    typingIndex: 0,
    typingDone: false,
    transitioning: false,
    transitionStartTime: 0,
  }
}

export const breakWall = (state: GameState, time: number): boolean => {
  if (state.caveRevealed) return false
  if (state.currentZone !== Zone.Cave) return false

  const d = DIRECTIONS[state.playerFacing]
  const fx = state.player.x + d.x
  const fy = state.player.y + d.y
  if (!isInBounds(fx, fy, state.mapWidth, state.mapHeight)) return false
  if (state.map[fy][fx].type !== TileType.CaveBreakableWall) return false

  // Start crumble animation
  const crumbleEntity = state.world.createEntity()
  state.world.addComponent(crumbleEntity, ComponentType.MultiPosition, {
    positions: [...state.caveBreakableWallPositions],
  })
  state.world.addComponent(crumbleEntity, ComponentType.TimedEffect, {
    kind: 'crumble',
    startTime: time,
  })
  state.world.addComponent(crumbleEntity, ComponentType.EntityTag, 'crumble')
  state.world.addComponent(crumbleEntity, ComponentType.EntityZone, getCurrentEntityZone(state))

  // Convert breakable wall tiles to CaveFloor
  for (const pos of state.caveBreakableWallPositions) {
    if (isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight)) {
      setMapTile(state, pos.x, pos.y, { type: TileType.CaveFloor })
    }
  }

  // Reveal hidden chamber. Invalidate the cache because the cave-mask
  // condition changes for every caveHiddenPositions entry simultaneously.
  state.caveRevealed = true
  invalidateMapCache(state.map)
  recordDiscovery(state, 'event:wall-break')

  updateFacingEntity(state)
  return true
}
