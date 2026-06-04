import type { ReactNode } from "react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

export interface SegmentedControlOption {
  label: ReactNode
  value: string
}

export interface SegmentedControlProps {
  ariaLabel: string
  onValueChange: (value: string) => void
  options: SegmentedControlOption[]
  value: string
}

export function SegmentedControl({
  ariaLabel,
  onValueChange,
  options,
  value,
}: SegmentedControlProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-border bg-secondary/70 p-1"
      role="radiogroup"
    >
      {options.map((option) => {
        const isSelected = option.value === value

        return (
          <Button
            aria-checked={isSelected}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              isSelected
                ? "bg-primary text-primary-foreground shadow-[0_0_24px_oklch(0.775_0.153_202.5_/_20%)]"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            role="radio"
            type="button"
            variant={isSelected ? "default" : "ghost"}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
