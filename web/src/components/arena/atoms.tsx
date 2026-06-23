import { formatDistanceToNowStrict } from "date-fns"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import type {
  ArenaActivity,
  ArenaCall,
  ArenaCallStatus,
  ArenaCreator,
  ArenaDirection,
} from "@/lib/arena/types"
import { SUI_NETWORK } from "@/lib/config"
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

// Timestamps from the live backend are epoch-ms strings; mock data uses
// pre-formatted strings ("12m ago"). Format the former, pass the latter
// through — guarding against the NaN that would crash date-fns.
export function formatCallTimestamp(value: string) {
  const ms = Number(value)
  if (Number.isFinite(ms) && ms > 0) {
    return formatDistanceToNowStrict(ms, { addSuffix: true })
  }
  return value
}

export function formatDusdc(value: number) {
  return `${value.toFixed(2)} DUSDC`
}

export function formatDirection(direction: ArenaDirection) {
  return direction === "up" ? "Above" : "Below"
}

// Backend emits the default label as "<asset> Up @ <strike>" /
// "<asset> Down @ <strike>". Present it as a readable phrase:
// "<asset> above <strike>" / "<asset> below <strike>".
export function formatMarketLabel(market: string): string {
  return market.replace(" Up @ ", " above ").replace(" Down @ ", " below ")
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

  // Default labels read "<asset> Up @ <strike>" / "... Down @ ...".
  if (market.includes(" Up @ ")) {
    return market.replace(" Up @ ", " Down @ ")
  }

  if (market.includes(" Down @ ")) {
    return market.replace(" Down @ ", " Up @ ")
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
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-1 ring-border/60 ring-inset",
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

// Bold Up/Down marker: the directional signal that gives a call card its
// at-a-glance energy. Tinted in the outcome color.
export function DirectionPill({ direction }: { direction: ArenaDirection }) {
  const isUp = direction === "up"
  const Icon = isUp ? ArrowUpIcon : ArrowDownIcon

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide",
        isUp
          ? "bg-outcome-up/10 text-outcome-up"
          : "bg-outcome-down/10 text-outcome-down"
      )}
    >
      <Icon className="size-3" />
      {isUp ? "Above" : "Below"}
    </span>
  )
}

// Back-vs-fade as a colored tug-of-war: backers push from the left (primary),
// faders from the right (outcome-down), with the counts owning each side.
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
    <div className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] font-semibold text-primary tabular-nums">
          {backers}
        </span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted/40">
          <div className="h-full bg-primary" style={{ width: `${backPct}%` }} />
          <div
            className="h-full bg-outcome-down/55"
            style={{ width: `${100 - backPct}%` }}
          />
        </div>
        <span className="text-[11px] font-semibold text-outcome-down tabular-nums">
          {faders}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        <span>Back</span>
        <span>Fade</span>
      </div>
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
  claimed: "bg-warning",
  faded: "bg-outcome-down",
  launched: "bg-outcome-up",
  reclaimed: "bg-muted-foreground",
}

const activityKindLabel: Record<ArenaActivity["kind"], string> = {
  backed: "backed",
  claimed: "claimed bond",
  faded: "faded",
  launched: "launched",
  reclaimed: "reclaimed bond",
}

export function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

// Backend actors/labels are usually resolved usernames + market titles, but
// unresolved ones arrive as raw addresses / object ids. Middle-truncate the
// machine-looking values (long, no whitespace) and pass human labels through.
function shortenHandle(value: string): string {
  const trimmed = value.trim()

  if (/\s/.test(trimmed) || trimmed.length <= 14) {
    return trimmed
  }

  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`
}

function isOnchainId(value: string): boolean {
  return /^0x[0-9a-fA-F]{6,}$/.test(value.trim())
}

function explorerUrl(kind: "account" | "object", value: string): string {
  return `https://suiscan.xyz/${SUI_NETWORK}/${kind}/${value.trim()}`
}

function ActivityActor({ value }: { value: string }) {
  if (isOnchainId(value)) {
    return (
      <a
        className="font-medium text-foreground transition-colors hover:text-primary hover:underline"
        href={explorerUrl("account", value)}
        rel="noreferrer"
        target="_blank"
      >
        {shortenHandle(value)}
      </a>
    )
  }

  return (
    <span className="font-medium text-foreground">{shortenHandle(value)}</span>
  )
}

function ActivityLabel({ value }: { value: string }) {
  if (isOnchainId(value)) {
    return (
      <a
        className="block truncate text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:underline"
        href={explorerUrl("object", value)}
        rel="noreferrer"
        target="_blank"
      >
        {shortenHandle(value)}
      </a>
    )
  }

  return (
    <div className="truncate text-[11px] text-muted-foreground">
      {shortenHandle(value)}
    </div>
  )
}

export function ActivityRow({ item }: { item: ArenaActivity }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md px-2 py-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-1.5 shrink-0 rounded-full",
          activityDotClassName[item.kind]
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0 truncate text-xs">
            <ActivityActor value={item.actor} />{" "}
            <span className="text-muted-foreground">
              {activityKindLabel[item.kind]}
            </span>
          </div>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
            {formatCallTimestamp(item.timestamp)}
          </span>
        </div>
        <ActivityLabel value={item.callLabel} />
      </div>
    </div>
  )
}
