import { ClockIcon, SearchIcon, SlidersHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface ToolbarOption {
  label: string
  value?: string
}

export interface ToolbarProps {
  assetOptions: ToolbarOption[]
  onAssetChange: (asset?: string) => void
  selectedAsset?: string
}

export interface MarketSearchControlsProps {
  onResetFilters: () => void
  onSearchChange: (search: string) => void
  onSortChange: (sort: "expiry" | "move" | "volume") => void
  onWithTradesOnlyChange: (withTradesOnly: boolean) => void
  searchQuery: string
  selectedSort: "expiry" | "move" | "volume"
  withTradesOnly: boolean
  expiryOptions: ToolbarOption[]
  onExpiryChange: (expiry?: string) => void
  selectedExpiry?: string
}

export function Toolbar({
  assetOptions,
  onAssetChange,
  selectedAsset,
}: ToolbarProps) {
  return (
    <div className="flex min-w-0">
      <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-hide">
        <ToolbarTabs
          onChange={onAssetChange}
          options={assetOptions}
          selectedValue={selectedAsset}
        />
      </div>
    </div>
  )
}

export function MarketSearchControls({
  onResetFilters,
  onSearchChange,
  onSortChange,
  onWithTradesOnlyChange,
  searchQuery,
  selectedSort,
  withTradesOnly,
  expiryOptions,
  onExpiryChange,
  selectedExpiry,
}: MarketSearchControlsProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search"
          className="border-0 bg-muted/60 pl-8 text-xs shadow-none ring-0 focus-visible:ring-1"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Filter markets..."
          value={searchQuery}
        />
      </div>

      <ExpirySelect
        onChange={onExpiryChange}
        options={expiryOptions}
        selectedValue={selectedExpiry}
      />

      <FilterMenu
        onResetFilters={onResetFilters}
        onSortChange={onSortChange}
        onWithTradesOnlyChange={onWithTradesOnlyChange}
        selectedSort={selectedSort}
        withTradesOnly={withTradesOnly}
      />
    </div>
  )
}

function FilterMenu({
  onResetFilters,
  onSortChange,
  onWithTradesOnlyChange,
  selectedSort,
  withTradesOnly,
}: {
  onResetFilters: () => void
  onSortChange: (sort: "expiry" | "move" | "volume") => void
  onWithTradesOnlyChange: (withTradesOnly: boolean) => void
  selectedSort: "expiry" | "move" | "volume"
  withTradesOnly: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Filters"
            className="border-0 bg-muted/60 text-muted-foreground shadow-none ring-0 hover:bg-accent focus-visible:ring-1"
            size="icon-sm"
            type="button"
            variant="outline"
          />
        }
      >
        <SlidersHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sort</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={selectedSort}
            onValueChange={onSortChange}
          >
            <DropdownMenuRadioItem value="expiry">
              Expiring soon
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="volume">Volume</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="move">
              Price move
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={withTradesOnly}
            onCheckedChange={onWithTradesOnlyChange}
          >
            With recent trades
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onResetFilters}>
            Reset filters
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ExpirySelect({
  onChange,
  options,
  selectedValue,
}: {
  onChange: (value?: string) => void
  options: ToolbarOption[]
  selectedValue?: string
}) {
  const selectedOption = options.find((option) => option.value === selectedValue)
  const label = selectedOption?.label ?? "Any"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="h-8 gap-1.5 border-0 bg-muted/60 px-2.5 text-xs text-muted-foreground shadow-none hover:bg-accent focus-visible:ring-1"
            type="button"
            variant="ghost"
          />
        }
      >
        <ClockIcon className="size-3.5" />
        <span>{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Expiry</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={selectedValue}
            onValueChange={(value) => onChange(value || undefined)}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.value ?? "all"}
                value={option.value}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
    <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
      {options.map((option) => {
        const isSelected = selectedValue === option.value

        return (
          <Button
            className={cn(
              "gap-1.5 px-2 text-xs font-normal text-muted-foreground shadow-none hover:bg-accent/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
              isSelected && "bg-primary/10 text-primary hover:bg-primary/15"
            )}
            key={option.value ?? "all"}
            onClick={() => onChange(option.value)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <span>{option.label}</span>
          </Button>
        )
      })}
    </div>
  )
}
