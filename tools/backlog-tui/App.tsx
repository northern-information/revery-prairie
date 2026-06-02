import { watch } from 'node:fs'
import { resolve } from 'node:path'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { groupByColumn, loadFeatures, STATUS_COLUMNS, wrapText, WRITABLE_STATUSES } from './data.js'
import { DetailPane } from './DetailPane.js'
import { moveFeatureAndOpenPr, openUrl } from './git.js'
import { Kanban } from './Kanban.js'
import { scanInFlight } from './scan.js'
import { Box, Text, useApp, useInput, useStdout } from 'ink'

import type { DerivedStatus, Feature, Status } from './data.js'
import type { InFlightScan } from './scan.js'

const YAML_REL = 'docs/backlog.yaml'
const YAML_PATH = resolve(process.cwd(), YAML_REL)

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

const firstNonEmptyColumn = (groups: Record<DerivedStatus, Feature[]>): DerivedStatus | null => {
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

type Mode =
  | { kind: 'browse' }
  | { kind: 'pick-status'; featureId: string; cursor: number }
  | { kind: 'confirm'; featureId: string; target: Status }
  | { kind: 'working'; featureId: string; target: Status }
  | { kind: 'result'; ok: boolean; url?: string; error?: string; log: string[] }

const STATUS_LABEL: Record<Status, string> = {
  todo: 'todo',
  'in-progress': 'in-progress',
  shipped: 'shipped',
}

type ScanState = { kind: 'idle' } | { kind: 'scanning' } | { kind: 'done'; scan: InFlightScan }

export const App = () => {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [load, setLoad] = useState<LoadState>(() => tryLoad())
  const [selectedId, setSelectedId] = useState<string | null>(() => pickDefaultId(tryLoad().features))
  const [expanded, setExpanded] = useState(false)
  const [notesScroll, setNotesScroll] = useState(0)
  const [termWidth, setTermWidth] = useState(() => stdout.columns || 120)
  const [termHeight, setTermHeight] = useState(() => stdout.rows || 40)
  const [mode, setMode] = useState<Mode>({ kind: 'browse' })
  const [scanState, setScanState] = useState<ScanState>({ kind: 'idle' })

  useEffect(() => {
    const onResize = () => {
      setTermWidth(stdout.columns || 120)
      setTermHeight(stdout.rows || 40)
    }
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  const scan = scanState.kind === 'done' ? scanState.scan : null

  const groups = useMemo(() => {
    if (!load.features) return null
    return groupByColumn(load.features, scan)
  }, [load.features, scan])

  const locate = useMemo(() => {
    if (!groups || !selectedId) return null
    for (const col of STATUS_COLUMNS) {
      const idx = groups[col].findIndex(f => f.id === selectedId)
      if (idx !== -1) return { column: col, index: idx }
    }
    return null
  }, [groups, selectedId])

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

  const runScan = useCallback((features: Feature[] | null) => {
    if (!features) return
    setScanState({ kind: 'scanning' })
    // Defer the synchronous shell calls so Ink renders the scanning indicator
    // before the spawnSync barrage. `gh pr list` is the slowest hop (~1–2s).
    setImmediate(() => {
      const result = scanInFlight(process.cwd(), features)
      setScanState({ kind: 'done', scan: result })
    })
  }, [])

  const reload = useCallback(() => {
    setLoad(tryLoad())
  }, [])

  // Re-scan whenever the loaded features change (initial mount, file watcher,
  // explicit `r` reload). runScan is a stable callback so this effect only
  // fires on feature changes.
  useEffect(() => {
    runScan(load.features)
  }, [runScan, load.features])

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

  const selected = locate && groups ? (groups[locate.column][locate.index] ?? null) : null

  // Notes can run hundreds of characters, so when expanded they live in a
  // fixed-height viewport that scrolls internally — the expanded pane never
  // grows the TUI past one screen. Ink has no scroll offset (only clipping), so
  // we wrap the notes to visual lines ourselves and window them. Inner text
  // width = termWidth − outer padding (2) − pane border (2) − paddingX (2).
  const NOTE_VIEWPORT = 8
  const noteWidth = Math.max(10, termWidth - 6)
  const noteLines = useMemo(
    () => (expanded && selected?.notes ? wrapText(selected.notes, noteWidth) : []),
    [expanded, selected?.notes, noteWidth]
  )
  const maxNotesScroll = Math.max(0, noteLines.length - NOTE_VIEWPORT)
  // Clamp the live offset so a viewport/width change can't strand it past the end.
  const clampedNotesScroll = Math.min(notesScroll, maxNotesScroll)

  // Reset the notes offset whenever the selection or expand state changes, so a
  // newly opened card always starts at the top of its notes.
  useEffect(() => {
    setNotesScroll(0)
  }, [selectedId, expanded])

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
      return
    }

    if (mode.kind === 'pick-status') {
      if (key.escape) {
        setMode({ kind: 'browse' })
        return
      }
      if (key.leftArrow || key.upArrow) {
        setMode({
          ...mode,
          cursor: (mode.cursor - 1 + WRITABLE_STATUSES.length) % WRITABLE_STATUSES.length,
        })
        return
      }
      if (key.rightArrow || key.downArrow) {
        setMode({ ...mode, cursor: (mode.cursor + 1) % WRITABLE_STATUSES.length })
        return
      }
      if (key.return) {
        const target = WRITABLE_STATUSES[mode.cursor]!
        setMode({ kind: 'confirm', featureId: mode.featureId, target })
        return
      }
      return
    }

    if (mode.kind === 'confirm') {
      if (input === 'y') {
        const { featureId, target } = mode
        setMode({ kind: 'working', featureId, target })
        // Defer the synchronous shell calls so Ink renders the working screen first.
        setImmediate(() => {
          const result = moveFeatureAndOpenPr({
            id: featureId,
            newStatus: target,
            yamlRelPath: YAML_REL,
            startDir: process.cwd(),
          })
          setMode({
            kind: 'result',
            ok: result.ok,
            url: result.url,
            error: result.error,
            log: result.log,
          })
          if (result.ok) reload()
        })
        return
      }
      if (input === 'n' || key.escape) {
        setMode({ kind: 'browse' })
        return
      }
      return
    }

    if (mode.kind === 'working') return

    if (mode.kind === 'result') {
      if (mode.ok && mode.url && input === 'o') {
        openUrl(mode.url)
        return
      }
      if (key.return || key.escape || input === ' ') {
        setMode({ kind: 'browse' })
        return
      }
      return
    }

    // browse
    if (input === 'r') {
      reload()
      return
    }
    if (!groups || !locate) return

    if (input === 'm' && selected) {
      const initialCursor = Math.max(0, WRITABLE_STATUSES.indexOf(selected.status))
      setMode({ kind: 'pick-status', featureId: selected.id, cursor: initialCursor })
      return
    }

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

    // While expanded with scrollable notes, ↑/↓ scroll the notes viewport
    // instead of moving between cards. Esc/Enter/Space collapses back out.
    if (expanded && maxNotesScroll > 0 && (key.upArrow || key.downArrow)) {
      const dir = key.upArrow ? -1 : 1
      setNotesScroll(s => Math.min(maxNotesScroll, Math.max(0, s + dir)))
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

    if (key.escape && expanded) {
      setExpanded(false)
      return
    }

    if (key.return || input === ' ') {
      setExpanded(e => !e)
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

  const total = load.features.length
  const shipped = groups.shipped.length
  const nextCount = groups.next.length
  const nextPick = groups.next[0]

  const promotedCount = scan
    ? load.features.filter(f => f.status === 'todo' && scan.byId.has(f.id) && !scan.branchOnly.has(f.id)).length
    : 0
  const staleCount = scan?.stale.length ?? 0
  const thinktankCount = scan?.unmappedThinktank.length ?? 0

  // Cap each column to a visible-card budget so the tallest column (usually
  // SHIPPED) can't push the TUI past one screen. Subtract the fixed chrome and a
  // detail-pane reservation from the terminal height; each column scrolls a
  // window around its selected card. CHROME_ROWS covers: outer padding (2) +
  // dashboard (1) + scan (1) + Kanban marginTop (1) + column border (2) + column
  // header + its margin (2) + DetailPane marginTop (1) + hint marginTop + hint
  // (2) + the two column scroll affordance rows (2).
  //
  // The detail pane reservation depends on expand state: collapsed it's a card
  // with full in-flight evidence; expanded it adds the fixed notes viewport plus
  // its scroll affordances. Reserving the expanded budget shrinks the columns
  // while a card is open (you're reading the pane anyway) so the whole TUI —
  // including the scrolling notes viewport — always fits on one screen.
  const CHROME_ROWS = 14
  const COLLAPSED_DETAIL_ROWS = 13
  const EXPANDED_DETAIL_ROWS = 26
  const detailRows = expanded ? EXPANDED_DETAIL_ROWS : COLLAPSED_DETAIL_ROWS
  const visibleCards = Math.max(3, termHeight - CHROME_ROWS - detailRows)

  return (
    <Box flexDirection="column" padding={1} width={termWidth}>
      <Box>
        <Text bold>Precis dashboard</Text>
        <Text dimColor> · </Text>
        <Text>{`${shipped}/${total} shipped`}</Text>
        <Text dimColor> · </Text>
        <Text color="cyan">{`${nextCount} unblocked`}</Text>
        <Text dimColor> · next pick: </Text>
        {nextPick ? <Text color="cyan">{`#${nextPick.id} ${nextPick.name}`}</Text> : <Text dimColor>—</Text>}
      </Box>
      <Box>
        <Text dimColor>scan: </Text>
        {scanState.kind === 'scanning' ? (
          <Text color="yellow">scanning…</Text>
        ) : scanState.kind === 'done' ? (
          <>
            <Text color="green">ok</Text>
            {promotedCount > 0 ? <Text color="magenta">{`  ·  ${promotedCount} promoted *`}</Text> : null}
            {staleCount > 0 ? <Text color="red">{`  ·  ${staleCount} stale !`}</Text> : null}
            {thinktankCount > 0 ? (
              <Text dimColor>{`  ·  ${thinktankCount} thinktank-only worktree${thinktankCount === 1 ? '' : 's'}`}</Text>
            ) : null}
            {scanState.scan.warnings.length > 0 ? (
              <Text color="yellow">{`  ·  ${scanState.scan.warnings.length} warning${scanState.scan.warnings.length === 1 ? '' : 's'}`}</Text>
            ) : null}
          </>
        ) : (
          <Text dimColor>idle</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Kanban
          groups={groups}
          selectedColumn={locate?.column ?? 'next'}
          selectedIndex={locate?.index ?? 0}
          termWidth={termWidth}
          visibleCards={visibleCards}
          scan={scan}
        />
      </Box>
      <Box marginTop={1}>
        <DetailPane
          feature={selected}
          all={load.features}
          expanded={expanded}
          scan={scan}
          noteLines={noteLines}
          notesScroll={clampedNotesScroll}
          noteViewport={NOTE_VIEWPORT}
        />
      </Box>

      <ModeOverlay mode={mode} selected={selected} />

      <Box marginTop={1}>
        {expanded && maxNotesScroll > 0 ? (
          <Text dimColor>[↑↓] scroll notes [esc] collapse [m] move [r] reload [q] quit</Text>
        ) : (
          <Text dimColor>[←→] column [↑↓] card [enter] expand [m] move [r] reload [q] quit</Text>
        )}
      </Box>
    </Box>
  )
}

interface ModeOverlayProps {
  mode: Mode
  selected: Feature | null
}

const ModeOverlay = ({ mode, selected }: ModeOverlayProps) => {
  if (mode.kind === 'browse') return null

  if (mode.kind === 'pick-status') {
    return (
      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold>{`Move ${mode.featureId} (${selected?.name ?? ''}) to…`}</Text>
        <Box marginTop={1}>
          {WRITABLE_STATUSES.map((s, i) => (
            <Box key={s} marginRight={2}>
              <Text color={i === mode.cursor ? 'cyan' : undefined} bold={i === mode.cursor} inverse={i === mode.cursor}>
                {` ${STATUS_LABEL[s]} `}
              </Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>[←→] choose [enter] confirm [esc] cancel</Text>
        </Box>
      </Box>
    )
  }

  if (mode.kind === 'confirm') {
    return (
      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text>
          Move <Text bold>{`${mode.featureId}`}</Text> to{' '}
          <Text bold color="yellow">
            {mode.target}
          </Text>
          ?
        </Text>
        <Text dimColor>This creates a worktree, commits the YAML change, pushes, and opens a draft PR.</Text>
        <Box marginTop={1}>
          <Text dimColor>[y]es [n]o [esc] cancel</Text>
        </Box>
      </Box>
    )
  }

  if (mode.kind === 'working') {
    return (
      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text>
          Moving <Text bold>{`${mode.featureId}`}</Text> to{' '}
          <Text bold color="yellow">
            {mode.target}
          </Text>
          …
        </Text>
        <Text dimColor>fetching, branching, committing, pushing, opening PR…</Text>
      </Box>
    )
  }

  return (
    <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={mode.ok ? 'green' : 'red'} paddingX={1}>
      {mode.ok ? (
        <>
          <Text color="green" bold>
            Move shipped.
          </Text>
          {mode.url ? (
            <Text>{`PR: ${mode.url}`}</Text>
          ) : (
            <Text dimColor>PR created but the URL was not captured. Check `gh pr list`.</Text>
          )}
          <Box marginTop={1}>
            <Text dimColor>{mode.url ? '[o] open in browser   ' : ''}[enter] dismiss</Text>
          </Box>
        </>
      ) : (
        <>
          <Text color="red" bold>
            Move failed.
          </Text>
          <Text>{mode.error ?? 'unknown error'}</Text>
          {mode.log.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>log:</Text>
              {mode.log.map((line, i) => (
                <Text key={i} dimColor>{`  ${line}`}</Text>
              ))}
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>[enter] dismiss</Text>
          </Box>
        </>
      )}
    </Box>
  )
}
