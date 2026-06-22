import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const KEEPER_PAGE_SIZE = 25

export interface StatusOption {
  label: string
  value: string
}

export function StatusFilter({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void
  options: StatusOption[]
  value: string
}) {
  return (
    <Select onValueChange={(next) => onChange(next as string)} value={value}>
      <SelectTrigger
        className="border-border/35 bg-muted/25 text-xs shadow-none"
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Pager({
  onPage,
  page,
  pageCount,
  pageSize,
  total,
}: {
  onPage: (page: number) => void
  page: number
  pageCount: number
  pageSize: number
  total: number
}) {
  if (total === 0) {
    return null
  }

  const start = page * pageSize + 1
  const end = Math.min(total, (page + 1) * pageSize)

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/45 px-4 py-2.5 text-[11px] text-muted-foreground">
      <span className="font-mono tabular-nums">
        {start.toLocaleString("en-US")}–{end.toLocaleString("en-US")} of{" "}
        {total.toLocaleString("en-US")}
      </span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            aria-label="Previous page"
            className="size-7 border-border/35 bg-muted/25 shadow-none disabled:opacity-40"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="font-mono tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            aria-label="Next page"
            className="size-7 border-border/35 bg-muted/25 shadow-none disabled:opacity-40"
            disabled={page >= pageCount - 1}
            onClick={() => onPage(page + 1)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
