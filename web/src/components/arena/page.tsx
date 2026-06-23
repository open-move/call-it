import { Link } from "@tanstack/react-router"
import { formatDistanceToNowStrict } from "date-fns"
import { ArrowRightIcon } from "lucide-react"

import type {
  ArenaActivity,
  ArenaCall,
  ArenaPageModel,
} from "@/lib/arena/types"
import { cn } from "@/lib/utils"

import {
  ActivityRow,
  CallStatusBadge,
  CreatorAvatar,
  DirectionPill,
  SentimentBar,
  formatCallTimestamp,
  getCallChance,
  percentFormatter,
} from "./atoms"
import { CallActionDialog } from "./call-action-dialog"
import { LaunchCallDialog } from "./launch-call-dialog"

export interface ArenaPageProps {
  model: ArenaPageModel
}

export function Page({ model }: ArenaPageProps) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <CallsPanel calls={model.calls} />

          <ActivityPanel activity={model.activity} />
        </div>
      </section>
    </main>
  )
}

function CallsPanel({ calls }: { calls: ArenaCall[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Calls
        </h2>
        <LaunchCallDialog />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {calls.length > 0 ? (
          calls.map((call) => <CallCard call={call} key={call.id} />)
        ) : (
          <CallsEmptyState />
        )}
      </div>
    </div>
  )
}

function CallsEmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/50 bg-card/40 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">No active calls</p>
      <p className="max-w-xs text-xs leading-5 text-pretty text-muted-foreground">
        Launch a call to bond PLP on a market and let the arena back or fade it.
      </p>
    </div>
  )
}

function PanelEmpty({ message }: { message: string }) {
  return (
    <div className="px-2 py-10 text-center text-xs text-muted-foreground">
      {message}
    </div>
  )
}

function CallCard({ call }: { call: ArenaCall }) {
  const isActive = call.status === "active"
  const isUp = call.direction === "up"
  const showChance = isActive && call.fairUpProbability > 0

  return (
    <article
      className={cn(
        "group flex flex-col gap-3 rounded-lg border-l-2 bg-card p-4 ring-1 ring-transparent transition-[box-shadow] duration-150 hover:ring-border/50",
        isUp ? "border-l-outcome-up/70" : "border-l-outcome-down/70"
      )}
    >
      <Link
        className="flex flex-1 flex-col gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        params={{ callId: call.id }}
        to="/arena/$callId"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <CreatorAvatar seed={call.creatorAvatarSeed} />
            <span className="truncate text-xs font-medium text-foreground">
              {call.creatorHandle}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {percentFormatter.format(call.creatorWinRate)}
              </span>{" "}
              win
            </span>
          </div>
          <CallStatusBadge status={call.status} winState={call.winState} />
        </div>

        <div className="flex min-w-0 items-start gap-2">
          <DirectionPill direction={call.direction} />
          <div className="min-w-0 flex-1">
            <h3 className="min-w-0 text-sm leading-5 font-semibold text-balance text-foreground">
              {call.market}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
              {isActive
                ? `${formatDistanceToNowStrict(call.expiryMs)} left`
                : formatCallTimestamp(call.createdAt)}
            </p>
          </div>
        </div>

        {showChance ? (
          <div>
            <div className="font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
              {percentFormatter.format(getCallChance(call))}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">chance</div>
          </div>
        ) : null}

        <SentimentBar backers={call.backers} faders={call.faders} />
      </Link>

      {isActive ? (
        <div className="grid grid-cols-2 gap-2">
          <CallActionDialog call={call} mode="back" />
          <CallActionDialog call={call} mode="fade" />
        </div>
      ) : (
        <Link
          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-muted/30 text-xs font-medium text-muted-foreground transition-[background-color,color,scale] duration-150 hover:bg-muted/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none active:scale-[0.98]"
          params={{ callId: call.id }}
          to="/arena/$callId"
        >
          View result
          <ArrowRightIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      )}
    </article>
  )
}

function ActivityPanel({ activity }: { activity: ArenaActivity[] }) {
  return (
    <div className="flex h-[32rem] flex-col rounded-lg bg-card xl:sticky xl:top-[4.25rem]">
      <div className="shrink-0 border-b border-border/35 px-4 py-3">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Recent activity
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {activity.length > 0 ? (
          activity.map((item) => <ActivityRow item={item} key={item.id} />)
        ) : (
          <PanelEmpty message="No recent activity." />
        )}
      </div>
    </div>
  )
}
