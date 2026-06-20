import type { ReactNode } from "react"

import type { StrategyKey } from "@/lib/strategies/hooks"

function VisualFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-24 overflow-hidden bg-background/40">
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:radial-gradient(var(--muted-foreground)_0.5px,transparent_0.5px)] [background-size:7px_7px]" />
      {children}
    </div>
  )
}

function LiquidityVisual() {
  return (
    <VisualFrame>
      <svg
        aria-hidden="true"
        className="relative h-full w-full text-primary"
        preserveAspectRatio="none"
        viewBox="0 0 200 96"
      >
        <defs>
          <linearGradient id="strategy-liquidity-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 72 C40 66 62 46 100 42 S168 24 200 16 V96 H0 Z"
          fill="url(#strategy-liquidity-fill)"
        />
        <path
          d="M0 72 C40 66 62 46 100 42 S168 24 200 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <line
          className="text-border"
          stroke="currentColor"
          strokeOpacity="0.6"
          x1="0"
          x2="200"
          y1="88"
          y2="88"
        />
      </svg>
    </VisualFrame>
  )
}

function TailHedgeVisual() {
  return (
    <VisualFrame>
      <svg
        aria-hidden="true"
        className="relative h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 200 96"
      >
        <line
          className="text-border"
          stroke="currentColor"
          strokeDasharray="3 4"
          x1="80"
          x2="80"
          y1="10"
          y2="86"
        />
        <path
          className="text-outcome-down"
          d="M10 66 H80"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          className="text-primary"
          d="M80 66 L192 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <circle className="text-primary" cx="80" cy="66" fill="currentColor" r="3" />
      </svg>
      <span className="absolute bottom-2 left-3 font-mono text-[9px] tracking-[0.12em] text-outcome-down uppercase">
        Floor
      </span>
      <span className="absolute top-2 right-3 font-mono text-[9px] tracking-[0.12em] text-primary uppercase">
        Yield
      </span>
    </VisualFrame>
  )
}

function RangeLadderVisual() {
  return (
    <VisualFrame>
      <svg
        aria-hidden="true"
        className="relative h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 200 96"
      >
        <line
          className="text-border"
          stroke="currentColor"
          strokeDasharray="3 4"
          strokeOpacity="0.7"
          x1="100"
          x2="100"
          y1="14"
          y2="82"
        />
        <rect
          className="text-chart-2"
          fill="currentColor"
          fillOpacity="0.7"
          height="10"
          rx="5"
          width="150"
          x="14"
          y="28"
        />
        <rect
          className="text-primary"
          fill="currentColor"
          fillOpacity="0.85"
          height="10"
          rx="5"
          width="150"
          x="36"
          y="43"
        />
        <rect
          className="text-chart-3"
          fill="currentColor"
          fillOpacity="0.65"
          height="10"
          rx="5"
          width="150"
          x="20"
          y="58"
        />
      </svg>
    </VisualFrame>
  )
}

export function StrategyVisual({ strategyKey }: { strategyKey: StrategyKey }) {
  switch (strategyKey) {
    case "earn":
      return <LiquidityVisual />
    case "shield":
      return <TailHedgeVisual />
    case "rangeLadder":
      return <RangeLadderVisual />
  }
}
