import { playClick, playHover } from '@/engine/sfx'

interface CloseButtonProps {
  onClick: () => void
  label?: string
}

export const CloseButton = ({ onClick, label = 'Close' }: CloseButtonProps) => (
  <button
    type="button"
    className="text-dim hover:text-pink absolute top-0 right-0 px-4 py-3 text-sm focus:outline-none"
    onClick={() => {
      playClick()
      onClick()
    }}
    onMouseEnter={playHover}
    aria-label={label}
  >
    x
  </button>
)

interface SectionHeaderProps {
  children: React.ReactNode
  className?: string
}

export const SectionHeader = ({ children, className }: SectionHeaderProps) => (
  <div className={`border-border-dim text-muted mb-3 border-b pb-2 text-xs ${className ?? ''}`}>{children}</div>
)

interface TextButtonProps {
  onClick: () => void
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
  title?: string
  disabled?: boolean
  'data-testid'?: string
}

export const TextButton = ({
  onClick,
  children,
  variant = 'primary',
  className,
  title,
  disabled,
  'data-testid': dataTestId,
}: TextButtonProps) => (
  <button
    type="button"
    className={`${variant === 'primary' ? 'text-text' : 'text-dim'} border-border/50 enabled:hover:border-pink enabled:hover:text-pink rounded border px-2 py-1 text-left text-xs transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ''}`}
    onClick={() => {
      if (disabled) return
      playClick()
      onClick()
    }}
    onMouseEnter={() => {
      if (disabled) return
      playHover()
    }}
    title={title}
    disabled={disabled}
    data-testid={dataTestId}
  >
    {children}
  </button>
)

interface TabProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  'data-testid'?: string
}

export const Tab = ({ active, onClick, children, ...rest }: TabProps) => (
  <button
    type="button"
    className={`px-2 py-1.5 text-xs transition-colors focus:outline-none ${
      active ? 'bg-pink text-bg' : 'text-dim hover:bg-permacomputer-dim hover:text-text'
    }`}
    onClick={() => {
      playClick()
      onClick()
    }}
    onMouseEnter={playHover}
    data-testid={rest['data-testid']}
  >
    {children}
  </button>
)

interface ListCardProps {
  children: React.ReactNode
  className?: string
  accentColor?: string
}

export const ListCard = ({ children, className, accentColor }: ListCardProps) => (
  <div
    className={`border-border/50 mb-2 rounded border p-2 ${className ?? ''}`}
    style={accentColor ? { backgroundColor: `${accentColor}20` } : undefined}
  >
    {children}
  </div>
)

interface AccentBlockProps {
  children: React.ReactNode
}

export const AccentBlock = ({ children }: AccentBlockProps) => (
  <div className="border-border border-l-2 pl-3">{children}</div>
)

interface ScrollAreaProps {
  children: React.ReactNode
  className?: string
}

export const ScrollArea = ({ children, className }: ScrollAreaProps) => (
  <div className={`scrollbar-custom min-h-0 flex-1 overflow-y-auto ${className ?? ''}`}>{children}</div>
)
