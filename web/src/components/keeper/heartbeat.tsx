import { RefreshCwIcon } from "lucide-react"

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
  index,
  label,
  tone = "default",
  value,
}: {
  dot?: boolean
  index: number
  label: string
  tone?: CellTone
  value: string
}) {
  return (
    <div className={cn("min-w-0", index > 0 && "sm:pl-5")}>
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
    </div>
  )
}

export function KeeperHeader({
  onRefresh,
  refreshing = false,
}: {
  onRefresh?: () => void
  refreshing?: boolean
}) {
  return (
    <div className="px-1 pt-1 pb-2">
      <div className="flex items-start justify-between gap-3">
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
        {onRefresh ? (
          <Button
            aria-label="Refresh"
            className="size-7 shrink-0 text-muted-foreground shadow-none hover:text-foreground"
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
  )
}

interface Verdict {
  detail: string
  title: string
  tone: CellTone
}

// Synthesize the keeper's overall health from its component signals, surfacing
// the most urgent problem first.
function getVerdict(status: KeeperStatus, errorCount: number): Verdict {
  const lag =
    status.checkpointLag === null ? null : Number(status.checkpointLag)
  const synced = lag !== null && lag <= 5

  if (status.dryRun) {
    return {
      tone: "muted",
      title: "Simulating only",
      detail:
        "Watching settled markets without a redeem key. Nothing is sent on-chain.",
    }
  }
  if (status.keeper?.belowMinimum) {
    return {
      tone: "warning",
      title: "Gas below minimum",
      detail: "Top up the keeper wallet. Redemptions stall without gas.",
    }
  }
  if (!synced) {
    return {
      tone: "warning",
      title:
        lag === null
          ? "Chain head unavailable"
          : `Catching up · ${formatCount(lag)} behind`,
      detail: "Indexing toward the latest checkpoint.",
    }
  }
  if (errorCount > 0) {
    return {
      tone: "warning",
      title: "Running with quarantine",
      detail: `${formatCount(errorCount)} event${errorCount === 1 ? "" : "s"} isolated. Redemptions continue.`,
    }
  }
  return {
    tone: "up",
    title: "Healthy",
    detail: "Running, synced, and funded.",
  }
}

export function KeeperStatusCockpit({
  errorCount,
  redeemableCount,
  redeemedCount,
  status,
}: {
  errorCount: number
  redeemableCount: number
  redeemedCount: number
  status: KeeperStatus
}) {
  const verdict = getVerdict(status, errorCount)
  const healthy = verdict.tone === "up"

  const lag =
    status.checkpointLag === null ? null : Number(status.checkpointLag)
  const synced = lag !== null && lag <= 5
  const syncValue =
    lag === null ? "--" : synced ? "Synced" : `${formatCount(lag)} behind`

  const gasValue = status.keeper
    ? formatSui(status.keeper.suiBalance)
    : "Dry run"
  const gasTone: CellTone = status.keeper?.belowMinimum
    ? "warning"
    : status.keeper
      ? "up"
      : "muted"

  return (
    <div className="rounded-lg bg-card p-4 sm:p-5">
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full",
              cellDotClassName[verdict.tone],
              healthy && "animate-pulse"
            )}
          />
          <span className="text-sm leading-none font-medium text-foreground">
            {verdict.title}
          </span>
        </div>
        <div className="mt-1.5 text-xs leading-snug text-muted-foreground">
          {verdict.detail}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/40 pt-4 sm:grid-cols-4 sm:gap-x-0 sm:divide-x sm:divide-border/40">
        <StatCell
          dot
          index={0}
          label="Sync"
          tone={lag === null ? "muted" : synced ? "up" : "warning"}
          value={syncValue}
        />
        <StatCell
          dot
          index={1}
          label="Gas tank"
          tone={gasTone}
          value={gasValue}
        />
        <StatCell
          index={2}
          label="Redeemable now"
          tone={redeemableCount > 0 ? "up" : "muted"}
          value={formatCount(redeemableCount)}
        />
        <StatCell
          index={3}
          label="Redeemed"
          value={formatCount(redeemedCount)}
        />
      </div>
    </div>
  )
}
