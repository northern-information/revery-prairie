import { CloseButton, PanelTitle, SectionHeader } from '../PanelPrimitives'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('CloseButton', () => {
  it('renders x and fires onClick', async () => {
    const onClick = vi.fn()
    render(<CloseButton onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Close' })
    expect(button).toHaveTextContent('x')

    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('uses custom aria-label', () => {
    render(<CloseButton onClick={vi.fn()} label="Close dialog" />)

    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument()
  })
})

describe('PanelTitle', () => {
  it('renders children with text-clover class', () => {
    render(<PanelTitle>inventory</PanelTitle>)

    const el = screen.getByText('inventory')
    expect(el).toBeInTheDocument()
    expect(el.className).toContain('text-clover')
  })
})

describe('SectionHeader', () => {
  it('renders children', () => {
    render(<SectionHeader>stats</SectionHeader>)

    expect(screen.getByText('stats')).toBeInTheDocument()
  })

  it('accepts className for layout overrides', () => {
    render(<SectionHeader className="flex items-baseline justify-between">backpack</SectionHeader>)

    const el = screen.getByText('backpack')
    expect(el.className).toContain('flex')
    expect(el.className).toContain('items-baseline')
  })
})
