import { watch } from 'node:fs'
import { resolve } from 'node:path'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DetailPane } from './DetailPane.js'
import { Kanban } from './Kanban.js'
import {
  groupByColumn,
  loadFeatures,
  STATUS_COLUMNS,
  type DerivedStatus,
  type Feature,
} from './data.js'

const YAML_PATH = resolve(process.cwd(), 'docs/precis-status.yaml')

interface LoadState {
  features: Feature[] | null
  error: string | null
}

const tryLoad = (): LoadState => {
  try {
    return { features: loadFeatures(YAML_PATH), error: null }
  } catch (err) {
    return { features: null, error: err instanceof Error ? err.message : String(err) }
  }
}

const firstNonEmptyColumn = (
  groups: Record<DerivedStatus, Feature[]>,
): DerivedStatus | null => {
  if (groups.next.length > 0) return 'next'
  for (const col of STATUS_COLUMNS) {
    if (groups[col].length > 0) return col
  }
  return null
}

const pickDefaultId = (features: Feature[] | null): string | null => {
  if (!features || features.length === 0) return null
  const groups = groupByColumn(features)
  const col = firstNonEmptyColumn(groups)
  if (!col) return null
  return groups[col][0]?.id ?? null
}

export const App = () => {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [load, setLoad] = useState<LoadState>(() => tryLoad())
  const [selectedId, setSelectedId] = useState<string | null>(() => pickDefaultId(tryLoad().features))
  const [expanded, setExpanded] = useState(false)
  const [termWidth, setTermWidth] = useState(() => stdout.columns || 120)

  useEffect(() => {
    const onResize = () => {
      setTermWidth(stdout.columns || 120)
    }
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  const groups = useMemo(() => {
    if (!load.features) return null
    return groupByColumn(load.features)
  }, [load.features])

  // Resolve selection: which column + index the selectedId currently lives in.
  const locate = useMemo(() => {
    if (!groups || !selectedId) return null
    for (const col of STATUS_COLUMNS) {
      const idx = groups[col].findIndex((f) => f.id === selectedId)
      if (idx !== -1) return { column: col, index: idx }
    }
    return null
  }, [groups, selectedId])

  // Initialize selection (or reset if the previously-selected id disappeared from the file).
  useEffect(() => {
    if (!groups) return
    if (locate) return
    const col = firstNonEmptyColumn(groups)
    if (!col) {
      setSelectedId(null)
      return
    }
    const first = groups[col][0]
    if (first) setSelectedId(first.id)
  }, [groups, locate])

  const reload = useCallback(() => {
    setLoad(tryLoad())
  }, [])

  // Watch the YAML for live reload.
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null
    let watcher: ReturnType<typeof watch> | null = null
    try {
      watcher = watch(YAML_PATH, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(reload, 120)
      })
    } catch {
      // file missing or unwatchable — user can press `r` instead
    }
    return () => {
      if (timer) clearTimeout(timer)
      watcher?.close()
    }
  }, [reload])

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
      return
    }
    if (input === 'r') {
      reload()
      return
    }
    if (!groups || !locate) return

    if (key.leftArrow || key.rightArrow) {
      const dir = key.leftArrow ? -1 : 1
      const startIdx = STATUS_COLUMNS.indexOf(locate.column)
      for (let i = 1; i <= STATUS_COLUMNS.length; i++) {
        const nextIdx = startIdx + dir * i
        if (nextIdx < 0 || nextIdx >= STATUS_COLUMNS.length) break
        const nextCol = STATUS_COLUMNS[nextIdx]!
        const items = groups[nextCol]
        if (items.length > 0) {
          const targetIdx = Math.min(locate.index, items.length - 1)
          setSelectedId(items[targetIdx]!.id)
          return
        }
      }
      return
    }

    if (key.upArrow) {
      const items = groups[locate.column]
      const next = items[Math.max(0, locate.index - 1)]
      if (next) setSelectedId(next.id)
      return
    }
    if (key.downArrow) {
      const items = groups[locate.column]
      const next = items[Math.min(items.length - 1, locate.index + 1)]
      if (next) setSelectedId(next.id)
      return
    }

    if (key.return || input === ' ') {
      setExpanded((e) => !e)
      return
    }
  })

  if (load.error || !load.features || !groups) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Could not load {YAML_PATH}
        </Text>
        <Text>{load.error ?? 'unknown error'}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text>r</Text>
          <Text dimColor> to retry, </Text>
          <Text>q</Text>
          <Text dimColor> to quit.</Text>
        </Box>
      </Box>
    )
  }

  const selected = locate ? groups[locate.column][locate.index] ?? null : null
  const total = load.features.length
  const shipped = groups.shipped.length
  const nextCount = groups.next.length
  const nextPick = groups.next[0]

  return (
    <Box flexDirection="column" padding={1} width={termWidth}>
      <Box>
        <Text bold>Precis dashboard</Text>
        <Text dimColor>  ·  </Text>
        <Text>{`${shipped}/${total} shipped`}</Text>
        <Text dimColor>  ·  </Text>
        <Text color="cyan">{`${nextCount} unblocked`}</Text>
        <Text dimColor>  ·  next pick: </Text>
        {nextPick ? (
          <Text color="cyan">{`#${nextPick.id} ${nextPick.name}`}</Text>
        ) : (
          <Text dimColor>—</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Kanban
          groups={groups}
          selectedColumn={locate?.column ?? 'next'}
          selectedIndex={locate?.index ?? 0}
          termWidth={termWidth}
        />
      </Box>
      <Box marginTop={1}>
        <DetailPane feature={selected} all={load.features} expanded={expanded} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          [←→] column   [↑↓] card   [enter] expand   [r] reload   [q] quit
        </Text>
      </Box>
    </Box>
  )
}
