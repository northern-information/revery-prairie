import {
  PRAIRIE_CREATE_PATH,
  prairieConnectPath,
} from '@revery-prairie/shared'

import type {
  ColorId,
  CreatePrairieResponse,
  Direction,
  HelloFrame,
  PositionFrame,
  ServerMessage,
} from '@revery-prairie/shared'

import type {
  NetworkClientEvents,
  NetworkClientStatus,
} from './types'

// Backoff schedule: 1s, 2s, 4s, 8s, 16s, 30s, then 6x30s. After 12 attempts, give up.
const BACKOFF_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
const TAIL_RETRIES_AT_CAP = 6
const MAX_ATTEMPTS = BACKOFF_DELAYS_MS.length + TAIL_RETRIES_AT_CAP

export interface ConnectArgs {
  prairieId: string
  stewardName: string
  color: ColorId
  ownerToken?: string
}

type Listeners = {
  [K in keyof NetworkClientEvents]?: NetworkClientEvents[K][]
}

export class NetworkClient {
  private workerUrl: string
  private ws: WebSocket | null = null
  private status: NetworkClientStatus = 'disconnected'
  private listeners: Listeners = {}
  private connectArgs: ConnectArgs | null = null
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private explicitClose = false

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl.replace(/\/+$/, '')
  }

  static async createPrairie(
    workerUrl: string,
    stewardName: string,
    color: ColorId
  ): Promise<CreatePrairieResponse> {
    const base = workerUrl.replace(/\/+$/, '')
    const res = await fetch(`${base}${PRAIRIE_CREATE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stewardName, color }),
    })
    if (!res.ok) {
      throw new Error(`Create prairie failed (${String(res.status)})`)
    }
    return (await res.json()) as CreatePrairieResponse
  }

  connect(args: ConnectArgs): void {
    this.connectArgs = args
    this.explicitClose = false
    this.attempt = 0
    this.openSocket()
  }

  disconnect(): void {
    this.explicitClose = true
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close(1000)
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  sendPosition(x: number, y: number, facing: Direction): void {
    if (this.status !== 'connected' || !this.ws) return
    const frame: PositionFrame = { type: 'position', x, y, facing }
    this.ws.send(JSON.stringify(frame))
  }

  on<K extends keyof NetworkClientEvents>(
    event: K,
    handler: NetworkClientEvents[K]
  ): void {
    const existing = this.listeners[event]
    const list: NetworkClientEvents[K][] = existing ?? []
    list.push(handler)
    this.listeners[event] = list as Listeners[K]
  }

  off<K extends keyof NetworkClientEvents>(
    event: K,
    handler: NetworkClientEvents[K]
  ): void {
    const list = this.listeners[event]
    if (!list) return
    const idx = list.indexOf(handler)
    if (idx !== -1) list.splice(idx, 1)
  }

  getStatus(): NetworkClientStatus {
    return this.status
  }

  private openSocket(): void {
    const args = this.connectArgs
    if (!args) return
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')

    const wsBase =
      this.workerUrl === ''
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
        : this.workerUrl.replace(/^http/, 'ws')
    const wsUrl = `${wsBase}${prairieConnectPath(args.prairieId)}`
    const ws = new WebSocket(wsUrl)
    this.ws = ws

    ws.addEventListener('open', () => {
      const hello: HelloFrame = {
        type: 'hello',
        stewardName: args.stewardName,
        color: args.color,
        ownerToken: args.ownerToken,
      }
      ws.send(JSON.stringify(hello))
    })

    ws.addEventListener('message', (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return
      let msg: ServerMessage
      try {
        msg = JSON.parse(ev.data) as ServerMessage
      } catch {
        return
      }
      this.handleMessage(msg)
    })

    ws.addEventListener('close', (ev: CloseEvent) => {
      this.ws = null
      if (this.explicitClose) {
        this.setStatus('disconnected')
        return
      }
      // 4xxx codes are application-level rejections; do not retry.
      if (ev.code >= 4000 && ev.code < 5000) {
        this.emit('error', { type: 'error', code: String(ev.code), message: ev.reason })
        this.setStatus('disconnected')
        return
      }
      this.scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      // The 'close' handler will follow and own the retry/disconnect decision.
    })
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.type === 'welcome') {
      this.attempt = 0
      this.setStatus('connected')
      this.emit('welcome', msg)
      return
    }
    if (msg.type === 'peer-joined') {
      this.emit('peer-joined', msg)
      return
    }
    if (msg.type === 'peer-position') {
      this.emit('peer-position', msg)
      return
    }
    if (msg.type === 'peer-left') {
      this.emit('peer-left', msg)
      return
    }
    if (msg.type === 'error') {
      this.emit('error', msg)
    }
  }

  private scheduleReconnect(): void {
    if (this.attempt >= MAX_ATTEMPTS) {
      this.setStatus('disconnected')
      return
    }
    const idx = Math.min(this.attempt, BACKOFF_DELAYS_MS.length - 1)
    const delay = BACKOFF_DELAYS_MS[idx]
    this.attempt++
    this.setStatus('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }

  private setStatus(next: NetworkClientStatus): void {
    if (this.status === next) return
    this.status = next
    this.emit('status-change', next)
  }

  private emit<K extends keyof NetworkClientEvents>(
    event: K,
    ...args: Parameters<NetworkClientEvents[K]>
  ): void {
    const list = this.listeners[event]
    if (!list) return
    for (const handler of list) {
      // Each handler is callable with the parameters of its event signature.
      ;(handler as (...a: Parameters<NetworkClientEvents[K]>) => void)(...args)
    }
  }
}
