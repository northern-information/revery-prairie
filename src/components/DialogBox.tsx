import { SectionHeader, TextButton } from './PanelPrimitives'

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
          style={{
            fontFamily:
              '"Libre Baskerville", Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, "Times New Roman", serif',
            fontSize: '0.9rem',
          }}
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
  <div className="text-text fixed top-1/2 right-0 left-0 z-30 mx-auto flex h-[240px] w-[65vw] max-w-[min(800px,calc(100vw-1rem))] -translate-y-1/2 flex-col items-center bg-black/85 px-6 py-4 font-mono text-xs">
    {portrait && (
      <img
        src={portrait}
        alt={`portrait of ${characterName.toLowerCase()}`}
        className="h-32 w-32 shrink-0 [image-rendering:pixelated]"
      />
    )}
    <div className="flex min-w-0 flex-1 flex-col self-stretch">
      <SectionHeader className="shrink-0">{characterName}</SectionHeader>
      {isAngel ? (
        <HashGrid hash={line} revealCount={typingIndex} />
      ) : (
        <p className="leading-relaxed">{line.slice(0, typingIndex)}</p>
      )}
    </div>
    {typingDone && onAdvance && (
      <TextButton
        onClick={() => {
          onAdvance()
        }}
        data-testid="dialog-advance-button"
        className="self-center"
      >
        {isLastLine ? '[F] Close' : '[F] Next'}
      </TextButton>
    )}
  </div>
)
