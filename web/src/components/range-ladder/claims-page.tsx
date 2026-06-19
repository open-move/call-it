import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Layers3Icon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

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
import type { RangeLadderPolicyRow } from "@/services/range-ladder-client"
import { getRangeLadderPolicies } from "@/services/range-ladder-client"
import { prepareRangeLadderClaimTransaction } from "@/services/range-ladder-transactions"

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

function getPolicyStatus(
  policy: RangeLadderPolicyRow,
  oracleStates: Record<string, OracleStateResponse | undefined>
): ClaimsTab {
  return getOwnedTicketClaimStatus(
    policy.oracleId ? oracleStates[policy.oracleId]?.oracle.status : undefined
  )
}

function getPolicyOracleLabel(
  policy: RangeLadderPolicyRow,
  oracleStates: Record<string, OracleStateResponse | undefined>
) {
  if (!policy.oracleId) {
    return "Range Ladder"
  }

  const state = oracleStates[policy.oracleId]

  if (!state) {
    return `${policy.oracleId.slice(0, 8)}...${policy.oracleId.slice(-6)}`
  }

  return state.oracle.underlying_asset
}

function getPolicyExpiry(policy: RangeLadderPolicyRow) {
  return policy.positions[0]?.expiryMs
}

function getPolicyBands(policy: RangeLadderPolicyRow) {
  return policy.positions
    .map(
      (position) =>
        `${formatUsd(position.lowerStrikeUsd, 0)}-${formatUsd(position.higherStrikeUsd, 0)}`
    )
    .join(", ")
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
  const [policies, setPolicies] = useState<RangeLadderPolicyRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedTab, setSelectedTab] = useState<ClaimsTab>("claimable")

  const grouped = useMemo(
    () => ({
      active: policies.filter(
        (policy) => getPolicyStatus(policy, oracleStates) === "active"
      ),
      claimable: policies.filter(
        (policy) => getPolicyStatus(policy, oracleStates) === "claimable"
      ),
    }),
    [oracleStates, policies]
  )

  useEffect(() => {
    let isStale = false

    async function loadPolicies() {
      if (!walletAddress) {
        setErrorMessage(undefined)
        setPolicies([])
        return
      }

      setErrorMessage(undefined)
      setIsLoading(true)

      try {
        const nextPolicies = await getRangeLadderPolicies(walletAddress)

        if (!isStale) {
          setPolicies(nextPolicies)
        }
      } catch (error) {
        if (!isStale) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load Range Ladder claims"
          )
        }
      } finally {
        if (!isStale) {
          setIsLoading(false)
        }
      }
    }

    void loadPolicies()

    return () => {
      isStale = true
    }
  }, [refreshKey, walletAddress])

  useEffect(() => {
    let isStale = false

    async function loadOracleStates() {
      const oracleIds = Array.from(
        new Set(
          policies.flatMap((policy) =>
            policy.oracleId ? [policy.oracleId] : []
          )
        )
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
  }, [policies])

  async function handleClaim(policy: RangeLadderPolicyRow) {
    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    if (!policy.oracleId) {
      setErrorMessage("Range Ladder policy has no stored oracle id")
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setErrorMessage(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    setClaimingPolicyId(policy.policyId)
    setErrorMessage(undefined)

    try {
      await executeSuiTransaction(
        signer,
        await prepareRangeLadderClaimTransaction({
          managerId: policy.managerId,
          oracleId: policy.oracleId,
          policyId: policy.policyId,
          walletAddress,
        })
      )
      setRefreshKey((currentKey) => currentKey + 1)
      refreshRoute()
      window.setTimeout(() => refreshRoute(), 1_500)
    } catch (error) {
      setErrorMessage(
        formatPredictTradeError(error, "Claim Range Ladder failed")
      )
    } finally {
      setClaimingPolicyId(undefined)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
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
          <div className="hidden grid-cols-[minmax(12rem,1.3fr)_5rem_minmax(10rem,1fr)_7rem_7rem] gap-4 border-b border-border/40 bg-muted/35 px-4 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase md:grid">
            <span>Policy</span>
            <span>Rungs</span>
            <span>Bands</span>
            <span>Cost</span>
            <span className="text-right">Action</span>
          </div>

          {!walletAddress ? (
            <EmptyState message="Sign in to view Range Ladder claims." />
          ) : isLoading ? (
            <EmptyState message="Loading Range Ladder claims." />
          ) : grouped[selectedTab].length === 0 ? (
            <EmptyState
              message={`No ${getTabLabel(selectedTab).toLowerCase()} Range Ladder policies.`}
            />
          ) : (
            <div className="divide-y divide-border/35">
              {grouped[selectedTab].map((policy) => {
                const expiryMs = getPolicyExpiry(policy)
                const isClaiming = claimingPolicyId === policy.policyId
                const oracleLabel = getPolicyOracleLabel(policy, oracleStates)
                const status = getPolicyStatus(policy, oracleStates)

                return (
                  <div
                    className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(12rem,1.3fr)_5rem_minmax(10rem,1fr)_7rem_7rem] md:items-center md:gap-4"
                    key={policy.policyId}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                        <Layers3Icon className="size-3.5 shrink-0 text-primary" />
                        <span className="truncate">{oracleLabel} Ladder</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Opened {formatRelativeTime(policy.createdAtMs)}
                        {expiryMs
                          ? ` · Expires ${formatExpiryDistance(expiryMs)}`
                          : ""}
                      </div>
                    </div>

                    <div className="font-mono text-xs text-foreground">
                      {policy.positions.length}
                    </div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {getPolicyBands(policy) || "--"}
                    </div>
                    <div className="font-mono text-xs text-foreground">
                      {formatDusdc(policy.totalCost)}
                    </div>
                    <div className="flex justify-end">
                      {status === "claimable" ? (
                        <Button
                          className="h-7 px-2.5 text-[11px]"
                          disabled={isClaiming || !policy.oracleId}
                          onClick={() => void handleClaim(policy)}
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
            Claim consumes the owned RangeLadderPolicy and redeems every stored
            RangePosition.
          </div>

          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-200/90">
            Every stored RangePosition must still match the manager&apos;s range
            position at claim time. Manual same-range trades can block claim.
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
