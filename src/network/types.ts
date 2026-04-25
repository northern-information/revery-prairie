import type {
  ErrorFrame,
  PeerJoinedFrame,
  PeerLeftFrame,
  PeerPositionFrame,
  WelcomeFrame,
} from '@revery-prairie/shared'

export type NetworkClientStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export interface NetworkClientEvents {
  'status-change': (status: NetworkClientStatus) => void
  welcome: (frame: WelcomeFrame) => void
  'peer-joined': (frame: PeerJoinedFrame) => void
  'peer-position': (frame: PeerPositionFrame) => void
  'peer-left': (frame: PeerLeftFrame) => void
  error: (frame: ErrorFrame) => void
}

export type NetworkClientEventName = keyof NetworkClientEvents
