interface DialogBoxProps {
  characterName: string
  portrait?: string
  line: string
  isLastLine: boolean
  onNext: () => void
  onClose: () => void
}

export const DialogBox = ({ characterName, portrait, line, isLastLine, onNext, onClose }: DialogBoxProps) => (
  <div className="border-border text-text fixed top-1/2 left-1/2 z-10 max-w-md min-w-72 -translate-x-1/2 -translate-y-1/2 border bg-black/85 px-8 py-6 font-mono text-sm">
    <button
      type="button"
      className="text-dim hover:text-text absolute top-0 right-0 px-4 py-3 text-sm"
      onClick={onClose}
      aria-label="Close dialog"
    >
      x
    </button>
    {portrait && (
      <div className="mb-4 flex justify-center">
        <img
          src={portrait}
          alt={`portrait of ${characterName.toLowerCase()}`}
          className="border-border-dim h-32 w-32 border [image-rendering:pixelated]"
        />
      </div>
    )}
    <div className="border-border-dim text-muted mb-4 border-b pb-2">{characterName.toLowerCase()}</div>
    <p className="mb-4 leading-relaxed">{line}</p>
    <div className="text-dim flex gap-4 text-xs">
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
