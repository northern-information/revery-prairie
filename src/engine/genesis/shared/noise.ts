import { clamp, lerp } from './math'

// 2D value-noise lattice. Each lattice cell stores a random value; samples
// are smoothstep-bilerped between corners. cellSize controls wavelength.
export const buildValueLattice = (
  width: number,
  height: number,
  cellSize: number,
  rng: () => number
): { values: number[]; cols: number; rows: number; cellSize: number } => {
  const cols = Math.ceil(width / cellSize) + 2
  const rows = Math.ceil(height / cellSize) + 2
  const values: number[] = []
  const total = cols * rows
  for (let i = 0; i < total; i++) values.push(rng() * 2 - 1)
  return { values, cols, rows, cellSize }
}

export const sampleLattice = (
  lat: { values: number[]; cols: number; rows: number; cellSize: number },
  x: number,
  y: number
): number => {
  const fx = x / lat.cellSize
  const fy = y / lat.cellSize
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  // Smoothstep
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const cx = clamp(ix, 0, lat.cols - 2)
  const cy = clamp(iy, 0, lat.rows - 2)
  const v00 = lat.values[cy * lat.cols + cx]
  const v10 = lat.values[cy * lat.cols + (cx + 1)]
  const v01 = lat.values[(cy + 1) * lat.cols + cx]
  const v11 = lat.values[(cy + 1) * lat.cols + (cx + 1)]
  const a = lerp(v00, v10, sx)
  const b = lerp(v01, v11, sx)
  return lerp(a, b, sy)
}

// Three-octave fBm with domain warp. Returns [-1, 1] range.
export const fbmWarp2D = (width: number, height: number, rng: () => number): ((x: number, y: number) => number) => {
  const baseCell = 14
  const lat0 = buildValueLattice(width, height, baseCell, rng)
  const lat1 = buildValueLattice(width, height, baseCell / 2, rng)
  const lat2 = buildValueLattice(width, height, baseCell / 4, rng)
  // Independent warp lattices
  const wx = buildValueLattice(width, height, baseCell, rng)
  const wy = buildValueLattice(width, height, baseCell, rng)
  const warpAmp = 6
  return (x, y) => {
    const ox = sampleLattice(wx, x, y) * warpAmp
    const oy = sampleLattice(wy, x, y) * warpAmp
    const wxC = x + ox
    const wyC = y + oy
    return (
      sampleLattice(lat0, wxC, wyC) * 1.0 + sampleLattice(lat1, wxC, wyC) * 0.5 + sampleLattice(lat2, wxC, wyC) * 0.25
    )
  }
}
