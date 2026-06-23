import { DataRow } from "@/components/primitives/data-row"
import { StatusIndicator, StatusTone } from "@/components/primitives/status-indicator"
import { KEEPER_API_URL } from "@/lib/config"

export function KeeperOffline() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-4 rounded-lg bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base leading-none font-semibold tracking-[-0.01em] text-balance text-foreground">
            Keeper offline
          </h1>
          <StatusIndicator tone={StatusTone.Risk}>Unreachable</StatusIndicator>
        </div>
        <p className="text-xs leading-5 text-muted-foreground text-pretty">
          The keeper API didn't respond. Start the keeper's HTTP server and
          point the dashboard at it.
        </p>
        <div>
          <DataRow label="Configured URL" mono value={KEEPER_API_URL || "not set"} />
          <DataRow label="Start (live)" mono value="bun run start" />
          <DataRow label="Start (read-only)" mono value="bun run serve" />
        </div>
      </div>
    </main>
  )
}
