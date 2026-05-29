import { useEffect, type RefObject } from 'react'

// Keeps keyboard focus inside a container while it is active, and restores
// focus to wherever it was when the container closes. This is deliberately
// invisible — the UI suppresses focus rings everywhere (aesthetics over the
// usual web focus-visible affordance), so the trap exists only to stop Tab
// from leaking into the game layer behind an open modal and to return the
// steward to where they were on close.
//
// Pass the container ref and whether the trap is active. When it flips active
// the hook focuses the first focusable descendant (or the container itself),
// cycles Tab / Shift+Tab within the container, and restores the previously
// focused element on teardown.

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// The selector already excludes disabled controls and tabindex="-1", which
// is the filtering that matters. We deliberately do NOT filter on layout
// visibility (offsetParent / getClientRects): jsdom has no layout engine so
// those always read as hidden, and no trap adopter renders a present-but-
// focusable hidden control. Hide-from-trap is handled at the source instead
// (render hidden focusables with tabindex="-1").
const getFocusable = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

export const useFocusTrap = (containerRef: RefObject<HTMLElement | null>, active: boolean): void => {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusables = getFocusable(container)
    const firstFocusable = focusables[0] ?? container
    firstFocusable.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const current = getFocusable(container)
      if (current.length === 0) {
        e.preventDefault()
        return
      }
      const first = current[0]
      const last = current[current.length - 1]
      const activeEl = document.activeElement
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)

    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [containerRef, active])
}
