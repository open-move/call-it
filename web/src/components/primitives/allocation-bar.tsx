import { cn } from "@/lib/utils"

export type AllocationTone = "primary" | "down" | "up" | "muted"

export interface AllocationSegment {
  label: string
  pct: number
  tone: AllocationTone
}

const barToneClassName: Record<AllocationTone, string> = {
  primary: "bg-primary",
  down: "bg-outcome-down",
  up: "bg-outcome-up",
  muted: "bg-muted-foreground/40",
}

const dotToneClassName: Record<AllocationTone, string> = {
  primary: "bg-primary",
  down: "bg-outcome-down",
  up: "bg-outcome-up",
  muted: "bg-muted-foreground/55",
}

export function AllocationBar({
  label,
  segments,
}: {
  label?: string
  segments?: AllocationSegment[]
}) {
  return (
    <div>
      {label ? (
        <div className="mb-2 text-xs text-muted-foreground">{label}</div>
      ) : null}

      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {segments ? (
          segments.map((segment) => (
            <div
              className={cn(
                "h-full transition-[width] duration-500 ease-out",
                barToneClassName[segment.tone]
              )}
              key={segment.label}
              style={{ width: `${Math.round(segment.pct * 100)}%` }}
            />
          ))
        ) : (
          <div className="h-full w-full animate-pulse bg-muted/60" />
        )}
      </div>

      {segments ? (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((segment) => (
            <div className="flex items-center gap-1.5" key={segment.label}>
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  dotToneClassName[segment.tone]
                )}
              />
              <span className="text-xs text-muted-foreground">
                {segment.label}
              </span>
              <span className="text-xs font-medium text-foreground tabular-nums">
                {Math.round(segment.pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2.5 h-4 w-32 animate-pulse rounded bg-muted/50" />
      )}
    </div>
  )
}
