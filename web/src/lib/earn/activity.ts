import { SUI_NETWORK } from "@/lib/config"
import type { LpSupplyEvent, LpWithdrawalEvent } from "@/lib/types/predict"

export type LpActivity =
  | {
      account: string
      amount: number
      id: string
      shares: number
      timestampMs: number
      transactionDigest: string
      type: "Supply"
    }
  | {
      account: string
      amount: number
      id: string
      shares: number
      timestampMs: number
      transactionDigest: string
      type: "Withdraw"
    }

export function getActivity(
  supplies: LpSupplyEvent[],
  withdrawals: LpWithdrawalEvent[]
) {
  const supplyActivity = supplies.map((event) => ({
    account: event.supplier,
    amount: event.amount,
    id: event.event_digest,
    shares: event.shares_minted,
    timestampMs: event.checkpoint_timestamp_ms,
    transactionDigest: event.digest,
    type: "Supply" as const,
  }))
  const withdrawalActivity = withdrawals.map((event) => ({
    account: event.withdrawer,
    amount: event.amount,
    id: event.event_digest,
    shares: event.shares_burned,
    timestampMs: event.checkpoint_timestamp_ms,
    transactionDigest: event.digest,
    type: "Withdraw" as const,
  }))

  return [...supplyActivity, ...withdrawalActivity].sort(
    (first, second) => second.timestampMs - first.timestampMs
  )
}

export function getAccountUrl(account: string) {
  return `https://suiscan.xyz/${SUI_NETWORK}/account/${account}`
}

export function getTransactionUrl(transactionDigest: string) {
  return `https://suiscan.xyz/${SUI_NETWORK}/tx/${transactionDigest}`
}
