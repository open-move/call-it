import { SearchIcon, SlidersHorizontalIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

export interface ToolbarOption {
  count?: number
  label: string
  value?: string
}

export interface ToolbarProps {
  assetOptions: ToolbarOption[]
  expiryOptions: ToolbarOption[]
  onAssetChange: (asset?: string) => void
  onExpiryChange: (expiry?: string) => void
  onSearchChange: (search: string) => void
  searchQuery: string
  selectedAsset?: string
  selectedExpiry?: string
  totalCount: number
  visibleCount: number
}

export function Toolbar({
  assetOptions,
  expiryOptions,
  onAssetChange,
  onExpiryChange,
  onSearchChange,
  searchQuery,
  selectedAsset,
  selectedExpiry,
  totalCount,
  visibleCount,
}: ToolbarProps) {
  return (
    <div className="space-y-2 border-b border-border/40 bg-card px-3 py-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Asset
          </span>
          <ToolbarTabs
            onChange={onAssetChange}
            options={assetOptions}
            selectedValue={selectedAsset}
          />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:w-72 lg:flex-none">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search markets"
              className="h-8 border-0 bg-muted/60 pl-8 text-xs shadow-none ring-0 focus-visible:ring-1"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search markets"
              value={searchQuery}
            />
          </div>
          <Button
            aria-label="Filters"
            className="size-8 border-0 bg-muted/60 text-muted-foreground shadow-none ring-0 hover:bg-accent focus-visible:ring-1"
            size="icon"
            type="button"
            variant="outline"
          >
            <SlidersHorizontalIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            Expiry
          </span>
          <ToolbarTabs
            onChange={onExpiryChange}
            options={expiryOptions}
            selectedValue={selectedExpiry}
          />
        </div>
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase lg:text-right">
          {visibleCount} / {totalCount} markets
        </div>
      </div>
    </div>
  )
}

function ToolbarTabs({
  onChange,
  options,
  selectedValue,
}: {
  onChange: (value?: string) => void
  options: ToolbarOption[]
  selectedValue?: string
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const isSelected = selectedValue === option.value

        return (
          <button
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
              isSelected && "bg-primary/10 text-primary hover:bg-primary/15"
            )}
            key={option.value ?? "all"}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <span>{option.label}</span>
            {option.count !== undefined && (
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
