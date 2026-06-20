import type { VaultSummary } from "@/lib/types/predict"

export interface WalletBalances {
  dusdc: bigint
  plp: bigint
}

export type EarnAction = "supply" | "withdraw"

export function getEstimatedOutput({
  action,
  amount,
  summary,
}: {
  action: EarnAction
  amount: string
  summary: VaultSummary
}) {
  const numericAmount = Number(amount)
  const isValidAmount = Number.isFinite(numericAmount) && numericAmount > 0

  if (!isValidAmount) {
    return undefined
  }

  if (summary.plp_share_price <= 0) {
    return undefined
  }

  return action === "supply"
    ? numericAmount / summary.plp_share_price
    : numericAmount * summary.plp_share_price
}

export function getEstimatedWithdrawAmount(amount: bigint, summary: VaultSummary) {
  const totalSupply = BigInt(Math.floor(summary.plp_total_supply))
  const vaultValue = BigInt(Math.floor(summary.vault_value))

  if (totalSupply <= 0n || vaultValue <= 0n) {
    return 0n
  }

  return (amount * vaultValue) / totalSupply
}

export function getEarnInvalidReason({
  action,
  balances,
  estimatedWithdrawAmount,
  isLoadingBalances,
  selectedAmount,
  summary,
}: {
  action: EarnAction
  balances?: WalletBalances
  estimatedWithdrawAmount?: bigint
  isLoadingBalances: boolean
  selectedAmount: bigint | null
  summary: VaultSummary
}) {
  if (!selectedAmount) {
    return "Enter an amount"
  }

  if (isLoadingBalances || !balances) {
    return "Loading balances"
  }

  if (action === "supply") {
    if (summary.plp_share_price <= 0) {
      return "PLP share price is unavailable."
    }

    return selectedAmount > balances.dusdc
      ? "Deposit exceeds wallet DUSDC."
      : undefined
  }

  if (selectedAmount > balances.plp) {
    return "Withdrawal exceeds wallet PLP."
  }

  if (estimatedWithdrawAmount === undefined || estimatedWithdrawAmount === 0n) {
    return "Vault withdrawable DUSDC is unavailable."
  }

  return estimatedWithdrawAmount >
    BigInt(Math.floor(summary.available_withdrawal))
    ? "Withdrawal exceeds vault withdrawable DUSDC."
    : undefined
}

export function getMaxWithdrawShares(summary: VaultSummary) {
  const vaultValue = BigInt(Math.floor(summary.vault_value))
  const totalSupply = BigInt(Math.floor(summary.plp_total_supply))

  if (vaultValue <= 0n || totalSupply <= 0n) {
    return 0n
  }

  return (
    (BigInt(Math.floor(summary.available_withdrawal)) * totalSupply) /
    vaultValue
  )
}

export function minBigInt(first: bigint, second: bigint) {
  return first < second ? first : second
}
