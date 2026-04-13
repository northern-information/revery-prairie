import { useCallback, useRef, useState } from 'react'
import { PanelTitle, SectionHeader, Tab } from './PanelPrimitives'

import {
  COMPONENT_META,
  DEV_PRESETS,
  paintTile,
  spawnDevEntity,
  TILE_TYPE_LIST,
  getComponentDefaults,
} from '@/engine/devPanel'
import { ComponentType } from '@/engine/ecs/types'

import type { ComponentMeta, FieldMeta } from '@/engine/devPanel'
import type { CharMetrics, GameState } from '@/engine/types'

type DevTab = 'entity' | 'tile'

interface DevPanelProps {
  state: GameState
  refreshUI: () => void
  metricsRef: React.RefObject<CharMetrics | null>
}

const ENTITY_TAG_SUGGESTIONS = [
  'bee',
  'angel',
  'character',
  'groundItem',
  'meteorite',
  'beehive',
  'groundOmnibox',
  'shootingStar',
  'explosion',
  'pickupBloom',
  'reveryCast',
  'lightning',
  'wildfire',
  'crumble',
]

// --- Field editor components ---

const NumberField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) => (
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

const BoolField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) => (
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
    return (
      <SelectField
        label={field.name}
        value={selectVal}
        options={field.options ?? []}
        onChange={onChange}
      />
    )
  }
  // string
  const strVal = typeof value === 'string' ? value : ''
  return (
    <StringField
      label={field.name}
      value={strVal}
      onChange={onChange}
      suggestions={isEntityTag ? ENTITY_TAG_SUGGESTIONS : undefined}
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
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-pink"
        />
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
            label="value"
            value={typeof values.value === 'string' ? values.value : ''}
            onChange={v => {
              onFieldChange('value', v)
            }}
            suggestions={ENTITY_TAG_SUGGESTIONS}
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
  const dragRef = useRef(false)

  const getValues = (type: ComponentType): Record<string, unknown> => {
    const existing = values.get(type)
    if (existing) return existing
    const defaults = getComponentDefaults(type, performance.now(), state.currentZone)
    if (typeof defaults === 'string') return { value: defaults }
    return { ...defaults }
  }

  const applyPreset = (presetKey: string) => {
    const preset = DEV_PRESETS[presetKey]
    if (!preset) return
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
    spawnDevEntity(state, buildComponentMap(), { x, y })
    refreshUI()
  }

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (checked.size === 0) return
      e.preventDefault()
      dragRef.current = true

      const handleMove = (me: MouseEvent) => {
        // Update cursor tile for preview — handled by existing cursor tracking
        void me
      }

      const handleUp = (ue: MouseEvent) => {
        dragRef.current = false
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)

        const metrics = metricsRef.current
        if (!metrics) return

        const canvas = document.querySelector('canvas')
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const sx = ue.clientX - rect.left
        const sy = ue.clientY - rect.top

        if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return

        const tileX = Math.floor(sx / metrics.charWidth) + state.camera.x
        const tileY = Math.floor(sy / metrics.charHeight) + state.camera.y

        if (tileX < 0 || tileX >= state.mapWidth || tileY < 0 || tileY >= state.mapHeight) return

        spawn(tileX, tileY)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checked, values, state, refreshUI, metricsRef]
  )

  const filteredMeta = filter
    ? COMPONENT_META.filter(m => m.label.toLowerCase().includes(filter.toLowerCase()))
    : COMPONENT_META

  const hasPosition = checked.has(ComponentType.Position)
  const canSpawn = checked.size > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="text-muted text-xs">preset</span>
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
        </select>
      </div>

      <input
        type="text"
        placeholder="filter..."
        value={filter}
        onChange={e => {
          setFilter(e.target.value)
        }}
        className="bg-bg border-border-dim rounded border px-2 py-1 text-xs"
      />

      <div className="scrollbar-custom max-h-64 overflow-y-auto">
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

      <div className="flex gap-1">
        <button
          type="button"
          disabled={!canSpawn}
          onMouseDown={handleDragStart}
          className={`border-border-dim flex-1 rounded border px-2 py-1 text-xs ${canSpawn ? 'text-pink hover:bg-pink/20 cursor-grab' : 'text-muted cursor-not-allowed'}`}
        >
          drag to place
        </button>
        <button
          type="button"
          disabled={!canSpawn || !hasPosition || !state.cursorTile}
          onClick={() => {
            if (state.cursorTile) spawn(state.cursorTile.x, state.cursorTile.y)
          }}
          className={`border-border-dim flex-1 rounded border px-2 py-1 text-xs ${canSpawn && hasPosition && state.cursorTile ? 'text-pink hover:bg-pink/20' : 'text-muted cursor-not-allowed'}`}
        >
          spawn at cursor
        </button>
      </div>
    </div>
  )
}

// --- Tile tab ---

const TileTab = ({ state, refreshUI, metricsRef }: DevPanelProps) => {
  const [selectedTile, setSelectedTile] = useState<string | null>(null)
  const paintingRef = useRef(false)

  const handleCanvasMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!selectedTile) return
      const metrics = metricsRef.current
      if (!metrics) return
      const canvas = document.querySelector('canvas')
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return

      const tileX = Math.floor(sx / metrics.charWidth) + state.camera.x
      const tileY = Math.floor(sy / metrics.charHeight) + state.camera.y

      paintTile(state, tileX, tileY, selectedTile)
      paintingRef.current = true
      refreshUI()

      const handleMove = (me: MouseEvent) => {
        if (!paintingRef.current) return
        const msx = me.clientX - rect.left
        const msy = me.clientY - rect.top
        const mx = Math.floor(msx / metrics.charWidth) + state.camera.x
        const my = Math.floor(msy / metrics.charHeight) + state.camera.y
        paintTile(state, mx, my, selectedTile)
        refreshUI()
      }

      const handleUp = () => {
        paintingRef.current = false
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [selectedTile, state, refreshUI, metricsRef]
  )

  // Register/unregister canvas listener when paint mode is active
  const listenerRef = useRef<((e: MouseEvent) => void) | null>(null)

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
  }

  // Effect: when selectedTile changes, attach/detach listener
  // Using ref-based approach to avoid useEffect dependency on handleCanvasMouseDown
  const prevSelectedRef = useRef<string | null>(null)
  if (prevSelectedRef.current !== selectedTile) {
    // Clean up old listener
    if (listenerRef.current) {
      const canvas = document.querySelector('canvas')
      canvas?.removeEventListener('mousedown', listenerRef.current)
      listenerRef.current = null
    }
    // Attach new listener if painting
    if (selectedTile) {
      // Defer to next frame so the canvas exists
      requestAnimationFrame(() => {
        const canvas = document.querySelector('canvas')
        if (canvas) {
          canvas.addEventListener('mousedown', handleCanvasMouseDown)
          listenerRef.current = handleCanvasMouseDown
        }
      })
    }
    prevSelectedRef.current = selectedTile
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        {TILE_TYPE_LIST.map(tile => (
          <button
            key={tile.value}
            type="button"
            onClick={() => {
              activatePaint(tile.value)
            }}
            className={`rounded px-2 py-1 text-left text-xs ${
              selectedTile === tile.value
                ? 'bg-pink text-bg'
                : 'text-text hover:bg-pink/20'
            }`}
          >
            {tile.label}
          </button>
        ))}
      </div>
      {selectedTile && (
        <button
          type="button"
          onClick={() => {
            activatePaint(selectedTile)
          }}
          className="text-muted hover:text-pink text-xs"
        >
          clear brush
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
      className="text-text pointer-events-none fixed top-0 left-0 z-10 flex h-full w-52 flex-col bg-black/70 px-4 py-4 font-mono text-xs"
    >
      <div className="pointer-events-auto flex flex-col gap-2 overflow-hidden">
        <PanelTitle>dev panel</PanelTitle>

        <div className="border-border-dim flex border-b">
          <Tab active={tab === 'entity'} onClick={() => { setTab('entity') }}>
            entity
          </Tab>
          <Tab active={tab === 'tile'} onClick={() => { setTab('tile') }}>
            tile
          </Tab>
        </div>

        <div className="scrollbar-custom min-h-0 flex-1 overflow-y-auto">
          {tab === 'entity' && <EntityTab {...props} />}
          {tab === 'tile' && <TileTab {...props} />}
        </div>

        <SectionHeader className="mb-0 mt-2">
          <span className="text-dim">` to toggle</span>
        </SectionHeader>
      </div>
    </div>
  )
}
