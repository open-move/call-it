import type { ShieldProduct } from "@/lib/types/shield"
import type {
  ShieldStrategyState,
  ShieldWalletState,
} from "@/services/shield-client"

export type ShieldAction = "deposit" | "withdraw"
export type RoundStepId = "deposit" | "start" | "settle" | "realize"

export const roundSteps = [
  { id: "deposit", label: "Deposit" },
  { id: "start", label: "Start" },
  { id: "settle", label: "Settle" },
  { id: "realize", label: "Realize" },
] satisfies { id: RoundStepId; label: string }[]

export function getVaultStatus(strategy?: ShieldStrategyState) {
  if (!strategy) {
    return "Loading"
  }

  if (strategy.paused) {
    return "Paused"
  }

  if (strategy.activeRound?.settled) {
    return "Oracle settled"
  }

  if (strategy.activeRound) {
    return "Round active"
  }

  return "Open"
}

export function getWithdrawQuote(amount: bigint | null, strategy?: ShieldStrategyState) {
  if (!amount || !strategy || strategy.shareSupply === 0n) {
    return undefined
  }

  return (amount * strategy.nav) / strategy.shareSupply
}

export function getDepositQuote(amount: bigint | null, strategy?: ShieldStrategyState) {
  if (!amount || !strategy) {
    return undefined
  }

  if (strategy.shareSupply === 0n || strategy.nav === 0n) {
    return amount
  }

  return (amount * strategy.shareSupply) / strategy.nav
}

export function getUserValue(wallet?: ShieldWalletState, strategy?: ShieldStrategyState) {
  return getWithdrawQuote(wallet?.shieldShareBalance ?? null, strategy) ?? 0n
}

export function getRoundStage(strategy?: ShieldStrategyState): RoundStepId {
  if (!strategy?.activeRound) {
    return "deposit"
  }

  return strategy.activeRound.settled ? "settle" : "start"
}

export function getRoundStateCopy(strategy?: ShieldStrategyState) {
  if (!strategy) {
    return "Loading Shield round state."
  }

  if (strategy.paused) {
    return "Strategy actions are paused while the operator reviews the round."
  }

  if (!strategy.activeRound) {
    return "Deposits and withdrawals are open until the next Predict round starts."
  }

  if (strategy.activeRound.settled) {
    return "Oracle settled. The strategy can redeem the hedge, withdraw PLP, and reopen."
  }

  return "Capital is deployed into PLP with a DOWN hedge below spot."
}

export function getStepState(step: RoundStepId, activeStep: RoundStepId) {
  const activeIndex = roundSteps.findIndex(
    (roundStep) => roundStep.id === activeStep
  )
  const stepIndex = roundSteps.findIndex((roundStep) => roundStep.id === step)

  if (stepIndex < activeIndex) {
    return "complete"
  }

  if (stepIndex === activeIndex) {
    return "active"
  }

  return "idle"
}

export function getRoundProduct(
  strategy: ShieldStrategyState | undefined,
  products: ShieldProduct[]
) {
  const oracleId = strategy?.activeRound?.oracleId

  if (!oracleId) {
    return undefined
  }

  return products.find((product) => product.market.oracleId === oracleId)
}

export function getInvalidReason({
  action,
  actionBalance,
  canUseVault,
  isLoadingWallet,
  parsedAmount,
  status,
  strategy,
  walletAddress,
}: {
  action: ShieldAction
  actionBalance?: bigint
  canUseVault: boolean
  isLoadingWallet: boolean
  parsedAmount: bigint | null
  status: string
  strategy?: ShieldStrategyState
  walletAddress?: string
}) {
  if (!walletAddress) {
    return "Connect wallet to use Shield."
  }

  if (!strategy) {
    return "Shield strategy is still loading."
  }

  if (!canUseVault) {
    return status === "Oracle settled"
      ? "This Shield round is settled. New actions require realization."
      : "Deposits and withdrawals are closed while a Shield round is active."
  }

  if (isLoadingWallet) {
    return "Wallet balances are loading."
  }

  if (!parsedAmount) {
    return "Enter a positive amount."
  }

  if (actionBalance !== undefined && parsedAmount > actionBalance) {
    return action === "deposit"
      ? "Deposit exceeds DUSDC balance."
      : "Withdrawal exceeds cSHIELD balance."
  }

  return undefined
}
