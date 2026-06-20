import { Badge, BadgeTone } from "@/components/primitives/badge"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/format"
import { exportRiskReport } from "@/lib/risk/helpers"
import type { RiskModel } from "@/lib/risk/types"

export function RiskHeader({ model }: { model: RiskModel }) {
  return (
    <div className="rounded-lg bg-card px-4 py-3 shadow-none ring-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              Risk console
            </h1>
            <Badge className="px-2 py-0.5 text-[10px]" tone={BadgeTone.Warning}>
              Model output
            </Badge>
            <Badge className="px-2 py-0.5 text-[10px]" tone={BadgeTone.Neutral}>
              Public data
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
            PLP liability cockpit for scenario shocks, max payout pressure, and
            reconstructed Predict exposure.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase tabular-nums">
            <span>Updated {formatRelativeTime(model.latestUpdatedAtMs)}</span>
            <span>
              Reconstruction{" "}
              {model.hasIncompleteReconstruction ? "partial" : "complete"}
            </span>
          </div>
        </div>

        <Button
          className="w-full sm:w-auto"
          onClick={() => exportRiskReport(model)}
          size="sm"
          type="button"
          variant="outline"
        >
          Export Risk Report
        </Button>
      </div>
    </div>
  )
}
