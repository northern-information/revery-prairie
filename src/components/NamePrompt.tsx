import { useState } from 'react'

interface NamePromptProps {
  onSubmit: (name: string) => void
}

export const NamePrompt = ({ onSubmit }: NamePromptProps) => {
  const [name, setName] = useState('')

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) {
      onSubmit(trimmed)
    }
  }

  return (
    <div className="text-text flex h-full w-full flex-col items-center justify-center gap-8 font-mono">
      <blockquote className="text-dirt max-w-full text-center leading-[1.8] italic">
        To make a prairie it takes a clover and one bee,
        <br />
        One clover, and a bee.
        <br />
        <br />
        And revery.
        <br />
        The revery alone will do,
        <br />
        If bees are few.
        <div className="text-dim mt-4 text-xs">Emily Dickinson</div>
      </blockquote>

      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
        <label htmlFor="steward-name" className="text-muted text-sm">
          enter your steward name
        </label>
        <input
          id="steward-name"
          type="text"
          value={name}
          onChange={e => {
            setName((e.target as HTMLInputElement).value)
          }}
          autoFocus
          maxLength={24}
          className="border-border text-text w-64 rounded-sm border bg-transparent px-4 py-2 text-center font-mono text-base outline-none"
        />
        <a href="/p/new" className="text-dim text-xs underline">
          or plant an online prairie
        </a>
      </form>
    </div>
  )
}
