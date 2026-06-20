import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import { formatAddress } from "@mysten/sui/utils"
import { formatDusdc } from "@/lib/portfolio/format"
import type { PortfolioSummary } from "@/lib/portfolio/helpers"
import type { ManagerSummary } from "@/lib/types/predict"
import { getManagerDusdcBalance } from "@/lib/portfolio/helpers"

function AccountModalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-mono text-sm text-foreground">{value}</span>
    </div>
  )
}

export function TradingAccountDialog({
  createManagerError,
  depositAmount,
  depositError,
  depositStatusMessage,
  dusdcBalance,
  isCreatingManager,
  isDepositing,
  isLoadingAccount,
  isWithdrawing,
  managerId,
  managerSummary,
  mode,
  summary,
  withdrawAmount,
  withdrawError,
  withdrawStatusMessage,
  walletAddress,
  onCreateManager,
  onDepositAmountChange,
  onDepositMax,
  onDepositSubmit,
  onOpenChange,
  onWithdrawAmountChange,
  onWithdrawMax,
  onWithdrawSubmit,
}: {
  createManagerError?: string
  depositAmount: string
  depositError?: string
  depositStatusMessage?: string
  dusdcBalance: bigint
  isCreatingManager: boolean
  isDepositing: boolean
  isLoadingAccount: boolean
  isWithdrawing: boolean
  managerId?: string
  managerSummary?: ManagerSummary
  mode: "deposit" | "withdraw" | null
  summary: PortfolioSummary
  withdrawAmount: string
  withdrawError?: string
  withdrawStatusMessage?: string
  walletAddress?: string
  onCreateManager: () => Promise<void>
  onDepositAmountChange: (value: string) => void
  onDepositMax: () => void
  onDepositSubmit: () => Promise<void>
  onOpenChange: (open: boolean) => void
  onWithdrawAmountChange: (value: string) => void
  onWithdrawMax: () => void
  onWithdrawSubmit: () => Promise<void>
}) {
  const isOpen = mode !== null
  const isDepositMode = mode === "deposit"
  const title = isDepositMode ? "Deposit DUSDC" : "Withdraw DUSDC"
  const description = isDepositMode
    ? "Move DUSDC from the connected wallet into your portfolio."
    : "Move available DUSDC back to the connected wallet."

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-0 shadow-none ring-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4">
            <AccountModalRow
              label="Connected wallet"
              value={
                walletAddress ? formatAddress(walletAddress) : "Not connected"
              }
            />
            <AccountModalRow
              label="Portfolio"
              value={managerId ? "Initialized" : "Not initialized"}
            />
          </div>

          {!managerId && isLoadingAccount ? (
            <div className="grid gap-3">
              <div className="rounded-lg border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
                Preparing portfolio...
              </div>
            </div>
          ) : !managerId ? (
            <div className="grid gap-3">
              <div className="rounded-lg border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
                Initialize your portfolio to start moving funds in and out.
              </div>
              {createManagerError ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {createManagerError}
                </div>
              ) : null}
            </div>
          ) : isDepositMode ? (
            <div className="grid gap-3">
              <div className="rounded-lg border border-border/60 bg-card/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="text-xs tracking-[0.18em] text-muted-foreground uppercase"
                    htmlFor="deposit-amount"
                  >
                    Deposit Amount
                  </label>
                  <button
                    className="text-xs font-medium text-primary"
                    type="button"
                    onClick={onDepositMax}
                  >
                    MAX
                  </button>
                </div>
                <Input
                  id="deposit-amount"
                  className="mt-2"
                  inputMode="decimal"
                  placeholder="Enter DUSDC amount"
                  value={depositAmount}
                  onChange={(event) =>
                    onDepositAmountChange(event.target.value)
                  }
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Available:{" "}
                    {`${formatDecimalUnits(dusdcBalance, PREDICT_QUOTE_DECIMALS, 4)} DUSDC`}
                  </span>
                  <span>PLP value: {formatDusdc(summary.plpValueUsd)}</span>
                </div>
              </div>

              {depositError ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {depositError}
                </div>
              ) : null}
              {depositStatusMessage ? (
                <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {depositStatusMessage}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-lg border border-border/60 bg-card/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="text-xs tracking-[0.18em] text-muted-foreground uppercase"
                    htmlFor="withdraw-amount"
                  >
                    Withdraw Amount
                  </label>
                  <button
                    className="text-xs font-medium text-primary"
                    type="button"
                    onClick={onWithdrawMax}
                  >
                    MAX
                  </button>
                </div>
                <Input
                  id="withdraw-amount"
                  className="mt-2"
                  inputMode="decimal"
                  placeholder="Enter DUSDC amount"
                  value={withdrawAmount}
                  onChange={(event) =>
                    onWithdrawAmountChange(event.target.value)
                  }
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Available:{" "}
                    {`${formatDecimalUnits(getManagerDusdcBalance(managerSummary), PREDICT_QUOTE_DECIMALS, 4)} DUSDC`}
                  </span>
                  <span>PLP value: {formatDusdc(summary.plpValueUsd)}</span>
                </div>
              </div>

              {withdrawError ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {withdrawError}
                </div>
              ) : null}
              {withdrawStatusMessage ? (
                <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {withdrawStatusMessage}
                </div>
              ) : null}
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
            {managerId
              ? isDepositMode
                ? "Funds move from your wallet into your portfolio."
                : "Funds move from your portfolio back to your wallet."
              : isLoadingAccount
                ? "Checking your connected wallet for portfolio setup."
                : "Initialize portfolio first."}
          </div>
        </div>

        <DialogFooter showCloseButton>
          {!managerId ? (
            <Button
              disabled={isCreatingManager || isLoadingAccount}
              type="button"
              variant="outline"
              onClick={() => {
                void onCreateManager()
              }}
            >
              {isLoadingAccount
                ? "Preparing..."
                : isCreatingManager
                  ? "Initializing..."
                  : "Initialize Portfolio"}
            </Button>
          ) : isDepositMode ? (
            <Button
              disabled={isDepositing}
              type="button"
              variant="outline"
              onClick={() => {
                void onDepositSubmit()
              }}
            >
              {isDepositing ? "Depositing..." : "Confirm Deposit"}
            </Button>
          ) : (
            <Button
              disabled={isWithdrawing}
              type="button"
              variant="outline"
              onClick={() => {
                void onWithdrawSubmit()
              }}
            >
              {isWithdrawing ? "Withdrawing..." : "Confirm Withdrawal"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
