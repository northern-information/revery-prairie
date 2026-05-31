interface WearBarProps {
  wear: number
  color: string
}

const BAR_HEIGHT_PX = 4

export const WearBar = ({ wear, color }: WearBarProps) => {
  const clamped = Math.min(1, Math.max(0, wear))
  const fillPct = (1 - clamped) * 100
  return (
    <div
      role="meter"
      aria-label="Item wear"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={clamped}
      className="w-full overflow-hidden"
      style={{
        height: BAR_HEIGHT_PX,
        backgroundColor: 'var(--color-border-dim)',
      }}
    >
      <div
        className="h-full"
        style={{
          width: `${String(fillPct)}%`,
          backgroundColor: color,
        }}
      />
    </div>
  )
}
