import { StatusIndicator } from "@/components/primitives/status-indicator"
import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import { formatUsd } from "@/lib/format"
import { formatAddress } from "@/lib/shield/format"
import {
  getRoundStage,
  getRoundStateCopy,
  getStepState,
  roundSteps,
} from "@/lib/shield/helpers"
import { getStrategyStatusTone } from "@/lib/strategies/hooks"
import type { ShieldProduct } from "@/lib/types/shield"
import { cn } from "@/lib/utils"
import type { HedgedPlpStrategyState } from "@/services/shield-client"
import { DataRow } from "@/components/primitives/data-row"

function RoundStep({
  label,
  state,
}: {
  label: string
  state: "active" | "complete" | "idle"
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <span
        className={cn(
          "h-1 w-full rounded-full",
          state === "active" && "bg-primary",
          state === "complete" && "bg-primary/45",
          state === "idle" && "bg-muted"
        )}
      />
      <span
        className={cn(
          "text-[11px]",
          state === "active" && "font-medium text-primary",
          state === "complete" && "text-foreground",
          state === "idle" && "text-muted-foreground"
        )}
      >
        {label}
      </span>
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
  strategy?: HedgedPlpStrategyState
}) {
  const round = strategy?.activeRound
  const activeStep = getRoundStage(strategy)
  const roundCopy = getRoundStateCopy(strategy)

  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Current round
        </h2>
        <StatusIndicator className="text-xs" tone={getStrategyStatusTone(status)}>
          {status}
        </StatusIndicator>
      </div>

      <p className="mt-2 text-xs leading-5 text-pretty text-muted-foreground">
        {roundCopy}
      </p>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {roundSteps.map((step) => (
          <RoundStep
            key={step.id}
            label={step.label}
            state={getStepState(step.id, activeStep)}
          />
        ))}
      </div>

      <div className="mt-5">
        <DataRow
          label="Downside trigger"
          tone={round ? "down" : "default"}
          value={round ? `Below ${formatUsd(round.strikeUsd, 0)}` : "—"}
        />
        <DataRow
          label="DOWN hedge size"
          value={
            round
              ? formatDecimalUnits(round.hedgeQuantity, PREDICT_QUOTE_DECIMALS, 4)
              : "—"
          }
        />
        <DataRow
          label="Oracle"
          mono
          value={round ? formatAddress(round.oracleId) : "No active round"}
        />
        {product ? (
          <DataRow
            label={`${product.market.assetSymbol} spot`}
            value={formatUsd(product.market.currentPriceUsd, 0)}
          />
        ) : null}
      </div>
    </div>
  )
}
