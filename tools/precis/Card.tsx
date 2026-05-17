import { Box, Text } from 'ink'
import type { DerivedStatus, Feature } from './data.js'

interface CardProps {
  feature: Feature
  selected: boolean
  column: DerivedStatus
}

const STATUS_COLOR: Record<DerivedStatus, string> = {
  todo: 'gray',
  next: 'cyan',
  'in-progress': 'yellow',
  shipped: 'green',
}

export const Card = ({ feature, selected, column }: CardProps) => {
  const color = STATUS_COLOR[column]
  const label = `#${feature.id} ${feature.name}`
  return (
    <Box>
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text inverse={selected} color={selected ? undefined : color} wrap="truncate-end">
          {label}
        </Text>
      </Box>
      <Text inverse={selected} dimColor={!selected}>
        {` ${feature.size}`}
      </Text>
    </Box>
  )
}
