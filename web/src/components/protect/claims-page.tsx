import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { TrendingDownIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { ProtectionFamilyHeader } from "@/components/protection/family-header"
import { Button } from "@/components/ui/button"
import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
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
import { getOracleState } from "@/services/predict-client"
import { formatPredictTradeError } from "@/services/predict-quotes"
import { executeSuiTransaction } from "@/services/predict-transactions"
import type { ProtectPositionRow } from "@/services/protect-client"
import { getProtectPositions } from "@/services/protect-client"
import { prepareProtectClaimTransaction } from "@/services/protect-transactions"

type ClaimsTab = OwnedTicketClaimStatus

function formatDusdc(value: bigint) {
  return `${formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)} DUSDC`
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
  position: ProtectPositionRow,
  oracleStates: Record<string, OracleStateResponse | undefined>
): ClaimsTab {
  return getOwnedTicketClaimStatus(
    oracleStates[position.oracleId]?.oracle.status
  )
}

function getOracleLabel(
  oracleId: string,
  oracleStates: Record<string, OracleStateResponse | undefined>
) {
  const state = oracleStates[oracleId]

  if (!state) {
    return `${oracleId.slice(0, 8)}...${oracleId.slice(-6)}`
  }

  return state.oracle.underlying_asset
}

export function Page() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const walletAddress = primaryWallet?.address
  const refreshRoute = useAppRouteRefresh()
  const [claimingPolicyId, setClaimingPolicyId] = useState<string>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const [oracleStates, setOracleStates] = useState<
    Record<string, OracleStateResponse | undefined>
  >({})
  const [positions, setPositions] = useState<ProtectPositionRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedTab, setSelectedTab] = useState<ClaimsTab>("claimable")

  const grouped = useMemo(
    () => ({
      active: positions.filter(
        (position) => getPositionStatus(position, oracleStates) === "active"
      ),
      claimable: positions.filter(
        (position) => getPositionStatus(position, oracleStates) === "claimable"
      ),
    }),
    [oracleStates, positions]
  )

  useEffect(() => {
    let isStale = false

    async function loadPositions() {
      if (!walletAddress) {
        setErrorMessage(undefined)
        setPositions([])
        return
      }

      setErrorMessage(undefined)
      setIsLoading(true)

      try {
        const nextPositions = await getProtectPositions(walletAddress)

        if (!isStale) {
          setPositions(nextPositions)
        }
      } catch (error) {
        if (!isStale) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load Protect claims"
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

  async function handleClaim(position: ProtectPositionRow) {
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
        await prepareProtectClaimTransaction({
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
      setErrorMessage(formatPredictTradeError(error, "Claim Protect failed"))
    } finally {
      setClaimingPolicyId(undefined)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <ProtectionFamilyHeader
        actions={[
          { href: "/protect", label: "Protect" },
          { href: "/protection", label: "Back to Protection" },
        ]}
        description="Claims surface for wallet-owned ProtectionPolicy tickets. Active tickets become claimable after Predict settlement."
        title="Protect Claims"
      />

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

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70">
          <div className="hidden grid-cols-[minmax(12rem,1.4fr)_7rem_8rem_8rem_7rem] gap-4 border-b border-border/40 bg-muted/35 px-4 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase md:grid">
            <span>Policy</span>
            <span>Premium</span>
            <span>Trigger</span>
            <span>Expiry</span>
            <span className="text-right">Action</span>
          </div>

          {!walletAddress ? (
            <EmptyState message="Sign in to view Protect claims." />
          ) : isLoading ? (
            <EmptyState message="Loading Protect claims." />
          ) : grouped[selectedTab].length === 0 ? (
            <EmptyState
              message={`No ${getTabLabel(selectedTab).toLowerCase()} Protect policies.`}
            />
          ) : (
            <div className="divide-y divide-border/35">
              {grouped[selectedTab].map((position) => {
                const isClaiming = claimingPolicyId === position.policyId
                const oracleLabel = getOracleLabel(
                  position.oracleId,
                  oracleStates
                )
                const status = getPositionStatus(position, oracleStates)

                return (
                  <div
                    className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(12rem,1.4fr)_7rem_8rem_8rem_7rem] md:items-center md:gap-4"
                    key={position.policyId}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                        <TrendingDownIcon className="size-3.5 shrink-0 text-outcome-down" />
                        <span className="truncate">{oracleLabel} Protect</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Opened {formatRelativeTime(position.createdAtMs)} · Qty{" "}
                        {formatDusdc(position.quantity)}
                      </div>
                    </div>

                    <div className="font-mono text-xs text-foreground">
                      {formatDusdc(position.premiumAmount)}
                    </div>
                    <div className="font-mono text-xs text-outcome-down">
                      Below {formatUsd(position.triggerStrikeUsd, 0)}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {formatExpiryDistance(position.expiryMs)}
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
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4 text-sm leading-6 text-muted-foreground">
            Claim consumes the owned ProtectionPolicy and transfers the DUSDC
            payout to your wallet.
          </div>

          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-200/90">
            Manual trades on the same manager, oracle, expiry, strike, and side
            can change the reserved hedge position and block claim.
          </div>
        </aside>
      </section>
    </main>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-4 py-12 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
