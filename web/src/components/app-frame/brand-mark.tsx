import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

// The CallIt wordmark: "Call" in foreground, "It" in the primary accent.
export function BrandMark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-lg leading-none font-semibold tracking-[-0.03em] text-foreground",
        className
      )}
      {...props}
    >
      Call<span className="text-primary">It</span>
    </span>
  )
}
