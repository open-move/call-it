import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function BrandMark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 place-items-center rounded-md bg-primary text-[15px] font-black text-primary-foreground shadow-[0_0_24px_oklch(0.8974_0.1487_115.6236_/_18%)]",
        className
      )}
      {...props}
    >
      C
    </span>
  )
}
