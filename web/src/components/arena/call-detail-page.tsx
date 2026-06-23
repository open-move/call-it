import { Link } from "@tanstack/react-router"
import { formatDistanceToNowStrict } from "date-fns"
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react"

import type { ArenaActivity, ArenaCall, ArenaCreator } from "@/lib/arena/types"
import { cn } from "@/lib/utils"

import { CallActionDialog } from "./call-action-dialog"
import { SettlementActions } from "./settlement-actions"
import {
  ActivityRow,
  CallStatusBadge,
  CreatorAvatar,
  DetailStat,
  DirectionPill,
  SentimentBar,
  formatCallTimestamp,
  formatMarketLabel,
  formatPlp,
  getCallChance,
  getWinRate,
  percentFormatter,
} from "./atoms"

// Compact creator track-record card. The call's creator identity already shows
// in the call header, so this is the deduped "who's behind it" link to the
// full profile.
function CreatorTrackRecord({ creator }: { creator: ArenaCreator }) {
  return (
    <Link
      className="block rounded-lg bg-card p-4 ring-1 ring-transparent transition-[box-shadow] duration-150 outline-none hover:ring-border/50 focus-visible:ring-2 focus-visible:ring-primary/40"
      params={{ handle: creator.handle }}
      to="/arena/creator/$handle"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Creator track record
        </span>
        <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DetailStat
          label="Win rate"
          value={percentFormatter.format(getWinRate(creator))}
        />
        <DetailStat label="Settled" value={creator.settledCount.toString()} />
        <DetailStat label="Calls" value={creator.callCount.toString()} />
        <DetailStat label="Bonded" value={formatPlp(creator.bondPlp)} />
      </div>
    </Link>
  )
}

export function CallDetailPage({
  activity,
  call,
  creator,
}: {
  activity: ArenaActivity[]
  call: ArenaCall
  creator?: ArenaCreator
}) {
  const isActive = call.status === "active"
  const isUp = call.direction === "up"
  const showChance = isActive && call.fairUpProbability > 0

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          to="/arena"
        >
          <ArrowLeftIcon className="size-3.5" />
          All calls
        </Link>

        {/* The call: claim, odds, crowd, and (when live) the move. */}
        <section
          className={cn(
            "space-y-5 rounded-lg border-l-2 bg-card p-5",
            isUp ? "border-l-outcome-up/70" : "border-l-outcome-down/70"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <CreatorAvatar seed={call.creatorAvatarSeed} />
              <span className="truncate font-medium text-foreground">
                {call.creatorHandle}
              </span>
              <span className="shrink-0 text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {percentFormatter.format(call.creatorWinRate)}
                </span>{" "}
                win · {formatCallTimestamp(call.createdAt)}
              </span>
            </div>
            <CallStatusBadge status={call.status} winState={call.winState} />
          </div>

          <div className="space-y-2">
            <DirectionPill direction={call.direction} />
            <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance text-foreground">
              {formatMarketLabel(call.market)}
            </h1>
          </div>

          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            {showChance ? (
              <div>
                <div className="font-mono text-3xl leading-none font-semibold tracking-tight text-foreground tabular-nums">
                  {percentFormatter.format(getCallChance(call))}
                </div>
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  implied chance
                </div>
              </div>
            ) : null}
            <DetailStat label="Creator bond" value={formatPlp(call.bondPlp)} />
            {isActive ? (
              <DetailStat
                label="Time left"
                value={formatDistanceToNowStrict(call.expiryMs)}
              />
            ) : null}
          </div>

          <div className="space-y-3 border-t border-border/35 pt-4">
            <SentimentBar backers={call.backers} faders={call.faders} />
            {isActive ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <CallActionDialog call={call} mode="back" />
                  <CallActionDialog call={call} mode="fade" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  No borrowing. No liquidation.
                </p>
              </>
            ) : null}
          </div>
        </section>

        {/* Claim bond / payout — only renders for the creator or a winner. */}
        <SettlementActions call={call} />

        {creator ? <CreatorTrackRecord creator={creator} /> : null}

        <div className="rounded-lg bg-card">
          <div className="border-b border-border/35 px-4 py-3">
            <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              Activity
            </h2>
          </div>
          <div className="px-2 py-2">
            {activity.length > 0 ? (
              activity.map((item) => <ActivityRow item={item} key={item.id} />)
            ) : (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No activity yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
