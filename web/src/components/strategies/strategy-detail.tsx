import { useEffect, useState } from "react"

import { AllocationBar, type AllocationSegment } from "@/components/primitives/allocation-bar"
import { Badge, BadgeTone } from "@/components/primitives/badge"
import { DataRow } from "@/components/primitives/data-row"
import { StatusIndicator } from "@/components/primitives/status-indicator"
import { Button } from "@/components/ui/button"
import {
  formatBps,
  formatCount,
  formatDusdc,
  formatShares,
  formatStrikeUsd,
  getStrategyStatus,
  positionValue,
  sharePriceFormatter,
  truncateAddress,
} from "@/lib/strategies/format"
import { getStrategyStatusTone } from "@/lib/strategies/hooks"
import type { StrategyMeta } from "@/lib/strategies/registry"
import type { StrategyState } from "@/lib/strategies/types"
import { useStrategyAction } from "@/lib/strategies/use-strategy-action"
import { StrategyActionDialog } from "./action-dialog"

function allocationSegments(meta: StrategyMeta, state: StrategyState): AllocationSegment[] | undefined {
  const parts = meta.allocation.map((segment) => ({
    ...segment,
    weight: state.policy[segment.field] ?? 0,
  }))
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.weight), 0)
  if (total <= 0) {
    return undefined
  }
  return parts.map((part) => ({
    label: part.label,
    pct: Math.max(0, part.weight) / total,
    tone: part.tone,
  }))
}

function Hero({ meta, state }: { meta: StrategyMeta; state: StrategyState }) {
  const status = getStrategyStatus(state)
  return (
    <div className="rounded-lg bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base leading-none font-semibold tracking-[-0.01em] text-balance text-foreground">
              {meta.name}
            </h1>
            <Badge tone={BadgeTone.Neutral}>{meta.shareSymbol}</Badge>
          </div>
          <p className="max-w-2xl text-xs leading-5 text-pretty text-muted-foreground">
            {meta.tagline}
          </p>
        </div>
        <StatusIndicator className="shrink-0 text-xs" tone={getStrategyStatusTone(status)}>
          {status}
        </StatusIndicator>
      </div>
    </div>
  )
}

function OverviewCard({ meta, state }: { meta: StrategyMeta; state: StrategyState }) {
  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">Strategy</h2>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">NAV</div>
          <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
            {formatDusdc(state.nav)}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-xs text-muted-foreground">{meta.shareSymbol} price</div>
          <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
            {sharePriceFormatter.format(state.sharePrice)}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <AllocationBar label="Capital allocation" segments={allocationSegments(meta, state)} />
      </div>

      <div className="mt-5">
        {meta.hasPlp ? (
          <DataRow label="PLP deployed" value={formatDusdc(state.plpCostBasis ?? 0n)} />
        ) : null}
        <DataRow label={`${meta.shareSymbol} supply`} value={formatShares(state.shareSupply)} />
        {state.reservedBaseShares > 0n ? (
          <DataRow label="Reserved (claims)" value={formatShares(state.reservedBaseShares)} />
        ) : null}
        {state.pendingShares > 0n ? (
          <DataRow label="Queued withdrawals" value={formatShares(state.pendingShares)} />
        ) : null}
      </div>
    </div>
  )
}

function RoundCard({ meta, state }: { meta: StrategyMeta; state: StrategyState }) {
  const status = getStrategyStatus(state)
  const round = state.round

  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">Current round</h2>
        <StatusIndicator className="text-xs" tone={getStrategyStatusTone(status)}>
          {status}
        </StatusIndicator>
      </div>

      <p className="mt-2 text-xs leading-5 text-pretty text-muted-foreground">
        {round
          ? "Positions are open for this expiry; deposits and withdrawals queue until the round settles."
          : "Between rounds — deposits and withdrawals settle instantly."}
      </p>

      <div className="mt-5">
        {round ? (
          <>
            {meta.shape === "single" ? (
              <>
                <DataRow label="Strike" tone="down" value={round.strike ? formatStrikeUsd(round.strike) : "—"} />
                <DataRow label="Size" value={round.quantity ? formatShares(round.quantity) : "—"} />
              </>
            ) : null}
            {meta.shape === "dual" ? (
              <>
                <DataRow label="Down strike" tone="down" value={round.downStrike ? formatStrikeUsd(round.downStrike) : "—"} />
                <DataRow label="Up strike" tone="up" value={round.upStrike ? formatStrikeUsd(round.upStrike) : "—"} />
                <DataRow label="Down size" value={round.downQuantity ? formatShares(round.downQuantity) : "—"} />
                <DataRow label="Up size" value={round.upQuantity ? formatShares(round.upQuantity) : "—"} />
              </>
            ) : null}
            {meta.shape === "ladder" ? (
              <DataRow label="Rungs" value={round.positionCount === null ? "—" : formatCount(round.positionCount)} />
            ) : null}
            <DataRow label="Oracle" mono value={truncateAddress(round.oracleId)} />
          </>
        ) : (
          <DataRow label="Oracle" value="No active round" />
        )}
      </div>
    </div>
  )
}

function PolicyCard({ meta, state }: { meta: StrategyMeta; state: StrategyState }) {
  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">Policy</h2>
      <div className="mt-4">
        {meta.policyFields.map((field) => {
          const value = state.policy[field.field]
          return (
            <DataRow
              key={field.field}
              label={field.label}
              value={
                value === undefined
                  ? "—"
                  : field.kind === "count"
                    ? formatCount(value)
                    : formatBps(value)
              }
            />
          )
        })}
      </div>
    </div>
  )
}

function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

function PositionPromptStatic({ shareSymbol }: { shareSymbol: string }) {
  return (
    <div className="mt-4 flex flex-1 flex-col">
      <p className="max-w-xs text-xs leading-5 text-pretty text-muted-foreground">
        Connect your wallet to deposit DUSDC and hold {shareSymbol}. No borrowing, no liquidation.
      </p>
      <div className="mt-auto pt-5">
        <div aria-hidden="true" className="h-9 w-full animate-pulse rounded-md bg-muted/40" />
      </div>
    </div>
  )
}

// Wallet state depends on Dynamic, whose store isn't available during SSR. Gate
// it behind mount so Hero/Overview/Round/Policy still server-render.
function PositionPanel({ meta, state }: { meta: StrategyMeta; state: StrategyState }) {
  const mounted = useMounted()
  return (
    <div className="flex h-full flex-col rounded-lg bg-card p-4">
      <h2 className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">Your position</h2>
      {mounted ? (
        <PositionBody meta={meta} state={state} />
      ) : (
        <PositionPromptStatic shareSymbol={meta.shareSymbol} />
      )}
    </div>
  )
}

function PositionBody({ meta, state }: { meta: StrategyMeta; state: StrategyState }) {
  const controller = useStrategyAction(meta, state)
  const { address, connect, openDialog, wallet } = controller
  const value = wallet ? positionValue(wallet.shareBalance, state) : 0n

  return (
    <>
      {address ? (
        <>
          <div className="mt-4">
            <div className="text-xs text-muted-foreground">Position value</div>
            <div className="mt-1 font-mono text-xl leading-none font-medium tracking-tight text-foreground tabular-nums">
              {formatDusdc(value)}
            </div>
          </div>
          <div className="mt-5">
            <DataRow label="DUSDC balance" value={wallet ? formatDusdc(wallet.dusdcBalance, 4) : "—"} />
            <DataRow label={`${meta.shareSymbol} balance`} value={wallet ? formatShares(wallet.shareBalance) : "—"} />
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
            <Button className="active:scale-[0.96]" onClick={() => openDialog("deposit")} type="button">
              Deposit DUSDC
            </Button>
            <Button className="active:scale-[0.96]" onClick={() => openDialog("withdraw")} type="button" variant="outline">
              Withdraw
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-4 flex flex-1 flex-col">
          <p className="max-w-xs text-xs leading-5 text-pretty text-muted-foreground">
            Connect your wallet to deposit DUSDC and hold {meta.shareSymbol}. No borrowing, no liquidation.
          </p>
          <div className="mt-auto pt-5">
            <Button className="w-full active:scale-[0.96]" onClick={connect} type="button">
              Connect wallet
            </Button>
          </div>
        </div>
      )}

      <StrategyActionDialog controller={controller} meta={meta} state={state} />
    </>
  )
}

export function StrategyDetail({ meta, state }: { meta: StrategyMeta; state?: StrategyState }) {
  if (!state) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-card p-4">
          <h1 className="text-base font-semibold text-foreground">{meta.name}</h1>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            This vault isn't available right now — its on-chain state could not be read.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <Hero meta={meta} state={state} />
        <div className="mx-auto grid max-w-5xl items-stretch gap-3 lg:grid-cols-2">
          <PositionPanel meta={meta} state={state} />
          <OverviewCard meta={meta} state={state} />
        </div>
        <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-2">
          <RoundCard meta={meta} state={state} />
          <PolicyCard meta={meta} state={state} />
        </div>
      </section>
    </main>
  )
}
