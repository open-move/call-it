import type { ReactNode } from "react"

import { BadgeTone } from "@/components/primitives/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export const KEEPER_PAGE_SIZE = 10

const statusDotClassName: Record<BadgeTone, string> = {
  [BadgeTone.Neutral]: "bg-muted-foreground",
  [BadgeTone.Live]: "bg-primary",
  [BadgeTone.Simulated]: "bg-chart-4",
  [BadgeTone.Warning]: "bg-warning",
  [BadgeTone.Risk]: "bg-destructive",
}

// Problem states tint their label; expected states stay quiet and let the dot
// carry the signal. Keeps a status column from reading as a wall of color.
const statusTextClassName: Record<BadgeTone, string> = {
  [BadgeTone.Neutral]: "text-muted-foreground",
  [BadgeTone.Live]: "text-muted-foreground",
  [BadgeTone.Simulated]: "text-muted-foreground",
  [BadgeTone.Warning]: "text-warning",
  [BadgeTone.Risk]: "text-destructive",
}

/// A dot + label status indicator. Uniform height and baseline across every
/// tone, so a status column always aligns regardless of which states appear.
export function StatusDot({
  children,
  className,
  tone = BadgeTone.Neutral,
}: {
  children: ReactNode
  className?: string
  tone?: BadgeTone
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          statusDotClassName[tone]
        )}
      />
      <span
        className={cn(
          "truncate font-mono text-[11px]",
          statusTextClassName[tone]
        )}
      >
        {children}
      </span>
    </span>
  )
}

export interface StatusOption {
  label: string
  value: string
}

export function StatusFilter({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void
  options: StatusOption[]
  value: string
}) {
  return (
    <Select onValueChange={(next) => onChange(next as string)} value={value}>
      <SelectTrigger
        className="border-border/35 bg-muted/25 text-xs shadow-none"
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
