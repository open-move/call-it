import { Input } from "@/components/ui/input"
import { formatStrikeInput } from "@/lib/market-detail/helpers"

export function StrikeInput({
  customStrike,
  onCommitStrike,
  onCustomStrikeChange,
  selectedStrikePriceUsd,
}: {
  customStrike: string
  onCommitStrike: () => void
  onCustomStrikeChange: (value: string) => void
  selectedStrikePriceUsd: number
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-muted-foreground">
        Strike (USD)
      </span>
      <Input
        className="border-border/35 bg-muted/25 font-mono text-xs shadow-none ring-0 transition-[background-color,border-color,color] duration-150 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
        inputMode="decimal"
        onBlur={onCommitStrike}
        onChange={(event) => onCustomStrikeChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
        placeholder={formatStrikeInput(selectedStrikePriceUsd)}
        value={customStrike}
      />
    </label>
  )
}
