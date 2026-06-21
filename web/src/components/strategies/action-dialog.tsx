import { PanelRow } from "@/components/primitives/panel-row"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatDusdc, formatShares, getStrategyStatus, sharePriceFormatter } from "@/lib/strategies/format"
import type { StrategyMeta } from "@/lib/strategies/registry"
import type { StrategyState } from "@/lib/strategies/types"
import type { useStrategyAction } from "@/lib/strategies/use-strategy-action"
import { cn } from "@/lib/utils"

function Message({ children, tone }: { children: string; tone: "error" | "muted" }) {
  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-xs leading-5",
        tone === "error"
          ? "border border-destructive/25 bg-destructive/10 text-destructive"
          : "bg-muted/15 text-muted-foreground"
      )}
    >
      {children}
    </div>
  )
}

export function StrategyActionDialog({
  controller,
  meta,
  state,
}: {
  controller: ReturnType<typeof useStrategyAction>
  meta: StrategyMeta
  state: StrategyState
}) {
  const {
    action,
    actionBalance,
    amount,
    canSubmit,
    depositSharesQuote,
    dialogOpen,
    duringRound,
    handleCancelRequest,
    handleClaim,
    handleDialogOpenChange,
    handleMaxAmount,
    handleSubmit,
    invalidReason,
    isSubmitting,
    message,
    messageTone,
    setAmount,
    withdrawQuote,
  } = controller

  const isDeposit = action === "deposit"
  const token = isDeposit ? "DUSDC" : meta.shareSymbol
  const title = isDeposit ? "Deposit DUSDC" : duringRound ? "Request withdrawal" : `Withdraw ${meta.shareSymbol}`
  const submitLabel = isSubmitting
    ? "Submitting"
    : isDeposit
      ? "Deposit DUSDC"
      : duringRound
        ? "Request withdrawal"
        : "Withdraw"

  return (
    <Dialog onOpenChange={handleDialogOpenChange} open={dialogOpen}>
      <DialogContent className="gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm leading-none font-medium tracking-[-0.01em]">{title}</DialogTitle>
        </DialogHeader>

        <label className="block space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Amount</span>
          <div className="relative">
            <Input
              className="border-border/35 bg-muted/25 pr-28 font-mono text-sm shadow-none ring-0 transition-[background-color,border-color,color] duration-150 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              value={amount}
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2 text-xs text-muted-foreground">
              <Button
                className="px-2 font-mono text-[10px]"
                onClick={handleMaxAmount}
                size="xs"
                type="button"
                variant="ghost"
              >
                MAX
              </Button>
              <span>{token}</span>
            </div>
          </div>
        </label>

        <div className="space-y-2.5 rounded-md border border-border/35 bg-muted/25 px-3 py-3">
          <div className="text-xs font-medium text-muted-foreground">Preview</div>
          <PanelRow
            label="Balance"
            value={
              actionBalance === undefined
                ? "--"
                : isDeposit
                  ? formatDusdc(actionBalance, 4)
                  : formatShares(actionBalance)
            }
          />
          <PanelRow
            label={isDeposit ? `Est. ${meta.shareSymbol}` : "Est. DUSDC"}
            value={
              isDeposit
                ? depositSharesQuote
                  ? formatShares(depositSharesQuote)
                  : "--"
                : formatDusdc(withdrawQuote, 4)
            }
          />
          <PanelRow label={`${meta.shareSymbol} price`} value={`${sharePriceFormatter.format(state.sharePrice)} DUSDC`} />
          <PanelRow label="Status" value={getStrategyStatus(state)} />
          {!isDeposit && duringRound ? <PanelRow label="Settles" value="Next round" /> : null}
        </div>

        {message ? (
          <Message tone={messageTone}>{message}</Message>
        ) : invalidReason ? (
          <Message tone="muted">{invalidReason}</Message>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full active:scale-[0.98]"
            disabled={isSubmitting || !canSubmit}
            onClick={handleSubmit}
            size="lg"
            type="button"
          >
            {submitLabel}
          </Button>

          {!isDeposit ? (
            <div className="flex w-full items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-muted-foreground">Manage a queued withdrawal</span>
              <div className="flex gap-2">
                <Button disabled={isSubmitting} onClick={handleCancelRequest} size="xs" type="button" variant="ghost">
                  Cancel
                </Button>
                <Button disabled={isSubmitting} onClick={handleClaim} size="xs" type="button" variant="outline">
                  Claim
                </Button>
              </div>
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
