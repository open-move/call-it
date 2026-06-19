import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatDecimalUnits } from "@/lib/amounts"
import {
  RECONNECT_SUI_WALLET_MESSAGE,
  getReadySuiTransactionSigner,
} from "@/lib/dynamic/sui-wallet"
import {
  formatExpiryDistance,
  formatRelativeTime,
  formatUsd,
} from "@/lib/format"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import type { OracleStateResponse } from "@/lib/types/predict"
import { cn } from "@/lib/utils"
import {
  getOwnedTicketClaimStatus,
  type OwnedTicketClaimStatus,
} from "@/services/owned-ticket-bcs"
import { formatPredictTradeError } from "@/services/predict-quotes"
import { getOracleState } from "@/services/predict-client"
import type { ShieldPositionRow } from "@/services/shield-client"
import { getShieldPositions } from "@/services/shield-client"
import { prepareShieldClaimTransaction } from "@/services/shield-transactions"
import { executeSuiTransaction } from "@/services/predict-transactions"

type ClaimsTab = OwnedTicketClaimStatus

function formatDusdc(value: bigint) {
  return `${formatDecimalUnits(value, 6, 4)} DUSDC`
}

function getTabLabel(tab: ClaimsTab) {
  switch (tab) {
    case "active":
      return "Active"
    case "claimable":
      return "Claimable"
  }
}

function getPositionStatus(
  position: ShieldPositionRow,
  oracleStates: Record<string, OracleStateResponse | undefined>
): ClaimsTab {
  const oracleStatus = oracleStates[position.oracleId]?.oracle.status

  return getOwnedTicketClaimStatus(oracleStatus)
}

function getOracleLabel(
  oracleId: string,
  oracleStates: Record<string, OracleStateResponse | undefined>
) {
  const state = oracleStates[oracleId]

  if (!state) {
    return `${oracleId.slice(0, 8)}…${oracleId.slice(-6)}`
  }

  return state.oracle.underlying_asset
}

export function Page() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const walletAddress = primaryWallet?.address
  const refreshRoute = useAppRouteRefresh()
  const [positions, setPositions] = useState<ShieldPositionRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedTab, setSelectedTab] = useState<ClaimsTab>("claimable")
  const [claimingPolicyId, setClaimingPolicyId] = useState<string>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [oracleStates, setOracleStates] = useState<
    Record<string, OracleStateResponse | undefined>
  >({})

  const grouped = useMemo(() => {
    return {
      claimable: positions.filter(
        (position) => getPositionStatus(position, oracleStates) === "claimable"
      ),
      active: positions.filter(
        (position) => getPositionStatus(position, oracleStates) === "active"
      ),
    }
  }, [oracleStates, positions])

  useEffect(() => {
    let isStale = false

    async function loadPositions() {
      if (!walletAddress) {
        setPositions([])
        setErrorMessage(undefined)
        return
      }

      setIsLoading(true)
      setErrorMessage(undefined)

      try {
        const nextPositions = await getShieldPositions(walletAddress)

        if (!isStale) {
          setPositions(nextPositions)
        }
      } catch (error) {
        if (!isStale) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load Shield claims"
          )
        }
      } finally {
        if (!isStale) {
          setIsLoading(false)
        }
      }
    }

    void loadPositions()

    return () => {
      isStale = true
    }
  }, [refreshKey, walletAddress])

  useEffect(() => {
    let isStale = false

    async function loadOracleStates() {
      const oracleIds = Array.from(
        new Set(positions.map((position) => position.oracleId))
      )

      if (oracleIds.length === 0) {
        setOracleStates({})
        return
      }

      const results = await Promise.allSettled(
        oracleIds.map(async (oracleId) => ({
          oracleId,
          state: await getOracleState(oracleId),
        }))
      )

      if (isStale) {
        return
      }

      const nextStates: Record<string, OracleStateResponse | undefined> = {}

      for (const result of results) {
        if (result.status === "fulfilled") {
          nextStates[result.value.oracleId] = result.value.state
        }
      }

      setOracleStates(nextStates)
    }

    void loadOracleStates()

    return () => {
      isStale = true
    }
  }, [positions])

  async function handleClaim(position: ShieldPositionRow) {
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

    setClaimingPolicyId(position.policyId)
    setErrorMessage(undefined)

    try {
      await executeSuiTransaction(
        signer,
        await prepareShieldClaimTransaction({
          managerId: position.managerId,
          oracleId: position.oracleId,
          policyId: position.policyId,
          walletAddress,
        })
      )
      setRefreshKey((currentKey) => currentKey + 1)
      refreshRoute()
      window.setTimeout(() => refreshRoute(), 1_500)
    } catch (error) {
      setErrorMessage(formatPredictTradeError(error, "Claim Shield failed"))
    } finally {
      setClaimingPolicyId(undefined)
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["claimable", "active"] as ClaimsTab[]).map((tab) => (
            <Button
              className={cn(
                selectedTab === tab
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              )}
              key={tab}
              onClick={() => setSelectedTab(tab)}
              size="sm"
              type="button"
              variant="outline"
            >
              {getTabLabel(tab)} ({grouped[tab].length})
            </Button>
          ))}
        </div>

        {errorMessage ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-2 text-xs leading-5 text-muted-foreground md:grid-cols-2">
          <div className="rounded-md border border-border/50 bg-card/60 px-3 py-2">
            Claim consumes the owned Shield policy and transfers the returned
            DUSDC payout to your wallet.
          </div>
          <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-amber-200/90">
            Avoid manual trades on the same manager key while a Shield is
            active; changing the reserved DOWN position can block claim.
          </div>
        </div>

        {!walletAddress ? (
          <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-12 text-center text-sm text-muted-foreground">
            Sign in to view Shield claims.
          </div>
        ) : isLoading ? (
          <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-12 text-center text-sm text-muted-foreground">
            Loading Shield claims.
          </div>
        ) : grouped[selectedTab].length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-12 text-center text-sm text-muted-foreground">
            No {getTabLabel(selectedTab).toLowerCase()} Shield policies.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70">
            <div className="hidden grid-cols-[minmax(12rem,1.4fr)_8rem_8rem_8rem_7rem] gap-4 border-b border-border/40 bg-muted/35 px-4 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase md:grid">
              <span>Policy</span>
              <span>PLP</span>
              <span>Trigger</span>
              <span>Expiry</span>
              <span className="text-right">Action</span>
            </div>

            <div className="divide-y divide-border/35">
              {grouped[selectedTab].map((position) => {
                const oracleLabel = getOracleLabel(
                  position.oracleId,
                  oracleStates
                )
                const isClaiming = claimingPolicyId === position.policyId
                const status = getPositionStatus(position, oracleStates)

                return (
                  <div
                    className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(12rem,1.4fr)_8rem_8rem_8rem_7rem] md:items-center md:gap-4"
                    key={position.policyId}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {oracleLabel} Shield
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Below {formatUsd(position.hedgeStrikeUsd, 0)} · Opened{" "}
                        {formatRelativeTime(position.createdAtMs)}
                      </div>
                    </div>

                    <div className="font-mono text-xs text-foreground">
                      {formatDusdc(position.plpAmount)}
                    </div>
                    <div className="font-mono text-xs text-outcome-down">
                      Below {formatUsd(position.hedgeStrikeUsd, 0)}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {formatExpiryDistance(position.hedgeExpiryMs)}
                    </div>
                    <div className="flex justify-end">
                      {status === "claimable" ? (
                        <Button
                          className="h-7 px-2.5 text-[11px]"
                          disabled={isClaiming}
                          onClick={() => void handleClaim(position)}
                          type="button"
                          variant="secondary"
                        >
                          {isClaiming ? "Claiming" : "Claim"}
                        </Button>
                      ) : (
                        <span className="font-mono text-[11px] text-muted-foreground uppercase">
                          {getTabLabel(status)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
