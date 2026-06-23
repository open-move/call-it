import { DataRow } from "@/components/primitives/data-row"
import { Card, CardContent } from "@/components/ui/card"
import { formatQuoteAmount, formatSharePrice } from "@/lib/risk/helpers"
import type { RiskModel } from "@/lib/risk/types"

export function AuditTape({ model }: { model: RiskModel }) {
  const summary = model.summary
  const accountingRows = [
    {
      label: "Strategy balance",
      value: formatQuoteAmount(summary.vault_balance),
    },
    { label: "Total MTM", value: formatQuoteAmount(summary.total_mtm) },
    {
      label: "Available liquidity",
      value: formatQuoteAmount(summary.available_liquidity),
    },
    { label: "PLP price", value: formatSharePrice(summary.plp_share_price) },
    {
      label: "PLP supply",
      value: formatQuoteAmount(summary.plp_total_supply, "PLP"),
    },
    {
      label: "Total supplied",
      value: formatQuoteAmount(summary.total_supplied),
    },
    {
      label: "Total withdrawn",
      value: formatQuoteAmount(summary.total_withdrawn),
    },
    { label: "Net deposits", value: formatQuoteAmount(summary.net_deposits) },
  ]

  return (
    <Card className="rounded-lg border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-3">
          <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            Audit tape
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
            The strategy accounting and the assumptions behind every number above.
          </p>
        </div>

        <div className="grid border-t border-border/45 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="border-b border-border/45 px-4 py-3 lg:border-r lg:border-b-0">
            <div className="mb-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Accounting
            </div>
            {accountingRows.map((row) => (
              <DataRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
          <div className="px-4 py-3">
            <div className="mb-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Assumptions
            </div>
            <div className="divide-y divide-border/30">
              {model.assumptions.map((assumption) => (
                <div
                  className="py-2 text-xs leading-5 text-muted-foreground first:pt-0 last:pb-0"
                  key={assumption}
                >
                  {assumption}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
