import { NamePrompt } from '../NamePrompt'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('NamePrompt', () => {
  it('renders the poem text', () => {
    render(<NamePrompt onSubmit={vi.fn()} />)
    expect(screen.getByText(/To make a prairie/)).toBeInTheDocument()
    expect(screen.getByText(/Emily Dickinson/)).toBeInTheDocument()
  })

  it('renders the name input with label', () => {
    render(<NamePrompt onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('enter your steward name')).toBeInTheDocument()
  })

  it('calls onSubmit with trimmed name on form submit', async () => {
    const onSubmit = vi.fn()
    render(<NamePrompt onSubmit={onSubmit} />)

    const input = screen.getByLabelText('enter your steward name')
    await userEvent.type(input, '  Willow  {Enter}')

    expect(onSubmit).toHaveBeenCalledWith('Willow')
  })

  it('does not call onSubmit with empty name', async () => {
    const onSubmit = vi.fn()
    render(<NamePrompt onSubmit={onSubmit} />)

    const input = screen.getByLabelText('enter your steward name')
    await userEvent.type(input, '   {Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('autofocuses the input', () => {
    render(<NamePrompt onSubmit={vi.fn()} />)
    const input = screen.getByLabelText('enter your steward name')
    expect(input).toHaveFocus()
  })
})
