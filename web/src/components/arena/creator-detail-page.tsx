import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import type { ArenaCall, ArenaCreator } from "@/lib/arena/types"

import {
  CallStatusBadge,
  CreatorAvatar,
  DetailStat,
  DirectionArrow,
  formatPlp,
  getCallChance,
  getWinRate,
  percentFormatter,
} from "./atoms"

export function CreatorDetailPage({
  calls,
  creator,
}: {
  calls: ArenaCall[]
  creator: ArenaCreator
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          to="/arena"
        >
          <ArrowLeftIcon className="size-3.5" />
          Arena
        </Link>

        <div className="rounded-lg bg-card p-5">
          <div className="flex items-center gap-3">
            <CreatorAvatar className="size-12 text-sm" seed={creator.handle} />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold tracking-tight text-foreground">
                {creator.handle}
              </div>
              <div className="text-xs text-muted-foreground">Creator</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border/35 pt-4 sm:grid-cols-4">
            <DetailStat
              label="Win rate"
              value={percentFormatter.format(getWinRate(creator))}
            />
            <DetailStat label="Settled" value={creator.settledCount.toString()} />
            <DetailStat label="Calls" value={creator.callCount.toString()} />
            <DetailStat label="Bonded" value={formatPlp(creator.bondPlp)} />
          </div>
        </div>

        <div className="rounded-lg bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
            <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              Calls
            </h2>
            <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              {calls.length}
            </span>
          </div>
          <div className="px-2 py-2">
            {calls.length > 0 ? (
              calls.map((call) => (
                <Link
                  className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-150 outline-none hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-primary/30"
                  key={call.id}
                  params={{ callId: call.id }}
                  to="/arena/$callId"
                >
                  <DirectionArrow className="mt-0 size-4" direction={call.direction} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {call.market}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      <span className="font-medium text-foreground tabular-nums">
                        {percentFormatter.format(getCallChance(call))}
                      </span>{" "}
                      chance ·{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatPlp(call.bondPlp)}
                      </span>{" "}
                      bonded
                    </div>
                  </div>
                  <CallStatusBadge status={call.status} winState={call.winState} />
                </Link>
              ))
            ) : (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No calls yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
