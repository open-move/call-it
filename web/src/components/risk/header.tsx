import { Button } from "@/components/ui/button"
import { exportRiskReport } from "@/lib/risk/helpers"
import type { RiskModel } from "@/lib/risk/types"

export function RiskHeader({ model }: { model: RiskModel }) {
  return (
    <div className="px-1 pt-1 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground">
            Risk console
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Stress-test the PLP vault: what it could lose under each price-shock
            scenario, and the exposure it carries across open markets.
          </p>
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
