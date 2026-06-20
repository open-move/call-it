import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

import { useRangeLadderAction } from "@/lib/range-ladder/hooks"
import type { RangeLadderProduct } from "@/lib/types/range-ladder"
import { ActionDialog } from "./action-dialog"
import { RangeLadderProductHeader } from "./header"
import { PolicyCard } from "./policy-card"
import { PositionPanel } from "./position-panel"
import { RoundProgressCard } from "./round-progress-card"
import { StrategyOverviewCard } from "./strategy-overview-card"

export interface PageProps {
  products: RangeLadderProduct[]
}

export function Page({ products }: PageProps) {
  const { setShowAuthFlow } = useDynamicContext()
  const {
    action,
    amount,
    dialogOpen,
    strategy,
    wallet,
    isLoadingVault,
    isLoadingWallet,
    isSubmitting,
    status,
    activeRoundProduct,
    nextLadder,
    canUseVault,
    actionBalance,
    canSubmit,
    depositQuote,
    withdrawQuote,
    invalidReason,
    message,
    messageTone,
    walletAddress,
    setAction,
    setAmount,
    handleSubmit,
    handleMaxAmount,
    openActionDialog,
    handleDialogOpenChange,
  } = useRangeLadderAction(products)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <RangeLadderProductHeader />

        <div className="mx-auto grid max-w-5xl items-stretch gap-3 lg:grid-cols-2">
          <StrategyOverviewCard
            isLoading={isLoadingVault}
            status={status}
            strategy={strategy}
          />

          <PositionPanel
            onOpenAction={openActionDialog}
            onSignIn={() => setShowAuthFlow(true)}
            strategy={strategy}
            wallet={wallet}
            walletAddress={walletAddress}
          />
        </div>

        <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-2">
          <RoundProgressCard
            nextLadder={nextLadder}
            product={activeRoundProduct}
            status={status}
            strategy={strategy}
          />
          <PolicyCard strategy={strategy} />
        </div>
      </section>

      <ActionDialog
        action={action}
        actionBalance={actionBalance}
        amount={amount}
        buttonDisabled={isSubmitting || (!!walletAddress && !canSubmit)}
        canSubmit={canSubmit}
        depositQuote={depositQuote}
        invalidReason={invalidReason}
        isLoadingWallet={isLoadingWallet}
        isSubmitting={isSubmitting}
        message={message}
        messageTone={messageTone}
        onAmountChange={setAmount}
        onMaxAmount={wallet ? handleMaxAmount : undefined}
        onOpenChange={handleDialogOpenChange}
        onSubmit={handleSubmit}
        open={dialogOpen}
        status={status}
        strategy={strategy}
        withdrawQuote={withdrawQuote}
      />
    </main>
  )
}
