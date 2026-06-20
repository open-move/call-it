import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatExpiryDate } from "@/lib/format"
import { exposurePageSize, formatDusdc } from "@/lib/risk/helpers"
import type { ExposureFilter } from "@/lib/risk/helpers"
import type { RiskExposureRow, RiskModel } from "@/lib/risk/types"
import { cn } from "@/lib/utils"
import { ExposureConcentration } from "./exposure-concentration"
import { TableValue } from "./table-value"

function ExposureRow({ row }: { row: RiskExposureRow }) {
  return (
    <div className="grid grid-cols-[minmax(14rem,1.5fr)_4rem_7rem_7rem_7.5rem_7.5rem_6rem] gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">
          {row.assetSymbol} - {row.settlementLabel}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {row.oracleId.slice(0, 8)}...{row.oracleId.slice(-4)}
        </div>
      </div>
      <span className="font-mono text-[10px] tracking-wide text-primary uppercase">
        {row.kind === "directional" ? "DIR" : "RNG"}
      </span>
      <TableValue
        value={row.openQuantity.toLocaleString("en-US", {
          maximumFractionDigits: 4,
        })}
      />
      <TableValue value={formatDusdc(row.costBasisUsd)} />
      <TableValue value={formatDusdc(row.maxPayoutUsd)} />
      <TableValue value={formatDusdc(row.payoutEstimateUsd)} />
      <TableValue muted value={formatExpiryDate(row.expiryMs)} />
    </div>
  )
}

function ExposureTable({ rows }: { rows: RiskExposureRow[] }) {
  return (
    <div className="overflow-auto border-t border-border/45">
      <div className="min-w-[58rem]">
        <div className="grid grid-cols-[minmax(14rem,1.5fr)_4rem_7rem_7rem_7.5rem_7.5rem_6rem] gap-4 border-b border-border/45 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <span>Market</span>
          <span>Kind</span>
          <span className="text-right">Open qty</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Max payout</span>
          <span className="text-right">Est. payout</span>
          <span className="text-right">Expiry</span>
        </div>
        {rows.length > 0 ? (
          rows.map((row) => <ExposureRow key={row.id} row={row} />)
        ) : (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            No open exposure was reconstructed from recent public events.
          </div>
        )}
      </div>
    </div>
  )
}

export function ExposureBook({ model }: { model: RiskModel }) {
  const [filter, setFilter] = useState<ExposureFilter>("all")
  const [page, setPage] = useState(0)
  const filteredRows = model.exposureRows.filter(
    (row) => filter === "all" || row.kind === filter
  )
  const pageCount = Math.max(
    1,
    Math.ceil(filteredRows.length / exposurePageSize)
  )
  const visibleRows = filteredRows.slice(
    page * exposurePageSize,
    page * exposurePageSize + exposurePageSize
  )

  function selectFilter(nextFilter: ExposureFilter) {
    setFilter(nextFilter)
    setPage(0)
  }

  return (
    <Card className="overflow-hidden rounded-lg border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
              Exposure book
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Open directional and range positions reconstructed from public
              Predict events.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "directional", "range"] as ExposureFilter[]).map(
              (option) => (
                <Button
                  className={cn(
                    "h-7 px-2.5 text-[11px] capitalize shadow-none",
                    filter === option && "bg-primary/10 text-primary"
                  )}
                  key={option}
                  onClick={() => selectFilter(option)}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  {option === "all" ? "All" : option}
                </Button>
              )
            )}
          </div>
        </div>

        <ExposureConcentration rows={model.exposureRows} />

        {model.hasIncompleteReconstruction ? (
          <div className="border-t border-chart-4/25 bg-chart-4/10 px-4 py-2 text-xs leading-5 text-chart-4">
            Event reconstruction is partial. Scenario estimates use total max
            payout as the stress anchor where public event history is missing.
          </div>
        ) : null}

        <ExposureTable rows={visibleRows} />

        {filteredRows.length > exposurePageSize ? (
          <div className="flex items-center justify-between border-t border-border/45 px-3 py-2">
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
        ) : null}
      </CardContent>
    </Card>
  )
}
