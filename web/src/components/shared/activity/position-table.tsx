import type { ReactNode } from "react"
import { MoreHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu"
import {
  ActivityEmptyState,
  ActivityNotice,
  ActivityTableHeader,
} from "@/components/shared/activity/activity-table"
import { cn } from "@/lib/utils"

export type PositionTableTone = "up" | "down" | "range" | "neutral"

export interface PositionTableAction {
  disabled?: boolean
  label: string
  onSelect: () => void
}

export interface PositionTableRow {
  actions?: PositionTableAction[]
  averageEntryPrice: number | null
  badges?: ReactNode
  contractLabel: string
  id: string
  meta: string
  pnlUsd: number | null
  premiumUsd: number
  quantity: number
  tag: string
  tone: PositionTableTone
  valueUnavailable?: boolean
}

const positionTableGrid =
  "grid-cols-[minmax(13rem,1.8fr)_7rem_5.25rem_6.5rem_6.5rem_5.5rem]"

function getToneClassName(tone: PositionTableTone) {
  if (tone === "up") {
    return "text-outcome-up"
  }

  if (tone === "down") {
    return "text-outcome-down"
  }

  if (tone === "range") {
    return "text-primary"
  }

  return "text-muted-foreground"
}

function getPnlClassName(value: number | null) {
  if (value === null || value === 0) {
    return "text-muted-foreground"
  }

  return value > 0 ? "text-outcome-up" : "text-outcome-down"
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

function formatPriceCents(value: number | null) {
  return value === null ? "--" : `${(value * 100).toFixed(1)}c`
}

function formatDusdc(value: number) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
    minimumFractionDigits: value >= 100 ? 0 : 2,
  })} DUSDC`
}

function formatSignedDusdc(value: number) {
  const formatted = formatDusdc(Math.abs(value))

  if (value > 0) {
    return `+${formatted}`
  }

  if (value < 0) {
    return `-${formatted}`
  }

  return formatted
}

export function PositionTable({
  emptyMessage,
  isLoading = false,
  loadingMessage,
  rows,
  unavailableValueMessage = "Live exit values are unavailable. Entry and premium are shown from trade history.",
}: {
  emptyMessage: string
  isLoading?: boolean
  loadingMessage: string
  rows: PositionTableRow[]
  unavailableValueMessage?: string
}) {
  if (isLoading) {
    return <ActivityEmptyState message={loadingMessage} />
  }

  if (rows.length === 0) {
    return <ActivityEmptyState message={emptyMessage} />
  }

  const hasUnavailableValues = rows.some((row) => row.valueUnavailable)

  return (
    <>
      <div className="hidden h-full min-h-0 overflow-auto lg:block">
        <div className="min-w-[56rem]">
          {hasUnavailableValues ? (
            <ActivityNotice>{unavailableValueMessage}</ActivityNotice>
          ) : null}
          <ActivityTableHeader
            gridClassName={positionTableGrid}
            columns={[
              { label: "Contract" },
              { align: "right", label: "Contracts" },
              { align: "right", label: "Avg entry" },
              { align: "right", label: "Premium" },
              { align: "right", label: "PnL" },
              { align: "right", label: "" },
            ]}
          />
          {rows.map((row) => (
            <PositionDesktopRow key={row.id} row={row} />
          ))}
        </div>
      </div>

      <div className="grid gap-2 lg:hidden">
        {hasUnavailableValues ? (
          <ActivityNotice>{unavailableValueMessage}</ActivityNotice>
        ) : null}
        {rows.map((row) => (
          <PositionMobileCard key={row.id} row={row} />
        ))}
      </div>
    </>
  )
}

function PositionDesktopRow({ row }: { row: PositionTableRow }) {
  return (
    <div
      className={cn(
        "grid items-center gap-4 border-b border-border/35 px-3 py-2 text-xs last:border-b-0",
        positionTableGrid
      )}
    >
      <PositionContractCell row={row} />
      <span className="truncate text-right font-mono text-muted-foreground tabular-nums">
        {formatQuantity(row.quantity)}
      </span>
      <span className="truncate text-right font-mono tabular-nums">
        {formatPriceCents(row.averageEntryPrice)}
      </span>
      <span className="truncate text-right font-mono tabular-nums">
        {formatDusdc(row.premiumUsd)}
      </span>
      <span
        className={cn(
          "truncate text-right font-mono tabular-nums",
          getPnlClassName(row.pnlUsd)
        )}
      >
        {row.pnlUsd === null ? "--" : formatSignedDusdc(row.pnlUsd)}
      </span>
      <PositionTableActionMenu row={row} />
    </div>
  )
}

function PositionContractCell({ row }: { row: PositionTableRow }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-2">
        <span
          className={cn(
            "inline-flex w-9 shrink-0 font-mono text-[10px] tracking-wide uppercase",
            getToneClassName(row.tone)
          )}
        >
          {row.tag}
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {row.contractLabel}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <div className="truncate font-mono text-[10px] text-muted-foreground uppercase">
              {row.meta}
            </div>
            {row.badges}
          </div>
        </div>
      </div>
    </div>
  )
}

function PositionTableActionMenu({ row }: { row: PositionTableRow }) {
  if (!row.actions?.length) {
    return <div />
  }

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Position actions"
              className="bg-muted text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              size="icon-sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <MoreHorizontalIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-sans text-xs font-medium tracking-normal text-muted-foreground normal-case">
              Manage Position
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {row.actions.map((action) => (
              <DropdownMenuItem
                disabled={action.disabled}
                key={action.label}
                onClick={action.onSelect}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function PositionMobileCard({ row }: { row: PositionTableRow }) {
  return (
    <div className="rounded-md border border-border/35 bg-muted/15 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <PositionContractCell row={row} />
        <PositionTableActionMenu row={row} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/35 pt-3 text-xs">
        <MobileStat label="Contracts" value={formatQuantity(row.quantity)} />
        <MobileStat
          label="Avg entry"
          value={formatPriceCents(row.averageEntryPrice)}
        />
        <MobileStat label="Premium" value={formatDusdc(row.premiumUsd)} />
        <MobileStat
          className={getPnlClassName(row.pnlUsd)}
          label="PnL"
          value={row.pnlUsd === null ? "--" : formatSignedDusdc(row.pnlUsd)}
        />
      </div>
    </div>
  )
}

function MobileStat({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-md bg-background/35 px-2.5 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}
