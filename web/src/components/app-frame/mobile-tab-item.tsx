import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Shared inner content for the mobile tab bar items (and the "More" trigger),
// so every tab gets the same active pill + label treatment. Render inside a
// `group` flex-col trigger/link.
export function MobileTabItemContent({
  active,
  icon: Icon,
  label,
}: {
  active: boolean
  icon: LucideIcon
  label: string
}) {
  return (
    <>
      <span
        className={cn(
          "flex h-7 w-12 items-center justify-center transition-[color,transform] duration-200 group-active:scale-90",
          active
            ? "text-primary"
            : "text-muted-foreground group-hover:text-foreground"
        )}
      >
        <Icon className="size-5" />
      </span>
      <span
        className={cn(
          "text-[10px] font-medium transition-colors duration-150",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </>
  )
}
