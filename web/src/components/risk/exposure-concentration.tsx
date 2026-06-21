import { formatDusdc } from "@/lib/risk/helpers"
import type { RiskExposureRow } from "@/lib/risk/types"
import { cn } from "@/lib/utils"

export function ExposureConcentration({ rows }: { rows: RiskExposureRow[] }) {
  const top = [...rows]
    .sort((first, second) => second.maxPayoutUsd - first.maxPayoutUsd)
    .slice(0, 6)
  const max = top[0]?.maxPayoutUsd ?? 0

  if (top.length === 0) {
    return null
  }

  return (
    <div className="border-t border-border/45 px-4 py-4">
      <div className="text-xs text-muted-foreground">
        Where risk concentrates · open max payout by market
      </div>
      <div className="mt-3 space-y-2">
        {top.map((row) => (
          <div className="flex items-center gap-3" key={row.id}>
            <div className="w-36 shrink-0 truncate text-xs text-foreground sm:w-44">
              {row.assetSymbol}{" "}
              <span className="text-muted-foreground">
                {row.settlementLabel}
              </span>
            </div>
            <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/40">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  row.kind === "range" ? "bg-chart-3" : "bg-primary"
                )}
                style={{
                  width: `${max > 0 ? (row.maxPayoutUsd / max) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="w-24 shrink-0 text-right font-mono text-xs font-medium text-foreground tabular-nums">
              {formatDusdc(row.maxPayoutUsd, 0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
