import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface MetricProps {
  className?: string
  label: string
  value: ReactNode
}

export function Metric({ className, label, value }: MetricProps) {
  return (
    <div className="rounded-md border border-border/35 bg-muted/25 px-2.5 py-1.5">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-xs font-medium text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}
