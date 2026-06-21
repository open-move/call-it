import { DataRow } from "@/components/primitives/data-row"
import { Panel } from "@/components/primitives/panel"
import { StatusIndicator, StatusTone } from "@/components/primitives/status-indicator"
import { KEEPER_API_URL } from "@/lib/config"

export function KeeperOffline() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <Panel className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base leading-none font-semibold tracking-[-0.01em] text-balance text-foreground">
            Keeper offline
          </h1>
          <StatusIndicator tone={StatusTone.Risk}>Unreachable</StatusIndicator>
        </div>
        <p className="text-xs leading-5 text-muted-foreground text-pretty">
          The keeper status API did not respond. Start the keeper with its HTTP
          server and confirm the dashboard points at it — this view shows live
          keeper state and never fabricates data.
        </p>
        <div>
          <DataRow label="Configured URL" mono value={KEEPER_API_URL || "not set"} />
          <DataRow label="Start (live)" mono value="bun run start" />
          <DataRow label="Start (read-only)" mono value="bun run serve" />
        </div>
      </Panel>
    </main>
  )
}
