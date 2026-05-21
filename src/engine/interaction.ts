import { storeAngelCanto } from './angels'
import { getCharacterDefinition, getCharacterDialog } from './characters'
import { ComponentType } from './ecs/types'
import { spawnPickupBloom } from './effects'
import { RuinRole } from './genesisTypes'
import { recordDiscovery } from './manual'
import { setMapTile } from './map'
import { spawnBeeOrMonarch } from './monarch'
import { CARDINAL, DIRECTIONS, isInBounds, isWalkableTile, posKey } from './position'
import { selectUnit } from './selection'
import { invalidateMapCache } from './tileBgCache'
import { CoyoteMode, MainQuestPhase, MoabState, TileType, Zone } from './types'
import { getCurrentEntityZone, spatialAtInCurrentZone } from './zone'

import type { GameState, Position } from './types'

export interface GiftAnnouncement {
  name: string
  glyphs: string[]
  glyphColor: string
}

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
  // Oak body tiles — same pattern as angels (3x3 MultiPosition, not in spatial)
  for (const eid of state.world.query(ComponentType.OakData, ComponentType.MultiPosition)) {
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
  if (
    state.currentZone === Zone.Ruin &&
    isInBounds(x, y, state.mapWidth, state.mapHeight) &&
    state.map[y][x].type === TileType.RuinDebris
  ) {
    return true
  }
  if (isInBounds(x, y, state.mapWidth, state.mapHeight) && state.map[y][x].type === TileType.Flora) {
    return true
  }
  // Egregore tiles are F-hold scan targets (precis-8a egregore-glyph-scan-fix).
  // The cursor highlights them and the facing entity reticle locks on, same
  // affordance as flora.
  if (isInBounds(x, y, state.mapWidth, state.mapHeight) && state.map[y][x].type === TileType.Egregore) {
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
): { opened: boolean; gift: GiftAnnouncement | null; coyoteToggled: boolean } => {
  const character = getAdjacentCharacter(state)
  if (!character) return { opened: false, gift: null, coyoteToggled: false }
  recordDiscovery(state, `character:${character.definitionId}`)

  // Coyote has no dialog — interacting selects it so the command panel
  // surfaces Follow/Collect controls.
  if (character.definitionId === 'coyote') {
    for (const eid of spatialAtInCurrentZone(state, character.pos.x, character.pos.y)) {
      const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
      if (identity?.definitionId === 'coyote') {
        selectUnit(state, eid)
        break
      }
    }
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
): { continuing: boolean; gift: GiftAnnouncement | null } => {
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

  // Gron has been saving these — release them when his sealed dialog closes.
  if (characterId === 'gron' && state.pendingSavedBees) {
    releaseSavedBees(state)
    state.pendingSavedBees = false
  }

  // Precis #9b — completing dialog with Moab while he is walking the
  // line dismisses him. moabState flips to 'dismissed'; the torchbearer
  // tick converts that to 'returning' next pass and Moab pathfinds back
  // to the cave. lockedBurnLine stays in state until Spring → Summer.
  if (characterId === 'moab' && state.moabState === MoabState.Walking) {
    state.moabState = MoabState.Dismissed
  }

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

export const giveCharacterGift = (
  state: GameState,
  characterId: string,
  _time?: number
): GiftAnnouncement | null => {
  const def = getCharacterDefinition(characterId)
  if (!def.gift) return null
  if (state.giftsReceived.has(characterId)) return null
  // Item gifts — deferred to precis #5 (ruin recovery).
  return null
}

export const givePostGift = (
  _state: GameState,
  characterId: string,
  _time?: number
): GiftAnnouncement | null => {
  const def = getCharacterDefinition(characterId)
  if (!def.postGift) return null
  // Item postGifts — deferred to a later feature.
  return null
}

export const isFacingLockedDoor = (state: GameState): boolean => {
  if (state.currentZone !== Zone.Ruin) return false
  const d = DIRECTIONS[state.playerFacing]
  const fx = state.player.x + d.x
  const fy = state.player.y + d.y
  if (!isInBounds(fx, fy, state.mapWidth, state.mapHeight)) return false
  return state.map[fy][fx].type === TileType.RuinDoorLocked
}

// Open the locked gate dialog using the synthetic 'gate' speaker. Reuses
// the existing dialog modal so the player gets a visible explanation when
// they try to open a locked door without an aqueductKey, instead of a
// silent no-op.
export const openLockedGateDialog = (state: GameState): void => {
  state.activeDialog = {
    characterId: 'gate',
    lineIndex: 0,
    typingIndex: 0,
    typingDone: false,
    transitioning: false,
    transitionStartTime: 0,
  }
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
  const keyItem = state.backpack.items.find(i => i.definitionId === 'aqueductKey')
  if (!keyItem) return false
  state.backpack.items = state.backpack.items.filter(i => i.uid !== keyItem.uid)

  // Open every door tile in the current ruin atomically. Always include
  // the facing tile as a fallback in case dormantGarden.doorPositions is
  // unset (older saves, non-dormant-garden archetypes, or test stubs that
  // override state.map directly).
  const interior = state.currentRuinIndex !== null ? state.ruinInteriors[state.currentRuinIndex] : null
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

  recordDiscovery(state, 'event:ruin-door-unlocked')

  updateFacingEntity(state)
  return true
}

/** If the player faces a RuinDebris tile, convert it to RuinFloor.
 *  Mirrors the cave breakable-wall mechanic: single-hit, no item
 *  required. Records 'event:rubble-cleared' on the first clear.
 *  Returns true if cleared.
 *
 *  When the facing tile is part of the current ruin's collapseBarrier
 *  (the 3-tile gating row in coyote-role ruins), every barrier tile
 *  collapses in this call — matches breakWall's atomic cave-wall pattern.
 *  A crumble TimedEffect entity covers all barrier tiles, and a
 *  pickupBloom fires at the player position. Scattered debris (anywhere
 *  outside collapseBarrier) keeps its single-tile clear behavior. */
export const clearRuinDebris = (state: GameState, time = performance.now()): boolean => {
  if (state.currentZone !== Zone.Ruin) return false
  const d = DIRECTIONS[state.playerFacing]
  const fx = state.player.x + d.x
  const fy = state.player.y + d.y
  if (!isInBounds(fx, fy, state.mapWidth, state.mapHeight)) return false
  if (state.map[fy][fx].type !== TileType.RuinDebris) return false

  const interior = state.currentRuinIndex !== null ? state.ruinInteriors[state.currentRuinIndex] : null
  const barrier = interior?.dormantGarden?.collapseBarrier ?? null
  const inBarrier = barrier?.some(p => p.x === fx && p.y === fy) ?? false

  if (inBarrier && barrier) {
    for (const bp of barrier) {
      if (!isInBounds(bp.x, bp.y, state.mapWidth, state.mapHeight)) continue
      if (state.map[bp.y][bp.x].type === TileType.RuinDebris) {
        setMapTile(state, bp.x, bp.y, { type: TileType.RuinFloor })
      }
    }
    const crumbleEntity = state.world.createEntity()
    state.world.addComponent(crumbleEntity, ComponentType.MultiPosition, {
      positions: barrier.map(p => ({ x: p.x, y: p.y })),
    })
    state.world.addComponent(crumbleEntity, ComponentType.TimedEffect, {
      kind: 'crumble',
      startTime: time,
    })
    state.world.addComponent(crumbleEntity, ComponentType.EntityTag, 'crumble')
    state.world.addComponent(crumbleEntity, ComponentType.EntityZone, getCurrentEntityZone(state))
    spawnPickupBloom(state, state.player.x, state.player.y, time)
  } else {
    setMapTile(state, fx, fy, { type: TileType.RuinFloor })
  }

  recordDiscovery(state, 'event:rubble-cleared')
  updateFacingEntity(state)
  return true
}

/** Fires the rescue if the player has just become cardinally adjacent to
 *  the trapped coyote in the coyote-role ruin. Gated on
 *  mainQuestPhase === AwaitingCoyote so it cannot re-fire after success.
 *  Called from movement.ts after every successful step. */
export const tryCoyoteRescueOnApproach = (state: GameState): void => {
  if (state.mainQuestPhase !== MainQuestPhase.AwaitingCoyote) return
  if (state.currentZone !== Zone.Ruin) return
  if (state.currentRuinIndex === null) return
  const ruin = state.civilizationRuins[state.currentRuinIndex]
  if (ruin?.role !== RuinRole.Coyote) return

  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (ident?.definitionId !== 'coyote') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) return
    const dx = Math.abs(pos.x - state.player.x)
    const dy = Math.abs(pos.y - state.player.y)
    if (dx + dy === 1) {
      rescueCoyote(state)
    }
    return
  }
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

  spawnPickupBloom(state, state.player.x, state.player.y, performance.now())
  recordDiscovery(state, 'character:coyote')
  recordDiscovery(state, 'event:rescue-coyote')

  state.mainQuestPhase = MainQuestPhase.Gathering

  state.activeDialog = {
    characterId: 'coyote',
    lineIndex: 0,
    typingIndex: 0,
    typingDone: false,
    transitioning: false,
    transitionStartTime: 0,
  }
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

/** Release up to 3 bees on tiles in a 3x3 radius around the player. Prefers
 *  clover tiles; falls back to any walkable non-water tile in the radius if
 *  fewer than 3 clover tiles are available. Returns the number spawned. */
const releaseSavedBees = (state: GameState): number => {
  const cloverTiles: Position[] = []
  const fallbackTiles: Position[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = state.player.x + dx
      const ty = state.player.y + dy
      if (!isInBounds(tx, ty, state.mapWidth, state.mapHeight)) continue
      const tile = state.map[ty][tx].type
      if (!isWalkableTile(tile)) continue
      const k = posKey(tx, ty)
      if (state.ponds.has(k) || state.rivers.has(k)) continue
      if (tile === TileType.Flora) {
        cloverTiles.push({ x: tx, y: ty })
      } else {
        fallbackTiles.push({ x: tx, y: ty })
      }
    }
  }
  const candidates = [...cloverTiles, ...fallbackTiles]
  const targetCount = Math.min(3, candidates.length)
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.floor(Math.random() * candidates.length)
    const [pick] = candidates.splice(idx, 1)
    spawnBeeOrMonarch(state, pick.x, pick.y)
  }
  return targetCount
}

/** Called after a successful bee+clover combine. If the player is on the
 *  overworld and has not yet been sealed, teleport Gron adjacent to the
 *  player, advance mainQuestPhase to Sealed, and auto-open Gron's dialog.
 *  Combines in the cave or inside a ruin are silently no-ops — the next
 *  overworld combine will fire the beat. */
export const triggerStewardSeal = (state: GameState, time?: number): void => {
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
        if (time !== undefined) state.angelFlashTime = time
      }
    }
  }

  state.mainQuestPhase = MainQuestPhase.Sealed
  state.pendingSavedBees = true
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

