import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type TicketMessageKind = "neutral" | "success" | "error"

export function TicketCard({ children }: { children: ReactNode }) {
  return (
    <Card className="w-full flex-1 rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="flex flex-1 flex-col gap-3 px-3 py-3">
        {children}
      </CardContent>
    </Card>
  )
}

export function TicketSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/35 bg-muted/25 p-2.5 text-sm">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

export function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-right font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}

export function TicketMessage({
  children,
  kind,
}: {
  children: ReactNode
  kind: TicketMessageKind
}) {
  return (
    <p
      className={cn(
        "rounded-md px-3 py-2 text-xs leading-5",
        kind === "error"
          ? "border border-destructive/25 bg-destructive/10 text-destructive"
          : kind === "success"
            ? "border border-outcome-up/25 bg-outcome-up/10 text-outcome-up"
            : "bg-muted/15 text-muted-foreground"
      )}
    >
      {children}
    </p>
  )
}
