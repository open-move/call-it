import { AssetIcon } from "@/components/shared/market/asset-icon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import { formatExpiryDistance, formatUsd } from "@/lib/format"
import { formatAddress } from "@/lib/shield/format"
import {
  getRoundStage,
  getRoundStateCopy,
  getStepState,
  roundSteps,
} from "@/lib/shield/helpers"
import type { ShieldProduct } from "@/lib/types/shield"
import { cn } from "@/lib/utils"
import type { ShieldStrategyState } from "@/services/shield-client"

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

export function RoundProgressCard({
  product,
  status,
  strategy,
}: {
  product?: ShieldProduct
  status: string
  strategy?: ShieldStrategyState
}) {
  const round = strategy?.activeRound
  const activeStep = getRoundStage(strategy)
  const roundCopy = getRoundStateCopy(strategy)

  return (
    <Card className="gap-0 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="px-4 pt-4 pb-3 [.border-b]:pb-3">
        <CardTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
          Current Round
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pt-2 pb-4">
        <div className="rounded-md border border-border/35 bg-muted/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-foreground">
              {status}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
              PLP + DOWN hedge
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
            label="Downside trigger"
            value={round ? `Below ${formatUsd(round.strikeUsd, 0)}` : "--"}
          />
          <RoundDetailRow
            label="DOWN hedge size"
            value={
              round
                ? formatDecimalUnits(
                    round.hedgeQuantity,
                    PREDICT_QUOTE_DECIMALS,
                    4
                  )
                : "--"
            }
          />
          <RoundDetailRow
            label="Oracle"
            value={round ? formatAddress(round.oracleId) : "No active round"}
          />
        </div>

        {product ? (
          <div className="flex items-center gap-2 rounded-md border border-border/35 bg-muted/25 px-3 py-2">
            <AssetIcon
              assetIconUrl={product.market.assetIconUrl}
              assetName={product.market.assetName}
              assetSymbol={product.market.assetSymbol}
              className="size-6"
            />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-foreground">
                {product.market.assetSymbol} hedge context
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
                {formatExpiryDistance(product.market.expiryMs)} · spot{" "}
                {formatUsd(product.market.currentPriceUsd, 0)}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
