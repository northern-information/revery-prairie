interface CloseButtonProps {
  onClick: () => void
  label?: string
}

export const CloseButton = ({ onClick, label = 'Close' }: CloseButtonProps) => (
  <button
    type="button"
    className="text-dim hover:text-text absolute top-0 right-0 px-4 py-3 text-sm"
    onClick={onClick}
    aria-label={label}
  >
    x
  </button>
)

interface PanelTitleProps {
  children: React.ReactNode
}

export const PanelTitle = ({ children }: PanelTitleProps) => (
  <div className="border-border-dim text-clover mb-3 border-b pb-2 text-sm">{children}</div>
)

interface SectionHeaderProps {
  children: React.ReactNode
  className?: string
}

export const SectionHeader = ({ children, className }: SectionHeaderProps) => (
  <div className={`border-border-dim text-muted mb-3 border-b pb-2 ${className ?? ''}`}>{children}</div>
)
