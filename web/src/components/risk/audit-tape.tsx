import { Card, CardContent } from "@/components/ui/card"
import {
  formatQuoteAmount,
  formatSharePrice,
} from "@/lib/risk/helpers"
import type { RiskModel } from "@/lib/risk/types"
import { ReadoutRow } from "./scenario-readout"

export function AuditTape({ model }: { model: RiskModel }) {
  const summary = model.summary
  const accountingRows = [
    { label: "Vault Balance", value: formatQuoteAmount(summary.vault_balance) },
    { label: "Total MTM", value: formatQuoteAmount(summary.total_mtm) },
    {
      label: "Available Liquidity",
      value: formatQuoteAmount(summary.available_liquidity),
    },
    { label: "PLP Price", value: formatSharePrice(summary.plp_share_price) },
    {
      label: "PLP Supply",
      value: formatQuoteAmount(summary.plp_total_supply, "PLP"),
    },
    {
      label: "Total Supplied",
      value: formatQuoteAmount(summary.total_supplied),
    },
    {
      label: "Total Withdrawn",
      value: formatQuoteAmount(summary.total_withdrawn),
    },
    { label: "Net Deposits", value: formatQuoteAmount(summary.net_deposits) },
  ]

  return (
    <Card className="rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-3">
          <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
            Audit Tape
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
            Raw vault accounting and model assumptions used by this console.
          </p>
        </div>

        <div className="grid border-t border-border/45 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="border-b border-border/45 px-4 py-3 lg:border-r lg:border-b-0">
            <div className="space-y-2 rounded-md border border-border/35 bg-muted/15 px-3 py-2">
              {accountingRows.map((row) => (
                <ReadoutRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                />
              ))}
            </div>
          </div>
          <div className="divide-y divide-border/30 px-4 py-3">
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
      </CardContent>
    </Card>
  )
}
