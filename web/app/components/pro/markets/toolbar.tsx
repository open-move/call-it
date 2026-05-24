import { ChevronDownIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
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
  selectedAsset,
  selectedExpiry,
  totalCount,
  visibleCount,
}: ToolbarProps) {
  const selectedAssetLabel =
    assetOptions.find((option) => option.value === selectedAsset)?.label ??
    "All assets"
  const selectedExpiryLabel =
    expiryOptions.find((option) => option.value === selectedExpiry)?.label ??
    "All expiries"

  return (
    <div className="flex flex-col gap-2 border-b border-border/50 bg-background/45 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ToolbarDropdown
          label="Asset"
          onChange={onAssetChange}
          options={assetOptions}
          selectedLabel={selectedAssetLabel}
          selectedValue={selectedAsset}
        />
        <ToolbarDropdown
          label="Expiry"
          onChange={onExpiryChange}
          options={expiryOptions}
          selectedLabel={selectedExpiryLabel}
          selectedValue={selectedExpiry}
        />
      </div>
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase sm:text-right">
        {visibleCount} / {totalCount} strikes
      </div>
    </div>
  )
}

function ToolbarDropdown({
  label,
  onChange,
  options,
  selectedLabel,
  selectedValue,
}: {
  label: string
  onChange: (value?: string) => void
  options: ToolbarOption[]
  selectedLabel: string
  selectedValue?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label={`${label}: ${selectedLabel}`}
            className="flex h-8 items-center gap-2 rounded-md border border-border/45 bg-surface/45 px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover/55 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            type="button"
          />
        }
      >
        <span>{selectedLabel}</span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-40" align="start">
        {options.map((option) => {
          const isSelected = selectedValue === option.value

          return (
            <DropdownMenuItem
              className={cn(
                "justify-between",
                isSelected && "bg-accent text-accent-foreground"
              )}
              key={option.value ?? "all"}
              onClick={() => onChange(option.value)}
            >
              <span>{option.label}</span>
              {option.count !== undefined && (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {option.count}
                </span>
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
