import type { ComponentProps } from "react"

import { Badge as BaseBadge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export enum BadgeTone {
  Neutral = "neutral",
  Live = "live",
  Simulated = "simulated",
  Warning = "warning",
  Risk = "risk",
}

export interface BadgeProps extends ComponentProps<typeof BaseBadge> {
  tone?: BadgeTone
}

const badgeToneClassName: Record<BadgeTone, string> = {
  [BadgeTone.Neutral]: "border-border bg-secondary text-secondary-foreground",
  [BadgeTone.Live]: "border-primary/35 bg-primary/10 text-primary",
  [BadgeTone.Simulated]: "border-chart-4/35 bg-chart-4/10 text-chart-4",
  [BadgeTone.Warning]: "border-warning/35 bg-warning/12 text-warning",
  [BadgeTone.Risk]: "border-destructive/35 bg-destructive/10 text-destructive",
}

export function Badge({
  className,
  tone = BadgeTone.Neutral,
  ...props
}: BadgeProps) {
  return (
    <BaseBadge
      className={cn(
        "h-auto rounded-md border px-2.5 py-1 tracking-wide",
        badgeToneClassName[tone],
        className
      )}
      {...props}
    />
  )
}
