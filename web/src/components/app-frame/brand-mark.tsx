import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function BrandMark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 place-items-center rounded-md border border-primary/30 bg-primary/8 text-primary",
        className
      )}
      {...props}
    >
      <svg
        className="size-4.5"
        fill="none"
        viewBox="0 0 18 18"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M9 2.25V15.75"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
        <path
          d="M4.25 10.75L7.15 7.85C7.62 7.38 8.38 7.38 8.85 7.85L10.15 9.15C10.62 9.62 11.38 9.62 11.85 9.15L13.75 7.25"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="M13.75 7.25H11.6M13.75 7.25V9.4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    </span>
  )
}
