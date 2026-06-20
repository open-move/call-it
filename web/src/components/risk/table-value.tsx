import { cn } from "@/lib/utils"

export function TableValue({
  className,
  muted = false,
  value,
}: {
  className?: string
  muted?: boolean
  value: string
}) {
  return (
    <span
      className={cn(
        "truncate text-right font-mono tabular-nums",
        muted ? "text-muted-foreground" : "text-foreground",
        className
      )}
    >
      {value}
    </span>
  )
}
