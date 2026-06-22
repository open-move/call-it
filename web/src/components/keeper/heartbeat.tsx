import { RefreshCwIcon } from "lucide-react"

import {
  StatusIndicator,
  StatusTone,
} from "@/components/primitives/status-indicator"
import { Button } from "@/components/ui/button"
import type { KeeperStatus } from "@/services/keeper-client"
import { formatCount, formatSui } from "@/lib/keeper/helpers"
import { cn } from "@/lib/utils"

type CellTone = "default" | "up" | "warning" | "down" | "muted"

const cellToneClassName: Record<CellTone, string> = {
  default: "text-foreground",
  down: "text-outcome-down-foreground",
  muted: "text-muted-foreground",
  up: "text-outcome-up-foreground",
  warning: "text-warning",
}

const cellDotClassName: Record<CellTone, string> = {
  default: "bg-muted-foreground",
  down: "bg-destructive",
  muted: "bg-muted-foreground",
  up: "bg-primary",
  warning: "bg-warning",
}

function StatCell({
  dot = false,
  label,
  meta,
  tone = "default",
  value,
}: {
  dot?: boolean
  label: string
  meta: string
  tone?: CellTone
  value: string
}) {
  return (
    <div className="border-b border-border/35 px-4 py-3 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0">
      <div className="flex items-center gap-1.5 text-xs leading-none text-muted-foreground">
        {dot ? (
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              cellDotClassName[tone]
            )}
          />
        ) : null}
        {label}
      </div>
      <div
        className={cn(
          "mt-2 truncate font-mono text-xl leading-tight font-semibold tracking-[-0.03em] tabular-nums",
          cellToneClassName[tone]
        )}
      >
        {value}
      </div>
      <div className="mt-1 truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {meta}
      </div>
    </div>
  )
}

export function KeeperHeader({
  onRefresh,
  refreshing = false,
  status,
}: {
  onRefresh?: () => void
  refreshing?: boolean
  status: KeeperStatus
}) {
  const live = !status.dryRun
  return (
    <div className="px-1 pt-1 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground">
            Predict Keeper
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
            Anyone can run it. It finds settled markets, redeems winning
            positions their owners never claimed, and earns a tip from the
            reward vault.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusIndicator
            pulse={live}
            tone={live ? StatusTone.Live : StatusTone.Simulated}
          >
            {live ? "Running" : "Simulating only"}
          </StatusIndicator>
          {onRefresh ? (
            <Button
              aria-label="Refresh"
              className="size-7 text-muted-foreground shadow-none hover:text-foreground"
              disabled={refreshing}
              onClick={onRefresh}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <RefreshCwIcon
                className={cn("size-4", refreshing && "animate-spin")}
              />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function HeartbeatStrip({
  redeemedCount,
  redeemableCount,
  status,
}: {
  redeemedCount: number
  redeemableCount: number
  status: KeeperStatus
}) {
  const lag =
    status.checkpointLag === null ? null : Number(status.checkpointLag)
  const synced = lag !== null && lag <= 5
  const syncValue =
    lag === null ? "--" : synced ? "Synced" : `${formatCount(lag)} behind`
  const syncMeta =
    status.latestCheckpoint === null
      ? "chain head unavailable"
      : `head ${formatCount(status.latestCheckpoint)}`

  const gasValue = status.keeper
    ? formatSui(status.keeper.suiBalance)
    : "Dry run"
  const gasMeta = status.keeper
    ? `min ${formatSui(status.minSuiBalance)}`
    : "no redeem key"
  const gasTone: CellTone = status.keeper?.belowMinimum
    ? "warning"
    : status.keeper
      ? "up"
      : "muted"

  return (
    <div className="overflow-hidden rounded-md bg-card">
      <div className="grid bg-muted/10 md:grid-cols-4">
        <StatCell
          dot
          label="Sync"
          meta={syncMeta}
          tone={lag === null ? "muted" : synced ? "up" : "warning"}
          value={syncValue}
        />
        <StatCell
          dot
          label="Gas tank"
          meta={gasMeta}
          tone={gasTone}
          value={gasValue}
        />
        <StatCell
          label="Redeemable now"
          meta={`${formatCount(status.counts.positions)} tracked positions`}
          tone={redeemableCount > 0 ? "up" : "muted"}
          value={formatCount(redeemableCount)}
        />
        <StatCell
          label="Redeemed"
          meta={`${formatCount(status.counts.txs)} total attempts`}
          value={formatCount(redeemedCount)}
        />
      </div>
    </div>
  )
}
