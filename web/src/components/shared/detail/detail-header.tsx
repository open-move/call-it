import { useId, useState } from "react"
import type { ReactNode } from "react"

import { Badge } from "@/components/primitives/badge"
import { AssetIcon } from "@/components/shared/market/asset-icon"
import { cn } from "@/lib/utils"
import type { BadgeTone } from "@/components/primitives/badge"

export interface DetailMetric {
  className?: string
  description?: string
  label: string
  value: ReactNode
}

export interface DetailHeaderProps {
  assetIconUrl?: string
  assetName: string
  assetSymbol: string
  badgeLabel: string
  badgeTone: BadgeTone
  identity?: ReactNode
  metrics: DetailMetric[]
  title: ReactNode
}

interface TooltipPosition {
  left: number
  top: number
}

export function DetailHeader({
  assetIconUrl,
  assetName,
  assetSymbol,
  badgeLabel,
  badgeTone,
  identity,
  metrics,
  title,
}: DetailHeaderProps) {
  return (
    <header className="border-b border-border/40">
      <div className="flex min-w-0 flex-col gap-3 px-3 py-2.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          {identity ?? (
            <div className="flex min-w-0 items-center gap-2.5">
              <AssetIcon
                assetIconUrl={assetIconUrl}
                assetName={assetName}
                assetSymbol={assetSymbol}
                className="size-5"
              />
              <div className="flex min-w-0 items-center gap-1.5 text-left">
                <span className="truncate text-sm leading-none font-medium tracking-tight text-foreground">
                  {title}
                </span>
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2">
            <Badge
              className="border-0 px-2 py-0.5 font-mono text-[10px] uppercase ring-0"
              tone={badgeTone}
            >
              {badgeLabel}
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-128 items-end gap-6">
            {metrics.map((metric) => (
              <DetailHeaderMetric key={metric.label} {...metric} />
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}

function DetailHeaderMetric({
  className,
  description,
  label,
  value,
}: DetailMetric) {
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(
    null
  )
  const tooltipId = useId()

  function showTooltip(target: HTMLElement) {
    const tooltipWidth = 208
    const viewportPadding = 8
    const rect = target.getBoundingClientRect()
    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - tooltipWidth - viewportPadding
    )

    setTooltipPosition({
      left: Math.min(Math.max(rect.left, viewportPadding), maxLeft),
      top: rect.top - viewportPadding,
    })
  }

  return (
    <div className="min-w-0 whitespace-nowrap">
      <div className="text-[11px] font-medium text-muted-foreground">
        {description ? (
          <span
            aria-describedby={tooltipPosition ? tooltipId : undefined}
            className="inline-flex cursor-help border-b border-dashed border-muted-foreground/70 leading-none outline-none focus-visible:border-primary"
            onBlur={() => setTooltipPosition(null)}
            onFocus={(event) => showTooltip(event.currentTarget)}
            onMouseEnter={(event) => showTooltip(event.currentTarget)}
            onMouseLeave={() => setTooltipPosition(null)}
            tabIndex={0}
            title={description}
          >
            {label}
          </span>
        ) : (
          label
        )}
      </div>
      {description && tooltipPosition ? (
        <div
          className="pointer-events-none fixed z-50 w-52 -translate-y-full rounded-md border border-border-strong bg-popover px-2.5 py-2 text-[11px] leading-4 whitespace-normal text-popover-foreground shadow-lg"
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
        >
          {description}
        </div>
      ) : null}
      <div
        className={cn(
          "mt-1 truncate font-mono text-xs leading-none font-medium text-foreground tabular-nums",
          value === "--" && "text-muted-foreground",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}
