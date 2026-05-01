import { getCharacterDefinition } from '@/engine/characters'
import { PLAYER_CHAR, PLAYER_COLOR } from '@/engine/constants'
import { ComponentType } from '@/engine/ecs/types'
import { CoyoteMode } from '@/engine/types'

import type { GameState } from '@/engine/types'

interface CommandPanelProps {
  state: GameState
  refreshUI: () => void
}

const PANEL_BG = 'rgba(0, 0, 0, 0.85)'
const BORDER_COLOR = '#ff69b4'
const ACTIVE_MODE_BG = 'rgba(255, 105, 180, 0.3)'

const getSelectedUnitInfo = (
  state: GameState
): { definitionId: string; name: string; glyph: string; glyphColor: string; portrait?: string }[] => {
  const units: { definitionId: string; name: string; glyph: string; glyphColor: string; portrait?: string }[] = []
  if (state.playerSelected) {
    units.push({
      definitionId: 'player',
      name: state.stewardName || 'you',
      glyph: PLAYER_CHAR,
      glyphColor: PLAYER_COLOR,
    })
  }
  for (const eid of state.selectedUnits) {
    if (!state.world.isAlive(eid)) continue
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (!identity) continue
    const def = getCharacterDefinition(identity.definitionId)
    units.push({
      definitionId: identity.definitionId,
      name: def.name,
      glyph: def.glyph,
      glyphColor: def.glyphColor,
      portrait: def.portrait,
    })
  }
  return units
}

const UnitPortrait = ({
  glyph,
  glyphColor,
  portrait,
  size,
}: {
  glyph: string
  glyphColor: string
  portrait?: string
  size: number
}) => (
  <div
    className="flex items-center justify-center rounded border border-border"
    style={{ width: size, height: size, backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
  >
    {portrait ? (
      <img src={portrait} alt="" className="h-full w-full rounded object-cover" />
    ) : (
      <span className="font-mono text-2xl" style={{ color: glyphColor }}>
        {glyph}
      </span>
    )}
  </div>
)

const CoyoteCommands = ({
  state,
  refreshUI,
}: {
  state: GameState
  refreshUI: () => void
}) => (
  <div className="flex gap-1">
    <button
      className="rounded border px-2 py-1 font-mono text-xs transition-colors"
      style={{
        borderColor: BORDER_COLOR,
        backgroundColor: state.coyoteMode === CoyoteMode.Follow ? ACTIVE_MODE_BG : 'transparent',
        color: state.coyoteMode === CoyoteMode.Follow ? '#ff69b4' : '#999',
      }}
      onClick={() => {
        state.coyoteMode = CoyoteMode.Follow
        state.coyotePath = null
        refreshUI()
      }}
    >
      follow
    </button>
    <button
      className="rounded border px-2 py-1 font-mono text-xs transition-colors"
      style={{
        borderColor: BORDER_COLOR,
        backgroundColor: state.coyoteMode === CoyoteMode.Collect ? ACTIVE_MODE_BG : 'transparent',
        color: state.coyoteMode === CoyoteMode.Collect ? '#ff69b4' : '#999',
      }}
      onClick={() => {
        state.coyoteMode = CoyoteMode.Collect
        state.coyotePath = null
        refreshUI()
      }}
    >
      collect
    </button>
  </div>
)

export const CommandPanel = ({ state, refreshUI }: CommandPanelProps) => {
  const units = getSelectedUnitInfo(state)
  if (units.length === 0) return null

  const isSingleSelect = units.length === 1
  const singleUnit = isSingleSelect ? units[0] : null

  const suppressEdgeScroll = () => {
    state.edgeScrollPos = null
    state.cursorScreenPos = null
    state.cursorTile = null
  }

  return (
    <div
      data-panel="command-panel"
      className="pointer-events-auto fixed bottom-2 left-1/2 z-20 ml-[100px] flex -translate-x-1/2 items-center gap-3 rounded border px-2 py-2"
      style={{ backgroundColor: PANEL_BG, borderColor: BORDER_COLOR }}
      onMouseEnter={suppressEdgeScroll}
      onMouseMove={suppressEdgeScroll}
    >
      {isSingleSelect && singleUnit ? (
        <>
          <UnitPortrait
            glyph={singleUnit.glyph}
            glyphColor={singleUnit.glyphColor}
            portrait={singleUnit.portrait}
            size={48}
          />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-sm text-white">{singleUnit.name}</span>
            {singleUnit.definitionId === 'coyote' && (
              <CoyoteCommands state={state} refreshUI={refreshUI} />
            )}
          </div>
        </>
      ) : (
        <div className="flex gap-1">
          {units.map((unit, i) => (
            <UnitPortrait
              key={i}
              glyph={unit.glyph}
              glyphColor={unit.glyphColor}
              portrait={unit.portrait}
              size={36}
            />
          ))}
        </div>
      )}
    </div>
  )
}
