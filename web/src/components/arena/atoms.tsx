import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import type {
  ArenaActivity,
  ArenaCall,
  ArenaCallStatus,
  ArenaCreator,
  ArenaDirection,
} from "@/lib/arena/types"
import { cn } from "@/lib/utils"

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
})

export const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  style: "percent",
})

export function formatCompactNumber(value: number) {
  return compactNumberFormatter.format(value)
}

export function formatPlp(value: number) {
  return `${formatCompactNumber(value)} PLP`
}

export function formatDusdc(value: number) {
  return `${value.toFixed(2)} DUSDC`
}

export function formatDirection(direction: ArenaDirection) {
  return direction === "up" ? "Up" : "Down"
}

export function getWinRate(creator: ArenaCreator) {
  return creator.settledCount === 0
    ? 0
    : creator.winCount / creator.settledCount
}

export function getCallChance(call: ArenaCall) {
  return call.direction === "up"
    ? call.fairUpProbability
    : 1 - call.fairUpProbability
}

export function oppositeMarket(market: string) {
  if (market.includes(" above ")) {
    return market.replace(" above ", " below ")
  }

  if (market.includes(" below ")) {
    return market.replace(" below ", " above ")
  }

  return market
}

function getStatusLabel(status: ArenaCallStatus) {
  switch (status) {
    case "active":
      return "Active"
    case "settled":
      return "Settled"
    case "bond_claimed":
      return "Bond claimed"
  }
}

const avatarGradients = [
  "from-sky-500 to-primary",
  "from-violet-500 to-fuchsia-400",
  "from-emerald-500 to-teal-300",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-pink-400",
  "from-indigo-500 to-blue-400",
]

function getAvatarGradient(seed: string) {
  const score = seed
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0)

  return avatarGradients[score % avatarGradients.length]
}

export function CreatorAvatar({
  className,
  seed,
}: {
  className?: string
  seed: string
}) {
  return (
    <div
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-white",
        getAvatarGradient(seed),
        className
      )}
    >
      {seed.slice(0, 2).toUpperCase()}
    </div>
  )
}

export function DirectionArrow({
  className,
  direction,
}: {
  className?: string
  direction: ArenaDirection
}) {
  const Icon = direction === "up" ? ArrowUpIcon : ArrowDownIcon

  return (
    <Icon
      aria-label={formatDirection(direction)}
      className={cn(
        "mt-0.5 size-4 shrink-0",
        direction === "up" ? "text-outcome-up" : "text-outcome-down",
        className
      )}
    />
  )
}

export function SentimentBar({
  backers,
  faders,
}: {
  backers: number
  faders: number
}) {
  const total = backers + faders
  const backPct = total === 0 ? 50 : Math.round((backers / total) * 100)

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] font-medium text-foreground tabular-nums">
        {backers}
      </span>
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
        <div className="h-full bg-primary" style={{ width: `${backPct}%` }} />
        <div
          className="h-full bg-muted-foreground/35"
          style={{ width: `${100 - backPct}%` }}
        />
      </div>
      <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
        {faders}
      </span>
    </div>
  )
}

export function CallStatusBadge({
  status,
  winState,
}: {
  status: ArenaCallStatus
  winState?: "won" | "lost"
}) {
  if (status === "active") {
    return null
  }

  if (winState) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide",
          winState === "won"
            ? "border-outcome-up/35 bg-outcome-up/10 text-outcome-up"
            : "border-outcome-down/35 bg-outcome-down/10 text-outcome-down"
        )}
      >
        {winState === "won" ? "Won" : "Lost"}
      </span>
    )
  }

  return <Badge tone={BadgeTone.Neutral}>{getStatusLabel(status)}</Badge>
}

const activityDotClassName: Record<ArenaActivity["kind"], string> = {
  backed: "bg-primary",
  faded: "bg-outcome-down",
  launched: "bg-outcome-up",
  settled: "bg-muted-foreground",
}

export function DetailStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

export function ActivityRow({ item }: { item: ArenaActivity }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          activityDotClassName[item.kind]
        )}
      />
      <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{item.actor}</span>{" "}
        {item.kind}{" "}
        <span className="text-foreground">{item.callLabel}</span>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
        {item.timestamp}
      </span>
    </div>
  )
}
