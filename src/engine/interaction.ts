import { autoAssignRevery } from './actionBar'
import { storeAngelCanto } from './angels'
import { getCharacterDefinition, getCharacterDialog } from './characters'
import { toggleCoyoteMode } from './coyote'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { CARDINAL, DIRECTIONS, isInBounds, posKey } from './position'
import { getReveryDefinition } from './reveries'
import { TileType, Zone } from './types'

import type { GameState, ReveryDefinition } from './types'

export const isInteractableAt = (state: GameState, x: number, y: number): boolean => {
  if (
    state.world.spatial.at(x, y).some(eid => {
      const tag = state.world.getComponent(eid, ComponentType.EntityTag)
      return tag === 'groundOmnibox' || tag === 'character'
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
  if (isInBounds(x, y, state.mapWidth, state.mapHeight) && state.map[y][x].type === TileType.Clover) {
    return true
  }
  return false
}

export const updateFacingEntity = (state: GameState): void => {
  const switchIfOpen = (x: number, y: number) => {
    // Find ground omnibox at this position
    let goUid: string | null = null
    for (const eid of state.world.spatial.at(x, y)) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundOmnibox') continue
      const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
      if (link) goUid = link.uid
      break
    }
    if (!goUid || !state.openContainer) return
    // Only switch if the open container is also a ground omnibox
    let openIsGround = false
    for (const eid of state.world.query(ComponentType.OmniboxLink, ComponentType.EntityTag)) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundOmnibox') continue
      if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== state.currentZone) continue
      const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
      if (link?.uid === state.openContainer.id) {
        openIsGround = true
        break
      }
    }
    if (!openIsGround || state.openContainer.id === goUid) return
    const container = state.omniboxContainers.get(goUid)
    if (container) state.openContainer = container
  }

  // Prefer the interactable in the facing direction
  const d = DIRECTIONS[state.playerFacing]
  const fx = state.player.x + d.x
  const fy = state.player.y + d.y
  if (isInteractableAt(state, fx, fy)) {
    state.facingEntityPos = { x: fx, y: fy }
    switchIfOpen(fx, fy)
    return
  }
  // Fall back to any cardinally adjacent interactable
  for (const cd of CARDINAL) {
    const nx = state.player.x + cd.x
    const ny = state.player.y + cd.y
    if (isInteractableAt(state, nx, ny)) {
      state.facingEntityPos = { x: nx, y: ny }
      switchIfOpen(nx, ny)
      return
    }
  }
  state.facingEntityPos = null
}

/** @deprecated Use updateFacingEntity instead */
export const updateFacingOmnibox = updateFacingEntity

export const getAdjacentCharacter = (
  state: GameState
): { definitionId: string; pos: { x: number; y: number } } | null => {
  const px = state.player.x
  const py = state.player.y

  const findCharAt = (x: number, y: number): { definitionId: string; pos: { x: number; y: number } } | null => {
    for (const eid of state.world.spatial.at(x, y)) {
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

  // Coyote uses mode toggle instead of dialog
  if (character.definitionId === 'coyote') {
    toggleCoyoteMode(state)
    return { opened: false, gift: null, coyoteToggled: true }
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

export const advanceDialog = (state: GameState): { continuing: boolean; gift: ReveryDefinition | null } => {
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
    const gift = giveCharacterGift(state, characterId)
    return { continuing: false, gift }
  }

  // Give one-time postGift when completing postGiftDialog
  const def = getCharacterDefinition(characterId)
  if (def.postGift && !state.postGiftActionsCompleted.has(characterId)) {
    const gift = givePostGift(state, characterId)
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

export const giveCharacterGift = (state: GameState, characterId: string): ReveryDefinition | null => {
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
    return reveryDef
  }

  // Item gifts — deferred
  return null
}

export const givePostGift = (state: GameState, characterId: string): ReveryDefinition | null => {
  const def = getCharacterDefinition(characterId)
  if (!def.postGift) return null

  if (def.postGift.kind === 'revery') {
    const reveryDef = getReveryDefinition(def.postGift.id)
    state.reveries.push(def.postGift.id)
    autoAssignRevery(state, def.postGift.id)
    recordDiscovery(state, `revery:${def.postGift.id}`)
    recordDiscovery(state, `event:${characterId}-deep-time`)
    return reveryDef
  }

  return null
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
  state.world.addComponent(crumbleEntity, ComponentType.EntityZone, { zone: state.currentZone })

  // Convert breakable wall tiles to CaveFloor
  for (const pos of state.caveBreakableWallPositions) {
    if (isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight)) {
      state.map[pos.y][pos.x] = { type: TileType.CaveFloor }
    }
  }

  // Reveal hidden chamber
  state.caveRevealed = true
  recordDiscovery(state, 'event:wall-break')

  updateFacingEntity(state)
  return true
}
