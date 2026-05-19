import { SpecimenStack } from '../SpecimenStack'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { ScannedSpecimen } from '@/engine/types'

const makeSpecimen = (identityChar: string, scannedAt: number): ScannedSpecimen => ({
  identity: identityChar.repeat(64),
  scannedAt,
  position: { x: 0, y: 0 },
})

describe('SpecimenStack', () => {
  it('renders nothing when the specimen list is empty', () => {
    render(<SpecimenStack specimens={[]} />)
    expect(screen.queryByTestId('specimen-stack')).not.toBeInTheDocument()
  })

  it('renders a single card with counter "1 of 1" when only one specimen exists', () => {
    render(<SpecimenStack specimens={[makeSpecimen('a', performance.now())]} />)
    expect(screen.getByTestId('specimen-stack-counter')).toHaveTextContent('Specimen 1 of 1')
  })

  it('paging buttons are disabled when only one specimen exists', () => {
    render(<SpecimenStack specimens={[makeSpecimen('a', performance.now())]} />)
    const prev = screen.getByLabelText('Previous specimen')
    const next = screen.getByLabelText('Next specimen')
    expect(prev).toBeDisabled()
    expect(next).toBeDisabled()
  })

  it('opens to the last card by default (just-scanned card)', () => {
    const now = performance.now()
    render(
      <SpecimenStack specimens={[makeSpecimen('a', now - 5000), makeSpecimen('b', now - 1000), makeSpecimen('c', now)]} />,
    )
    expect(screen.getByTestId('specimen-stack-counter')).toHaveTextContent('Specimen 3 of 3')
  })

  it('opens to initialIndex when provided', () => {
    const now = performance.now()
    render(
      <SpecimenStack
        specimens={[makeSpecimen('a', now), makeSpecimen('b', now), makeSpecimen('c', now)]}
        initialIndex={0}
      />,
    )
    expect(screen.getByTestId('specimen-stack-counter')).toHaveTextContent('Specimen 1 of 3')
  })

  it('next button advances the card', async () => {
    const user = userEvent.setup()
    const now = performance.now()
    render(
      <SpecimenStack
        specimens={[makeSpecimen('a', now), makeSpecimen('b', now), makeSpecimen('c', now)]}
        initialIndex={0}
      />,
    )
    await user.click(screen.getByLabelText('Next specimen'))
    expect(screen.getByTestId('specimen-stack-counter')).toHaveTextContent('Specimen 2 of 3')
  })

  it('prev button wraps from first to last', async () => {
    const user = userEvent.setup()
    const now = performance.now()
    render(
      <SpecimenStack
        specimens={[makeSpecimen('a', now), makeSpecimen('b', now), makeSpecimen('c', now)]}
        initialIndex={0}
      />,
    )
    await user.click(screen.getByLabelText('Previous specimen'))
    expect(screen.getByTestId('specimen-stack-counter')).toHaveTextContent('Specimen 3 of 3')
  })

  it('shows "just now" for a freshly-scanned card', () => {
    render(<SpecimenStack specimens={[makeSpecimen('a', performance.now())]} />)
    expect(screen.getByTestId('specimen-scan-time')).toHaveTextContent('just now')
  })

  it('shows "N seconds ago" for a card scanned within the last minute', () => {
    const tenSecondsAgo = performance.now() - 10_000
    render(<SpecimenStack specimens={[makeSpecimen('a', tenSecondsAgo)]} />)
    expect(screen.getByTestId('specimen-scan-time')).toHaveTextContent(/seconds ago/)
  })
})
