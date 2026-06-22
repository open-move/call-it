import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { CheckIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { TicketMessage } from "@/components/shared/ticket/ticket"
import { Button } from "@/components/ui/button"
import type { ArenaCall } from "@/lib/arena/types"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import {
  canRedeemPosition,
  getPositionLifecycleActionLabel,
  getPositionRedeemParams,
  loadWalletMarketPositions,
} from "@/lib/market-detail/helpers"
import { loadMarketSnapshot } from "@/lib/market-loaders"
import { usePredictAccount } from "@/lib/providers/predict-account"
import type { MarketSnapshot } from "@/lib/types/market"
import type { PositionRow } from "@/lib/types/trade"
import { executeClaimBond } from "@/services/arena-transactions"
import {
  formatPredictLifecycleError,
  formatPredictTradeError,
} from "@/services/predict-quotes"
import {
  buildPredictRedeemTransaction,
  executeSuiTransaction,
  simulatePredictRedeemTransaction,
} from "@/services/predict-transactions"

const STRIKE_EPSILON = 0.000001

function matchesCallStrike(position: PositionRow, strikeUsd: number) {
  // Both sides of the call live on the same directional strike: backers take one
  // direction, faders take the opposite, so we match on the strike only.
  return (
    position.kind === "directional" &&
    Math.abs(position.strikePriceUsd - strikeUsd) < STRIKE_EPSILON
  )
}

function ClaimBondAction({
  call,
  walletAddress,
}: {
  call: ArenaCall
  walletAddress?: string
}) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const predictAccount = usePredictAccount()
  const refreshRoute = useAppRouteRefresh()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [statusKind, setStatusKind] = useState<"neutral" | "success">("neutral")
  const [errorMessage, setErrorMessage] = useState<string>()

  const isCreator =
    !!walletAddress &&
    !!call.creator &&
    walletAddress.toLowerCase() === call.creator.toLowerCase()

  if (!isCreator) {
    return null
  }

  if (call.status === "bond_claimed") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/35 bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">
        <CheckIcon className="size-3.5 text-outcome-up" />
        <span>Bond claimed</span>
      </div>
    )
  }

  if (call.status !== "settled" || !call.callId || !call.oracleId) {
    return null
  }

  const callId = call.callId
  const oracleId = call.oracleId

  async function handleClaimBond() {
    setStatusMessage(undefined)
    setStatusKind("neutral")
    setErrorMessage(undefined)

    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setErrorMessage(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    setIsSubmitting(true)
    setStatusMessage("Claiming bond")

    try {
      await executeClaimBond({ callId, oracleId, walletAddress }, signer)

      setStatusMessage("Bond claimed")
      setStatusKind("success")
      refreshRoute()
      void predictAccount.refreshAccount()
    } catch (error) {
      setStatusMessage(undefined)
      setStatusKind("neutral")
      setErrorMessage(
        formatPredictTradeError(error, "Claim bond failed")
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border/35 bg-muted/25 p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">Creator bond</div>
        <p className="text-xs text-muted-foreground">
          Settled. Reclaim your bond.
        </p>
      </div>

      {(errorMessage || statusMessage) && (
        <TicketMessage
          kind={
            errorMessage
              ? "error"
              : statusKind === "success"
                ? "success"
                : "neutral"
          }
        >
          {errorMessage ?? statusMessage}
        </TicketMessage>
      )}

      <Button
        className="w-full active:scale-[0.98]"
        disabled={isSubmitting}
        onClick={handleClaimBond}
        size="lg"
        type="button"
      >
        {isSubmitting ? "Claiming" : "Claim bond"}
      </Button>
    </div>
  )
}

interface RedeemableRow {
  managerId: string
  market: MarketSnapshot
  position: PositionRow
}

interface RowActionState {
  errorMessage?: string
  isSubmitting: boolean
  message?: string
  status: "neutral" | "success"
}

const IDLE_ROW_STATE: RowActionState = {
  isSubmitting: false,
  status: "neutral",
}

function ClaimPayoutAction({
  call,
  walletAddress,
}: {
  call: ArenaCall
  walletAddress?: string
}) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const predictAccount = usePredictAccount()
  const refreshRoute = useAppRouteRefresh()
  const managerId = predictAccount.managerId
  const oracleId = call.oracleId
  const strikeUsd = call.strikeUsd

  const [rows, setRows] = useState<RedeemableRow[]>([])
  const [rowStates, setRowStates] = useState<Record<string, RowActionState>>({})
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    let isStale = false

    async function loadRedeemable() {
      if (!walletAddress || !oracleId) {
        setRows([])
        return
      }

      try {
        const market = await loadMarketSnapshot(oracleId)
        const loaded = await loadWalletMarketPositions({ managerId, market })

        if (isStale) {
          return
        }

        const loadedManagerId = loaded.managerId

        if (!loadedManagerId) {
          setRows([])
          return
        }

        const redeemableRows = loaded.positions
          .filter(
            (position) =>
              matchesCallStrike(position, strikeUsd) &&
              canRedeemPosition(position)
          )
          .map((position) => ({
            managerId: loadedManagerId,
            market,
            position,
          }))

        setRows(redeemableRows)
      } catch {
        if (!isStale) {
          setRows([])
        }
      }
    }

    void loadRedeemable()

    return () => {
      isStale = true
    }
  }, [managerId, oracleId, refreshNonce, strikeUsd, walletAddress])

  function updateRowState(positionId: string, next: RowActionState) {
    setRowStates((current) => ({ ...current, [positionId]: next }))
  }

  async function handleClaimPayout(row: RedeemableRow) {
    const positionId = row.position.id

    updateRowState(positionId, {
      ...IDLE_ROW_STATE,
      errorMessage: undefined,
      message: undefined,
    })

    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const params = getPositionRedeemParams({
      market: row.market,
      position: row.position,
      walletAddress,
    })

    if (!params) {
      updateRowState(positionId, {
        ...IDLE_ROW_STATE,
        errorMessage: "This position has no redeemable quantity.",
      })
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      updateRowState(positionId, {
        ...IDLE_ROW_STATE,
        errorMessage: RECONNECT_SUI_WALLET_MESSAGE,
      })
      setShowAuthFlow(true)
      return
    }

    updateRowState(positionId, {
      isSubmitting: true,
      message: "Claiming payout",
      status: "neutral",
    })

    try {
      await simulatePredictRedeemTransaction({
        managerId: row.managerId,
        params,
      })

      const result = await executeSuiTransaction(
        signer,
        buildPredictRedeemTransaction({ managerId: row.managerId, params })
      )

      updateRowState(positionId, {
        isSubmitting: false,
        message: `Payout claimed (${result.events.length} events).`,
        status: "success",
      })
      void predictAccount.refreshAccount()
      refreshRoute()
      setRefreshNonce((current) => current + 1)
    } catch (error) {
      updateRowState(positionId, {
        ...IDLE_ROW_STATE,
        errorMessage: formatPredictLifecycleError(
          error,
          "Claim payout failed."
        ),
      })
    }
  }

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="space-y-3 rounded-md border border-border/35 bg-muted/25 p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">Your payout</div>
        <p className="text-xs text-muted-foreground">
          Settled. Redeem your winning positions.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const rowState = rowStates[row.position.id] ?? IDLE_ROW_STATE
          const actionLabel = getPositionLifecycleActionLabel(row.position)

          return (
            <div className="space-y-2" key={row.position.id}>
              {(rowState.errorMessage || rowState.message) && (
                <TicketMessage
                  kind={
                    rowState.errorMessage
                      ? "error"
                      : rowState.status === "success"
                        ? "success"
                        : "neutral"
                  }
                >
                  {rowState.errorMessage ?? rowState.message}
                </TicketMessage>
              )}
              <Button
                className="w-full active:scale-[0.98]"
                disabled={rowState.isSubmitting}
                onClick={() => handleClaimPayout(row)}
                size="lg"
                type="button"
              >
                {rowState.isSubmitting ? "Claiming" : actionLabel === "Redeem position" ? "Claim payout" : actionLabel}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SettlementActions({ call }: { call: ArenaCall }) {
  const { primaryWallet } = useDynamicContext()
  const walletAddress = primaryWallet?.address

  if (call.status !== "settled" && call.status !== "bond_claimed") {
    return null
  }

  return (
    <div className="space-y-3">
      <ClaimBondAction call={call} walletAddress={walletAddress} />
      <ClaimPayoutAction call={call} walletAddress={walletAddress} />
    </div>
  )
}
