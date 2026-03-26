/**
 * Topologically sort items into tiers using Kahn's algorithm.
 * Items in the same tier have no dependencies on each other and can run in parallel.
 *
 * Returns { tiers, cycleParticipants }.
 * - tiers: array of arrays, each tier contains IDs that can execute concurrently
 * - cycleParticipants: IDs that could not be sorted (involved in a cycle)
 */
export const topoSortTiers = (
  items: { id: string; depends_on: string[] }[],
): { tiers: string[][]; cycleParticipants: string[] } => {
  const ids = new Set(items.map((t) => t.id))

  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const id of ids) {
    inDegree.set(id, 0)
    dependents.set(id, [])
  }

  for (const item of items) {
    for (const dep of item.depends_on) {
      if (ids.has(dep)) {
        inDegree.set(item.id, (inDegree.get(item.id) ?? 0) + 1)
        dependents.get(dep)!.push(item.id)
      }
    }
  }

  const tiers: string[][] = []

  // seed first tier with all zero-inDegree nodes
  let queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  while (queue.length > 0) {
    tiers.push([...queue])

    const next: string[] = []
    for (const id of queue) {
      for (const dep of dependents.get(id) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1
        inDegree.set(dep, newDeg)
        if (newDeg === 0) next.push(dep)
      }
    }
    queue = next
  }

  const sorted = new Set(tiers.flat())
  const cycleParticipants = [...ids].filter((id) => !sorted.has(id))

  return { tiers, cycleParticipants }
}
