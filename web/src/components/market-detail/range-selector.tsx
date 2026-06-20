import { useEffect, useState } from "react"

import { Input } from "@/components/ui/input"
import {
  formatStrikeInput,
  normalizeStrikePrice,
  parseStrikeInput,
} from "@/lib/market-detail/helpers"
import type { MarketSnapshot } from "@/lib/types/market"

export function RangeSelector({
  higherStrike,
  lowerStrike,
  market,
  onHigherStrikeChange,
  onLowerStrikeChange,
}: {
  higherStrike: number
  lowerStrike: number
  market: MarketSnapshot
  onHigherStrikeChange: (strikePriceUsd: number) => void
  onLowerStrikeChange: (strikePriceUsd: number) => void
}) {
  const [lowerInput, setLowerInput] = useState(() =>
    formatStrikeInput(lowerStrike)
  )
  const [higherInput, setHigherInput] = useState(() =>
    formatStrikeInput(higherStrike)
  )

  useEffect(() => {
    setLowerInput(formatStrikeInput(lowerStrike))
    setHigherInput(formatStrikeInput(higherStrike))
  }, [higherStrike, lowerStrike])

  function commitLowerStrike() {
    const parsedStrike = parseStrikeInput(lowerInput)

    if (!parsedStrike) {
      setLowerInput(formatStrikeInput(lowerStrike))
      return
    }

    onLowerStrikeChange(normalizeStrikePrice(parsedStrike, market))
  }

  function commitHigherStrike() {
    const parsedStrike = parseStrikeInput(higherInput)

    if (!parsedStrike) {
      setHigherInput(formatStrikeInput(higherStrike))
      return
    }

    onHigherStrikeChange(normalizeStrikePrice(parsedStrike, market))
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">
          Lower Strike (USD)
        </span>
        <Input
          className="border-border/35 bg-muted/25 font-mono text-xs shadow-none ring-0 transition-[background-color,border-color,color] duration-150 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
          inputMode="decimal"
          onBlur={commitLowerStrike}
          onChange={(event) => setLowerInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
          value={lowerInput}
        />
      </label>
      <label className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">
          Upper Strike (USD)
        </span>
        <Input
          className="border-border/35 bg-muted/25 font-mono text-xs shadow-none ring-0 transition-[background-color,border-color,color] duration-150 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
          inputMode="decimal"
          onBlur={commitHigherStrike}
          onChange={(event) => setHigherInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
          value={higherInput}
        />
      </label>
    </div>
  )
}
