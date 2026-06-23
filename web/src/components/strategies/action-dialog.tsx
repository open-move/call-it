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
import { formatShares, formatUsd, getStrategyStatus, sharePriceFormatter } from "@/lib/strategies/format"
import type { StrategyMeta } from "@/lib/strategies/registry"
import type { StrategyState } from "@/lib/strategies/types"
import type { useStrategyAction } from "@/lib/strategies/use-strategy-action"
import { cn } from "@/lib/utils"

function Message({ children, tone }: { children: string; tone: "error" | "muted" | "alert" }) {
  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-xs leading-5",
        tone === "error"
          ? "border border-destructive/25 bg-destructive/10 text-destructive"
          : tone === "alert"
            ? "border border-warning/25 bg-warning/10 text-warning"
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
  // While a round is live, both sides queue: deposits convert at the next
  // settlement, withdrawals settle at the next round.
  const queued = duringRound
  const token = isDeposit ? "DUSDC" : "Shares"

  // The action keeps its plain name regardless of round state; a live round only
  // changes WHEN it settles, which is surfaced by the preview row and an alert
  // below, not by renaming the action.
  const title = isDeposit ? "Deposit" : "Withdraw"

  const submitLabel = isSubmitting ? "Submitting" : isDeposit ? "Deposit" : "Withdraw"

  // Mid-round: a caution alert flagging that the action is deferred (and how to
  // back out). Shown only while a round is live.
  const queueNotice = isDeposit
    ? "Deposit settles into shares next round. Refundable until then."
    : "Withdrawal settles next round. Cancellable until then."

  const estLabel = isDeposit ? "Est. shares" : "Est. value"

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
                  ? formatUsd(actionBalance, 4)
                  : formatShares(actionBalance)
            }
          />
          <PanelRow
            label={estLabel}
            value={
              isDeposit
                ? depositSharesQuote
                  ? formatShares(depositSharesQuote)
                  : "--"
                : formatUsd(withdrawQuote, 4)
            }
          />
          <PanelRow label="Share price" value={`$${sharePriceFormatter.format(state.sharePrice)}`} />
          <PanelRow label="Status" value={getStrategyStatus(state)} />
          {queued ? (
            <PanelRow label={isDeposit ? "Available" : "Settles"} value="Next round" />
          ) : null}
        </div>

        {message ? (
          <Message tone={messageTone}>{message}</Message>
        ) : queued ? (
          <Message tone="alert">{queueNotice}</Message>
        ) : invalidReason ? (
          <Message tone="muted">{invalidReason}</Message>
        ) : null}

        <DialogFooter>
          <Button
            className="w-full active:scale-[0.98]"
            disabled={isSubmitting || !canSubmit}
            onClick={handleSubmit}
            size="lg"
            type="button"
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
