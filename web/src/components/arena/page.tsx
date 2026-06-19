import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  FlameIcon,
  SwordsIcon,
  TrophyIcon,
  UserRoundIcon,
} from "lucide-react"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatUsd } from "@/lib/format"
import type {
  ArenaActivity,
  ArenaCall,
  ArenaCallStatus,
  ArenaCreator,
  ArenaDirection,
  ArenaPageModel,
} from "@/lib/arena/types"
import { cn } from "@/lib/utils"

export interface ArenaPageProps {
  model: ArenaPageModel
}

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
})

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  style: "percent",
})

function formatCompactNumber(value: number) {
  return compactNumberFormatter.format(value)
}

function formatPlp(value: number) {
  return `${formatCompactNumber(value)} PLP`
}

function formatDirection(direction: ArenaDirection) {
  return direction === "up" ? "UP" : "DOWN"
}

function getOppositeDirection(direction: ArenaDirection) {
  return direction === "up" ? "DOWN" : "UP"
}

function getWinRate(creator: ArenaCreator) {
  return creator.settledCount === 0 ? 0 : creator.winCount / creator.settledCount
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

function getActivityVerb(kind: ArenaActivity["kind"]) {
  switch (kind) {
    case "launched":
      return "launched"
    case "backed":
      return "backed"
    case "faded":
      return "faded"
    case "settled":
      return "settled"
  }
}

function getAvatarGradient(seed: string) {
  const variants = [
    "from-primary/80 to-sky-400/70",
    "from-outcome-down/80 to-amber-400/70",
    "from-emerald-400/70 to-primary/70",
    "from-violet-400/75 to-outcome-down/70",
  ]
  const index = seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0)

  return variants[index % variants.length]
}

export function Page({ model }: ArenaPageProps) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <ArenaHero model={model} />

        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <ActiveCallsCard calls={model.calls} />
          <TopCreatorsCard creators={model.creators} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <RecentActivityCard activity={model.activity} />
          <HowArenaWorksCard />
        </div>
      </section>
    </main>
  )
}

function ArenaHero({ model }: { model: ArenaPageModel }) {
  return (
    <div className="overflow-hidden rounded-md bg-card shadow-none ring-0">
      <div className="relative px-3 py-4 sm:px-4">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-primary/5 lg:block" />
        <div className="pointer-events-none absolute top-0 right-0 hidden h-full w-24 border-l border-primary/10 bg-primary/5 lg:block" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
              <SwordsIcon className="size-3.5" />
              Arena
            </div>
            {model.dataMode === "mock" ? (
              <Badge className="ml-2 px-2 py-0.5 text-[10px]" tone={BadgeTone.Warning}>
                Mock data
              </Badge>
            ) : null}
            <h1 className="mt-3 text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
              Back or fade market calls.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Creators post bonded calls on DeepBook Predict. Back the call,
              fade it, or build your own record.
            </p>
            <div className="mt-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Social prediction layer · Native Predict positions · PLP-bonded calls
            </div>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-4 lg:min-w-[34rem]">
            <HeroMetric label="Active Calls" value={model.summary.activeCalls.toString()} />
            <HeroMetric label="Bonded" value={formatPlp(model.summary.bondedPlp)} />
            <HeroMetric label="Creators" value={model.summary.creatorCount.toString()} />
            <HeroMetric label="Participants" value={formatCompactNumber(model.summary.participantCount)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-2">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function ActiveCallsCard({ calls }: { calls: ArenaCall[] }) {
  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-end justify-between gap-3">
          <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Back/Fade coming next
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 px-3 pb-3 md:grid-cols-2">
        {calls.map((call) => (
          <CallCard call={call} key={call.id} />
        ))}
      </CardContent>
    </Card>
  )
}

function CallCard({ call }: { call: ArenaCall }) {
  const isUp = call.direction === "up"

  return (
    <article className="overflow-hidden rounded-md border border-border/45 bg-background/35">
      <div className="flex items-start justify-between gap-3 border-b border-border/35 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <CreatorAvatar seed={call.creatorAvatarSeed} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {call.creatorName}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground uppercase">
              @{call.creatorHandle} · {call.createdAt}
            </div>
          </div>
        </div>
        <CallStatusBadge status={call.status} />
      </div>

      <div className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <DirectionBadge direction={call.direction} />
          <div className="min-w-0 truncate text-sm text-foreground">
            {call.market}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <CallMetric label="Strike" value={formatUsd(call.strikeUsd, 0)} />
          <CallMetric label="Bond" value={formatPlp(call.bondPlp)} />
          <CallMetric label="Expiry" value={call.expiryLabel.split(" · ").at(-1) ?? call.expiryLabel} />
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden rounded-md border border-border/40">
          <SideCount label="Backers" value={call.backers} />
          <SideCount label="Faders" value={call.faders} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            className={cn(
              "h-8 text-xs shadow-none",
              isUp
                ? "bg-outcome-up/10 text-outcome-up hover:bg-outcome-up/10"
                : "bg-outcome-down/10 text-outcome-down hover:bg-outcome-down/10"
            )}
            disabled
            size="sm"
            type="button"
            variant="ghost"
          >
            Back {formatDirection(call.direction)} · next
          </Button>
          <Button
            className={cn(
              "h-8 text-xs shadow-none",
              isUp
                ? "bg-outcome-down/10 text-outcome-down hover:bg-outcome-down/10"
                : "bg-outcome-up/10 text-outcome-up hover:bg-outcome-up/10"
            )}
            disabled
            size="sm"
            type="button"
            variant="ghost"
          >
            Fade {getOppositeDirection(call.direction)} · next
          </Button>
        </div>
      </div>
    </article>
  )
}

function CreatorAvatar({ seed }: { seed: string }) {
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-mono text-[11px] font-medium text-white shadow-none",
        getAvatarGradient(seed)
      )}
    >
      {seed.slice(0, 2).toUpperCase()}
    </div>
  )
}

function DirectionBadge({ direction }: { direction: ArenaDirection }) {
  const Icon = direction === "up" ? ArrowUpIcon : ArrowDownIcon

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] font-medium tracking-wide uppercase",
        direction === "up"
          ? "bg-outcome-up/10 text-outcome-up"
          : "bg-outcome-down/10 text-outcome-down"
      )}
    >
      <Icon className="size-3" />
      {formatDirection(direction)}
    </span>
  )
}

function CallStatusBadge({ status }: { status: ArenaCallStatus }) {
  return (
    <Badge
      className="px-2 py-0.5 text-[10px]"
      tone={status === "active" ? BadgeTone.Live : BadgeTone.Neutral}
    >
      {getStatusLabel(status)}
    </Badge>
  )
}

function CallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5">
      <div className="truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-xs text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function SideCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-border/35 px-2.5 py-2 last:border-r-0">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function TopCreatorsCard({ creators }: { creators: ArenaCreator[] }) {
  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Top Creators</CardTitle>
          <TrophyIcon className="size-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3">
        {creators.map((creator, index) => (
          <CreatorRow creator={creator} key={creator.id} rank={index + 1} />
        ))}
      </CardContent>
    </Card>
  )
}

function CreatorRow({ creator, rank }: { creator: ArenaCreator; rank: number }) {
  const winRate = getWinRate(creator)

  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_5rem] items-center gap-2 rounded-md px-1.5 py-2 transition-colors hover:bg-accent/25">
      <div className="font-mono text-xs text-muted-foreground tabular-nums">
        #{rank}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">{creator.name}</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground uppercase">
          @{creator.handle} · {creator.settledCount} settled · {formatPlp(creator.bondPlp)}
        </div>
      </div>
      <div className="text-right font-mono text-xs text-foreground tabular-nums">
        {percentFormatter.format(winRate)}
      </div>
    </div>
  )
}

function RecentActivityCard({ activity }: { activity: ArenaActivity[] }) {
  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Recent Arena Activity</CardTitle>
          <ActivityIcon className="size-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="space-y-1">
          {activity.map((item) => (
            <ActivityRow item={item} key={item.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ActivityRow({ item }: { item: ArenaActivity }) {
  return (
    <div className="grid grid-cols-[0.5rem_minmax(0,1fr)_4rem] items-center gap-2 rounded-md px-1.5 py-2">
      <div
        className={cn(
          "size-1.5 rounded-full",
          item.kind === "backed" && "bg-outcome-up",
          item.kind === "faded" && "bg-outcome-down",
          item.kind === "launched" && "bg-primary",
          item.kind === "settled" && "bg-muted-foreground"
        )}
      />
      <div className="min-w-0 text-sm text-muted-foreground">
        <span className="text-foreground">{item.actor}</span>{" "}
        {getActivityVerb(item.kind)}{" "}
        <span className="text-foreground">{item.callLabel}</span>
      </div>
      <div className="text-right font-mono text-[10px] text-muted-foreground uppercase">
        {item.timestamp}
      </div>
    </div>
  )
}

function HowArenaWorksCard() {
  const steps = [
    {
      description: "A creator posts a call and bonds PLP to its provenance.",
      icon: FlameIcon,
      label: "Creator bonds a call",
    },
    {
      description: "Backers mint the same native Predict side through Arena.",
      icon: ArrowUpIcon,
      label: "Backers buy the same side",
    },
    {
      description: "Faders mint the opposite native Predict side through Arena.",
      icon: ArrowDownIcon,
      label: "Faders buy the opposite side",
    },
    {
      description: "Predict settlement updates the call and creator record.",
      icon: UserRoundIcon,
      label: "Settlement updates record",
    },
  ]

  return (
    <Card className="gap-2 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/40 px-3 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-medium">How Arena Works</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
        {steps.map((step, index) => {
          const Icon = step.icon

          return (
            <div
              className="rounded-md border border-border/40 bg-background/35 px-3 py-3"
              key={step.label}
            >
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-3.5" />
                </div>
                <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                  Step {index + 1}
                </div>
              </div>
              <div className="mt-3 text-sm font-medium text-foreground">
                {step.label}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {step.description}
              </p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
