import { ArrowUpRightIcon } from "lucide-react"

import { Badge } from "@/components/primitives/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatRelativeTime } from "@/lib/format"
import {
  formatDusdc,
  isOnChainDigest,
  suivisionTxUrl,
  truncateMiddle,
  txStatusMeta,
} from "@/lib/keeper/helpers"
import type { KeeperTx } from "@/services/keeper-client"

const COLUMNS = "grid-cols-[7rem_minmax(9rem,1fr)_7rem_8rem_7rem_6rem]"

function sideFromKey(positionKey: string): string {
  const side = positionKey.split("|").at(-1)
  return side === "up" ? "Up" : side === "down" ? "Down" : "—"
}

function RedemptionRow({ tx }: { tx: KeeperTx }) {
  const meta = txStatusMeta(tx.status)
  const onChain = isOnChainDigest(tx.digest)

  return (
    <div className={`grid ${COLUMNS} gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0`}>
      <span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </span>
      <div className="min-w-0">
        <div className="truncate font-mono font-medium text-foreground">
          {sideFromKey(tx.positionKey)}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {truncateMiddle(tx.oracleId)}
        </div>
      </div>
      <span className="truncate text-right font-mono text-muted-foreground tabular-nums">
        {formatDusdc(tx.quantity)}
      </span>
      <span className="truncate text-right font-mono text-foreground tabular-nums">
        {formatDusdc(tx.expectedPayout)}
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

export function RedemptionsLedger({ txs }: { txs: KeeperTx[] }) {
  return (
    <Card className="overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            Redemptions
          </div>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase tabular-nums">
            {txs.length.toLocaleString("en-US")} attempts
          </div>
        </div>
        <div className="overflow-auto border-t border-border/45">
          <div className="min-w-[48rem]">
            <div className={`grid ${COLUMNS} gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase`}>
              <span>Status</span>
              <span>Market</span>
              <span className="text-right">Quantity</span>
              <span className="text-right">Payout</span>
              <span className="text-right">Tx</span>
              <span className="text-right">When</span>
            </div>
            {txs.length > 0 ? (
              txs.map((tx) => <RedemptionRow key={tx.digest} tx={tx} />)
            ) : (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No redemptions yet. The keeper records one here each time it
                redeems a settled position.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
