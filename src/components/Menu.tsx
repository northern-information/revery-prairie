interface MenuProps {
  onResume: () => void
  onNewGame: () => void
}

export const Menu = ({ onResume, onNewGame }: MenuProps) => (
  <div className="border-border text-text fixed top-1/2 left-1/2 z-10 min-w-56 -translate-x-1/2 -translate-y-1/2 border bg-black/85 px-8 py-6 font-mono text-sm">
    <div className="border-border-dim text-muted mb-4 border-b pb-2">menu</div>
    <div className="flex flex-col gap-2">
      <button type="button" className="text-text hover:text-clover text-left" onClick={onResume}>
        resume
      </button>
      <button type="button" className="text-text hover:text-clover text-left" onClick={onNewGame}>
        new game
      </button>
    </div>
    <div className="text-dim mt-4 text-xs">[esc] close</div>
  </div>
)
