import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import {
  coinBalanceToAmount,
  getManagerDusdcBalance,
} from "@/lib/portfolio/helpers"
import type { OracleInfo, VaultSummary } from "@/lib/types/predict"
import { usePortfolio } from "@/lib/portfolio/hooks"
import { AccountCard } from "./account-card"
import { ConnectPortfolioCard } from "./connect-card"
import { PortfolioChartCard } from "./chart-card"
import { PositionsLedger } from "./positions-ledger"

export interface PageProps {
  oracles: OracleInfo[]
  vaultSummary: VaultSummary
}

export function Page({ oracles, vaultSummary }: PageProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <ConnectPortfolioCard onConnect={() => undefined} />
      </main>
    )
  }

  return <PageClient oracles={oracles} vaultSummary={vaultSummary} />
}

function PageClient({ oracles, vaultSummary }: PageProps) {
  const { setShowAuthFlow } = useDynamicContext()
  const {
    activeTab,
    claimError,
    filteredPositions,
    handleClaim,
    isClaiming,
    managerSummary,
    portfolioState,
    redeemState,
    searchQuery,
    summary,
    walletAddress,
    setActiveTab,
    setSearchQuery,
    handleRedeemPosition,
  } = usePortfolio(oracles, vaultSummary)

  const claimableDusdc = coinBalanceToAmount(
    getManagerDusdcBalance(managerSummary)
  )

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        {!walletAddress ? (
          <ConnectPortfolioCard onConnect={() => setShowAuthFlow(true)} />
        ) : (
          <>
            <section className="grid gap-3 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
              <AccountCard
                claimableDusdc={claimableDusdc}
                isClaiming={isClaiming}
                onClaim={handleClaim}
                summary={summary}
                walletAddress={walletAddress}
              />

              <PortfolioChartCard
                isLoading={portfolioState.isLoading}
                realizedPnlPoints={portfolioState.realizedPnlPoints}
                summary={summary}
              />
            </section>

            {portfolioState.errorMessage ? (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {portfolioState.errorMessage}
              </div>
            ) : null}
            {redeemState.errorMessage ? (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {redeemState.errorMessage}
              </div>
            ) : null}
            {claimError ? (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {claimError}
              </div>
            ) : null}

            <PositionsLedger
              activeTab={activeTab}
              isLoading={portfolioState.isLoading}
              onRedeemPosition={handleRedeemPosition}
              positions={filteredPositions}
              redeemingPositionId={redeemState.positionId}
              searchQuery={searchQuery}
              totalPositions={portfolioState.positions}
              onSearchChange={setSearchQuery}
              onTabChange={setActiveTab}
            />
          </>
        )}
      </div>
    </main>
  )
}
