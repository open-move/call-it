import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PanelRow } from "@/components/primitives/panel-row"
import { formatDusdc, formatShares } from "@/lib/shield/format"
import { getUserValue } from "@/lib/shield/helpers"
import type { ShieldAction } from "@/lib/shield/helpers"
import type { HedgedPlpStrategyState, ShieldWalletState } from "@/services/shield-client"

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
  const walletValue = getUserValue(wallet, strategy)

  return (
    <Card className="h-full gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Your Position
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-4 pt-2 pb-4">
        {walletAddress ? (
          <div className="space-y-3 pt-1">
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                Shield value
              </div>
              <div className="mt-1 font-mono text-xl leading-tight font-medium tracking-tight text-foreground tabular-nums">
                {formatDusdc(walletValue)}
              </div>
            </div>
            <div className="space-y-2 rounded-md border border-border/35 bg-muted/25 p-2.5">
              <PanelRow
                label="DUSDC balance"
                value={wallet ? formatDusdc(wallet.dusdcBalance, 4) : "--"}
              />
              <PanelRow
                label="cHPLP balance"
                value={wallet ? formatShares(wallet.hedgedPlpShareBalance) : "--"}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm">
            <p className="text-center text-xs text-muted-foreground">
              Connect wallet to view your Shield position.
            </p>
            <Button className="w-full" onClick={onSignIn} type="button">
              Sign in to manage Shield
            </Button>
          </div>
        )}

        {walletAddress && (
          <div className="mt-auto grid grid-cols-2 gap-2">
            <Button onClick={() => onOpenAction("deposit")} type="button">
              Deposit DUSDC
            </Button>
            <Button
              onClick={() => onOpenAction("withdraw")}
              type="button"
              variant="outline"
            >
              Withdraw
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
