import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatExpiryDistance, formatUsd } from "@/lib/format"
import { formatAddress, formatDusdc } from "@/lib/range-ladder/format"
import {
  getRoundStateCopy,
  getRoundStage,
  getStepState,
  roundSteps,
} from "@/lib/range-ladder/helpers"
import { getRangeLadderPresetLabel } from "@/lib/range-ladder-products"
import type { RangeLadderProduct } from "@/lib/types/range-ladder"
import { cn } from "@/lib/utils"
import type { RangeLadderPositionRow, RangeLadderStrategyState } from "@/services/range-ladder-client"

export function RoundProgressCard({
  nextLadder,
  product,
  status,
  strategy,
}: {
  nextLadder?: RangeLadderProduct
  product?: RangeLadderProduct
  status: string
  strategy?: RangeLadderStrategyState
}) {
  const round = strategy?.activeRound
  const activeStep = getRoundStage(strategy)
  const contextProduct = product ?? nextLadder
  const roundCopy = getRoundStateCopy(strategy)

  return (
    <Card className="gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Current Ladder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pt-2 pb-4">
        <div className="rounded-md border border-border/35 bg-muted/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-foreground">
              {status}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
              Native ranges
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {roundCopy}
          </p>
        </div>

        <div className="grid overflow-hidden rounded-md border border-border/35 bg-muted/25 md:grid-cols-4">
          {roundSteps.map((step) => (
            <RoundStep
              key={step.id}
              label={step.label}
              state={getStepState(step.id, activeStep)}
            />
          ))}
        </div>

        <div className="space-y-2 rounded-md border border-border/35 bg-muted/15 p-3">
          <RoundDetailRow label="Strategy state" value={status} />
          <RoundDetailRow
            label="Active rungs"
            value={round ? round.positionCount.toString() : "--"}
          />
          <RoundDetailRow
            label="Premium spent"
            value={round ? formatDusdc(round.totalCost, 4) : "--"}
          />
          <RoundDetailRow
            label="Oracle"
            value={round ? formatAddress(round.oracleId) : "No active round"}
          />
        </div>

        {round ? <ActiveRungRail positions={round.positions} /> : null}

        {contextProduct ? (
          <div className="flex items-center gap-2 rounded-md border border-border/35 bg-muted/25 px-3 py-2">
            <AssetIcon
              assetIconUrl={contextProduct.market.assetIconUrl}
              assetName={contextProduct.market.assetName}
              assetSymbol={contextProduct.market.assetSymbol}
              className="size-6"
            />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-foreground">
                {contextProduct.market.assetSymbol} ladder context
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
                {formatExpiryDistance(contextProduct.market.expiryMs)} ·{" "}
                {getRangeLadderPresetLabel(contextProduct.preset)} ·{" "}
                {contextProduct.rungs.length} rungs
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RoundStep({
  label,
  state,
}: {
  label: string
  state: "active" | "complete" | "idle"
}) {
  return (
    <div
      className={cn(
        "px-3 py-2 text-center text-xs md:border-r md:border-border/30 md:last:border-r-0",
        state === "active" && "bg-primary/10 font-medium text-primary",
        state === "complete" && "text-foreground",
        state === "idle" && "text-muted-foreground"
      )}
    >
      {label}
    </div>
  )
}

function RoundDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-2 last:border-b-0 last:pb-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="max-w-[58%] truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function ActiveRungRail({
  positions,
}: {
  positions: RangeLadderPositionRow[]
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/35 bg-muted/15 p-2">
      {positions.map((position) => (
        <div
          className="grid gap-2 rounded-md border border-border/25 bg-muted/25 px-2.5 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:items-center"
          key={`${position.oracleId}-${position.lowerStrike}-${position.higherStrike}`}
        >
          <div className="font-mono font-medium text-foreground tabular-nums">
            {formatUsd(position.lowerStrikeUsd, 0)}-
            {formatUsd(position.higherStrikeUsd, 0)}
          </div>
          <div className="font-mono text-muted-foreground tabular-nums sm:text-right">
            qty {formatDusdc(position.quantity, 4)}
          </div>
          <div className="font-mono text-muted-foreground tabular-nums sm:text-right">
            cost {formatDusdc(position.cost, 4)}
          </div>
        </div>
      ))}
    </div>
  )
}
