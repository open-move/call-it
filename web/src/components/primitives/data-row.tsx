import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type DataRowTone = "default" | "up" | "down" | "warning"

const dataRowToneClassName: Record<DataRowTone, string> = {
  default: "text-foreground",
  up: "text-outcome-up-foreground",
  down: "text-outcome-down-foreground",
  warning: "text-warning",
}

export function DataRow({
  label,
  mono = false,
  tone = "default",
  value,
}: {
  label: ReactNode
  mono?: boolean
  tone?: DataRowTone
  value: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/25 py-1.5 last:border-b-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "truncate text-right text-xs font-medium tabular-nums",
          mono && "font-mono",
          dataRowToneClassName[tone]
        )}
      >
        {value}
      </span>
    </div>
  )
}
