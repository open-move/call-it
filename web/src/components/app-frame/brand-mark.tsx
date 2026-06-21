import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function BrandMark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground",
        className
      )}
      {...props}
    >
      <svg
        className="size-4"
        fill="none"
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4.2 8.6 A6.2 6.2 0 0 1 13.6 3.7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
        <path
          d="M11.3 3.2 L13.6 3.7 L13.2 6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <ellipse
          cx="10"
          cy="12.3"
          rx="4.4"
          ry="5.9"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="10" cy="12.3" fill="currentColor" r="1.25" />
      </svg>
    </span>
  )
}
