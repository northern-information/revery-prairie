import { Box, Text } from 'ink'
import { depSummary, type Feature } from './data.js'

interface DetailPaneProps {
  feature: Feature | null
  all: Feature[]
  expanded: boolean
}

const STATUS_COLOR = {
  todo: 'gray',
  'in-progress': 'yellow',
  shipped: 'green',
} as const

export const DetailPane = ({ feature, all, expanded }: DetailPaneProps) => {
  if (!feature) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>No feature selected.</Text>
      </Box>
    )
  }

  const deps = depSummary(feature, all)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="white" paddingX={1}>
      <Box>
        <Text bold>{`#${feature.id} ${feature.name}`}</Text>
      </Box>
      <Text>{feature.summary}</Text>
      <Box marginTop={1}>
        <Text dimColor>deps: </Text>
        {deps.length === 0 ? (
          <Text>—</Text>
        ) : (
          deps.map((d, i) => (
            <Text key={d.id} color={STATUS_COLOR[d.status]}>
              {i < deps.length - 1 ? `#${d.id} ` : `#${d.id}`}
            </Text>
          ))
        )}
      </Box>
      <Box>
        <Text dimColor>spec: </Text>
        <Text>{feature.spec ?? '—'}</Text>
        <Text dimColor>   plan: </Text>
        <Text>{feature.plan ?? '—'}</Text>
        <Text dimColor>   pr: </Text>
        <Text>{feature.pr ?? '—'}</Text>
      </Box>
      {expanded && feature.notes ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>notes:</Text>
          <Text>{feature.notes}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
