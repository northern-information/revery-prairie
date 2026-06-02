import { Card } from './Card.js'
import { COLUMN_LABEL, STATUS_COLUMNS, windowStart } from './data.js'
import { Box, Text } from 'ink'

import type { DerivedStatus, Feature } from './data.js'
import type { InFlightScan } from './scan.js'

interface KanbanProps {
  groups: Record<DerivedStatus, Feature[]>
  selectedColumn: DerivedStatus
  selectedIndex: number
  termWidth: number
  // Max cards rendered per column before the column scrolls a window.
  visibleCards: number
  scan: InFlightScan | null
}

const markerFor = (feature: Feature, scan: InFlightScan | null): '*' | '~' | '!' | null => {
  if (!scan) return null
  if (feature.status === 'shipped' && scan.stale.includes(feature.id)) return '!'
  const ev = scan.byId.get(feature.id)
  if (!ev) return null
  if (feature.status === 'todo') {
    return scan.branchOnly.has(feature.id) ? '~' : '*'
  }
  return null
}

const COLUMN_COLOR: Record<DerivedStatus, string> = {
  todo: 'gray',
  next: 'cyan',
  'in-progress': 'yellow',
  shipped: 'green',
}

export const Kanban = ({ groups, selectedColumn, selectedIndex, termWidth, visibleCards, scan }: KanbanProps) => {
  // Available width inside App's padding={1}: termWidth - 2.
  // Reserve 3 chars for the 3 inter-column gaps. Then divide by 4.
  const available = Math.max(40, termWidth - 2 - 3)
  const colWidth = Math.max(14, Math.floor(available / 4))

  return (
    <Box flexDirection="row" width={termWidth - 2}>
      {STATUS_COLUMNS.map(col => {
        const items = groups[col]
        const isActiveColumn = col === selectedColumn
        // The active column centers its window on the cursor; others pin to the top.
        const start = windowStart(items.length, visibleCards, isActiveColumn ? selectedIndex : null)
        const end = Math.min(items.length, start + visibleCards)
        const hiddenAbove = start
        const hiddenBelow = items.length - end
        return (
          <Box
            key={col}
            flexDirection="column"
            width={colWidth}
            borderStyle="round"
            borderColor={isActiveColumn ? COLUMN_COLOR[col] : 'gray'}
            paddingX={1}
            marginRight={col === 'shipped' ? 0 : 1}
          >
            <Box marginBottom={1}>
              <Text bold color={COLUMN_COLOR[col]}>
                {COLUMN_LABEL[col]}
              </Text>
              <Text dimColor> ({items.length})</Text>
            </Box>
            {items.length === 0 ? (
              <Text dimColor>—</Text>
            ) : (
              <>
                {hiddenAbove > 0 ? <Text dimColor>{`↑ ${hiddenAbove} more`}</Text> : null}
                {items.slice(start, end).map((f, i) => (
                  <Card
                    key={f.id}
                    feature={f}
                    column={col}
                    selected={isActiveColumn && start + i === selectedIndex}
                    marker={markerFor(f, scan)}
                  />
                ))}
                {hiddenBelow > 0 ? <Text dimColor>{`↓ ${hiddenBelow} more`}</Text> : null}
              </>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
