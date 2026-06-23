import { Link } from "@tanstack/react-router"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DusdcValue,
  formatDusdc,
  SignedUsdValue,
  UsdValue,
} from "@/lib/portfolio/format"
import { getPnlClassName } from "@/lib/portfolio/helpers"
import type { PortfolioSummary } from "@/lib/portfolio/helpers"
import { truncateAddress } from "@/lib/strategies/format"
import { cn } from "@/lib/utils"

function Metric({
  className,
  label,
  tone = "default",
  value,
}: {
  className?: string
  label: string
  tone?: "default" | "muted" | "up" | "down"
  value: React.ReactNode
}) {
  return (
    <div
      className={cn("min-w-0 rounded-md bg-muted/25 px-2.5 py-2", className)}
    >
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-sm font-medium",
          tone === "default" && "text-foreground",
          tone === "muted" && "text-muted-foreground",
          tone === "up" && "text-outcome-up",
          tone === "down" && "text-outcome-down"
        )}
      >
        {value}
      </div>
    </div>
  )
}

function AccountAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">Your account</span>
      <button
        className="group inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
        onClick={copy}
        type="button"
      >
        <span className="tabular-nums">{truncateAddress(address)}</span>
        {copied ? (
          <CheckIcon className="size-3.5 text-primary" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </button>
    </div>
  )
}

export function AccountCard({
  claimableDusdc,
  isClaiming,
  onClaim,
  summary,
  walletAddress,
}: {
  claimableDusdc: number
  isClaiming: boolean
  onClaim: () => void
  summary: PortfolioSummary
  walletAddress: string
}) {
  return (
    <Card className="gap-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0">
      <div className="border-b border-border/45 px-4 py-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Portfolio
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4">
        <div>
          <div className="truncate text-xs text-muted-foreground">
            Net Value
          </div>
          <div>
            <UsdValue
              className="mt-1 block text-2xl font-medium tracking-tight text-foreground"
              value={summary.portfolioValueUsd}
            />
            <div
              className={cn(
                "mt-1 flex items-baseline gap-1.5 text-xs",
                getPnlClassName(summary.unrealizedPnlUsd)
              )}
            >
              <SignedUsdValue value={summary.unrealizedPnlUsd} />
              <span className="text-muted-foreground">unrealized</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Wallet"
            value={<DusdcValue value={summary.availableDusdc} />}
          />
          <Metric
            label="PLP Value"
            value={<UsdValue value={summary.plpValueUsd} />}
          />
        </div>

        <div className="grid gap-2">
          <Link className={cn(buttonVariants(), "w-full")} to="/markets">
            Trade
          </Link>
          {claimableDusdc > 0 ? (
            <Button
              className="h-auto min-h-9 py-2 leading-5 whitespace-normal"
              disabled={isClaiming}
              onClick={onClaim}
              type="button"
              variant="secondary"
            >
              {isClaiming
                ? "Claiming…"
                : `Claim ${formatDusdc(claimableDusdc)} to wallet`}
            </Button>
          ) : null}
          <AccountAddress address={walletAddress} />
        </div>
      </div>
    </Card>
  )
}
