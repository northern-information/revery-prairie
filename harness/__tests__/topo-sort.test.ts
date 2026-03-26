import { topoSortTiers } from '../src/topo-sort.ts'

describe('topoSortTiers', () => {
  it('returns a single tier for items with no dependencies', () => {
    const result = topoSortTiers([
      { id: 'a', depends_on: [] },
      { id: 'b', depends_on: [] },
      { id: 'c', depends_on: [] },
    ])

    expect(result.cycleParticipants).toHaveLength(0)
    expect(result.tiers).toHaveLength(1)
    expect(result.tiers[0].sort()).toEqual(['a', 'b', 'c'])
  })

  it('sorts a linear chain into separate tiers', () => {
    const result = topoSortTiers([
      { id: 'a', depends_on: [] },
      { id: 'b', depends_on: ['a'] },
      { id: 'c', depends_on: ['b'] },
    ])

    expect(result.cycleParticipants).toHaveLength(0)
    expect(result.tiers).toEqual([['a'], ['b'], ['c']])
  })

  it('groups independent items in the same tier', () => {
    const result = topoSortTiers([
      { id: 'root', depends_on: [] },
      { id: 'left', depends_on: ['root'] },
      { id: 'right', depends_on: ['root'] },
      { id: 'final', depends_on: ['left', 'right'] },
    ])

    expect(result.cycleParticipants).toHaveLength(0)
    expect(result.tiers).toHaveLength(3)
    expect(result.tiers[0]).toEqual(['root'])
    expect(result.tiers[1].sort()).toEqual(['left', 'right'])
    expect(result.tiers[2]).toEqual(['final'])
  })

  it('detects a 2-node cycle', () => {
    const result = topoSortTiers([
      { id: 'a', depends_on: ['b'] },
      { id: 'b', depends_on: ['a'] },
    ])

    expect(result.cycleParticipants.sort()).toEqual(['a', 'b'])
    expect(result.tiers).toHaveLength(0)
  })

  it('detects a 3-node cycle', () => {
    const result = topoSortTiers([
      { id: 'a', depends_on: ['c'] },
      { id: 'b', depends_on: ['a'] },
      { id: 'c', depends_on: ['b'] },
    ])

    expect(result.cycleParticipants.sort()).toEqual(['a', 'b', 'c'])
  })

  it('sorts non-cycle nodes and reports cycle participants separately', () => {
    const result = topoSortTiers([
      { id: 'ok', depends_on: [] },
      { id: 'a', depends_on: ['b'] },
      { id: 'b', depends_on: ['a'] },
    ])

    expect(result.tiers).toEqual([['ok']])
    expect(result.cycleParticipants.sort()).toEqual(['a', 'b'])
  })

  it('ignores dependencies on unknown IDs', () => {
    const result = topoSortTiers([
      { id: 'a', depends_on: ['nonexistent'] },
    ])

    expect(result.cycleParticipants).toHaveLength(0)
    expect(result.tiers).toEqual([['a']])
  })

  it('handles an empty list', () => {
    const result = topoSortTiers([])

    expect(result.tiers).toHaveLength(0)
    expect(result.cycleParticipants).toHaveLength(0)
  })
})
