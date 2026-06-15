import { ChevronRightIcon, ShieldCheckIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FamilyHeaderAction {
  href: "/protection" | "/shield" | "/shield/claims"
  label: string
}

export function ProtectionFamilyHeader({
  actions,
  description,
  title,
}: {
  actions?: FamilyHeaderAction[]
  description: string
  title: string
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/60 p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <Link className="transition-colors hover:text-foreground" to="/protection">
            Protection
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="text-foreground">{title}</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ShieldCheckIcon className="size-4 text-primary" />
            {title}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      {actions?.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Link
              className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
              key={action.href + action.label}
              to={action.href}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
