import { SectionHeader, TextButton } from './PanelPrimitives'

interface DialogBoxProps {
  characterName: string
  line: string
  typingIndex: number
  typingDone: boolean
  isLastLine?: boolean
  onAdvance?: () => void
}

export const DialogBox = ({
  characterName,
  line,
  typingIndex,
  typingDone,
  isLastLine,
  onAdvance,
}: DialogBoxProps) => (
  <div className="text-text fixed top-1/2 right-0 left-0 z-30 mx-auto flex h-[240px] w-[65vw] max-w-[min(800px,calc(100vw-1rem))] -translate-y-1/2 flex-col items-center bg-black/85 px-6 py-4 font-mono text-xs">
    <div className="flex min-w-0 flex-1 flex-col self-stretch">
      <SectionHeader className="shrink-0">{characterName}</SectionHeader>
      <p
        className="font-serif leading-relaxed"
        style={{ color: '#ffd700' }}
        data-testid="dialog-line"
      >
        {line.slice(0, typingIndex)}
      </p>
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
