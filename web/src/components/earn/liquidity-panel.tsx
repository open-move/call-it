import { useEffect, useState } from "react"

import { DataRow } from "@/components/primitives/data-row"
import { Button } from "@/components/ui/button"
import { useEarnAction } from "@/lib/earn/hooks"
import type { EarnAction } from "@/lib/earn/quote"
import type { VaultSummary } from "@/lib/types/predict"
import { EarnActionDialog } from "./earn-action-dialog"

export function LiquidityPanel({ summary }: { summary: VaultSummary }) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <LiquidityPanelFallback summary={summary} />
  }

  return <LiquidityPanelClient summary={summary} />
}

function LiquidityPanelFallback({ summary }: { summary: VaultSummary }) {
  const [action, setAction] = useState<EarnAction>("supply")
  const [amount, setAmount] = useState("")

  return (
    <LiquidityPanelFrame
      action={action}
      amount={amount}
      buttonDisabled
      buttonLabel={action === "supply" ? "Deposit DUSDC" : "Withdraw PLP"}
      estimatedOutput={undefined}
      message="Connect wallet to view your position."
      messageTone="muted"
      onActionChange={setAction}
      onAmountChange={setAmount}
      onMaxAmount={undefined}
      onSubmit={() => undefined}
      summary={summary}
      walletAddress={undefined}
      walletBlock={undefined}
    />
  )
}

function LiquidityPanelClient({ summary }: { summary: VaultSummary }) {
  const {
    action,
    amount,
    connect,
    dialogOpen,
    isConnected,
    walletAddress,
    buttonDisabled,
    buttonLabel,
    estimatedOutput,
    invalidReason,
    message,
    messageTone,
    dusdcBalanceValue,
    plpBalanceValue,
    plpValueLabel,
    actionBalanceLabel,
    actionBalanceValue,
    handleSubmit,
    handleMaxAmount,
    openActionDialog,
    handleDialogOpenChange,
    setAction,
    setAmount,
  } = useEarnAction(summary)

  return (
    <LiquidityPanelFrame
      action={action}
      actionBalanceLabel={actionBalanceLabel}
      actionBalanceValue={actionBalanceValue}
      amount={amount}
      buttonDisabled={buttonDisabled}
      buttonLabel={buttonLabel}
      dialogOpen={dialogOpen}
      estimatedOutput={estimatedOutput}
      invalidReason={invalidReason}
      message={message}
      messageTone={messageTone}
      onActionChange={setAction}
      onAmountChange={setAmount}
      onConnect={connect}
      onDialogOpenChange={handleDialogOpenChange}
      onMaxAmount={isConnected ? handleMaxAmount : undefined}
      onOpenAction={openActionDialog}
      onSubmit={handleSubmit}
      summary={summary}
      walletAddress={walletAddress}
      walletBlock={
        walletAddress && (
          <>
            <div className="mt-4">
              <div className="text-xs text-muted-foreground">PLP value</div>
              <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
                {plpValueLabel}
              </div>
            </div>
            <div className="mt-5">
              <DataRow label="DUSDC balance" value={dusdcBalanceValue} />
              <DataRow label="PLP balance" value={plpBalanceValue} />
            </div>
          </>
        )
      }
    />
  )
}

function LiquidityPanelFrame({
  action,
  actionBalanceLabel,
  actionBalanceValue,
  amount,
  buttonDisabled,
  buttonLabel,
  dialogOpen = false,
  estimatedOutput,
  invalidReason,
  message,
  messageTone,
  onActionChange,
  onAmountChange,
  onConnect,
  onDialogOpenChange,
  onMaxAmount,
  onOpenAction,
  onSubmit,
  summary,
  walletAddress,
  walletBlock,
}: {
  action: EarnAction
  actionBalanceLabel?: string
  actionBalanceValue?: string
  amount: string
  buttonDisabled: boolean
  buttonLabel: string
  dialogOpen?: boolean
  estimatedOutput?: number
  invalidReason?: string
  message?: string
  messageTone: "error" | "muted"
  onActionChange: (action: EarnAction) => void
  onAmountChange: (amount: string) => void
  onConnect?: () => void
  onDialogOpenChange?: (open: boolean) => void
  onMaxAmount?: () => void
  onOpenAction?: (action: EarnAction) => void
  onSubmit: () => void
  summary: VaultSummary
  walletAddress?: string
  walletBlock?: React.ReactNode
}) {
  function selectAction(nextAction: EarnAction) {
    onActionChange(nextAction)
    onOpenAction?.(nextAction)
  }

  return (
    <>
      <div className="flex h-full flex-col rounded-lg bg-card p-4">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Your position
        </h2>

        {walletAddress ? (
          <>
            {walletBlock}
            <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
              <Button
                className="active:scale-[0.96]"
                onClick={() => selectAction("supply")}
                type="button"
              >
                Deposit DUSDC
              </Button>
              <Button
                className="active:scale-[0.96]"
                onClick={() => selectAction("withdraw")}
                type="button"
                variant="outline"
              >
                Withdraw
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-4 flex flex-1 flex-col">
            <p className="text-xs leading-5 text-pretty text-muted-foreground">
              Connect your wallet to deposit DUSDC and hold PLP shares.
            </p>
            <div className="mt-auto pt-5">
              {onConnect ? (
                <Button className="w-full active:scale-[0.96]" onClick={onConnect} type="button">
                  Connect wallet
                </Button>
              ) : (
                <div aria-hidden="true" className="h-9 w-full animate-pulse rounded-md bg-muted/40" />
              )}
            </div>
          </div>
        )}
      </div>

      <EarnActionDialog
        action={action}
        actionBalanceLabel={actionBalanceLabel}
        actionBalanceValue={actionBalanceValue}
        amount={amount}
        buttonDisabled={buttonDisabled}
        buttonLabel={buttonLabel}
        estimatedOutput={estimatedOutput}
        invalidReason={invalidReason}
        message={message}
        messageTone={messageTone}
        onAmountChange={onAmountChange}
        onMaxAmount={onMaxAmount}
        onOpenChange={onDialogOpenChange}
        onSubmit={onSubmit}
        open={dialogOpen}
        summary={summary}
      />
    </>
  )
}
