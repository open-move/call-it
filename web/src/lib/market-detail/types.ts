import type { PositionRow, PositionTradeIntent } from "@/lib/types/trade"

export interface PositionLoadState {
  errorMessage?: string
  isLoading: boolean
  managerId?: string
  positions: PositionRow[]
}

export interface PositionPreviewState {
  errorMessage?: string
  isExecuting?: boolean
  isLoading: boolean
  message?: string
  positionId?: string
}

export interface PositionConfirmState {
  position?: PositionRow
}

export interface LoadedPositions {
  managerId?: string
  positions: PositionRow[]
}

export type AddPositionIntent =
  | Omit<Extract<PositionTradeIntent, { kind: "binary" }>, "intentId">
  | Omit<Extract<PositionTradeIntent, { kind: "range" }>, "intentId">

export type ActivityTabValue = "positions" | "trades" | "redemptions"
export type ContractTone = "above" | "below" | "range"

export interface ContractToneInput {
  kind: "directional" | "range"
  side?: "above" | "below"
}

export type TicketMode = "binary" | "range"
export type ContractSide = "above" | "below"

export interface RangeStrikeState {
  higher: number
  lower: number
}
