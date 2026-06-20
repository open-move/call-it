import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatSignedDusdc } from "@/lib/portfolio/format"
import { DusdcValue, SignedDusdcValue } from "@/lib/portfolio/format"
import { getPnlClassName } from "@/lib/portfolio/helpers"
import type { PortfolioSummary } from "@/lib/portfolio/helpers"
import { cn } from "@/lib/utils"

function Metric({
  label,
  tone = "default",
  value,
}: {
  label: string
  tone?: "default" | "muted" | "up" | "down"
  value: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/25 px-2.5 py-2">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-sm font-medium",
          tone === "default" && "text-foreground",
          tone === "muted" && "text-muted-foreground",
          tone === "up" && "text-outcome-up",
          tone === "down" && "text-outcome-down"
        )}
      >
        {value}
      </div>
    </div>
  )
}

export function AccountCard({
  deployedDusdc,
  summary,
  onOpenDeposit,
  onOpenWithdraw,
}: {
  deployedDusdc: number
  summary: PortfolioSummary
  onOpenDeposit: () => void
  onOpenWithdraw: () => void
}) {
  return (
    <Card className="gap-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="border-b border-border/45 px-4 py-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Portfolio
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4">
        <div>
          <div className="truncate text-xs text-muted-foreground">
            Net Value
          </div>
          <div>
            <DusdcValue
              className="mt-1 text-2xl font-medium tracking-tight text-foreground"
              value={summary.portfolioValueUsd}
            />
            <div
              className={cn(
                "mt-1 flex items-baseline gap-1.5 text-xs",
                getPnlClassName(summary.unrealizedPnlUsd)
              )}
            >
              <SignedDusdcValue value={summary.unrealizedPnlUsd} />
              <span className="text-muted-foreground">unrealized</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Available DUSDC"
            value={<DusdcValue value={summary.availableDusdc} />}
          />
          <Metric
            label="Deployed DUSDC"
            value={<DusdcValue value={deployedDusdc} />}
          />
          <Metric
            label="PLP Value"
            value={<DusdcValue value={summary.plpValueUsd} />}
          />
          <Metric
            label="Realized PnL"
            tone={
              summary.realizedPnlUsd === 0
                ? "muted"
                : summary.realizedPnlUsd > 0
                  ? "up"
                  : "down"
            }
            value={<SignedDusdcValue value={summary.realizedPnlUsd} />}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            className="h-auto min-h-9 py-2 text-center leading-5 whitespace-normal"
            type="button"
            onClick={onOpenDeposit}
          >
            Deposit
          </Button>
          <Button
            className="h-auto min-h-9 py-2 text-center leading-5 whitespace-normal"
            type="button"
            variant="secondary"
            onClick={onOpenWithdraw}
          >
            Withdraw
          </Button>
        </div>
      </div>
    </Card>
  )
}
