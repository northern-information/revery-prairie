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
  onNext: () => void
  onClose: () => void
  top: number
  left: number
}

export const DialogBox = ({
  characterName,
  portrait,
  line,
  typingIndex,
  typingDone,
  isLastLine,
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
    <p className="min-h-0 flex-1 overflow-hidden leading-relaxed">{line.slice(0, typingIndex)}</p>
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
