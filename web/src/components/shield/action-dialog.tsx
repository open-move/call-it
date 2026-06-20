import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PanelRow } from "@/components/primitives/panel-row"
import { formatDusdc, formatShares, sharePriceFormatter } from "@/lib/shield/format"
import { cn } from "@/lib/utils"
import type { HedgedPlpStrategyState } from "@/services/shield-client"

function ShieldMessage({
  children,
  tone,
}: {
  children: string
  tone: "error" | "muted"
}) {
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

export function ShieldActionDialog({
  action,
  actionBalance,
  amount,
  buttonDisabled,
  canSubmit,
  depositQuote,
  invalidReason,
  isLoadingWallet,
  isSubmitting,
  message,
  messageTone,
  onAmountChange,
  onMaxAmount,
  onOpenChange,
  onSubmit,
  open,
  status,
  strategy,
  withdrawQuote,
}: {
  action: "deposit" | "withdraw"
  actionBalance?: bigint
  amount: string
  buttonDisabled: boolean
  canSubmit: boolean
  depositQuote?: bigint
  invalidReason?: string
  isLoadingWallet: boolean
  isSubmitting: boolean
  message?: string
  messageTone: "error" | "muted"
  onAmountChange: (amount: string) => void
  onMaxAmount?: () => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
  open: boolean
  status: string
  strategy?: HedgedPlpStrategyState
  withdrawQuote?: bigint
}) {
  const isDeposit = action === "deposit"
  const buttonLabel = isSubmitting
    ? isDeposit
      ? "Depositing"
      : "Withdrawing"
    : isDeposit
      ? "Deposit DUSDC"
      : "Withdraw cSHIELD"

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            {isDeposit ? "Deposit DUSDC" : "Withdraw cSHIELD"}
          </DialogTitle>
        </DialogHeader>

        <label className="block space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Amount
          </span>
          <div className="relative">
            <Input
              className="border-border/35 bg-muted/25 pr-28 font-mono text-sm shadow-none ring-0 transition-[background-color,border-color,color] duration-150 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
              inputMode="decimal"
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
              value={amount}
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2 text-xs text-muted-foreground">
              <Button
                className="px-2 font-mono text-[10px]"
                disabled={!onMaxAmount}
                onClick={onMaxAmount}
                size="xs"
                type="button"
                variant="ghost"
              >
                MAX
              </Button>
              <span>{isDeposit ? "DUSDC" : "cSHIELD"}</span>
            </div>
          </div>
        </label>

        <div className="space-y-2.5 rounded-md border border-border/35 bg-muted/25 px-3 py-3">
          <div className="text-xs font-medium text-muted-foreground">
            Preview
          </div>
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
            label={isDeposit ? "Est. cSHIELD" : "Est. DUSDC"}
            value={
              isDeposit
                ? depositQuote
                  ? formatShares(depositQuote, 6)
                  : "--"
                : withdrawQuote
                  ? formatDusdc(withdrawQuote, 4)
                  : "--"
            }
          />
          <PanelRow
            label="cSHIELD price"
            value={
              strategy
                ? `${sharePriceFormatter.format(strategy.sharePrice)} DUSDC`
                : "--"
            }
          />
          <PanelRow label="Strategy status" value={status} />
          {isDeposit ? (
            <PanelRow
              label="Round access"
              value={status === "Open" ? "Open strategy" : "Next open round"}
            />
          ) : null}
        </div>

        {message ? (
          <ShieldMessage tone={messageTone}>{message}</ShieldMessage>
        ) : null}
        {!message && invalidReason ? (
          <ShieldMessage tone="muted">{invalidReason}</ShieldMessage>
        ) : null}
        {!message && !invalidReason && isLoadingWallet ? (
          <ShieldMessage tone="muted">Loading wallet balances.</ShieldMessage>
        ) : null}

        <DialogFooter>
          <Button
            className="w-full active:scale-[0.98]"
            disabled={buttonDisabled || !canSubmit}
            onClick={onSubmit}
            size="lg"
            type="button"
          >
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
