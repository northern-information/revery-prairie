import { AccentBlock, ListCard, ScrollArea, SectionHeader, Tab, TextButton } from '../PanelPrimitives'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

  it('uses text-xs for body tier typography', () => {
    render(<SectionHeader>weather</SectionHeader>)

    const el = screen.getByText('weather')
    expect(el.className).toContain('text-xs')
  })
})

describe('TextButton', () => {
  it('renders with primary variant by default', () => {
    render(<TextButton onClick={vi.fn()}>resume</TextButton>)

    const button = screen.getByRole('button', { name: 'resume' })
    expect(button.className).toContain('text-text')
    expect(button.className).toContain('enabled:hover:text-pink')
    expect(button.className).toContain('enabled:hover:border-pink')
    expect(button.className).toContain('border')
    expect(button.className).toContain('px-2')
    expect(button.className).toContain('py-1')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('renders with secondary variant', () => {
    render(
      <TextButton onClick={vi.fn()} variant="secondary">
        sort
      </TextButton>
    )

    const button = screen.getByRole('button', { name: 'sort' })
    expect(button.className).toContain('text-dim')
    expect(button.className).toContain('enabled:hover:text-pink')
  })

  it('shows a dimmed, non-interactive disabled state', () => {
    render(
      <TextButton onClick={vi.fn()} disabled>
        locked
      </TextButton>
    )

    const button = screen.getByRole('button', { name: 'locked' })
    expect(button.className).toContain('disabled:opacity-40')
    expect(button.className).toContain('disabled:cursor-not-allowed')
  })

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn()
    render(
      <TextButton onClick={onClick} disabled>
        locked
      </TextButton>
    )

    await userEvent.click(screen.getByRole('button', { name: 'locked' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('fires onClick', async () => {
    const onClick = vi.fn()
    render(<TextButton onClick={onClick}>equip</TextButton>)

    await userEvent.click(screen.getByRole('button', { name: 'equip' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('passes title and disabled', () => {
    render(
      <TextButton onClick={vi.fn()} title="move left" disabled>
        {'<'}
      </TextButton>
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('title', 'move left')
    expect(button).toBeDisabled()
  })
})

describe('Tab', () => {
  it('renders active state with bg-pink', () => {
    render(
      <Tab active onClick={vi.fn()}>
        PACK
      </Tab>
    )

    const button = screen.getByRole('button', { name: 'PACK' })
    expect(button.className).toContain('bg-pink')
    expect(button.className).toContain('text-bg')
  })

  it('renders inactive state with text-dim', () => {
    render(
      <Tab active={false} onClick={vi.fn()}>
        MANUAL
      </Tab>
    )

    const button = screen.getByRole('button', { name: 'MANUAL' })
    expect(button.className).toContain('text-dim')
    expect(button.className).not.toContain('bg-pink')
  })

  it('fires onClick', async () => {
    const onClick = vi.fn()
    render(
      <Tab active={false} onClick={onClick}>
        REVERIES
      </Tab>
    )

    await userEvent.click(screen.getByRole('button', { name: 'REVERIES' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('passes data-testid', () => {
    render(
      <Tab active onClick={vi.fn()} data-testid="tab-manual">
        MANUAL
      </Tab>
    )

    expect(screen.getByTestId('tab-manual')).toBeInTheDocument()
  })
})

describe('ListCard', () => {
  it('renders children with border', () => {
    render(<ListCard>card content</ListCard>)

    const el = screen.getByText('card content')
    expect(el.className).toContain('border')
    expect(el.className).toContain('rounded')
    expect(el.className).toContain('p-2')
  })

  it('applies accent color as background', () => {
    render(<ListCard accentColor="#ff0000">tinted card</ListCard>)

    const el = screen.getByText('tinted card')
    expect(el.style.backgroundColor).toBe('rgba(255, 0, 0, 0.125)')
  })

  it('has no background when accentColor is omitted', () => {
    render(<ListCard>plain card</ListCard>)

    const el = screen.getByText('plain card')
    expect(el.style.backgroundColor).toBe('')
  })
})

describe('AccentBlock', () => {
  it('renders children with left border', () => {
    render(<AccentBlock>quoted text</AccentBlock>)

    const el = screen.getByText('quoted text')
    expect(el.className).toContain('border-l-2')
    expect(el.className).toContain('pl-3')
  })
})

describe('ScrollArea', () => {
  it('renders children with scrollbar-custom class', () => {
    render(<ScrollArea>scrollable content</ScrollArea>)

    const el = screen.getByText('scrollable content')
    expect(el.className).toContain('scrollbar-custom')
    expect(el.className).toContain('overflow-y-auto')
  })

  it('merges additional className', () => {
    render(<ScrollArea className="pr-2">content</ScrollArea>)

    const el = screen.getByText('content')
    expect(el.className).toContain('pr-2')
    expect(el.className).toContain('scrollbar-custom')
  })
})
