import { Link } from "@tanstack/react-router"
import { formatDistanceToNowStrict } from "date-fns"
import { ActivityIcon, ArrowLeftIcon, TrophyIcon } from "lucide-react"
import { useState } from "react"

import { TicketRow, TicketSection } from "@/components/shared/ticket/ticket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ArenaActivity, ArenaCall, ArenaCreator } from "@/lib/arena/types"
import { cn } from "@/lib/utils"

import { CallActionDialog } from "./call-action-dialog"
import { SettlementActions } from "./settlement-actions"
import {
  ActivityRow,
  CallStatusBadge,
  CreatorAvatar,
  DetailStat,
  DirectionArrow,
  SentimentBar,
  formatCallTimestamp,
  formatDusdc,
  formatPlp,
  getCallChance,
  getWinRate,
  oppositeMarket,
  percentFormatter,
} from "./atoms"

function CallActionPanel({ call }: { call: ArenaCall }) {
  const [mode, setMode] = useState<"back" | "fade">("back")
  const [amount, setAmount] = useState("")

  if (call.status !== "active") {
    return (
      <div className="rounded-lg bg-card p-4 text-sm text-muted-foreground">
        Settled. Backing and fading are closed.
      </div>
    )
  }

  const isBack = mode === "back"
  const backPrice = getCallChance(call)
  const price = isBack ? backPrice : 1 - backPrice
  const market = isBack ? call.market : oppositeMarket(call.market)
  const quantity = Number(amount)
  const hasQuantity =
    amount.trim() !== "" && !Number.isNaN(quantity) && quantity > 0
  const premium = price * quantity
  const potentialProfit = quantity - premium
  const previewValue = (value: number) =>
    hasQuantity ? formatDusdc(value) : "—"

  return (
    <div className="space-y-3 rounded-lg bg-card p-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          aria-pressed={isBack}
          className={cn(
            "shadow-none",
            isBack
              ? "bg-primary/10 text-primary hover:bg-primary/15"
              : "bg-muted/25 text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setMode("back")}
          size="sm"
          type="button"
          variant="ghost"
        >
          Back
        </Button>
        <Button
          aria-pressed={!isBack}
          className={cn(
            "shadow-none",
            isBack
              ? "bg-muted/25 text-muted-foreground hover:text-foreground"
              : "bg-muted/55 text-foreground"
          )}
          onClick={() => setMode("fade")}
          size="sm"
          type="button"
          variant="ghost"
        >
          Fade
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {isBack ? "Taking" : "Against"}{" "}
        <span className="font-medium text-foreground">{market}</span> ·{" "}
        <span className="font-medium text-foreground tabular-nums">
          {percentFormatter.format(price)}
        </span>{" "}
        chance
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Contracts
        </span>
        <div className="relative">
          <Input
            className="border-border/35 bg-muted/25 pr-20 font-mono text-sm shadow-none ring-0 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            value={amount}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            Contracts
          </span>
        </div>
      </label>

      <TicketSection>
        <TicketRow label="Price" value={formatDusdc(price)} />
        <TicketRow label="Premium" value={previewValue(premium)} />
        <TicketRow label="Max loss" value={previewValue(premium)} />
        <TicketRow
          label="Potential profit"
          value={previewValue(potentialProfit)}
        />
      </TicketSection>

      <div className="grid grid-cols-2 gap-2">
        <CallActionDialog call={call} mode="back" />
        <CallActionDialog call={call} mode="fade" />
      </div>
    </div>
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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          to="/arena"
        >
          <ArrowLeftIcon className="size-3.5" />
          All calls
        </Link>

        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-3">
            <div className="space-y-4 rounded-lg bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <CreatorAvatar
                    className="size-8 text-xs"
                    seed={call.creatorAvatarSeed}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {call.creatorHandle}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                        <TrophyIcon className="size-3 text-primary/70" />
                        <span className="font-medium text-foreground tabular-nums">
                          {percentFormatter.format(call.creatorWinRate)}
                        </span>
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatCallTimestamp(call.createdAt)}
                    </div>
                  </div>
                </div>
                <CallStatusBadge status={call.status} winState={call.winState} />
              </div>

              <div className="flex items-start gap-2">
                <DirectionArrow
                  className="mt-1 size-5"
                  direction={call.direction}
                />
                <h1 className="text-lg leading-snug font-semibold tracking-tight text-balance text-foreground sm:text-xl">
                  {call.market}
                  {isActive ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      in {formatDistanceToNowStrict(call.expiryMs)}
                    </span>
                  ) : null}
                </h1>
              </div>

              <div className="grid grid-cols-3 gap-3 border-y border-border/35 py-3">
                <DetailStat
                  label="Chance"
                  value={percentFormatter.format(getCallChance(call))}
                />
                <DetailStat label="Strike" value={`$${call.strikeUsd.toLocaleString("en-US")}`} />
                <DetailStat label="Creator bond" value={formatPlp(call.bondPlp)} />
              </div>

              <SentimentBar backers={call.backers} faders={call.faders} />
            </div>

            {creator ? (
              <div className="rounded-lg bg-card p-4">
                <Link
                  className="mb-3 flex items-center gap-2.5 rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/30"
                  params={{ handle: creator.handle }}
                  to="/arena/creator/$handle"
                >
                  <CreatorAvatar
                    className="size-7 text-xs"
                    seed={creator.handle}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {creator.handle}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Creator track record
                    </div>
                  </div>
                </Link>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <DetailStat
                    label="Win rate"
                    value={percentFormatter.format(getWinRate(creator))}
                  />
                  <DetailStat
                    label="Settled"
                    value={creator.settledCount.toString()}
                  />
                  <DetailStat
                    label="Calls"
                    value={creator.callCount.toString()}
                  />
                  <DetailStat label="Bonded" value={formatPlp(creator.bondPlp)} />
                </div>
              </div>
            ) : null}

            <div className="rounded-lg bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
                <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
                  Activity
                </h2>
                <ActivityIcon className="size-4 text-muted-foreground" />
              </div>
              <div className="px-2 py-2">
                {activity.length > 0 ? (
                  activity.map((item) => (
                    <ActivityRow item={item} key={item.id} />
                  ))
                ) : (
                  <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                    No activity yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-3 lg:sticky lg:top-[4.25rem]">
            <CallActionPanel call={call} />
            <SettlementActions call={call} />
          </aside>
        </div>
      </div>
    </main>
  )
}
