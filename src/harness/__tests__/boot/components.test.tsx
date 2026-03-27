import { render } from '@testing-library/react'
import { NamePrompt } from '@/components/NamePrompt'
import { Menu } from '@/components/Menu'
import { DialogBox } from '@/components/DialogBox'

describe('boot: component smoke tests', () => {
  describe('NamePrompt', () => {
    it('renders without throwing', () => {
      expect(() => {
        render(<NamePrompt onSubmit={vi.fn()} />)
      }).not.toThrow()
    })
  })

  describe('Menu', () => {
    it('renders without throwing', () => {
      expect(() => {
        render(
          <Menu
            onResume={vi.fn()}
            onNewGame={vi.fn()}
            metric={true}
            onToggleUnits={vi.fn()}
          />,
        )
      }).not.toThrow()
    })
  })

  describe('DialogBox', () => {
    it('renders without throwing', () => {
      expect(() => {
        render(
          <DialogBox
            characterName="Gron"
            line="Hello there."
            typingIndex={12}
            typingDone={true}
            isLastLine={false}
            onNext={vi.fn()}
            onClose={vi.fn()}
            top={100}
            left={100}
          />,
        )
      }).not.toThrow()
    })
  })
})
