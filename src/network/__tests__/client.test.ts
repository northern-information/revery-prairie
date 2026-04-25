import { afterEach, beforeEach } from 'vitest'

import { WS_CLOSE_CODES } from '@revery-prairie/shared'

import { NetworkClient } from '../client'

import type {
  PeerJoinedFrame,
  PeerLeftFrame,
  PeerPositionFrame,
  WelcomeFrame,
} from '@revery-prairie/shared'

interface SentFrame {
  data: string
}

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1

  url: string
  readyState = 0 // CONNECTING
  sent: SentFrame[] = []

  private listeners: Record<string, ((ev: unknown) => void)[]> = {}

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  addEventListener(event: string, handler: (ev: unknown) => void): void {
    const list = this.listeners[event] ?? []
    list.push(handler)
    this.listeners[event] = list
  }

  send(data: string): void {
    this.sent.push({ data })
  }

  close(_code?: number): void {
    this.readyState = 3
    this.dispatch('close', { code: _code ?? 1000, reason: '' })
  }

  // --- Test driver helpers ---
  triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN
    this.dispatch('open', {})
  }

  receive(payload: unknown): void {
    this.dispatch('message', { data: JSON.stringify(payload) })
  }

  triggerClose(code: number, reason = ''): void {
    this.readyState = 3
    this.dispatch('close', { code, reason })
  }

  private dispatch(event: string, ev: unknown): void {
    const list = this.listeners[event]
    if (!list) return
    for (const h of list) h(ev)
  }
}

const installMockWebSocket = (): typeof MockWebSocket => {
  MockWebSocket.instances = []
  ;(globalThis as { WebSocket: unknown }).WebSocket = MockWebSocket
  return MockWebSocket
}

const mockFetch = (response: unknown, status = 201): typeof fetch => {
  const impl = (): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify(response), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    )
  return impl as unknown as typeof fetch
}

describe('multiplayer foundation: NetworkClient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    installMockWebSocket()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('createPrairie sends POST and returns prairieId+ownerToken', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(mockFetch({ prairieId: 'prairie-abc', ownerToken: 'tok' }))

    const result = await NetworkClient.createPrairie('https://worker.example', 'alice', 'amber')
    expect(result).toEqual({ prairieId: 'prairie-abc', ownerToken: 'tok' })

    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toBe('https://worker.example/api/prairies')
    const init = call[1]
    expect(init).toBeTruthy()
    if (!init) return
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as { stewardName: string; color: string }
    expect(body).toEqual({ stewardName: 'alice', color: 'amber' })
  })

  it('connect sends hello on open and emits welcome+peer events', () => {
    const client = new NetworkClient('https://worker.example')
    const events: string[] = []

    let welcome: WelcomeFrame | null = null
    let joined: PeerJoinedFrame | null = null
    let position: PeerPositionFrame | null = null
    let left: PeerLeftFrame | null = null

    client.on('status-change', s => events.push(s))
    client.on('welcome', w => {
      welcome = w
    })
    client.on('peer-joined', f => {
      joined = f
    })
    client.on('peer-position', f => {
      position = f
    })
    client.on('peer-left', f => {
      left = f
    })

    client.connect({ prairieId: 'p1', stewardName: 'bob', color: 'cyan' })
    expect(events).toContain('connecting')

    const ws = MockWebSocket.instances[0]
    expect(ws.url).toBe('wss://worker.example/api/prairies/p1/connect')

    ws.triggerOpen()
    const helloFrame = JSON.parse(ws.sent[0].data) as { type: string; stewardName: string; color: string }
    expect(helloFrame).toEqual({ type: 'hello', stewardName: 'bob', color: 'cyan' })

    ws.receive({
      type: 'welcome',
      sessionId: 'sess-1',
      isOwner: false,
      world: { genesisSeed: 'alice' },
      peers: [],
    } satisfies WelcomeFrame)
    expect(welcome).not.toBeNull()
    expect(client.getStatus()).toBe('connected')

    ws.receive({
      type: 'peer-joined',
      sessionId: 'sess-2',
      stewardName: 'carol',
      color: 'mint',
      x: 1,
      y: 2,
      facing: 'down',
    } satisfies PeerJoinedFrame)
    expect(joined).not.toBeNull()
    expect((joined as unknown as PeerJoinedFrame).stewardName).toBe('carol')

    ws.receive({
      type: 'peer-position',
      sessionId: 'sess-2',
      x: 3,
      y: 4,
      facing: 'right',
    } satisfies PeerPositionFrame)
    expect(position).not.toBeNull()
    expect((position as unknown as PeerPositionFrame).x).toBe(3)

    ws.receive({ type: 'peer-left', sessionId: 'sess-2' } satisfies PeerLeftFrame)
    expect(left).not.toBeNull()
  })

  it('sendPosition writes a position frame only when connected', () => {
    const client = new NetworkClient('https://worker.example')
    client.connect({ prairieId: 'p1', stewardName: 'bob', color: 'cyan' })

    const ws = MockWebSocket.instances[0]
    // Not yet connected — sendPosition should be a no-op
    client.sendPosition(5, 5, 'down')
    expect(ws.sent.length).toBe(0)

    ws.triggerOpen() // hello
    ws.receive({
      type: 'welcome',
      sessionId: 'sess-1',
      isOwner: false,
      world: { genesisSeed: 'alice' },
      peers: [],
    })
    client.sendPosition(7, 8, 'up')
    const last = JSON.parse(ws.sent.at(-1)?.data ?? '{}') as { type: string; x: number; y: number; facing: string }
    expect(last).toEqual({ type: 'position', x: 7, y: 8, facing: 'up' })
  })

  it('treats application close codes (4xxx) as terminal — no reconnect', () => {
    const client = new NetworkClient('https://worker.example')
    const errors: { code: string; message: string }[] = []
    client.on('error', e => {
      errors.push({ code: e.code, message: e.message })
    })

    client.connect({ prairieId: 'p1', stewardName: 'bob', color: 'cyan' })
    const ws = MockWebSocket.instances[0]
    ws.triggerOpen()
    ws.triggerClose(WS_CLOSE_CODES.invalidColor, 'invalid color')

    expect(client.getStatus()).toBe('disconnected')
    expect(errors).toEqual([{ code: String(WS_CLOSE_CODES.invalidColor), message: 'invalid color' }])
    // No retry was scheduled
    vi.advanceTimersByTime(60_000)
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('schedules reconnect with exponential backoff on unexpected close', () => {
    const client = new NetworkClient('https://worker.example')
    const statuses: string[] = []
    client.on('status-change', s => statuses.push(s))

    client.connect({ prairieId: 'p1', stewardName: 'bob', color: 'cyan' })
    const ws1 = MockWebSocket.instances[0]
    ws1.triggerOpen()
    ws1.triggerClose(1006) // abnormal close

    // First retry should fire at 1s
    expect(MockWebSocket.instances.length).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances.length).toBe(2)

    // Second retry at 2s
    MockWebSocket.instances[1].triggerClose(1006)
    vi.advanceTimersByTime(2000)
    expect(MockWebSocket.instances.length).toBe(3)

    expect(statuses).toContain('reconnecting')
  })

  it('disconnect closes socket explicitly and does not retry', () => {
    const client = new NetworkClient('https://worker.example')
    client.connect({ prairieId: 'p1', stewardName: 'bob', color: 'cyan' })
    const ws = MockWebSocket.instances[0]
    ws.triggerOpen()
    ws.receive({
      type: 'welcome',
      sessionId: 'sess-1',
      isOwner: false,
      world: { genesisSeed: 'alice' },
      peers: [],
    })

    client.disconnect()
    expect(client.getStatus()).toBe('disconnected')
    vi.advanceTimersByTime(60_000)
    expect(MockWebSocket.instances.length).toBe(1)
  })
})
