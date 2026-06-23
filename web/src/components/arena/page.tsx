import { Link } from "@tanstack/react-router"
import { formatDistanceToNowStrict } from "date-fns"
import {
  ActivityIcon,
  ArrowRightIcon,
  MegaphoneIcon,
  TrophyIcon,
} from "lucide-react"

import type {
  ArenaActivity,
  ArenaCall,
  ArenaPageModel,
} from "@/lib/arena/types"

import {
  ActivityRow,
  CallStatusBadge,
  CreatorAvatar,
  DirectionArrow,
  SentimentBar,
  formatCallTimestamp,
  formatPlp,
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
    <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/50 bg-card/40 px-6 py-16 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
        <MegaphoneIcon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">No active calls</p>
        <p className="max-w-xs text-xs leading-5 text-pretty text-muted-foreground">
          Launch a call to bond PLP on a market and let the arena back or fade it.
        </p>
      </div>
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

  return (
    <article className="group flex flex-col gap-3 rounded-xl bg-card p-4 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg">
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
            <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
              <TrophyIcon className="size-3 text-primary/70" />
              <span className="font-medium text-foreground tabular-nums">
                {percentFormatter.format(call.creatorWinRate)}
              </span>
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              · {formatCallTimestamp(call.createdAt)}
            </span>
          </div>
          <CallStatusBadge status={call.status} winState={call.winState} />
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex min-w-0 items-start gap-2">
            <DirectionArrow direction={call.direction} />
            <h3 className="min-w-0 text-sm leading-5 font-semibold text-balance text-foreground">
              {call.market}
              {isActive ? (
                <span className=" text-muted-foreground">
                  {" "}
                  · {formatDistanceToNowStrict(call.expiryMs)} left
                </span>
              ) : null}
            </h3>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {isActive && call.fairUpProbability > 0 ? (
              <>
                <span>
                  <span className="font-medium text-foreground tabular-nums">
                    {percentFormatter.format(getCallChance(call))}
                  </span>{" "}
                  chance
                </span>
                <span aria-hidden="true" className="text-muted-foreground/40">
                  ·
                </span>
              </>
            ) : null}
            <span>
              <span className="font-medium text-foreground tabular-nums">
                {formatPlp(call.bondPlp)}
              </span>{" "}
              bonded
            </span>
          </div>
        </div>

        <SentimentBar backers={call.backers} faders={call.faders} />
      </Link>

      {isActive ? (
        <div className="grid grid-cols-2 gap-2">
          <CallActionDialog call={call} mode="back" />
          <CallActionDialog call={call} mode="fade" />
        </div>
      ) : (
        <Link
          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-muted/30 text-xs font-medium text-muted-foreground transition-[background-color,color] duration-150 hover:bg-muted/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
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
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Recent activity
        </h2>
        <ActivityIcon className="size-4 text-muted-foreground" />
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
