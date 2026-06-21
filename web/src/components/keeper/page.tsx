import { HeartbeatStrip, KeeperHeader } from "./heartbeat"
import { KeeperOffline } from "./offline"
import { isRedeemable, PositionsTable } from "./positions-table"
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

  const { positions, reconcileErrors, status, txs } = snapshot
  const redeemableCount = positions.filter(isRedeemable).length
  const redeemedCount = txs.filter((tx) => tx.status === "succeeded").length

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <KeeperHeader status={status} />
        <HeartbeatStrip
          redeemableCount={redeemableCount}
          redeemedCount={redeemedCount}
          status={status}
        />
        <PositionsTable positions={positions} />
        <RedemptionsLedger txs={txs} />
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <RewardVaultPanel status={status} />
          <QuarantinePanel errors={reconcileErrors} />
        </div>
      </section>
    </main>
  )
}
