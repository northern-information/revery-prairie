// Wire protocol shared between the React client and the Cloudflare Worker.
// Both packages import from `@revery-prairie/shared` — there is no duplicated copy.

export type Direction = 'up' | 'down' | 'left' | 'right'

export const PLAYER_COLORS = {
  amber: { id: 'amber', label: 'amber', hex: '#ffb000' },
  coral: { id: 'coral', label: 'coral', hex: '#ff5440' },
  violet: { id: 'violet', label: 'violet', hex: '#c060ff' },
  cyan: { id: 'cyan', label: 'cyan', hex: '#00d0ff' },
  mint: { id: 'mint', label: 'mint', hex: '#50ff90' },
  crimson: { id: 'crimson', label: 'crimson', hex: '#d01838' },
  indigo: { id: 'indigo', label: 'indigo', hex: '#3050d0' },
  ivory: { id: 'ivory', label: 'ivory', hex: '#f5f5f5' },
} as const satisfies Record<string, { id: string; label: string; hex: string }>

export type ColorId = keyof typeof PLAYER_COLORS

export const isColorId = (value: unknown): value is ColorId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLAYER_COLORS, value)

// HTTP
export interface CreatePrairieRequest {
  stewardName: string
  color: ColorId
}

export interface CreatePrairieResponse {
  prairieId: string
  ownerToken: string
}

// WebSocket frames

export interface RemotePlayerWire {
  sessionId: string
  stewardName: string
  color: ColorId
  x: number
  y: number
  facing: Direction
}

export interface WorldSnapshot {
  genesisSeed: string
}

export interface HelloFrame {
  type: 'hello'
  stewardName: string
  color: ColorId
  ownerToken?: string
}

export interface PositionFrame {
  type: 'position'
  x: number
  y: number
  facing: Direction
}

export interface WelcomeFrame {
  type: 'welcome'
  sessionId: string
  isOwner: boolean
  world: WorldSnapshot
  peers: RemotePlayerWire[]
}

export interface PeerJoinedFrame {
  type: 'peer-joined'
  sessionId: string
  stewardName: string
  color: ColorId
  x: number
  y: number
  facing: Direction
}

export interface PeerPositionFrame {
  type: 'peer-position'
  sessionId: string
  x: number
  y: number
  facing: Direction
}

export interface PeerLeftFrame {
  type: 'peer-left'
  sessionId: string
}

export interface ErrorFrame {
  type: 'error'
  code: string
  message: string
}

export type ClientMessage = HelloFrame | PositionFrame
export type ServerMessage =
  | WelcomeFrame
  | PeerJoinedFrame
  | PeerPositionFrame
  | PeerLeftFrame
  | ErrorFrame

// WebSocket close codes (4xxx range is application-defined per RFC 6455)
export const WS_CLOSE_CODES = {
  malformedHello: 4001,
  invalidColor: 4002,
  prairieNotFound: 4003,
  serverError: 4500,
} as const

// HTTP and WS paths
export const PRAIRIE_CREATE_PATH = '/api/prairies'
export const prairieConnectPath = (prairieId: string): string =>
  `/api/prairies/${encodeURIComponent(prairieId)}/connect`

// Player spawn defaults — used when a session has no prior position
export const SPAWN_DEFAULT = { x: 0, y: 0, facing: 'down' as Direction } as const
