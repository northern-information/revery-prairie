import { getCharacterDefinition } from './characters'
import { ComponentType } from './ecs'
import { createOmniboxContainer, findFitPosition, placeItem } from './inventory'
import { CARDINAL, DIRECTIONS, isInBounds } from './position'
import { Rotation, TileType, Zone } from './types'

import type { Character, GameState } from './types'

export const isInteractableAt = (state: GameState, x: number, y: number): boolean => {
  if (state.groundOmniboxes.some(go => go.pos.x === x && go.pos.y === y)) return true
  if (state.characters.some(c => c.pos.x === x && c.pos.y === y)) return true
  if (
    state.currentZone === Zone.Cave &&
    !state.caveRevealed &&
    isInBounds(x, y, state.mapWidth, state.mapHeight) &&
    state.map[y][x].type === TileType.CaveBreakableWall
  ) {
    return true
  }
  return false
}

export const updateFacingEntity = (state: GameState): void => {
  const switchIfOpen = (x: number, y: number) => {
    const go = state.groundOmniboxes.find(g => g.pos.x === x && g.pos.y === y)
    if (
      go &&
      state.openContainer &&
      state.groundOmniboxes.some(g => g.uid === state.openContainer?.id) &&
      state.openContainer.id !== go.uid
    ) {
      const container = state.omniboxContainers.get(go.uid)
      if (container) state.openContainer = container
    }
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

export const getAdjacentCharacter = (state: GameState): Character | null => {
  const px = state.player.x
  const py = state.player.y
  // Prefer the character in the facing direction
  const d = DIRECTIONS[state.playerFacing]
  const fx = px + d.x
  const fy = py + d.y
  const facing = state.characters.find(c => c.pos.x === fx && c.pos.y === fy)
  if (facing) return facing
  // Fall back to any cardinally adjacent character
  for (const cd of CARDINAL) {
    const nx = px + cd.x
    const ny = py + cd.y
    const character = state.characters.find(c => c.pos.x === nx && c.pos.y === ny)
    if (character) return character
  }
  return null
}

export const interactWithCharacter = (state: GameState): boolean => {
  const character = getAdjacentCharacter(state)
  if (!character) return false
  state.activeDialog = {
    characterId: character.definitionId,
    lineIndex: 0,
    typingIndex: 0,
    typingDone: false,
    transitioning: false,
    transitionStartTime: 0,
  }
  return true
}

export const advanceDialog = (state: GameState): boolean => {
  if (!state.activeDialog) return false

  // If still typing, reveal the full line instantly
  if (!state.activeDialog.typingDone) {
    const def = getCharacterDefinition(state.activeDialog.characterId)
    const line = def.dialog[state.activeDialog.lineIndex]
    state.activeDialog.typingIndex = line.length
    state.activeDialog.typingDone = true
    return true
  }

  // If transitioning between lines, ignore
  if (state.activeDialog.transitioning) return true

  const def = getCharacterDefinition(state.activeDialog.characterId)
  if (state.activeDialog.lineIndex < def.dialog.length - 1) {
    state.activeDialog.transitioning = true
    state.activeDialog.transitionStartTime = performance.now()
    return true
  }
  state.activeDialog = null
  return false
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

export const tickDialogTyping = (state: GameState, lastTypingTime: number, now: number): number => {
  if (!state.activeDialog || state.activeDialog.typingDone || state.activeDialog.transitioning) return lastTypingTime
  if (now - lastTypingTime < DIALOG_TYPING_MS) return lastTypingTime

  const def = getCharacterDefinition(state.activeDialog.characterId)
  const line = def.dialog[state.activeDialog.lineIndex]
  state.activeDialog.typingIndex++
  if (state.activeDialog.typingIndex >= line.length) {
    state.activeDialog.typingDone = true
  }
  return now
}

export { DIALOG_TRANSITION_MS }

export const giveMoabGift = (state: GameState): boolean => {
  if (state.moabGiftGiven) return false

  const fit = findFitPosition(state.backpack, 'omnibox')
  if (!fit) return false

  const omniboxItem = placeItem(state.backpack, 'omnibox', fit.rotation, fit.gridX, fit.gridY)
  if (!omniboxItem) return false

  const container = createOmniboxContainer(state, omniboxItem.uid)

  // Fill the omnibox with bees
  for (let y = 0; y < container.height; y++) {
    for (let x = 0; x < container.width; x++) {
      placeItem(container, 'bee', Rotation.R0, x, y)
    }
  }

  state.moabGiftGiven = true

  // Switch Moab's dialog to post-gift single line
  const def = getCharacterDefinition('moab')
  def.dialog = ['...']

  return true
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

  // Convert breakable wall tiles to CaveFloor
  for (const pos of state.caveBreakableWallPositions) {
    if (isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight)) {
      state.map[pos.y][pos.x] = { type: TileType.CaveFloor }
    }
  }

  // Reveal hidden chamber
  state.caveRevealed = true

  updateFacingEntity(state)
  return true
}
