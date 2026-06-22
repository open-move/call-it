import { useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"

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

// The keeper advances every few seconds; poll often enough to feel live without
// hammering the status API.
const POLL_INTERVAL_MS = 15_000

export function Page({ snapshot }: KeeperPageProps) {
  const router = useRouter()
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) {
        setRefreshing(true)
      }
      // Bump the signal so the client-fetched tables refetch, and invalidate the
      // loader so the heartbeat / counts refresh too.
      setRefreshKey((key) => key + 1)
      try {
        await router.invalidate()
      } finally {
        if (showSpinner) {
          setRefreshing(false)
        }
      }
    },
    [router]
  )

  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) {
        void refresh(false)
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  if (!snapshot) {
    return <KeeperOffline />
  }

  const { reconcileErrors, status } = snapshot

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <section className="space-y-3">
        <KeeperHeader
          onRefresh={() => void refresh(true)}
          refreshing={refreshing}
          status={status}
        />
        <HeartbeatStrip
          redeemableCount={status.redeemableCount}
          redeemedCount={status.redeemedCount}
          status={status}
        />
        <div className="grid items-start gap-3 pt-3 lg:grid-cols-2">
          <PositionsTable refreshSignal={refreshKey} />
          <RedemptionsLedger refreshSignal={refreshKey} />
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <RewardVaultPanel status={status} />
          <QuarantinePanel errors={reconcileErrors} />
        </div>
      </section>
    </main>
  )
}
