import type { RangeLadderProduct } from "@/lib/types/range-ladder"
import type {
  RangeLadderPositionRow,
  RangeLadderStrategyState,
  RangeLadderWalletState,
} from "@/services/range-ladder-client"

export type RangeLadderAction = "deposit" | "withdraw"
export type RoundStepId = "deposit" | "start" | "settle" | "roll"

export const roundSteps = [
  { id: "deposit", label: "Deposit" },
  { id: "start", label: "Start" },
  { id: "settle", label: "Settle" },
  { id: "roll", label: "Roll" },
] satisfies { id: RoundStepId; label: string }[]

export function getVaultStatus(strategy?: RangeLadderStrategyState) {
  if (!strategy) {
    return "Loading"
  }

  if (strategy.paused) {
    return "Paused"
  }

  if (strategy.activeRound) {
    return "Round active"
  }

  return "Between rounds"
}

export function getWithdrawQuote(
  amount: bigint | null,
  strategy?: RangeLadderStrategyState
) {
  if (!amount || !strategy || strategy.shareSupply === 0n) {
    return undefined
  }

  return (amount * strategy.nav) / strategy.shareSupply
}

export function getDepositQuote(amount: bigint | null, strategy?: RangeLadderStrategyState) {
  if (!amount || !strategy) {
    return undefined
  }

  if (strategy.shareSupply === 0n || strategy.nav === 0n) {
    return amount
  }

  return (amount * strategy.shareSupply) / strategy.nav
}

export function getUserValue(
  wallet?: RangeLadderWalletState,
  strategy?: RangeLadderStrategyState
) {
  return getWithdrawQuote(wallet?.rangeShareBalance ?? null, strategy) ?? 0n
}

export function getRoundStage(strategy?: RangeLadderStrategyState): RoundStepId {
  return strategy?.activeRound ? "start" : "deposit"
}

export function getRoundStateCopy(strategy?: RangeLadderStrategyState) {
  if (!strategy) {
    return "Loading Range Ladder round state."
  }

  if (strategy.paused) {
    return "Strategy actions are paused while the operator reviews the ladder."
  }

  if (!strategy.activeRound) {
    return "Deposits and withdrawals are open until the operator starts the next ladder."
  }

  return "The strategy holds native Predict ranges. Settlement must land inside a rung for that rung to pay."
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
  strategy: RangeLadderStrategyState | undefined,
  products: RangeLadderProduct[]
) {
  const oracleId = strategy?.activeRound?.oracleId

  if (!oracleId) {
    return undefined
  }

  return products.find((product) => product.market.oracleId === oracleId)
}

export function getNextLadder(products: RangeLadderProduct[]) {
  return products.find((product) => product.market.expiryMs > Date.now())
}

export function getInvalidReason({
  action,
  actionBalance,
  canUseVault,
  isLoadingWallet,
  parsedAmount,
  strategy,
  walletAddress,
}: {
  action: RangeLadderAction
  actionBalance?: bigint
  canUseVault: boolean
  isLoadingWallet: boolean
  parsedAmount: bigint | null
  strategy?: RangeLadderStrategyState
  walletAddress?: string
}) {
  if (!walletAddress) {
    return "Connect wallet to use Range Ladder."
  }

  if (!strategy) {
    return "Range Ladder strategy is still loading."
  }

  if (!canUseVault) {
    return "Deposits and withdrawals are open only between Range Ladder rounds."
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
      : "Withdrawal exceeds cRANGE balance."
  }

  return undefined
}
