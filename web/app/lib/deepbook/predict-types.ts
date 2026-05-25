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

export interface DirectionalPositionMintEvent {
  event_digest: string
  digest: string
  sender: string
  checkpoint: number
  checkpoint_timestamp_ms: number
  tx_index: number
  event_index: number
  package: string
  predict_id: string
  manager_id: string
  trader: string
  quote_asset: string
  oracle_id: string
  expiry: number
  strike: number
  is_up: boolean
  quantity: number
  cost: number
  ask_price: number
}

export interface DirectionalPositionRedeemEvent {
  event_digest: string
  digest: string
  sender: string
  checkpoint: number
  checkpoint_timestamp_ms: number
  tx_index: number
  event_index: number
  package: string
  predict_id: string
  manager_id: string
  owner: string
  executor: string
  quote_asset: string
  oracle_id: string
  expiry: number
  strike: number
  is_up: boolean
  quantity: number
  payout: number
  bid_price: number
  is_settled: boolean
}

export interface RangeMintEvent {
  event_digest: string
  digest: string
  sender: string
  checkpoint: number
  checkpoint_timestamp_ms: number
  tx_index: number
  event_index: number
  package: string
  predict_id: string
  manager_id: string
  trader: string
  quote_asset: string
  oracle_id: string
  expiry: number
  lower_strike: number
  higher_strike: number
  quantity: number
  cost: number
  ask_price: number
}

export interface RangeRedeemEvent {
  event_digest: string
  digest: string
  sender: string
  checkpoint: number
  checkpoint_timestamp_ms: number
  tx_index: number
  event_index: number
  package: string
  predict_id: string
  manager_id: string
  trader: string
  quote_asset: string
  oracle_id: string
  expiry: number
  lower_strike: number
  higher_strike: number
  quantity: number
  payout: number
  bid_price: number
  is_settled: boolean
}
