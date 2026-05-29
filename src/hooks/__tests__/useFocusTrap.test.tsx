import { useFocusTrap } from '../useFocusTrap'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'

interface HarnessProps {
  active: boolean
}

const Harness = ({ active }: HarnessProps) => {
  const ref = useRef<HTMLDivElement | null>(null)
  useFocusTrap(ref, active)
  return (
    <div ref={ref} tabIndex={-1} data-testid="trap">
      <button type="button">first</button>
      <button type="button">second</button>
      <button type="button">last</button>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element when activated', () => {
    render(<Harness active />)
    expect(document.activeElement).toHaveTextContent('first')
  })

  it('wraps focus from last to first on Tab', async () => {
    render(<Harness active />)
    const last = document.querySelectorAll('button')[2]
    last.focus()

    await userEvent.tab()
    expect(document.activeElement).toHaveTextContent('first')
  })

  it('wraps focus from first to last on Shift+Tab', async () => {
    render(<Harness active />)
    // first is already focused on activation
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toHaveTextContent('last')
  })

  it('restores focus to the prior element on deactivation', () => {
    const outside = document.createElement('button')
    outside.textContent = 'outside'
    document.body.appendChild(outside)
    outside.focus()
    expect(document.activeElement).toBe(outside)

    const { rerender } = render(<Harness active />)
    expect(document.activeElement).toHaveTextContent('first')

    rerender(<Harness active={false} />)
    expect(document.activeElement).toBe(outside)

    outside.remove()
  })

  it('does nothing when inactive', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    render(<Harness active={false} />)
    expect(document.activeElement).toBe(outside)

    outside.remove()
  })
})
