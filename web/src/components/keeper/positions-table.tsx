import { Badge, BadgeTone } from "@/components/primitives/badge"
import { Card, CardContent } from "@/components/ui/card"
import { PREDICT_PRICE_SCALE } from "@/lib/config"
import { formatCount, formatDusdc, sideLabel, truncateMiddle } from "@/lib/keeper/helpers"
import type { KeeperPosition } from "@/services/keeper-client"

const COLUMNS = "grid-cols-[minmax(9rem,1fr)_7rem_7rem_8rem_8rem_7rem]"

export function isRedeemable(position: KeeperPosition): boolean {
  if (!position.settled || position.settlementPrice === null || Number(position.openQty) <= 0) {
    return false
  }
  const upWins = Number(position.settlementPrice) > Number(position.strike)
  return position.isUp ? upWins : !upWins
}

function formatPrice(scaled: string | null): string {
  if (scaled === null) {
    return "--"
  }
  return formatCount(Math.round(Number(scaled) / PREDICT_PRICE_SCALE))
}

function PositionRow({ position }: { position: KeeperPosition }) {
  const redeemable = isRedeemable(position)
  return (
    <div className={`grid ${COLUMNS} gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0`}>
      <div className="min-w-0">
        <div className="truncate font-mono font-medium text-foreground">
          {sideLabel(position.isUp)} · {formatPrice(position.strike)}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {truncateMiddle(position.oracleId)}
        </div>
      </div>
      <span className="truncate text-right font-mono text-foreground tabular-nums">
        {formatDusdc(position.openQty)}
      </span>
      <span className="text-right">
        <Badge tone={position.settled ? BadgeTone.Live : BadgeTone.Neutral}>
          {position.settled ? "Settled" : "Open"}
        </Badge>
      </span>
      <span className="truncate text-right font-mono text-muted-foreground tabular-nums">
        {formatPrice(position.settlementPrice)}
      </span>
      <span className="truncate text-right font-mono text-foreground tabular-nums">
        {formatDusdc(position.payout)}
      </span>
      <span className="text-right">
        {redeemable ? (
          <Badge tone={BadgeTone.Warning}>Redeemable</Badge>
        ) : (
          <span className="font-mono text-muted-foreground tabular-nums">--</span>
        )}
      </span>
    </div>
  )
}

export function PositionsTable({ positions }: { positions: KeeperPosition[] }) {
  // Surface redeemable-now and open positions first.
  const ordered = [...positions].sort((left, right) => {
    const score = (position: KeeperPosition) =>
      (isRedeemable(position) ? 2 : 0) + (Number(position.openQty) > 0 ? 1 : 0)
    return score(right) - score(left)
  })

  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            Tracked positions
          </div>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase tabular-nums">
            {positions.length.toLocaleString("en-US")} indexed
          </div>
        </div>
        <div className="overflow-auto border-t border-border/45">
          <div className="min-w-[48rem]">
            <div className={`grid ${COLUMNS} gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase`}>
              <span>Market</span>
              <span className="text-right">Open</span>
              <span className="text-right">State</span>
              <span className="text-right">Settlement</span>
              <span className="text-right">Payout</span>
              <span className="text-right">Action</span>
            </div>
            {ordered.length > 0 ? (
              ordered.map((position) => <PositionRow key={position.key} position={position} />)
            ) : (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No positions indexed yet from the keeper's start checkpoint.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
