import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '@/hooks/useFocusTrap'

// Shared modal scaffolding. Owns the mechanics every modal used to
// re-implement by hand: portal to <body> (so stacking clears the canvas),
// an optional backdrop scrim with click-to-dismiss, a single keyboard
// dismissal listener, focus trapping/restoration, and dialog semantics for
// screen readers.
//
// Dismissal is configurable so a single shell covers divergent surfaces:
//   - CreditsModal closes on Escape with a dimmed backdrop.
//   - ScanResultModal closes on `f`, but only once its reveal ceremony is
//     done (canDismiss=false until then), over a transparent backdrop.
//
// Focus rings stay suppressed UI-wide; the trap is invisible and exists only
// to keep Tab from leaking into the game layer behind the modal.

interface ModalShellProps {
  children: React.ReactNode
  onDismiss: () => void
  // Key that dismisses the modal. Defaults to Escape. Matched case-insensitively.
  dismissKey?: string
  // Gate dismissal (key, backdrop click). Defaults to always dismissable.
  canDismiss?: boolean
  // Render a dimmed backdrop. Credits uses true; the scan ceremony uses false.
  scrim?: boolean
  // Dismiss when the backdrop (outside the content) is clicked. Defaults true.
  dismissOnBackdropClick?: boolean
  // Accessible label for the dialog when there is no visible heading element.
  ariaLabel?: string
  // id of the element labelling the dialog (e.g. a heading). Takes precedence.
  ariaLabelledBy?: string
  contentClassName?: string
  'data-testid'?: string
  contentTestId?: string
}

export const ModalShell = ({
  children,
  onDismiss,
  dismissKey = 'Escape',
  canDismiss = true,
  scrim = true,
  dismissOnBackdropClick = true,
  ariaLabel,
  ariaLabelledBy,
  contentClassName,
  'data-testid': dataTestId,
  contentTestId,
}: ModalShellProps) => {
  const contentRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(contentRef, true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== dismissKey.toLowerCase()) return
      if (!canDismiss) return
      // Capture-phase + stopPropagation keeps the dismissal key from also
      // reaching the game input layer behind the modal.
      e.preventDefault()
      e.stopPropagation()
      onDismiss()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [dismissKey, canDismiss, onDismiss])

  const handleBackdropClick = () => {
    if (canDismiss && dismissOnBackdropClick) onDismiss()
  }

  return createPortal(
    <div
      data-testid={dataTestId}
      className={`fixed inset-0 z-30 flex items-center justify-center ${scrim ? 'bg-black/70' : 'pointer-events-auto'}`}
      onClick={handleBackdropClick}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        data-testid={contentTestId}
        className={`focus:outline-none ${contentClassName ?? ''}`}
        onClick={e => {
          e.stopPropagation()
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
