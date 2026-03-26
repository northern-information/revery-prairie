import { CloseButton, SectionHeader } from './PanelPrimitives'

export const DIALOG_WIDTH = 448
export const DIALOG_HEIGHT = 340

interface DialogBoxProps {
  characterName: string
  portrait?: string
  line: string
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
  isLastLine,
  onNext,
  onClose,
  top,
  left,
}: DialogBoxProps) => (
  <div
    className="border-border text-text fixed z-10 flex h-[340px] w-[448px] flex-col border bg-black/85 px-8 py-6 font-mono text-sm"
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
    <p className="min-h-0 flex-1 overflow-hidden leading-relaxed">{line}</p>
    <div className="text-dim mt-auto flex shrink-0 gap-4 text-xs">
      {isLastLine ? (
        <button type="button" className="hover:text-text" onClick={onClose}>
          [e] close
        </button>
      ) : (
        <button type="button" className="hover:text-text" onClick={onNext}>
          [e] next
        </button>
      )}
    </div>
  </div>
)
