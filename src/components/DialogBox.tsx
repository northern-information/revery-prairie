import { CloseButton, SectionHeader, TextButton } from './PanelPrimitives'

export const DIALOG_WIDTH = 448
export const DIALOG_HEIGHT = 340

interface DialogBoxProps {
  characterName: string
  portrait?: string
  line: string
  typingIndex: number
  typingDone: boolean
  isLastLine: boolean
  isAngel?: boolean
  onNext: () => void
  onClose: () => void
  top: number
  left: number
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
  isLastLine,
  isAngel,
  onNext,
  onClose,
  top,
  left,
}: DialogBoxProps) => (
  <div
    className="border-border text-text fixed z-10 flex h-[340px] w-[448px] flex-col border bg-black/85 px-8 py-6 font-mono text-xs"
    style={{ top, left }}
  >
    <CloseButton onClick={onClose} label="Close dialog" />
    {portrait && (
      <div className="mb-4 flex shrink-0 justify-center">
        <img
          src={portrait}
          alt={`portrait of ${characterName.toLowerCase()}`}
          className="border-border-dim h-32 w-32 border [image-rendering:pixelated]"
        />
      </div>
    )}
    <SectionHeader className="shrink-0">{characterName.toLowerCase()}</SectionHeader>
    {isAngel ? (
      <div className="min-h-0 flex-1 overflow-hidden">
        <HashGrid hash={line} revealCount={typingIndex} />
      </div>
    ) : (
      <p className="min-h-0 flex-1 overflow-hidden leading-relaxed">{line.slice(0, typingIndex)}</p>
    )}
    <div className="mt-auto flex shrink-0 gap-4">
      {!typingDone ? (
        <TextButton variant="secondary" onClick={onNext}>
          skip
        </TextButton>
      ) : isLastLine ? (
        <TextButton variant="secondary" onClick={onClose}>
          close
        </TextButton>
      ) : (
        <TextButton variant="secondary" onClick={onNext}>
          next
        </TextButton>
      )}
    </div>
  </div>
)
