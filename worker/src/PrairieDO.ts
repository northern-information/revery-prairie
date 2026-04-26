import {
  isColorId,
  SPAWN_DEFAULT,
  WS_CLOSE_CODES,
} from '@revery-prairie/shared'

import type {
  ClientMessage,
  ColorId,
  Direction,
  HelloFrame,
  PeerJoinedFrame,
  PeerLeftFrame,
  PeerPositionFrame,
  PositionFrame,
  RemotePlayerWire,
  ServerMessage,
  WelcomeFrame,
} from '@revery-prairie/shared'

interface Meta {
  prairieId: string
  ownerToken: string
  stewardName: string
  createdAt: number
}

interface Attachment {
  sessionId: string
  stewardName: string
  color: ColorId
  isOwner: boolean
  x: number
  y: number
  facing: Direction
}

interface Env {
  PRAIRIE: DurableObjectNamespace
}

export class PrairieDO implements DurableObject {
  private ctx: DurableObjectState
  // env retained for future use (KV, secrets); unused for MVP
  private env: Env

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
    void this.env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/create' && request.method === 'POST') {
      return this.handleCreate(request)
    }
    if (url.pathname === '/connect') {
      return this.handleConnect(request)
    }
    return new Response('not found', { status: 404 })
  }

  private async handleCreate(request: Request): Promise<Response> {
    const existing = await this.ctx.storage.get<Meta>('meta')
    if (existing) {
      return new Response(JSON.stringify({ error: 'prairie already exists' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      })
    }
    const body = (await request.json()) as {
      prairieId?: string
      stewardName?: string
      color?: string
    }
    if (
      typeof body.prairieId !== 'string' ||
      typeof body.stewardName !== 'string' ||
      !isColorId(body.color)
    ) {
      return new Response(JSON.stringify({ error: 'invalid create body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }
    const ownerToken = crypto.randomUUID()
    const meta: Meta = {
      prairieId: body.prairieId,
      ownerToken,
      stewardName: body.stewardName,
      createdAt: Date.now(),
    }
    await this.ctx.storage.put('meta', meta)
    return new Response(
      JSON.stringify({ prairieId: meta.prairieId, ownerToken: meta.ownerToken }),
      { status: 201, headers: { 'content-type': 'application/json' } }
    )
  }

  private async handleConnect(request: Request): Promise<Response> {
    const meta = await this.ctx.storage.get<Meta>('meta')
    if (!meta) {
      return new Response('prairie not found', { status: 404 })
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 400 })
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string') {
      ws.close(WS_CLOSE_CODES.malformedHello, 'binary frames not accepted')
      return
    }
    let msg: ClientMessage
    try {
      msg = JSON.parse(data) as ClientMessage
    } catch {
      ws.close(WS_CLOSE_CODES.malformedHello, 'malformed JSON')
      return
    }

    const attachment = (ws.deserializeAttachment() as Attachment | null) ?? null

    if (attachment === null) {
      if (msg.type !== 'hello') {
        ws.close(WS_CLOSE_CODES.malformedHello, 'expected hello frame first')
        return
      }
      await this.handleHello(ws, msg)
      return
    }

    if (msg.type === 'position') {
      this.handlePosition(ws, attachment, msg)
      return
    }

    ws.close(WS_CLOSE_CODES.malformedHello, 'unexpected message type after hello')
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as Attachment | null
    if (!attachment) return
    const frame: PeerLeftFrame = {
      type: 'peer-left',
      sessionId: attachment.sessionId,
    }
    this.broadcast(frame, ws)
  }

  private async handleHello(ws: WebSocket, hello: HelloFrame): Promise<void> {
    const meta = await this.ctx.storage.get<Meta>('meta')
    if (!meta) {
      ws.close(WS_CLOSE_CODES.serverError, 'meta missing')
      return
    }
    if (typeof hello.stewardName !== 'string' || hello.stewardName.length === 0) {
      ws.close(WS_CLOSE_CODES.malformedHello, 'stewardName required')
      return
    }
    if (!isColorId(hello.color)) {
      ws.close(WS_CLOSE_CODES.invalidColor, 'invalid color')
      return
    }
    const isOwner =
      typeof hello.ownerToken === 'string' && hello.ownerToken === meta.ownerToken
    const sessionId = crypto.randomUUID()
    const attachment: Attachment = {
      sessionId,
      stewardName: hello.stewardName,
      color: hello.color,
      isOwner,
      x: SPAWN_DEFAULT.x,
      y: SPAWN_DEFAULT.y,
      facing: SPAWN_DEFAULT.facing,
    }
    ws.serializeAttachment(attachment)

    const peers: RemotePlayerWire[] = this.collectPeers(ws)
    const welcome: WelcomeFrame = {
      type: 'welcome',
      sessionId,
      isOwner,
      world: { genesisSeed: meta.stewardName },
      peers,
    }
    ws.send(JSON.stringify(welcome))

    const joinedFrame: PeerJoinedFrame = {
      type: 'peer-joined',
      sessionId,
      stewardName: hello.stewardName,
      color: hello.color,
      x: SPAWN_DEFAULT.x,
      y: SPAWN_DEFAULT.y,
      facing: SPAWN_DEFAULT.facing,
    }
    this.broadcast(joinedFrame, ws)
  }

  private handlePosition(
    ws: WebSocket,
    attachment: Attachment,
    msg: PositionFrame
  ): void {
    const updated: Attachment = {
      ...attachment,
      x: msg.x,
      y: msg.y,
      facing: msg.facing,
    }
    ws.serializeAttachment(updated)
    const frame: PeerPositionFrame = {
      type: 'peer-position',
      sessionId: attachment.sessionId,
      x: msg.x,
      y: msg.y,
      facing: msg.facing,
    }
    this.broadcast(frame, ws)
  }

  private collectPeers(exclude: WebSocket): RemotePlayerWire[] {
    const peers: RemotePlayerWire[] = []
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) continue
      const att = socket.deserializeAttachment() as Attachment | null
      if (!att) continue
      peers.push({
        sessionId: att.sessionId,
        stewardName: att.stewardName,
        color: att.color,
        x: att.x,
        y: att.y,
        facing: att.facing,
      })
    }
    return peers
  }

  private broadcast(frame: ServerMessage, exclude: WebSocket): void {
    const payload = JSON.stringify(frame)
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) continue
      // Only fan out to sockets that have completed the hello handshake.
      const att = socket.deserializeAttachment() as Attachment | null
      if (!att) continue
      try {
        socket.send(payload)
      } catch {
        // socket may be closing; ignore
      }
    }
  }
}
