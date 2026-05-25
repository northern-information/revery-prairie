import { Box, Text } from 'ink'

import type { DerivedStatus, Feature } from './data.js'

interface CardProps {
  feature: Feature
  selected: boolean
  column: DerivedStatus
  // Glyph rendered after the id when in-flight scan disagrees with YAML.
  //   '*' — YAML says todo, evidence promoted it to in-progress
  //   '~' — branch/worktree exists but no harness work started
  //   '!' — YAML says shipped, but stale evidence still exists
  marker?: '*' | '~' | '!' | null
}

const STATUS_COLOR: Record<DerivedStatus, string> = {
  todo: 'gray',
  next: 'cyan',
  'in-progress': 'yellow',
  shipped: 'green',
}

const MARKER_COLOR: Record<NonNullable<CardProps['marker']>, string> = {
  '*': 'magenta',
  '~': 'gray',
  '!': 'red',
}

export const Card = ({ feature, selected, column, marker }: CardProps) => {
  const color = STATUS_COLOR[column]
  const label = `#${feature.id} ${feature.name}`
  return (
    <Box>
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text inverse={selected} color={selected ? undefined : color} wrap="truncate-end">
          {label}
        </Text>
      </Box>
      {marker ? (
        <Box flexShrink={0} marginLeft={1}>
          <Text color={selected ? undefined : MARKER_COLOR[marker]} inverse={selected} bold>
            {marker}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
