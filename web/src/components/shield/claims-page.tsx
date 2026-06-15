import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useMemo, useState } from "react"

import { ProtectionFamilyHeader } from "@/components/protection/family-header"
import { Button } from "@/components/ui/button"
import { formatDecimalUnits } from "@/lib/amounts"
import { RECONNECT_SUI_WALLET_MESSAGE, getReadySuiTransactionSigner } from "@/lib/dynamic/sui-wallet"
import { formatExpiryDistance, formatRelativeTime, formatUsd } from "@/lib/format"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import type { OracleStateResponse } from "@/lib/types/predict"
import { cn } from "@/lib/utils"
import { formatPredictTradeError } from "@/services/predict-quotes"
import { getOracleState } from "@/services/predict-client"
import type { ShieldPositionRow } from "@/services/shield-client"
import { getShieldPositions } from "@/services/shield-client"
import { buildShieldClaimTransaction } from "@/services/shield-transactions"
import { executeSuiTransaction } from "@/services/predict-transactions"

type ClaimsTab = "active" | "claimable" | "settled"

function formatDusdc(value: bigint) {
  return `${formatDecimalUnits(value, 6, 4)} DUSDC`
}

function getTabLabel(tab: ClaimsTab) {
  switch (tab) {
    case "active":
      return "Active"
    case "claimable":
      return "Claimable"
    case "settled":
      return "Settled"
  }
}

function getPositionStatus(position: ShieldPositionRow): ClaimsTab {
  if (position.settled) {
    return "settled"
  }

  return Date.now() >= position.hedgeExpiryMs ? "claimable" : "active"
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
  const [claimingOwnerCapId, setClaimingOwnerCapId] = useState<string>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [oracleStates, setOracleStates] = useState<
    Record<string, OracleStateResponse | undefined>
  >({})

  const grouped = useMemo(() => {
    return {
      active: positions.filter((position) => getPositionStatus(position) === "active"),
      claimable: positions.filter(
        (position) => getPositionStatus(position) === "claimable"
      ),
      settled: positions.filter((position) => getPositionStatus(position) === "settled"),
    }
  }, [positions])

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
      const oracleIds = Array.from(new Set(positions.map((position) => position.oracleId)))

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

    setClaimingOwnerCapId(position.ownerCapId)
    setErrorMessage(undefined)

    try {
      await executeSuiTransaction(
        signer,
        buildShieldClaimTransaction({
          managerId: position.managerId,
          oracleId: position.oracleId,
          ownerCapId: position.ownerCapId,
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
      setClaimingOwnerCapId(undefined)
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <ProtectionFamilyHeader
          actions={[
            { href: "/shield", label: "All Shield products" },
            { href: "/protection", label: "Back to Protection" },
          ]}
          description="Single claims surface for Shield policies. Review active positions, claim matured policies, and inspect settled history."
          title="Shield Claims"
        />

        <div className="flex flex-wrap items-center gap-2">
          {(["claimable", "active", "settled"] as ClaimsTab[]).map((tab) => (
            <button
              className={cn(
                "inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors",
                selectedTab === tab
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              )}
              key={tab}
              onClick={() => setSelectedTab(tab)}
              type="button"
            >
              {getTabLabel(tab)} ({grouped[tab].length})
            </button>
          ))}
        </div>

        {errorMessage ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

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
            <div className="hidden grid-cols-[minmax(12rem,1.4fr)_8rem_8rem_8rem_7rem] gap-4 border-b border-border/40 bg-muted/35 px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground md:grid">
              <span>Policy</span>
              <span>Deposit</span>
              <span>Trigger</span>
              <span>Expiry</span>
              <span className="text-right">Action</span>
            </div>

            <div className="divide-y divide-border/35">
              {grouped[selectedTab].map((position) => {
                const oracleLabel = getOracleLabel(position.oracleId, oracleStates)
                const isClaiming = claimingOwnerCapId === position.ownerCapId
                const status = getPositionStatus(position)

                return (
                  <div
                    className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(12rem,1.4fr)_8rem_8rem_8rem_7rem] md:items-center md:gap-4"
                    key={position.ownerCapId}
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
                      {formatDusdc(position.depositAmount)}
                    </div>
                    <div className="font-mono text-xs text-outcome-down">
                      Below {formatUsd(position.hedgeStrikeUsd, 0)}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {position.settled
                        ? "Settled"
                        : formatExpiryDistance(position.hedgeExpiryMs)}
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
                        <span className="font-mono text-[11px] uppercase text-muted-foreground">
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
