import { render, screen } from '@testing-library/react'

import { DialogBox } from '../DialogBox'

describe('DialogBox', () => {
  it('renders character name and dialog text', () => {
    render(
      <DialogBox
        characterName="Moab"
        line="hello traveler"
        typingIndex={14}
        typingDone={false}
      />,
    )

    expect(screen.getByText('moab')).toBeTruthy()
    expect(screen.getByText('hello traveler')).toBeTruthy()
  })

  it('renders with z-30 to sit above the action bar', () => {
    const { container } = render(
      <DialogBox
        characterName="Moab"
        line="hello"
        typingIndex={5}
        typingDone={false}
      />,
    )

    const dialogRoot = container.firstElementChild as HTMLElement
    expect(dialogRoot.className).toMatch(/z-30/)
    expect(dialogRoot.className).not.toMatch(/z-10/)
  })

  it('is centered within the game canvas area (left-0 to right-48)', () => {
    const { container } = render(
      <DialogBox
        characterName="Moab"
        line="hello"
        typingIndex={5}
        typingDone={false}
      />,
    )

    const dialogRoot = container.firstElementChild as HTMLElement
    // horizontally: left-0 + right-48 + mx-auto centers within game canvas area
    expect(dialogRoot.className).toMatch(/left-0/)
    expect(dialogRoot.className).toMatch(/right-48/)
    expect(dialogRoot.className).toMatch(/mx-auto/)
    // vertically: top-1/2 + -translate-y-1/2 centers vertically
    expect(dialogRoot.className).toMatch(/top-1\/2/)
    expect(dialogRoot.className).toMatch(/-translate-y-1\/2/)
  })

  it('does not use left-1/2 -translate-x-1/2 (viewport-center overflow pattern)', () => {
    const { container } = render(
      <DialogBox
        characterName="Moab"
        line="hello"
        typingIndex={5}
        typingDone={false}
      />,
    )

    const dialogRoot = container.firstElementChild as HTMLElement
    expect(dialogRoot.className).not.toMatch(/left-1\/2/)
    expect(dialogRoot.className).not.toMatch(/-translate-x-1\/2/)
  })

  it('renders portrait when provided', () => {
    render(
      <DialogBox
        characterName="Moab"
        portrait="/portraits/moab.png"
        line="hello"
        typingIndex={5}
        typingDone={false}
      />,
    )

    const img = screen.getByAltText('portrait of moab')
    expect(img).toBeTruthy()
  })

  it('renders angel hash grid for angel characters', () => {
    render(
      <DialogBox
        characterName="Angel"
        line="abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        typingIndex={10}
        typingDone={false}
        isAngel
      />,
    )

    expect(screen.getByTestId('angel-hash-grid')).toBeTruthy()
  })

  it('does not constrain height — content grows to fit', () => {
    const { container } = render(
      <DialogBox
        characterName="Angel"
        line="abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        typingIndex={64}
        typingDone={false}
        isAngel
      />,
    )

    const dialogRoot = container.firstElementChild as HTMLElement
    expect(dialogRoot.className).not.toMatch(/max-h/)
    expect(dialogRoot.className).not.toMatch(/overflow-hidden/)
  })

  it('renders portrait at 128x128 when provided', () => {
    render(
      <DialogBox
        characterName="Gron"
        portrait="/gron.gif"
        line="hello"
        typingIndex={5}
        typingDone={false}
      />,
    )

    const img = screen.getByAltText('portrait of gron')
    expect(img.className).toMatch(/h-32/)
    expect(img.className).toMatch(/w-32/)
  })

  it('shows n[e]xt button when typing is done and not last line', () => {
    const onAdvance = vi.fn()
    render(
      <DialogBox
        characterName="Gron"
        line="hello"
        typingIndex={5}
        typingDone={true}
        isLastLine={false}
        onAdvance={onAdvance}
      />,
    )

    const button = screen.getByTestId('dialog-advance-button')
    expect(button.textContent).toBe('n[e]xt')
  })

  it('shows clos[e] button on last line', () => {
    const onAdvance = vi.fn()
    render(
      <DialogBox
        characterName="Gron"
        line="goodbye"
        typingIndex={7}
        typingDone={true}
        isLastLine={true}
        onAdvance={onAdvance}
      />,
    )

    const button = screen.getByTestId('dialog-advance-button')
    expect(button.textContent).toBe('clos[e]')
  })

  it('hides button while still typing', () => {
    const onAdvance = vi.fn()
    render(
      <DialogBox
        characterName="Gron"
        line="hello"
        typingIndex={3}
        typingDone={false}
        isLastLine={false}
        onAdvance={onAdvance}
      />,
    )

    expect(screen.queryByTestId('dialog-advance-button')).toBeNull()
  })

  it('calls onAdvance when button is clicked', () => {
    const onAdvance = vi.fn()
    render(
      <DialogBox
        characterName="Gron"
        line="hello"
        typingIndex={5}
        typingDone={true}
        isLastLine={false}
        onAdvance={onAdvance}
      />,
    )

    const button = screen.getByTestId('dialog-advance-button')
    button.click()
    expect(onAdvance).toHaveBeenCalledOnce()
  })
})
