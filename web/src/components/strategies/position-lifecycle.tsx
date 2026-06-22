import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { formatDusdc, formatShares } from "@/lib/strategies/format"
import type { StrategyMeta } from "@/lib/strategies/registry"
import type { useStrategyAction } from "@/lib/strategies/use-strategy-action"

/**
 * In-flight positions for a strategy: deposits and withdrawals that are sitting
 * in the round queues. Each shows where it is in its lifecycle and the one
 * action available right now — refund/cancel while a round is live, claim once
 * it has settled. Persistent on the position panel, not buried in a dialog.
 */

function StateDot({ ready }: { ready: boolean }) {
  return (
    <span className="relative flex size-1.5" aria-hidden="true">
      {ready ? (
        <>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </>
      ) : (
        <span className="relative inline-flex size-1.5 rounded-full bg-muted-foreground/45" />
      )}
    </span>
  )
}

function LifecycleRow({
  action,
  hint,
  ready,
  title,
  value,
}: {
  action: ReactNode
  hint: string
  ready: boolean
  title: string
  value: string
}) {
  return (
    <div className="rounded-md border border-border/35 bg-muted/20 px-3 py-2.5 transition-colors duration-150 hover:bg-muted/30">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StateDot ready={ready} />
          <span className="truncate text-xs font-medium text-foreground">{title}</span>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">{value}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-[11px] leading-4 text-pretty text-muted-foreground">{hint}</span>
        <div className="flex shrink-0 gap-2">{action}</div>
      </div>
    </div>
  )
}

export function StrategyLifecycle({
  controller,
  meta,
}: {
  controller: ReturnType<typeof useStrategyAction>
  meta: StrategyMeta
}) {
  const {
    handleCancelPending,
    handleCancelRequest,
    handleClaimShares,
    handleClaimWithdrawal,
    isSubmitting,
    position,
  } = controller

  const pendingDeposit = position?.pendingDeposit ?? null
  const pendingWithdrawal = position?.pendingWithdrawal ?? null

  if (!pendingDeposit && !pendingWithdrawal) {
    return null
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        In flight
      </div>

      {pendingDeposit ? (
        <LifecycleRow
          action={
            pendingDeposit.settled ? (
              <Button disabled={isSubmitting} onClick={handleClaimShares} size="xs" type="button">
                Claim
              </Button>
            ) : (
              <Button disabled={isSubmitting} onClick={handleCancelPending} size="xs" type="button" variant="ghost">
                Cancel
              </Button>
            )
          }
          hint={
            pendingDeposit.settled
              ? `Settled — claim your ${meta.shareSymbol}`
              : "Converts to shares at the next settlement"
          }
          ready={pendingDeposit.settled}
          title="Pending deposit"
          value={`${formatDusdc(pendingDeposit.amount, 2)} DUSDC`}
        />
      ) : null}

      {pendingWithdrawal ? (
        <LifecycleRow
          action={
            pendingWithdrawal.settled ? (
              <Button disabled={isSubmitting} onClick={handleClaimWithdrawal} size="xs" type="button">
                Claim
              </Button>
            ) : (
              <Button disabled={isSubmitting} onClick={handleCancelRequest} size="xs" type="button" variant="ghost">
                Cancel
              </Button>
            )
          }
          hint={
            pendingWithdrawal.settled
              ? "Settled — claim your DUSDC"
              : "Settles at the next round"
          }
          ready={pendingWithdrawal.settled}
          title="Withdrawing"
          value={`${formatShares(pendingWithdrawal.shares)} ${meta.shareSymbol}`}
        />
      ) : null}
    </div>
  )
}
