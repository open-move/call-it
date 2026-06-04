export interface OracleInfo {
  predict_id: string
  oracle_id: string
  oracle_cap_id: string
  underlying_asset: string
  expiry: number
  min_strike: number
  tick_size: number
  status: string
  activated_at: number | null
  settlement_price: number | null
  settled_at: number | null
  created_checkpoint: number
}

export interface OraclePriceUpdate {
  event_digest: string
  digest: string
  sender: string
  checkpoint: number
  checkpoint_timestamp_ms: number
  tx_index: number
  event_index: number
  package: string
  oracle_id: string
  spot: number
  forward: number
  onchain_timestamp: number
}

export interface OracleSviUpdate {
  event_digest: string
  digest: string
  sender: string
  checkpoint: number
  checkpoint_timestamp_ms: number
  tx_index: number
  event_index: number
  package: string
  oracle_id: string
  a: number
  b: number
  rho: number
  rho_negative: boolean
  m: number
  m_negative: boolean
  sigma: number
  onchain_timestamp: number
}

export interface OracleStateResponse {
  oracle: OracleInfo
  latest_price: OraclePriceUpdate | null
  latest_svi: OracleSviUpdate | null
  ask_bounds: unknown | null
}

export interface PredictManagerEvent {
  event_digest: string
  digest: string
  sender: string
  checkpoint: number
  checkpoint_timestamp_ms: number
  tx_index: number
  event_index: number
  package: string
  manager_id: string
  owner: string
}

export interface ManagerBalance {
  quote_asset: string
  balance: number
}

export interface ManagerSummaryResponse {
  manager_id: string
  owner: string
  balances: ManagerBalance[]
  trading_balance: number
  open_exposure: number
  redeemable_value: number
  realized_pnl: number
  unrealized_pnl: number
  account_value: number
  open_positions: number
  awaiting_settlement_positions: number
}

export interface ManagerPositionSummaryResponse {
  predict_id: string
  manager_id: string
  quote_asset: string
  oracle_id: string
  underlying_asset: string
  expiry: number
  strike: number
  is_up: boolean
  minted_quantity: number
  redeemed_quantity: number
  open_quantity: number
  total_cost: number
  total_payout: number
  realized_pnl: number
  unrealized_pnl: number
  open_cost_basis: number
  average_entry_price: number
  average_exit_price: number | null
  mark_price: number | null
  mark_value: number | null
  status: string
  first_minted_at: number
  last_activity_at: number
}
