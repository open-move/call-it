import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface MetricProps extends HTMLAttributes<HTMLDivElement> {
  label: string
  value: ReactNode
  detail?: ReactNode
}

export function Metric({
  className,
  detail,
  label,
  value,
  ...props
}: MetricProps) {
  return (
    <div className={cn("min-w-0", className)} {...props}>
      <div className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl leading-none font-semibold tracking-[-0.04em] text-foreground tabular-nums">
        {value}
      </div>
      {detail && (
        <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
      )}
    </div>
  )
}
