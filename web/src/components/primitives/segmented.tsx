import { cn } from "@/lib/utils"

export interface SegmentedOption<T extends string> {
  id: T
  label: string
}

export function Segmented<T extends string>({
  className,
  onChange,
  options,
  value,
}: {
  className?: string
  onChange: (id: T) => void
  options: SegmentedOption<T>[]
  value: T
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md bg-muted/30 p-0.5",
        className
      )}
      role="group"
    >
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            aria-pressed={active}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              active
                ? "bg-card text-foreground ring-1 ring-border/40"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
