import { SectionHeader } from './PanelPrimitives'

interface DialogBoxProps {
  characterName: string
  portrait?: string
  line: string
  typingIndex: number
  typingDone: boolean
  isAngel?: boolean
  isLastLine?: boolean
  onAdvance?: () => void
}

const HASH_GRID_SIZE = 8

const HashGrid = ({ hash, revealCount }: { hash: string; revealCount: number }) => {
  const chars = hash.slice(0, revealCount).split('')
  return (
    <div
      className="mx-auto my-2 grid gap-0.5"
      style={{ gridTemplateColumns: `repeat(${String(HASH_GRID_SIZE)}, 1fr)`, width: 'fit-content' }}
      data-testid="angel-hash-grid"
    >
      {Array.from({ length: 64 }, (_, i) => (
        <div
          key={i}
          className="text-permacomputer flex h-6 w-6 items-center justify-center"
          style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '0.9rem' }}
        >
          {chars[i] ?? ''}
        </div>
      ))}
    </div>
  )
}

export const DialogBox = ({
  characterName,
  portrait,
  line,
  typingIndex,
  typingDone,
  isAngel,
  isLastLine,
  onAdvance,
}: DialogBoxProps) => (
  <div className="text-text fixed top-1/2 right-48 left-0 z-30 mx-auto flex min-h-[80px] w-[65vw] max-w-[min(800px,calc(100vw-12rem-1rem))] -translate-y-1/2 items-start gap-4 bg-black/85 px-6 py-4 font-mono text-xs">
    {portrait && (
      <img
        src={portrait}
        alt={`portrait of ${characterName.toLowerCase()}`}
        className="h-32 w-32 shrink-0 self-center [image-rendering:pixelated]"
      />
    )}
    <div className="flex min-w-0 flex-1 flex-col">
      <SectionHeader className="shrink-0">{characterName.toLowerCase()}</SectionHeader>
      {isAngel ? (
        <HashGrid hash={line} revealCount={typingIndex} />
      ) : (
        <p className="leading-relaxed">{line.slice(0, typingIndex)}</p>
      )}
      {typingDone && onAdvance && (
        <button
          type="button"
          className="text-dim hover:text-pink mt-2 self-end text-xs transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onAdvance()
          }}
          data-testid="dialog-advance-button"
        >
          {isLastLine ? 'clos[e]' : 'n[e]xt'}
        </button>
      )}
    </div>
  </div>
)
