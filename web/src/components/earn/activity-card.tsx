import { ArrowUpRightIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/format"
import { formatQuoteAmount, formatAddress } from "@/lib/earn/format"
import { getAccountUrl, getTransactionUrl } from "@/lib/earn/activity"
import type { LpActivity } from "@/lib/earn/activity"
import { cn } from "@/lib/utils"

export function ActivityCard({ activity }: { activity: LpActivity[] }) {
  const pageSize = 10
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(activity.length / pageSize))
  const pageStart = page * pageSize
  const visibleActivity = activity.slice(pageStart, pageStart + pageSize)

  useEffect(() => {
    setPage(0)
  }, [activity.length])

  return (
    <div className="rounded-lg bg-card">
      <div className="px-3 py-2.5">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Liquidity activity
        </h2>
      </div>
      <div>
        <div className="hidden border-b border-border/40 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[0.9fr_0.65fr_0.9fr_1fr_1fr_0.7fr]">
          <div>Tx</div>
          <div>Type</div>
          <div>Account</div>
          <div className="text-right">DUSDC</div>
          <div className="text-right">PLP</div>
          <div className="text-right">Time</div>
        </div>
        <div className="divide-y divide-border/25">
          {activity.length > 0 ? (
            visibleActivity.map((event) => (
              <div
                className="grid gap-1.5 px-3 py-2 text-xs md:grid-cols-[0.9fr_0.65fr_0.9fr_1fr_1fr_0.7fr] md:items-center md:gap-0"
                key={event.id}
              >
                <LabeledActivityLink
                  align="left"
                  href={getTransactionUrl(event.transactionDigest)}
                  label="Tx"
                  value={formatAddress(event.transactionDigest)}
                />
                <div className="flex items-center justify-between gap-3 md:block">
                  <span
                    className={cn(
                      "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium",
                      event.type === "Supply"
                        ? "bg-outcome-up/10 text-outcome-up"
                        : "bg-outcome-down/10 text-outcome-down"
                    )}
                  >
                    {event.type}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground md:hidden">
                    {formatRelativeTime(event.timestampMs)}
                  </span>
                </div>
                <LabeledActivityLink
                  align="left"
                  href={getAccountUrl(event.account)}
                  label="Account"
                  value={formatAddress(event.account)}
                />
                <LabeledActivityValue
                  label="DUSDC"
                  value={formatQuoteAmount(event.amount)}
                />
                <LabeledActivityValue
                  label="PLP"
                  value={formatQuoteAmount(event.shares, "PLP")}
                />
                <div className="hidden font-mono text-xs text-muted-foreground md:block md:text-right">
                  {formatRelativeTime(event.timestampMs)}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No strategy activity yet.
            </div>
          )}
        </div>
        {activity.length > pageSize && (
          <div className="flex items-center justify-between border-t border-border/40 px-3 py-2">
            <Button
              disabled={page === 0}
              onClick={() =>
                setPage((currentPage) => Math.max(0, currentPage - 1))
              }
              size="xs"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
              Page {page + 1} / {pageCount}
            </div>
            <Button
              disabled={page >= pageCount - 1}
              onClick={() =>
                setPage((currentPage) =>
                  Math.min(pageCount - 1, currentPage + 1)
                )
              }
              size="xs"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function LabeledActivityValue({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-xs text-foreground tabular-nums md:block md:text-right">
      <span className="text-muted-foreground md:hidden">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function LabeledActivityLink({
  align = "right",
  href,
  label,
  value,
}: {
  align?: "left" | "right"
  href: string
  label: string
  value: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 font-mono text-xs tabular-nums md:block",
        align === "right" ? "md:text-right" : "md:text-left"
      )}
    >
      <span className="text-muted-foreground md:hidden">{label}</span>
      <a
        className="inline-flex min-w-0 items-center gap-1 text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none active:scale-[0.98]"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        <span className="truncate">{value}</span>
        <ArrowUpRightIcon className="size-3 shrink-0" />
      </a>
    </div>
  )
}
