import { BadgeTone } from "@/components/primitives/badge"
import { Panel } from "@/components/primitives/panel"
import { formatCount, truncateMiddle } from "@/lib/keeper/helpers"
import type { KeeperReconcileError } from "@/services/keeper-client"

import { StatusDot } from "./table-controls"

export function QuarantinePanel({
  errors,
}: {
  errors: KeeperReconcileError[]
}) {
  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Reconcile quarantine
        </div>
        <StatusDot
          tone={errors.length > 0 ? BadgeTone.Warning : BadgeTone.Neutral}
        >
          {errors.length > 0
            ? `${formatCount(errors.length)} quarantined`
            : "Clean"}
        </StatusDot>
      </div>

      {errors.length > 0 ? (
        <ul className="space-y-2">
          {errors.map((error) => (
            <li
              key={error.id}
              className="rounded-sm border border-warning/25 bg-warning/8 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-mono text-xs font-medium text-warning">
                  {error.eventType.split("::").at(-1) ?? error.eventType}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                  ckpt {formatCount(error.checkpoint)}
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {error.error ?? truncateMiddle(error.id)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-5 text-pretty text-muted-foreground">
          No quarantined events. A malformed event is isolated here instead of
          stalling reconciliation, so the keeper keeps making progress.
        </p>
      )}
    </Panel>
  )
}
