import { ArrowUpRightIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { formatRelativeTime } from "@/lib/format"
import {
  formatDusdc,
  isOnChainDigest,
  suivisionTxUrl,
  truncateMiddle,
  txStatusMeta,
} from "@/lib/keeper/helpers"
import { fetchKeeperTxs, type KeeperTx } from "@/services/keeper-client"

import {
  KEEPER_PAGE_SIZE,
  Pager,
  StatusDot,
  StatusFilter,
} from "./table-controls"

const COLUMNS = "grid-cols-[4.5rem_minmax(0,1fr)_5.5rem_5rem_4.5rem]"

// Fixed keeper tx statuses, used as server-side filter values.
const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: txStatusMeta("succeeded").label, value: "succeeded" },
  { label: txStatusMeta("submitted").label, value: "submitted" },
  { label: txStatusMeta("sim_failed").label, value: "sim_failed" },
  { label: txStatusMeta("failed").label, value: "failed" },
  { label: txStatusMeta("dry_run").label, value: "dry_run" },
]

function sideFromKey(positionKey: string): string {
  const side = positionKey.split("|").at(-1)
  return side === "up" ? "Up" : side === "down" ? "Down" : "—"
}

function RedemptionRow({ tx }: { tx: KeeperTx }) {
  const meta = txStatusMeta(tx.status)
  const onChain = isOnChainDigest(tx.digest)

  return (
    <div
      className={`grid ${COLUMNS} items-center gap-3 border-b border-border/35 px-3 py-1.5 text-xs transition-colors last:border-b-0 hover:bg-muted/20`}
    >
      <span className="min-w-0">
        <StatusDot tone={meta.tone}>{meta.label}</StatusDot>
      </span>
      <div className="min-w-0">
        <div className="truncate font-mono font-medium text-foreground">
          {sideFromKey(tx.positionKey)}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {truncateMiddle(tx.oracleId)}
        </div>
      </div>
      <span className="truncate text-right font-mono text-foreground tabular-nums">
        {formatDusdc(tx.expectedPayout, false)}
      </span>
      <span className="truncate text-right font-mono text-muted-foreground tabular-nums">
        {onChain ? (
          <a
            className="group inline-flex items-center gap-1 underline-offset-4 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            href={suivisionTxUrl(tx.digest)}
            rel="noreferrer"
            target="_blank"
          >
            <span className="truncate">{truncateMiddle(tx.digest, 4, 4)}</span>
            <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </a>
        ) : (
          "local"
        )}
      </span>
      <span className="truncate text-right font-mono text-muted-foreground tabular-nums">
        {formatRelativeTime(tx.createdAt)}
      </span>
    </div>
  )
}

export function RedemptionsLedger({
  refreshSignal = 0,
}: {
  refreshSignal?: number
}) {
  const [status, setStatus] = useState("all")
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<KeeperTx[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<"error" | "loading" | "ready">("loading")
  // Keep current rows visible through refetches so polling doesn't flicker.
  const hasData = useRef(false)

  useEffect(() => {
    let stale = false
    if (!hasData.current) {
      setState("loading")
    }
    fetchKeeperTxs({ page, pageSize: KEEPER_PAGE_SIZE, status })
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
          Redemptions
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
      <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
        <CardContent className="p-0">
          <div
            className={`grid ${COLUMNS} gap-3 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase`}
          >
            <span>Status</span>
            <span>Market</span>
            <span className="text-right">Payout</span>
            <span className="text-right">Tx</span>
            <span className="text-right">When</span>
          </div>
          {state === "error" ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Keeper API unreachable.
            </div>
          ) : state === "loading" ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Loading redemptions…
            </div>
          ) : rows.length > 0 ? (
            rows.map((tx) => <RedemptionRow key={tx.digest} tx={tx} />)
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {status === "all"
                ? "No redemptions yet."
                : "No redemptions match this filter."}
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
