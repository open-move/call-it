import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface MetricProps {
  className?: string
  label: string
  value: ReactNode
}

export function Metric({ className, label, value }: MetricProps) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-xs font-medium text-foreground tabular-nums",
          className
        )}
      >
        {value}
      </div>
    </div>
  )
}
