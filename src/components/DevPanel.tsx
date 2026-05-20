import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelTitle, Tab } from './PanelPrimitives'

import {
  COMPONENT_META,
  DEV_PRESETS,
  ENTITY_TAG_SUGGESTIONS,
  forceSeason,
  getComponentDefaults,
  getEntityPreviewGlyph,
  getRuinPreviewGlyph,
  paintRect,
  RUIN_ARCHETYPE_OPTIONS,
  RUIN_GLYPH_OPTIONS,
  RUIN_GLYPH_RANDOM,
  RUIN_PRESET_KEY,
  RUIN_PRESET_LABEL,
  spawnDevEntity,
  spawnDevRuin,
  TILE_TYPE_LIST,
} from '@/engine/devPanel'
import { ComponentType } from '@/engine/ecs/types'
import { screenToTile } from '@/engine/projection'
import { RuinArchetype, Season } from '@/engine/types'
import type { ComponentMeta, FieldMeta } from '@/engine/devPanel'
import type { CharMetrics, GameState, Position } from '@/engine/types'

type DevTab = 'entity' | 'tile'

interface DevPanelProps {
  state: GameState
  refreshUI: () => void
  metricsRef: React.RefObject<CharMetrics | null>
}

const ENTITY_TAG_LIST = [...ENTITY_TAG_SUGGESTIONS]

// --- Shared helpers ---

const screenToTilePos = (
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  metrics: CharMetrics,
  state: GameState
): Position | null => {
  const rect = canvas.getBoundingClientRect()
  const sx = clientX - rect.left
  const sy = clientY - rect.top
  if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null
  return screenToTile(
    sx,
    sy,
    state.camera,
    metrics.charWidth,
    metrics.charHeight,
    state.viewportWidth,
    state.viewportHeight
  )
}

// --- Field editor components ---

const NumberField = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
  <label className="flex items-center justify-between gap-2">
    <span className="text-muted">{label}</span>
    <input
      type="number"
      value={value}
      onChange={e => {
        onChange(parseFloat(e.target.value) || 0)
      }}
      className="bg-bg border-border-dim w-16 rounded border px-1 py-0.5 text-right text-xs"
    />
  </label>
)

const StringField = ({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suggestions?: string[]
}) => (
  <label className="flex items-center justify-between gap-2">
    <span className="text-muted">{label}</span>
    {suggestions ? (
      <select
        value={suggestions.includes(value) ? value : ''}
        onChange={e => {
          onChange(e.target.value)
        }}
        className="bg-bg border-border-dim min-w-0 flex-1 rounded border px-1 py-0.5 text-right text-xs"
      >
        {!suggestions.includes(value) && <option value="">{value}</option>}
        {suggestions.map(s => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    ) : (
      <input
        type="text"
        value={value}
        onChange={e => {
          onChange(e.target.value)
        }}
        className="bg-bg border-border-dim w-16 rounded border px-1 py-0.5 text-right text-xs"
      />
    )}
  </label>
)

const BoolField = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center justify-between gap-2">
    <span className="text-muted">{label}</span>
    <input
      type="checkbox"
      checked={value}
      onChange={e => {
        onChange(e.target.checked)
      }}
      className="accent-pink"
    />
  </label>
)

const SelectField = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) => (
  <label className="flex items-center justify-between gap-2">
    <span className="text-muted">{label}</span>
    <select
      value={value}
      onChange={e => {
        onChange(e.target.value)
      }}
      className="bg-bg border-border-dim min-w-0 flex-1 rounded border px-1 py-0.5 text-right text-xs"
    >
      {options.map(o => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </label>
)

// --- Field renderer ---

const FieldEditor = ({
  field,
  value,
  onChange,
  isEntityTag,
}: {
  field: FieldMeta
  value: unknown
  onChange: (v: unknown) => void
  isEntityTag?: boolean
}) => {
  if (field.kind === 'number') {
    return <NumberField label={field.name} value={(value as number) ?? 0} onChange={onChange} />
  }
  if (field.kind === 'boolean') {
    return <BoolField label={field.name} value={(value as boolean) ?? false} onChange={onChange} />
  }
  if (field.kind === 'select') {
    const selectVal = typeof value === 'string' ? value : (field.options?.[0] ?? '')
    return <SelectField label={field.name} value={selectVal} options={field.options ?? []} onChange={onChange} />
  }
  // string
  const strVal = typeof value === 'string' ? value : ''
  return (
    <StringField
      label={field.name}
      value={strVal}
      onChange={onChange}
      suggestions={isEntityTag ? ENTITY_TAG_LIST : undefined}
    />
  )
}

// --- Component section ---

const ComponentSection = ({
  meta,
  checked,
  values,
  onToggle,
  onFieldChange,
}: {
  meta: ComponentMeta
  checked: boolean
  values: Record<string, unknown>
  onToggle: () => void
  onFieldChange: (fieldName: string, value: unknown) => void
}) => {
  const [expanded, setExpanded] = useState(false)
  const isEntityTag = meta.type === ComponentType.EntityTag

  return (
    <div className="border-border-dim border-b">
      <div className="flex items-center gap-1 py-1">
        <input type="checkbox" checked={checked} onChange={onToggle} className="accent-pink" />
        <button
          type="button"
          className={`text-xs ${checked ? 'text-text' : 'text-muted'} flex-1 text-left`}
          onClick={() => {
            setExpanded(!expanded)
          }}
        >
          {expanded ? '▾' : '▸'} {meta.label}
        </button>
      </div>
      {expanded && checked && meta.fields.length > 0 && (
        <div className="flex flex-col gap-1 pb-2 pl-5">
          {meta.fields.map(field => (
            <FieldEditor
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={v => {
                onFieldChange(field.name, v)
              }}
              isEntityTag={isEntityTag}
            />
          ))}
        </div>
      )}
      {expanded && checked && isEntityTag && (
        <div className="flex flex-col gap-1 pb-2 pl-5">
          <StringField
            label="Value"
            value={typeof values.value === 'string' ? values.value : ''}
            onChange={v => {
              onFieldChange('value', v)
            }}
            suggestions={ENTITY_TAG_LIST}
          />
        </div>
      )}
    </div>
  )
}

// --- Entity tab ---

const EntityTab = ({ state, refreshUI, metricsRef }: DevPanelProps) => {
  const [checked, setChecked] = useState(() => new Set<ComponentType>())
  const [values, setValues] = useState(() => new Map<ComponentType, Record<string, unknown>>())
  const [filter, setFilter] = useState('')
  const [ruinMode, setRuinMode] = useState(false)
  const [ruinArchetype, setRuinArchetype] = useState<RuinArchetype>(RuinArchetype.DormantGarden)
  const [ruinGlyph, setRuinGlyph] = useState(RUIN_GLYPH_RANDOM)

  const getValues = (type: ComponentType): Record<string, unknown> => {
    const existing = values.get(type)
    if (existing) return existing
    const defaults = getComponentDefaults(type, performance.now(), state.currentZone)
    if (typeof defaults === 'string') return { value: defaults }
    return { ...defaults }
  }

  const applyPreset = (presetKey: string) => {
    if (presetKey === RUIN_PRESET_KEY) {
      setRuinMode(true)
      setChecked(new Set<ComponentType>())
      setValues(new Map<ComponentType, Record<string, unknown>>())
      return
    }
    const preset = DEV_PRESETS[presetKey]
    if (!preset) return
    setRuinMode(false)
    const newChecked = new Set<ComponentType>()
    const newValues = new Map<ComponentType, Record<string, unknown>>()
    const now = performance.now()
    for (const comp of preset.components) {
      newChecked.add(comp.type)
      const defaults = getComponentDefaults(comp.type, now, state.currentZone)
      const base: Record<string, unknown> = typeof defaults === 'string' ? { value: defaults } : { ...defaults }
      if (comp.overrides) {
        Object.assign(base, comp.overrides)
      }
      newValues.set(comp.type, base)
    }
    setChecked(newChecked)
    setValues(newValues)
  }

  const buildComponentMap = (): Map<ComponentType, Record<string, unknown>> => {
    const map = new Map<ComponentType, Record<string, unknown>>()
    for (const type of checked) {
      map.set(type, getValues(type))
    }
    return map
  }

  const spawn = (x: number, y: number) => {
    if (ruinMode) {
      spawnDevRuin(state, { x, y }, ruinArchetype, ruinGlyph)
    } else {
      spawnDevEntity(state, buildComponentMap(), { x, y })
    }
    refreshUI()
  }

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!ruinMode && checked.size === 0) return
      e.preventDefault()

      const glyph = ruinMode ? getRuinPreviewGlyph(ruinGlyph) : getEntityPreviewGlyph(buildComponentMap())

      const handleUp = (ue: MouseEvent) => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        state.devEntityPreview = null

        const metrics = metricsRef.current
        if (!metrics) return
        const canvas = document.querySelector('canvas')
        if (!canvas) return
        const tile = screenToTilePos(ue.clientX, ue.clientY, canvas, metrics, state)
        if (!tile) return
        if (tile.x < 0 || tile.x >= state.mapWidth || tile.y < 0 || tile.y >= state.mapHeight) return

        spawn(tile.x, tile.y)
      }

      const handleMove = (me: MouseEvent) => {
        const metrics = metricsRef.current
        if (!metrics) return
        const canvas = document.querySelector('canvas')
        if (!canvas) return
        const tile = screenToTilePos(me.clientX, me.clientY, canvas, metrics, state)
        if (tile && tile.x >= 0 && tile.x < state.mapWidth && tile.y >= 0 && tile.y < state.mapHeight) {
          state.devEntityPreview = { x: tile.x, y: tile.y, ...glyph }
        } else {
          state.devEntityPreview = null
        }
        refreshUI()
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checked, values, state, refreshUI, metricsRef, ruinMode, ruinArchetype, ruinGlyph]
  )

  const filteredMeta = filter
    ? COMPONENT_META.filter(m => m.label.toLowerCase().includes(filter.toLowerCase()))
    : COMPONENT_META

  const canSpawn = ruinMode || checked.size > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="text-muted text-xs">Preset</span>
        <select
          onChange={e => {
            if (e.target.value) applyPreset(e.target.value)
          }}
          className="bg-bg border-border-dim min-w-0 flex-1 rounded border px-1 py-0.5 text-xs"
          value=""
        >
          <option value="">select...</option>
          {Object.entries(DEV_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.label}
            </option>
          ))}
          <option value={RUIN_PRESET_KEY}>{RUIN_PRESET_LABEL}</option>
        </select>
      </div>

      {ruinMode ? (
        <div className="scrollbar-custom flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted">Archetype</span>
            <select
              value={ruinArchetype}
              onChange={e => {
                setRuinArchetype(e.target.value as RuinArchetype)
              }}
              className="bg-bg border-border-dim min-w-0 flex-1 rounded border px-1 py-0.5 text-xs"
            >
              {RUIN_ARCHETYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted">Glyph</span>
            <select
              value={ruinGlyph}
              onChange={e => {
                setRuinGlyph(e.target.value)
              }}
              className="bg-bg border-border-dim min-w-0 flex-1 rounded border px-1 py-0.5 text-xs"
            >
              {RUIN_GLYPH_OPTIONS.map(g => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={e => {
              setFilter(e.target.value)
            }}
            className="bg-bg border-border-dim shrink-0 rounded border px-2 py-1 text-xs"
          />

          <div className="scrollbar-custom min-h-0 flex-1 overflow-y-auto">
            {filteredMeta.map(meta => (
              <ComponentSection
                key={meta.type}
                meta={meta}
                checked={checked.has(meta.type)}
                values={getValues(meta.type)}
                onToggle={() => {
                  const next = new Set(checked)
                  if (next.has(meta.type)) {
                    next.delete(meta.type)
                  } else {
                    next.add(meta.type)
                  }
                  setChecked(next)
                }}
                onFieldChange={(fieldName, value) => {
                  const current = getValues(meta.type)
                  const updated = { ...current, [fieldName]: value }
                  setValues(new Map(values).set(meta.type, updated))
                }}
              />
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        disabled={!canSpawn}
        onMouseDown={handleDragStart}
        className={`border-border-dim shrink-0 rounded border px-2 py-1 text-xs ${canSpawn ? 'text-pink hover:bg-pink/20 cursor-grab' : 'text-muted cursor-not-allowed'}`}
      >
        DRAG TO PLACE
      </button>
    </div>
  )
}

// --- Tile tab ---

const TileTab = ({ state, refreshUI, metricsRef }: DevPanelProps) => {
  const [selectedTile, setSelectedTile] = useState<string | null>(null)
  const listenerRef = useRef<((e: MouseEvent) => void) | null>(null)

  // Clean up listener on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        const canvas = document.querySelector('canvas')
        canvas?.removeEventListener('mousedown', listenerRef.current)
      }
    }
  }, [])

  const handleCanvasMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!selectedTile) return
      const metrics = metricsRef.current
      if (!metrics) return
      const canvas = document.querySelector('canvas')
      if (!canvas) return

      const startTile = screenToTilePos(e.clientX, e.clientY, canvas, metrics, state)
      if (!startTile) return

      let currentTile = startTile

      // Show initial preview (single tile)
      state.devPaintPreview = {
        x1: startTile.x,
        y1: startTile.y,
        x2: startTile.x,
        y2: startTile.y,
        tileType: selectedTile,
      }
      refreshUI()

      const handleMove = (me: MouseEvent) => {
        const tile = screenToTilePos(me.clientX, me.clientY, canvas, metrics, state)
        if (tile) {
          currentTile = tile
          state.devPaintPreview = {
            x1: startTile.x,
            y1: startTile.y,
            x2: currentTile.x,
            y2: currentTile.y,
            tileType: selectedTile,
          }
          refreshUI()
        }
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)

        paintRect(state, startTile.x, startTile.y, currentTile.x, currentTile.y, selectedTile)
        state.devPaintPreview = null
        refreshUI()
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [selectedTile, state, refreshUI, metricsRef]
  )

  const activatePaint = (tileType: string) => {
    // Deactivate previous listener
    if (listenerRef.current) {
      const canvas = document.querySelector('canvas')
      canvas?.removeEventListener('mousedown', listenerRef.current)
      listenerRef.current = null
    }

    if (selectedTile === tileType) {
      setSelectedTile(null)
      return
    }

    setSelectedTile(tileType)

    // Attach listener on next frame
    requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas')
      if (canvas) {
        canvas.addEventListener('mousedown', handleCanvasMouseDown)
        listenerRef.current = handleCanvasMouseDown
      }
    })
  }

  // Re-attach listener when handleCanvasMouseDown changes (selectedTile changed)
  const prevCallbackRef = useRef(handleCanvasMouseDown)
  if (prevCallbackRef.current !== handleCanvasMouseDown && selectedTile) {
    if (listenerRef.current) {
      const canvas = document.querySelector('canvas')
      canvas?.removeEventListener('mousedown', listenerRef.current)
    }
    requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas')
      if (canvas) {
        canvas.addEventListener('mousedown', handleCanvasMouseDown)
        listenerRef.current = handleCanvasMouseDown
      }
    })
    prevCallbackRef.current = handleCanvasMouseDown
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="scrollbar-custom flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {TILE_TYPE_LIST.map(tile => (
          <button
            key={tile.value}
            type="button"
            onClick={() => {
              activatePaint(tile.value)
            }}
            className={`shrink-0 rounded px-2 py-1 text-left text-xs ${
              selectedTile === tile.value ? 'bg-pink text-bg' : 'text-text hover:bg-pink/20'
            }`}
          >
            {tile.label.toUpperCase()}
          </button>
        ))}
      </div>
      {selectedTile && (
        <button
          type="button"
          onClick={() => {
            if (listenerRef.current) {
              const canvas = document.querySelector('canvas')
              canvas?.removeEventListener('mousedown', listenerRef.current)
              listenerRef.current = null
            }
            setSelectedTile(null)
          }}
          className="text-muted hover:text-pink shrink-0 text-xs"
        >
          CLEAR BRUSH
        </button>
      )}
    </div>
  )
}

// --- Main panel ---

export const DevPanel = (props: DevPanelProps) => {
  const [tab, setTab] = useState<DevTab>('entity')

  return (
    <div
      data-panel="dev-panel"
      className="text-text pointer-events-none fixed top-0 left-0 z-[60] flex h-full w-52 flex-col bg-black/70 px-4 py-4 font-mono text-xs"
    >
      <div className="pointer-events-auto flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between">
          <PanelTitle>Dev Panel</PanelTitle>
          <span className="text-dim shrink-0 text-xs">` to toggle</span>
        </div>

        <label className="flex shrink-0 items-center justify-between gap-2">
          <span className="text-muted">Force Season</span>
          <select
            value={props.state.weather.season}
            onChange={e => {
              forceSeason(props.state, e.target.value as Season)
              props.refreshUI()
            }}
            className="bg-bg border-border-dim min-w-0 flex-1 rounded border px-1 py-0.5 text-right text-xs"
          >
            {Object.values(Season).map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="border-border-dim flex shrink-0 border-b">
          <Tab
            active={tab === 'entity'}
            onClick={() => {
              setTab('entity')
            }}
          >
            ENTITY
          </Tab>
          <Tab
            active={tab === 'tile'}
            onClick={() => {
              setTab('tile')
            }}
          >
            TILE
          </Tab>
        </div>

        {tab === 'entity' && <EntityTab {...props} />}
        {tab === 'tile' && <TileTab {...props} />}
      </div>
    </div>
  )
}
