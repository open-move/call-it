import { DataRow } from "@/components/primitives/data-row"
import { StatusIndicator } from "@/components/primitives/status-indicator"
import { formatExpiryDistance, formatUsd } from "@/lib/format"
import { formatAddress, formatDusdc } from "@/lib/range-ladder/format"
import {
  getRoundStage,
  getRoundStateCopy,
  getStepState,
  roundSteps,
} from "@/lib/range-ladder/helpers"
import { getStrategyStatusTone } from "@/lib/strategies/hooks"
import type { RangeLadderProduct } from "@/lib/types/range-ladder"
import { cn } from "@/lib/utils"
import type {
  RangeLadderPositionRow,
  RangeLadderStrategyState,
} from "@/services/range-ladder-client"

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

function RungList({ positions }: { positions: RangeLadderPositionRow[] }) {
  return (
    <div className="mt-4 space-y-1.5">
      {positions.map((position) => (
        <div
          className="flex items-center justify-between gap-3 text-xs"
          key={`${position.oracleId}-${position.lowerStrike}-${position.higherStrike}`}
        >
          <span className="font-medium text-foreground tabular-nums">
            {formatUsd(position.lowerStrikeUsd, 0)}–
            {formatUsd(position.higherStrikeUsd, 0)}
          </span>
          <span className="text-muted-foreground tabular-nums">
            cost {formatDusdc(position.cost, 2)}
          </span>
        </div>
      ))}
    </div>
  )
}

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
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Current ladder
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
          label="Active rungs"
          value={round ? round.positionCount.toString() : "—"}
        />
        <DataRow
          label="Premium spent"
          value={round ? formatDusdc(round.totalCost, 4) : "—"}
        />
        <DataRow
          label="Oracle"
          mono
          value={round ? formatAddress(round.oracleId) : "No active round"}
        />
        {contextProduct ? (
          <DataRow
            label={`${contextProduct.market.assetSymbol} ladder`}
            value={`${formatExpiryDistance(contextProduct.market.expiryMs)} · ${contextProduct.rungs.length} rungs`}
          />
        ) : null}
      </div>

      {round && round.positions.length > 0 ? (
        <RungList positions={round.positions} />
      ) : null}
    </div>
  )
}
