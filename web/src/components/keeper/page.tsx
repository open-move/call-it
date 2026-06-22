import { HeartbeatStrip, KeeperHeader } from "./heartbeat"
import { KeeperOffline } from "./offline"
import { PositionsTable } from "./positions-table"
import { QuarantinePanel } from "./quarantine"
import { RedemptionsLedger } from "./redemptions-table"
import { RewardVaultPanel } from "./reward-panel"
import type { KeeperSnapshot } from "@/services/keeper-client"

export interface KeeperPageProps {
  snapshot: KeeperSnapshot | null
}

export function Page({ snapshot }: KeeperPageProps) {
  if (!snapshot) {
    return <KeeperOffline />
  }

  const { reconcileErrors, status } = snapshot

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <KeeperHeader status={status} />
        <HeartbeatStrip
          redeemableCount={status.redeemableCount}
          redeemedCount={status.redeemedCount}
          status={status}
        />
        <PositionsTable />
        <RedemptionsLedger />
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <RewardVaultPanel status={status} />
          <QuarantinePanel errors={reconcileErrors} />
        </div>
      </section>
    </main>
  )
}
