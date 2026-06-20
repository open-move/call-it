import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEarnAction } from "@/lib/earn/hooks"
import type { EarnAction } from "@/lib/earn/quote"
import type { VaultSummary } from "@/lib/types/predict"
import { PanelRow } from "../primitives/panel-row"
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
  const estimatedOutput = undefined

  return (
    <LiquidityPanelFrame
      action={action}
      amount={amount}
      buttonDisabled
      buttonLabel={action === "supply" ? "Deposit DUSDC" : "Withdraw PLP"}
      estimatedOutput={estimatedOutput}
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
      onDialogOpenChange={handleDialogOpenChange}
      onMaxAmount={isConnected ? handleMaxAmount : undefined}
      onOpenAction={openActionDialog}
      onSubmit={handleSubmit}
      summary={summary}
      walletAddress={walletAddress}
      walletBlock={
        walletAddress && (
          <div className="space-y-3 pt-1">
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                PLP value
              </div>
              <div className="mt-1 font-mono text-xl leading-tight font-medium tracking-tight text-foreground tabular-nums">
                {plpValueLabel}
              </div>
            </div>
            <div className="space-y-2 rounded-md border border-border/35 bg-muted/25 p-2.5">
              <PanelRow label="DUSDC balance" value={dusdcBalanceValue} />
              <PanelRow label="PLP balance" value={plpBalanceValue} />
            </div>
          </div>
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
      <Card className="h-full gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0 xl:row-span-2">
        <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
          <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            Your Position
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 px-4 pt-2 pb-4">
          {walletAddress ? (
            walletBlock
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm">
              <p className="text-center text-xs text-muted-foreground">
                Connect wallet to view your position.
              </p>
            </div>
          )}

          {walletAddress && (
            <div className="mt-auto">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="active:scale-[0.98]"
                  onClick={() => selectAction("supply")}
                  type="button"
                >
                  Deposit DUSDC
                </Button>
                <Button
                  className="active:scale-[0.98]"
                  onClick={() => selectAction("withdraw")}
                  type="button"
                  variant="outline"
                >
                  Withdraw
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
