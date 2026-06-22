import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/utils"

export enum StatusTone {
  Live = "live",
  Simulated = "simulated",
  Neutral = "neutral",
  Risk = "risk",
}

export interface StatusIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  pulse?: boolean
  tone?: StatusTone
}

const statusToneClassName: Record<StatusTone, string> = {
  [StatusTone.Live]: "bg-primary",
  [StatusTone.Simulated]: "bg-chart-4",
  [StatusTone.Neutral]: "bg-muted-foreground",
  [StatusTone.Risk]: "bg-destructive",
}

export function StatusIndicator({
  children,
  className,
  pulse = false,
  tone = StatusTone.Neutral,
  ...props
}: StatusIndicatorProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 text-sm text-muted-foreground",
        className
      )}
      {...props}
    >
      <span aria-hidden="true" className="relative flex size-2">
        {pulse ? (
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full opacity-75",
              statusToneClassName[tone]
            )}
          />
        ) : null}
        <span
          className={cn(
            "relative size-2 rounded-full",
            statusToneClassName[tone]
          )}
        />
      </span>
      <span>{children}</span>
    </div>
  )
}
