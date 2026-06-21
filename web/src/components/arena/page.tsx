import { Link } from "@tanstack/react-router"
import { formatDistanceToNowStrict } from "date-fns"
import { ActivityIcon, TrophyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  ArenaActivity,
  ArenaCall,
  ArenaCreator,
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
  getWinRate,
  percentFormatter,
} from "./atoms"
import { CallActionDialog } from "./call-action-dialog"
import { LaunchCallDialog } from "./launch-call-dialog"
import { UsernameEditor } from "./username-editor"

export interface ArenaPageProps {
  model: ArenaPageModel
}

export function Page({ model }: ArenaPageProps) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <CallsPanel calls={model.calls} />

          <div className="grid gap-3">
            <TopCreatorsPanel creators={model.creators} />
            <ActivityPanel activity={model.activity} />
          </div>
        </div>
      </section>
    </main>
  )
}

function CallsPanel({ calls }: { calls: ArenaCall[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            Calls
          </h2>
          <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            {calls.length} calls
          </span>
        </div>
        <div className="flex items-center gap-2">
          <UsernameEditor />
          <LaunchCallDialog />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {calls.map((call) => (
          <CallCard call={call} key={call.id} />
        ))}
      </div>
    </div>
  )
}

function CallCard({ call }: { call: ArenaCall }) {
  return (
    <article className="flex flex-col gap-3 rounded-lg bg-card p-4 transition-transform duration-200 ease-out hover:-translate-y-0.5">
      <Link
        className="flex flex-col gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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

        <div>
          <div className="flex min-w-0 items-start gap-1.5">
            <DirectionArrow direction={call.direction} />
            <span className="min-w-0 text-sm font-semibold text-foreground">
              {call.market}
              {call.status === "active" ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  in {formatDistanceToNowStrict(call.expiryMs)}
                </span>
              ) : null}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {call.status === "active" && call.fairUpProbability > 0 ? (
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

      <div className="grid grid-cols-2 gap-2">
        {call.status === "active" ? (
          <>
            <CallActionDialog call={call} mode="back" />
            <CallActionDialog call={call} mode="fade" />
          </>
        ) : (
          <>
            <Button
              className="bg-primary/10 text-primary shadow-none"
              disabled
              size="sm"
              type="button"
              variant="ghost"
            >
              Back
            </Button>
            <Button
              className="bg-muted/40 text-foreground shadow-none"
              disabled
              size="sm"
              type="button"
              variant="ghost"
            >
              Fade
            </Button>
          </>
        )}
      </div>
    </article>
  )
}

function TopCreatorsPanel({ creators }: { creators: ArenaCreator[] }) {
  return (
    <div className="rounded-lg bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Top creators
        </h2>
        <TrophyIcon className="size-4 text-primary" />
      </div>
      <div className="px-2 py-2">
        {creators.map((creator, index) => (
          <CreatorRow creator={creator} key={creator.id} rank={index + 1} />
        ))}
      </div>
    </div>
  )
}

function CreatorRow({
  creator,
  rank,
}: {
  creator: ArenaCreator
  rank: number
}) {
  return (
    <Link
      className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-150 outline-none hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-primary/30"
      params={{ handle: creator.handle }}
      to="/arena/creator/$handle"
    >
      <span className="w-4 text-center font-mono text-xs text-muted-foreground tabular-nums">
        {rank}
      </span>
      <CreatorAvatar seed={creator.handle} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {creator.handle}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {creator.settledCount} settled · {formatPlp(creator.bondPlp)} bonded
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-medium text-foreground tabular-nums">
          {percentFormatter.format(getWinRate(creator))}
        </div>
        <div className="text-[10px] text-muted-foreground">win rate</div>
      </div>
    </Link>
  )
}

function ActivityPanel({ activity }: { activity: ArenaActivity[] }) {
  return (
    <div className="rounded-lg bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Recent activity
        </h2>
        <ActivityIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="px-2 py-2">
        {activity.map((item) => (
          <ActivityRow item={item} key={item.id} />
        ))}
      </div>
    </div>
  )
}
