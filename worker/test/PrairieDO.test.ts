import { PrairieDO } from '../src/PrairieDO'
import { describe, expect, it } from 'vitest'

import type {
  HelloFrame,
  PeerJoinedFrame,
  PeerLeftFrame,
  PeerPositionFrame,
  PositionFrame,
  WelcomeFrame,
} from '@revery-prairie/shared'

// --- Mocks for the Cloudflare Workers runtime APIs we use ---

class MockWebSocket {
  attachment: unknown = null
  sent: string[] = []
  closeCode: number | null = null
  closeReason: string | null = null

  send(data: string): void {
    this.sent.push(data)
  }
  close(code?: number, reason?: string): void {
    this.closeCode = code ?? 1000
    this.closeReason = reason ?? ''
  }
  serializeAttachment(value: unknown): void {
    this.attachment = value
  }
  deserializeAttachment(): unknown {
    return this.attachment
  }
}

class MockStorage {
  private map = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value)
  }
}

class MockState {
  storage = new MockStorage()
  private sockets: MockWebSocket[] = []

  acceptWebSocket(ws: MockWebSocket): void {
    this.sockets.push(ws)
  }
  getWebSockets(): MockWebSocket[] {
    return this.sockets
  }
}

const newDO = (): { do_: PrairieDO; state: MockState } => {
  const state = new MockState()
  const env = { PRAIRIE: {} as unknown as DurableObjectNamespace }
  // Cast through unknown to satisfy the DurableObjectState shape we partially implement.
  const do_ = new PrairieDO(state as unknown as DurableObjectState, env)
  return { do_, state }
}

const seedMeta = async (state: MockState, prairieId = 'p1', ownerToken = 'tok'): Promise<void> => {
  await state.storage.put('meta', {
    prairieId,
    ownerToken,
    stewardName: 'alice',
    createdAt: 1,
  })
}

describe('multiplayer foundation: PrairieDO', () => {
  it('create persists meta and returns prairieId+ownerToken', async () => {
    const { do_, state } = newDO()
    const req = new Request('https://do/create', {
      method: 'POST',
      body: JSON.stringify({ prairieId: 'p1', stewardName: 'alice', color: 'amber' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await do_.fetch(req)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { prairieId: string; ownerToken: string }
    expect(body.prairieId).toBe('p1')
    expect(typeof body.ownerToken).toBe('string')
    const meta = await state.storage.get<{ stewardName: string }>('meta')
    expect(meta?.stewardName).toBe('alice')
  })

  it('create rejects invalid color', async () => {
    const { do_ } = newDO()
    const req = new Request('https://do/create', {
      method: 'POST',
      body: JSON.stringify({ prairieId: 'p1', stewardName: 'alice', color: 'fuchsia' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await do_.fetch(req)
    expect(res.status).toBe(400)
  })

  it('create rejects duplicate prairie', async () => {
    const { do_, state } = newDO()
    await seedMeta(state)
    const req = new Request('https://do/create', {
      method: 'POST',
      body: JSON.stringify({ prairieId: 'p1', stewardName: 'alice', color: 'amber' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await do_.fetch(req)
    expect(res.status).toBe(409)
  })

  it('connect returns 404 when prairie does not exist', async () => {
    const { do_ } = newDO()
    const req = new Request('https://do/connect', {
      method: 'GET',
      headers: { Upgrade: 'websocket' },
    })
    const res = await do_.fetch(req)
    expect(res.status).toBe(404)
  })

  it('hello with invalid color closes socket with code 4002', async () => {
    const { do_, state } = newDO()
    await seedMeta(state)
    const ws = new MockWebSocket()
    state.acceptWebSocket(ws)
    const hello = JSON.stringify({
      type: 'hello',
      stewardName: 'bob',
      color: 'fuchsia',
    } as unknown as HelloFrame)
    await do_.webSocketMessage(ws as unknown as WebSocket, hello)
    expect(ws.closeCode).toBe(4002)
  })

  it('hello sends welcome and broadcasts peer-joined to other sockets', async () => {
    const { do_, state } = newDO()
    await seedMeta(state)
    const wsA = new MockWebSocket()
    const wsB = new MockWebSocket()
    state.acceptWebSocket(wsA)
    state.acceptWebSocket(wsB)

    // wsA joins first
    await do_.webSocketMessage(
      wsA as unknown as WebSocket,
      JSON.stringify({ type: 'hello', stewardName: 'alice', color: 'amber' })
    )
    const welcomeA = JSON.parse(wsA.sent[0]) as WelcomeFrame
    expect(welcomeA.type).toBe('welcome')
    expect(welcomeA.peers).toHaveLength(0)

    // wsB joins; wsA should receive peer-joined
    await do_.webSocketMessage(
      wsB as unknown as WebSocket,
      JSON.stringify({ type: 'hello', stewardName: 'bob', color: 'cyan', ownerToken: 'tok' })
    )
    const welcomeB = JSON.parse(wsB.sent[0]) as WelcomeFrame
    expect(welcomeB.isOwner).toBe(true)
    expect(welcomeB.peers).toHaveLength(1)
    expect(welcomeB.peers[0].stewardName).toBe('alice')

    const joined = JSON.parse(wsA.sent[1]) as PeerJoinedFrame
    expect(joined.type).toBe('peer-joined')
    expect(joined.stewardName).toBe('bob')
    expect(joined.color).toBe('cyan')
  })

  it('position frame fans out as peer-position to other sockets only', async () => {
    const { do_, state } = newDO()
    await seedMeta(state)
    const wsA = new MockWebSocket()
    const wsB = new MockWebSocket()
    state.acceptWebSocket(wsA)
    state.acceptWebSocket(wsB)
    await do_.webSocketMessage(
      wsA as unknown as WebSocket,
      JSON.stringify({ type: 'hello', stewardName: 'alice', color: 'amber' })
    )
    await do_.webSocketMessage(
      wsB as unknown as WebSocket,
      JSON.stringify({ type: 'hello', stewardName: 'bob', color: 'cyan' })
    )

    const beforeA = wsA.sent.length
    const beforeB = wsB.sent.length

    await do_.webSocketMessage(
      wsA as unknown as WebSocket,
      JSON.stringify({ type: 'position', x: 7, y: 8, facing: 'up' } satisfies PositionFrame)
    )
    expect(wsA.sent.length).toBe(beforeA) // sender does not receive its own update
    expect(wsB.sent.length).toBe(beforeB + 1)

    const fanned = JSON.parse(wsB.sent.at(-1) ?? '{}') as PeerPositionFrame
    expect(fanned.type).toBe('peer-position')
    expect(fanned.x).toBe(7)
    expect(fanned.y).toBe(8)
    expect(fanned.facing).toBe('up')
  })

  it('webSocketClose broadcasts peer-left to remaining sockets', async () => {
    const { do_, state } = newDO()
    await seedMeta(state)
    const wsA = new MockWebSocket()
    const wsB = new MockWebSocket()
    state.acceptWebSocket(wsA)
    state.acceptWebSocket(wsB)
    await do_.webSocketMessage(
      wsA as unknown as WebSocket,
      JSON.stringify({ type: 'hello', stewardName: 'alice', color: 'amber' })
    )
    await do_.webSocketMessage(
      wsB as unknown as WebSocket,
      JSON.stringify({ type: 'hello', stewardName: 'bob', color: 'cyan' })
    )

    const beforeA = wsA.sent.length
    await do_.webSocketClose(wsB as unknown as WebSocket, 1006, 'abnormal', false)
    const left = JSON.parse(wsA.sent[beforeA]) as PeerLeftFrame
    expect(left.type).toBe('peer-left')
  })

  it('storage meta survives across DO instance recreation (hibernation simulation)', async () => {
    const env = { PRAIRIE: {} as unknown as DurableObjectNamespace }
    const sharedState = new MockState()
    await seedMeta(sharedState, 'persistent-id', 'persistent-tok')

    // Simulate hibernation/wake by creating a new DO instance over the same storage
    const woken = new PrairieDO(sharedState as unknown as DurableObjectState, env)
    const ws = new MockWebSocket()
    sharedState.acceptWebSocket(ws)
    await woken.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: 'hello', stewardName: 'frank', color: 'mint', ownerToken: 'persistent-tok' })
    )
    const welcome = JSON.parse(ws.sent[0]) as WelcomeFrame
    expect(welcome.type).toBe('welcome')
    expect(welcome.isOwner).toBe(true)
  })
})
