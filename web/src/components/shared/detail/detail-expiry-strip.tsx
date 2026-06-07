import { Link } from "@tanstack/react-router"

import { formatExpiryDate, formatExpiryDistance, formatExpiryTime } from "@/lib/format"
import type {ExpiryOption} from "@/lib/types/market";
import { cn } from "@/lib/utils"

export interface DetailExpiryStripProps {
  expiryOptions: ExpiryOption[]
  getHref: (option: ExpiryOption) => string
  selectedOracleId: string
}

export function DetailExpiryStrip({
  expiryOptions,
  getHref,
  selectedOracleId,
}: DetailExpiryStripProps) {
  if (expiryOptions.length <= 1) {
    return null
  }

  return (
    <div className="border-b border-border/30 bg-background/25 px-3 py-2">
      <div className="flex min-w-0 [scrollbar-width:none] gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {expiryOptions.map((option) => {
          const isSelected = option.oracleId === selectedOracleId
          const isExpiryActive = option.status === "active"

          return (
            <Link
              aria-current={isSelected ? "page" : undefined}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/45 bg-muted/30 px-2.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                isSelected && isExpiryActive
                  ? "border-primary/80 bg-primary/10 text-foreground ring-1 ring-primary/30"
                  : isSelected &&
                      "border-border/70 bg-muted/45 text-foreground ring-1 ring-border/30"
              )}
              key={option.oracleId}
              to={getHref(option)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  isExpiryActive ? "bg-outcome-up" : "bg-muted-foreground/45"
                )}
              />
              <span className="tracking-wide text-foreground uppercase">
                {formatExpiryDate(option.expiryMs)}
              </span>
              <span>{formatExpiryTime(option.expiryMs)}</span>
              <span className="text-border">·</span>
              <span
                className={
                  isSelected && isExpiryActive ? "text-primary" : undefined
                }
              >
                {formatExpiryDistance(option.expiryMs)}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
