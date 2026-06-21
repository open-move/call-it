export type ArenaCallStatus = "active" | "settled" | "bond_claimed"

export type ArenaDirection = "up" | "down"

export type ArenaDataMode = "live" | "mock"

export interface ArenaCall {
  backers: number
  bondPlp: number
  createdAt: string
  creatorAvatarSeed: string
  creatorHandle: string
  creatorName: string
  creatorWinRate: number
  direction: ArenaDirection
  expiryMs: number
  faders: number
  fairUpProbability: number
  id: string
  market: string
  status: ArenaCallStatus
  strikeUsd: number
  winState?: "won" | "lost"
}

export interface ArenaCreator {
  bondPlp: number
  callCount: number
  handle: string
  id: string
  name: string
  settledCount: number
  winCount: number
}

export interface ArenaActivity {
  actor: string
  callLabel: string
  id: string
  kind: "launched" | "backed" | "faded" | "claimed" | "reclaimed"
  timestamp: string
}

export interface ArenaSummary {
  activeCalls: number
  bondedPlp: number
  creatorCount: number
  participantCount: number
}

export interface ArenaPageModel {
  activity: ArenaActivity[]
  calls: ArenaCall[]
  creators: ArenaCreator[]
  dataMode: ArenaDataMode
  summary: ArenaSummary
}
