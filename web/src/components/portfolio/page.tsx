import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import { getManagerDusdcBalance } from "@/lib/portfolio/helpers"
import type { OracleInfo, VaultSummary } from "@/lib/types/predict"
import { coinBalanceToAmount } from "@/lib/portfolio/helpers"
import { usePortfolio } from "@/lib/portfolio/hooks"
import { AccountCard } from "./account-card"
import { ConnectPortfolioCard } from "./connect-card"
import { PortfolioChartCard } from "./chart-card"
import { PositionsLedger } from "./positions-ledger"
import { TradingAccountDialog } from "./trading-account-dialog"

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
    createManagerError,
    depositAmount,
    depositError,
    depositStatusMessage,
    filteredPositions,
    isCreatingManager,
    isDepositing,
    isLoadingAccount,
    isWithdrawing,
    managerId,
    managerSummary,
    portfolioState,
    redeemState,
    searchQuery,
    summary,
    tradingAccountModalMode,
    walletAddress,
    withdrawAmount,
    withdrawError,
    withdrawStatusMessage,
    setActiveTab,
    setDepositAmount,
    setSearchQuery,
    setWithdrawAmount,
    setTradingAccountModalMode,
    resetTradingAccountState,
    handleCreateTradingAccount,
    handleDepositToTradingAccount,
    handleWithdrawFromTradingAccount,
    handleRedeemPosition,
  } = usePortfolio(oracles, vaultSummary)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        {!walletAddress ? (
          <ConnectPortfolioCard onConnect={() => setShowAuthFlow(true)} />
        ) : (
          <>
            <section className="grid gap-3 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
              <AccountCard
                summary={summary}
                deployedDusdc={coinBalanceToAmount(
                  getManagerDusdcBalance(managerSummary)
                )}
                onOpenDeposit={() => {
                  resetTradingAccountState()
                  setTradingAccountModalMode("deposit")
                }}
                onOpenWithdraw={() => {
                  resetTradingAccountState()
                  setTradingAccountModalMode("withdraw")
                }}
              />
              <TradingAccountDialog
                createManagerError={createManagerError}
                depositAmount={depositAmount}
                depositError={depositError}
                depositStatusMessage={depositStatusMessage}
                dusdcBalance={portfolioState.dusdcBalance}
                isCreatingManager={isCreatingManager}
                isDepositing={isDepositing}
                isLoadingAccount={isLoadingAccount}
                isWithdrawing={isWithdrawing}
                managerId={managerId}
                managerSummary={managerSummary}
                mode={tradingAccountModalMode}
                summary={summary}
                withdrawAmount={withdrawAmount}
                withdrawError={withdrawError}
                withdrawStatusMessage={withdrawStatusMessage}
                walletAddress={walletAddress}
                onCreateManager={handleCreateTradingAccount}
                onDepositAmountChange={setDepositAmount}
                onDepositMax={() =>
                  setDepositAmount(
                    formatDecimalUnits(
                      portfolioState.dusdcBalance,
                      PREDICT_QUOTE_DECIMALS
                    )
                  )
                }
                onDepositSubmit={handleDepositToTradingAccount}
                onOpenChange={(open) => {
                  if (!open) {
                    setTradingAccountModalMode(null)
                    resetTradingAccountState()
                  }
                }}
                onWithdrawAmountChange={setWithdrawAmount}
                onWithdrawMax={() =>
                  setWithdrawAmount(
                    formatDecimalUnits(
                      getManagerDusdcBalance(managerSummary),
                      PREDICT_QUOTE_DECIMALS
                    )
                  )
                }
                onWithdrawSubmit={handleWithdrawFromTradingAccount}
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
