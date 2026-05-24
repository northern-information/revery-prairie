import { depSummary } from './data.js'
import { evidenceSourceLines } from './scan.js'
import { Box, Text } from 'ink'

import type { Feature } from './data.js'
import type { InFlightScan } from './scan.js'

interface DetailPaneProps {
  feature: Feature | null
  all: Feature[]
  expanded: boolean
  scan: InFlightScan | null
}

const STATUS_COLOR = {
  todo: 'gray',
  'in-progress': 'yellow',
  shipped: 'green',
} as const

export const DetailPane = ({ feature, all, expanded, scan }: DetailPaneProps) => {
  if (!feature) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>No feature selected.</Text>
      </Box>
    )
  }

  const deps = depSummary(feature, all)
  const evidence = scan?.byId.get(feature.id) ?? null
  const evidenceLines = evidence ? evidenceSourceLines(evidence) : []
  const isStale = scan?.stale.includes(feature.id) ?? false
  const isBranchOnly = scan?.branchOnly.has(feature.id) ?? false

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
        <Text dimColor> plan: </Text>
        <Text>{feature.plan ?? '—'}</Text>
        <Text dimColor> pr: </Text>
        <Text>{feature.pr ?? '—'}</Text>
      </Box>
      {evidenceLines.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text dimColor>in-flight evidence</Text>
            {feature.status === 'todo' && !isBranchOnly ? (
              <Text color="magenta" bold>
                {' * promoted (YAML still says todo)'}
              </Text>
            ) : null}
            {isBranchOnly ? (
              <Text color="gray" bold>
                {' ~ branch exists, no harness work yet'}
              </Text>
            ) : null}
            {isStale ? (
              <Text color="red" bold>
                {' ! stale — YAML says shipped, evidence persists'}
              </Text>
            ) : null}
          </Box>
          {evidenceLines.map((line, i) => (
            <Text key={i} dimColor>{`  ${line}`}</Text>
          ))}
        </Box>
      ) : null}
      {expanded && feature.notes ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>notes:</Text>
          <Text>{feature.notes}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
