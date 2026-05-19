import { describe, expect, it } from 'vitest'

import { FloraSpecies, OmenKind, ReveryPhase, Season } from '@/engine/types'
import { ReverySummary } from '../ReverySummary'
import { render, screen } from '@testing-library/react'

import type { ReveryChange, ReveryState } from '@/engine/types'

const makeReverySummary = (overrides: Partial<ReveryState> = {}): ReveryState => ({
  active: true,
  startTime: 0,
  phase: ReveryPhase.Summary,
  elapsedYears: 1.0,
  snapshotBeforeRevery: {
    floraCounts: {
      [FloraSpecies.Clover]: 10,
      [FloraSpecies.Wildflower]: 5,
      [FloraSpecies.TallGrass]: 3,
    },
    egregoreCount: 3,
    season: Season.Autumn,
    reveryCount: 0,
  },
  scheduledChanges: [],
  summaryReady: true,
  omenKind: OmenKind.BeeOnShoulder,
  ...overrides,
})

describe('ReverySummary (precis #4)', () => {
  it('renders nothing when revery is null', () => {
    const { container } = render(<ReverySummary revery={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when summaryReady is false', () => {
    const revery = makeReverySummary({ summaryReady: false })
    const { container } = render(<ReverySummary revery={revery} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when phase is not Summary', () => {
    const revery = makeReverySummary({ phase: ReveryPhase.Observing })
    const { container } = render(<ReverySummary revery={revery} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the title and dismiss footer when active', () => {
    const revery = makeReverySummary()
    render(<ReverySummary revery={revery} />)
    expect(screen.getByText('The Revery')).toBeTruthy()
    expect(screen.getByText('Press any key to continue')).toBeTruthy()
  })

  it('renders flora delta lines in ASCII', () => {
    const changes: ReveryChange[] = [
      { kind: 'flora-delta', payload: { species: FloraSpecies.Clover, before: 10, after: 22 } },
      { kind: 'flora-delta', payload: { species: FloraSpecies.Wildflower, before: 5, after: 2 } },
    ]
    const revery = makeReverySummary({ scheduledChanges: changes })
    render(<ReverySummary revery={revery} />)
    expect(screen.getByText(/Clover.*\+12/)).toBeTruthy()
    expect(screen.getByText(/Purple Coneflower.*-3/)).toBeTruthy()
  })

  it('renders the Voynich line when an egregore-grew change exists', () => {
    const changes: ReveryChange[] = [
      { kind: 'egregore-grew', payload: { positions: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] } },
    ]
    const revery = makeReverySummary({ scheduledChanges: changes })
    render(<ReverySummary revery={revery} />)
    expect(screen.getByTestId('revery-voynich-line')).toBeTruthy()
  })

  it('omits the Voynich line when egregore-grew has zero positions', () => {
    const changes: ReveryChange[] = [
      { kind: 'egregore-grew', payload: { positions: [] } },
    ]
    const revery = makeReverySummary({ scheduledChanges: changes })
    render(<ReverySummary revery={revery} />)
    expect(screen.queryByTestId('revery-voynich-line')).toBeNull()
  })

  it('renders the Suspected phenotype line', () => {
    const changes: ReveryChange[] = [
      {
        kind: 'phenotype-revealed',
        payload: { species: FloraSpecies.Clover, axis: 'bloomTiming', verdict: 'late-blooming' },
      },
    ]
    const revery = makeReverySummary({ scheduledChanges: changes })
    render(<ReverySummary revery={revery} />)
    expect(screen.getByText('Suspected: late-blooming')).toBeTruthy()
  })
})
