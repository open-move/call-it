import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "../ui/button"
import { PanelRow } from "../primitives/panel-row"
import { cn } from "@/lib/utils"
import type { VaultSummary } from "@/lib/types/predict"
import type { EarnAction } from "@/lib/earn/quote"
import {
  formatTokenAmount,
  formatSharePrice,
  formatQuoteAmount,
} from "@/lib/earn/format"

export function EarnActionDialog({
  action,
  actionBalanceLabel,
  actionBalanceValue,
  amount,
  buttonDisabled,
  buttonLabel,
  estimatedOutput,
  invalidReason,
  message,
  messageTone,
  onAmountChange,
  onMaxAmount,
  onOpenChange,
  onSubmit,
  open,
  summary,
}: {
  action: EarnAction
  actionBalanceLabel?: string
  actionBalanceValue?: string
  amount: string
  buttonDisabled: boolean
  buttonLabel: string
  estimatedOutput?: number
  invalidReason?: string
  message?: string
  messageTone: "error" | "muted"
  onAmountChange: (amount: string) => void
  onMaxAmount?: () => void
  onOpenChange?: (open: boolean) => void
  onSubmit: () => void
  open: boolean
  summary: VaultSummary
}) {
  return (
    <Dialog onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)} open={open}>
      <DialogContent className="gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            {action === "supply" ? "Deposit DUSDC" : "Withdraw PLP"}
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
              <span>{action === "supply" ? "DUSDC" : "PLP"}</span>
            </div>
          </div>
        </label>

        <div className="space-y-2.5 rounded-md border border-border/35 bg-muted/25 px-3 py-3">
          {actionBalanceLabel && actionBalanceValue && (
            <PanelRow label={actionBalanceLabel} value={actionBalanceValue} />
          )}
          <PanelRow
            label="Est. receive"
            value={
              estimatedOutput === undefined
                ? "--"
                : formatTokenAmount(
                    estimatedOutput,
                    action === "supply" ? "PLP" : "DUSDC",
                    6
                  )
            }
          />
          <PanelRow
            label="PLP price"
            value={`${formatSharePrice(summary.plp_share_price)} DUSDC`}
          />
          {action === "withdraw" && (
            <PanelRow
              label="Vault withdrawable"
              value={formatQuoteAmount(summary.available_withdrawal)}
            />
          )}
        </div>

        {message && (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-xs leading-5",
              messageTone === "error"
                ? "border border-destructive/25 bg-destructive/10 text-destructive"
                : "bg-muted/15 text-muted-foreground"
            )}
          >
            {message}
          </p>
        )}

        {!message && invalidReason && (
          <p className="rounded-md bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {invalidReason}
          </p>
        )}

        <DialogFooter>
          <Button
            className="w-full active:scale-[0.98]"
            disabled={buttonDisabled}
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
