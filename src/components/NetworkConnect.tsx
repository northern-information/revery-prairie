import { useEffect, useState } from 'react'
import { PLAYER_COLORS } from '@revery-prairie/shared'

import { NetworkClient } from '@/network/client'

import type { ColorId, CreatePrairieResponse, WelcomeFrame } from '@revery-prairie/shared'

const COLOR_IDS = Object.keys(PLAYER_COLORS) as ColorId[]
const LAST_COLOR_KEY = 'prairie:lastColor'
const ownerTokenKey = (prairieId: string): string => `prairie:${prairieId}:ownerToken`

const readLastColor = (): ColorId => {
  try {
    const stored = window.localStorage.getItem(LAST_COLOR_KEY)
    if (stored && COLOR_IDS.includes(stored as ColorId)) return stored as ColorId
  } catch {
    // localStorage unavailable; fall through
  }
  return 'amber'
}

export interface NetworkConnectResult {
  client: NetworkClient
  welcome: WelcomeFrame
  prairieId: string
  ownerToken: string | null
  stewardName: string
  color: ColorId
}

interface NetworkConnectProps {
  workerUrl: string
  prairieId: string | null
  onConnected: (result: NetworkConnectResult) => void
}

type Mode = 'create' | 'join'

export const NetworkConnect = ({ workerUrl, prairieId, onConnected }: NetworkConnectProps) => {
  const mode: Mode = prairieId === null ? 'create' : 'join'
  const [name, setName] = useState('')
  const [color, setColor] = useState<ColorId>(readLastColor())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storedOwnerToken, setStoredOwnerToken] = useState<string | null>(null)

  useEffect(() => {
    if (prairieId === null) {
      setStoredOwnerToken(null)
      return
    }
    try {
      setStoredOwnerToken(window.localStorage.getItem(ownerTokenKey(prairieId)))
    } catch {
      setStoredOwnerToken(null)
    }
  }, [prairieId])

  const submitImpl = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)

    try {
      window.localStorage.setItem(LAST_COLOR_KEY, color)

      let resolvedPrairieId: string
      let resolvedOwnerToken: string | null

      if (mode === 'create') {
        const response: CreatePrairieResponse = await NetworkClient.createPrairie(
          workerUrl,
          trimmed,
          color
        )
        window.localStorage.setItem(ownerTokenKey(response.prairieId), response.ownerToken)
        window.history.replaceState(null, '', `/p/${response.prairieId}`)
        resolvedPrairieId = response.prairieId
        resolvedOwnerToken = response.ownerToken
      } else {
        if (prairieId === null) {
          setError('missing prairie id')
          setSubmitting(false)
          return
        }
        resolvedPrairieId = prairieId
        resolvedOwnerToken = storedOwnerToken
      }

      const client = new NetworkClient(workerUrl)
      const welcomeHandler = (welcome: WelcomeFrame) => {
        client.off('welcome', welcomeHandler)
        client.off('error', errorHandler)
        onConnected({
          client,
          welcome,
          prairieId: resolvedPrairieId,
          ownerToken: resolvedOwnerToken,
          stewardName: trimmed,
          color,
        })
      }
      const errorHandler = (frame: { code: string; message: string }) => {
        client.off('welcome', welcomeHandler)
        client.off('error', errorHandler)
        setError(`connection rejected (${frame.code}): ${frame.message}`)
        setSubmitting(false)
      }
      client.on('welcome', welcomeHandler)
      client.on('error', errorHandler)
      client.connect({
        prairieId: resolvedPrairieId,
        stewardName: trimmed,
        color,
        ownerToken: resolvedOwnerToken ?? undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'connection failed')
      setSubmitting(false)
    }
  }

  const handleSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault()
    void submitImpl()
  }

  return (
    <div className="text-text flex h-full w-full flex-col items-center justify-center gap-8 font-mono">
      <blockquote className="text-dirt max-w-full text-center leading-[1.8] italic">
        {mode === 'create' ? 'plant a new prairie' : 'visit a prairie'}
      </blockquote>

      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
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
            disabled={submitting}
            className="border-border text-text w-64 rounded-sm border bg-transparent px-4 py-2 text-center font-mono text-base outline-none"
          />
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="text-muted text-sm">pick a color</span>
          <div className="flex flex-wrap justify-center gap-2">
            {COLOR_IDS.map(id => {
              const swatch = PLAYER_COLORS[id]
              const isActive = id === color
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setColor(id)
                  }}
                  disabled={submitting}
                  aria-label={swatch.label}
                  aria-pressed={isActive}
                  className={`flex h-10 w-10 items-center justify-center rounded border-2 ${isActive ? 'border-text' : 'border-transparent'}`}
                  style={{ backgroundColor: swatch.hex }}
                >
                  <span className="text-bg font-bold">@</span>
                </button>
              )
            })}
          </div>
        </div>

        {storedOwnerToken !== null && mode === 'join' && (
          <div className="text-dim text-xs">connecting as host (owner token found)</div>
        )}

        <button
          type="submit"
          disabled={submitting || name.trim() === ''}
          className="border-border text-text rounded-sm border bg-transparent px-6 py-2 font-mono text-sm outline-none disabled:opacity-50"
        >
          {submitting ? 'connecting…' : mode === 'create' ? 'create prairie' : 'join prairie'}
        </button>

        {error !== null && <div className="text-coral text-xs">{error}</div>}

        <a href="/" className="text-dim text-xs underline">
          return offline
        </a>
      </form>
    </div>
  )
}
