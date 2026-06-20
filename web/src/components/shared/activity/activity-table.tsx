import { ArrowUpRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import { SUI_NETWORK } from "@/lib/config"
import { cn } from "@/lib/utils"

export interface ActivityTableColumn {
  align?: "left" | "right"
  label: string
}

export function ActivityTableHeader({
  columns,
  gridClassName,
}: {
  columns: ActivityTableColumn[]
  gridClassName: string
}) {
  return (
    <div
      className={cn(
        "grid gap-4 border-b border-border/45 bg-muted/45 px-3 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase",
        gridClassName
      )}
    >
      {columns.map((column, index) => (
        <span
          className={cn("truncate", column.align === "right" && "text-right")}
          key={`${column.label}-${index}`}
        >
          {column.label}
        </span>
      ))}
    </div>
  )
}

export function ActivityNotice({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-border/35 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      {children}
    </div>
  )
}

export function ActivityEmptyState({ message }: { message: string }) {
  return (
    <div className="grid min-h-56 place-items-center px-3 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

export function ActivityCenteredEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getTransactionUrl(transactionDigest: string) {
  return `https://suiscan.xyz/${SUI_NETWORK}/tx/${transactionDigest}`
}

export function ActivityTransactionLink({
  transactionDigest,
}: {
  transactionDigest: string
}) {
  return (
    <a
      aria-label="Open transaction in explorer"
      className="inline-flex min-w-0 items-center gap-1 truncate font-mono text-muted-foreground tabular-nums transition-[color,transform] duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none active:scale-[0.98]"
      href={getTransactionUrl(transactionDigest)}
      rel="noreferrer"
      target="_blank"
    >
      <span className="truncate">{formatAddress(transactionDigest)}</span>
      <ArrowUpRightIcon className="size-3 shrink-0" />
    </a>
  )
}
