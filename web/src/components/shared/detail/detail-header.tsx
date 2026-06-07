import { type ReactNode } from "react"

import { Badge, type BadgeTone } from "@/components/primitives/badge"
import { AssetIcon } from "@/components/shared/market/asset-icon"
import { cn } from "@/lib/utils"

export interface DetailMetric {
  className?: string
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
              className="px-2 py-0.5 font-mono text-[10px] uppercase"
              tone={badgeTone}
            >
              {badgeLabel}
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-150 items-end gap-6">
            {metrics.map((metric) => (
              <DetailHeaderMetric key={metric.label} {...metric} />
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}

function DetailHeaderMetric({ className, label, value }: DetailMetric) {
  return (
    <div className="min-w-0 whitespace-nowrap">
      <div className="text-[11px] text-muted-foreground">{label}</div>
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
