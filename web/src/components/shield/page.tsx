import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

import { useShieldAction } from "@/lib/shield/hooks"
import type { ShieldProduct } from "@/lib/types/shield"
import { ShieldActionDialog } from "./action-dialog"
import { ShieldHero } from "./hero"
import { ShieldPolicyCard } from "./policy-card"
import { ShieldPositionPanel } from "./position-panel"
import { RoundProgressCard } from "./round-progress-card"
import { ShieldOverviewCard } from "./strategy-overview-card"

export interface PageProps {
  products: ShieldProduct[]
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
    roundProduct,
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
  } = useShieldAction(products)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <ShieldHero />

        <div className="mx-auto grid max-w-5xl items-stretch gap-3 lg:grid-cols-2">
          <ShieldPositionPanel
            onOpenAction={openActionDialog}
            onSignIn={() => setShowAuthFlow(true)}
            strategy={strategy}
            wallet={wallet}
            walletAddress={walletAddress}
          />

          <ShieldOverviewCard
            isLoading={isLoadingVault}
            status={status}
            strategy={strategy}
          />
        </div>

        <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-2">
          <RoundProgressCard
            product={roundProduct}
            status={status}
            strategy={strategy}
          />
          <ShieldPolicyCard strategy={strategy} />
        </div>
      </section>

      <ShieldActionDialog
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
