import { SectionHeader } from './PanelPrimitives'

interface DialogBoxProps {
  characterName: string
  portrait?: string
  line: string
  typingIndex: number
  typingDone: boolean
  isAngel?: boolean
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

export const DialogBox = ({ characterName, portrait, line, typingIndex, isAngel }: DialogBoxProps) => (
  <div className="text-text fixed bottom-8 left-1/2 z-10 flex max-h-[140px] min-h-[80px] w-[65vw] min-w-[400px] max-w-[800px] -translate-x-1/2 items-start gap-4 bg-black/85 px-6 py-4 font-mono text-xs">
    {portrait && (
      <img
        src={portrait}
        alt={`portrait of ${characterName.toLowerCase()}`}
        className="h-12 w-12 shrink-0 self-center [image-rendering:pixelated]"
      />
    )}
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SectionHeader className="shrink-0">{characterName.toLowerCase()}</SectionHeader>
      {isAngel ? (
        <div className="min-h-0 overflow-hidden">
          <HashGrid hash={line} revealCount={typingIndex} />
        </div>
      ) : (
        <p className="min-h-0 overflow-hidden leading-relaxed">{line.slice(0, typingIndex)}</p>
      )}
    </div>
  </div>
)
