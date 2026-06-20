import { Button } from "@/components/ui/button"
import { formatDusdc, formatShares } from "@/lib/shield/format"
import { getUserValue } from "@/lib/shield/helpers"
import type { ShieldAction } from "@/lib/shield/helpers"
import type {
  HedgedPlpStrategyState,
  ShieldWalletState,
} from "@/services/shield-client"
import { DataRow } from "@/components/primitives/data-row"

export function ShieldPositionPanel({
  onOpenAction,
  onSignIn,
  strategy,
  wallet,
  walletAddress,
}: {
  onOpenAction: (action: ShieldAction) => void
  onSignIn: () => void
  strategy?: HedgedPlpStrategyState
  wallet?: ShieldWalletState
  walletAddress?: string
}) {
  const value = getUserValue(wallet, strategy)

  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
        Your position
      </h2>

      {walletAddress ? (
        <>
          <div className="mt-4">
            <div className="text-xs text-muted-foreground">Position value</div>
            <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
              {formatDusdc(value)}
            </div>
          </div>

          <div className="mt-5">
            <DataRow
              label="DUSDC balance"
              value={wallet ? formatDusdc(wallet.dusdcBalance, 4) : "—"}
            />
            <DataRow
              label="hPLP balance"
              value={wallet ? formatShares(wallet.hedgedPlpShareBalance) : "—"}
            />
          </div>

          <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
            <Button
              className="active:scale-[0.96]"
              onClick={() => onOpenAction("deposit")}
              type="button"
            >
              Deposit DUSDC
            </Button>
            <Button
              className="active:scale-[0.96]"
              onClick={() => onOpenAction("withdraw")}
              type="button"
              variant="outline"
            >
              Withdraw
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-4 flex flex-1 flex-col">
          <p className="max-w-xs text-xs leading-5 text-pretty text-muted-foreground">
            Connect your wallet to deposit DUSDC and hold hPLP. Loss capped to
            premium — no borrowing, no liquidation.
          </p>
          <div className="mt-auto pt-5">
            <Button
              className="w-full active:scale-[0.96]"
              onClick={onSignIn}
              type="button"
            >
              Connect wallet
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
