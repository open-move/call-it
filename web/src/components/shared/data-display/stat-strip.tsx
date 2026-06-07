import type {ReactNode} from "react";

import { cn } from "@/lib/utils"

export enum StatTone {
  Default = "default",
  Positive = "positive",
}

export interface StatStripItem {
  label: string
  value: ReactNode
  tone?: StatTone
}

export interface StatStripProps {
  items: [StatStripItem, StatStripItem, StatStripItem]
}

export function StatStrip({ items }: StatStripProps) {
  return (
    <div className="border-y border-border/35 py-1 sm:py-3">
      <div className="divide-y divide-border/30 sm:grid sm:grid-cols-3 sm:gap-4 sm:divide-y-0">
        {items.map((item) => (
          <div
            className="flex items-baseline justify-between gap-3 py-2.5 sm:block sm:space-y-1 sm:py-0"
            key={item.label}
          >
            <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {item.label}
            </div>
            <div
              className={cn(
                "text-right text-base font-semibold tabular-nums sm:text-left",
                item.tone === StatTone.Positive
                  ? "text-outcome-up"
                  : "text-foreground"
              )}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
