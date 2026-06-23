import { ArrowUpRightIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { BadgeTone } from "@/components/primitives/badge"
import { Card, CardContent } from "@/components/ui/card"
import { PREDICT_PRICE_SCALE } from "@/lib/config"
import {
  formatCount,
  formatDusdc,
  sideLabel,
  suivisionObjectUrl,
  truncateMiddle,
} from "@/lib/keeper/helpers"
import {
  fetchKeeperPositions,
  type KeeperPosition,
} from "@/services/keeper-client"

import { Pager } from "@/components/primitives/pager"

import { KEEPER_PAGE_SIZE, StatusDot, StatusFilter } from "./table-controls"

const COLUMNS = "grid-cols-[minmax(0,1fr)_5rem_4.5rem]"

const STATUS_OPTIONS = [
  { label: "All states", value: "all" },
  { label: "Open", value: "open" },
  { label: "Settled", value: "settled" },
  { label: "Redeemable", value: "redeemable" },
]

function formatPrice(scaled: string | null): string {
  if (scaled === null) {
    return "--"
  }
  return formatCount(Math.round(Number(scaled) / PREDICT_PRICE_SCALE))
}

function PositionRow({ position }: { position: KeeperPosition }) {
  return (
    <div
      className={`grid ${COLUMNS} items-center gap-3 border-b border-border/35 px-3 py-1.5 text-xs transition-colors last:border-b-0 hover:bg-muted/20`}
    >
      <div className="min-w-0">
        <div className="truncate font-mono font-medium text-foreground">
          {sideLabel(position.isUp)} · {formatPrice(position.strike)}
        </div>
        <a
          className="group mt-0.5 inline-flex max-w-full items-center gap-1 underline-offset-4 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          href={suivisionObjectUrl(position.oracleId)}
          rel="noreferrer"
          target="_blank"
        >
          <span className="truncate font-mono text-[10px] text-muted-foreground transition-colors group-hover:text-primary">
            {truncateMiddle(position.oracleId)}
          </span>
          <ArrowUpRightIcon className="size-2.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </a>
      </div>
      <span className="truncate text-right font-mono text-foreground tabular-nums">
        {formatDusdc(position.openQty, false)}
      </span>
      <span className="flex min-w-0 justify-end">
        <StatusDot tone={position.settled ? BadgeTone.Live : BadgeTone.Neutral}>
          {position.settled ? "Settled" : "Open"}
        </StatusDot>
      </span>
    </div>
  )
}

export function PositionsTable({
  refreshSignal = 0,
}: {
  refreshSignal?: number
}) {
  const [status, setStatus] = useState("all")
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<KeeperPosition[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<"error" | "loading" | "ready">("loading")
  // Once we have data, keep showing it through refetches (stale-while-revalidate)
  // so polling doesn't blank the table every interval.
  const hasData = useRef(false)

  useEffect(() => {
    let stale = false
    if (!hasData.current) {
      setState("loading")
    }
    fetchKeeperPositions({ page, pageSize: KEEPER_PAGE_SIZE, status })
      .then((result) => {
        if (stale) {
          return
        }
        setRows(result.rows)
        setTotal(result.total)
        hasData.current = true
        setState("ready")
      })
      .catch(() => {
        if (!stale && !hasData.current) {
          setState("error")
        }
      })
    return () => {
      stale = true
    }
  }, [page, status, refreshSignal])

  const pageCount = Math.max(1, Math.ceil(total / KEEPER_PAGE_SIZE))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Tracked positions
        </div>
        <StatusFilter
          onChange={(next) => {
            setStatus(next)
            setPage(0)
          }}
          options={STATUS_OPTIONS}
          value={status}
        />
      </div>
      <Card className="overflow-hidden rounded-lg border-0 bg-card py-0 shadow-none ring-0">
        <CardContent className="p-0">
          <div
            className={`grid ${COLUMNS} gap-3 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase`}
          >
            <span>Market</span>
            <span className="text-right">Open</span>
            <span className="text-right">State</span>
          </div>
          {state === "error" ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Keeper API unreachable.
            </div>
          ) : state === "loading" ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Loading positions…
            </div>
          ) : rows.length > 0 ? (
            rows.map((position) => (
              <PositionRow key={position.key} position={position} />
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {status === "all"
                ? "No positions indexed yet."
                : "No positions match this filter."}
            </div>
          )}
          {state === "ready" ? (
            <Pager
              onPage={setPage}
              page={page}
              pageCount={pageCount}
              pageSize={KEEPER_PAGE_SIZE}
              total={total}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
