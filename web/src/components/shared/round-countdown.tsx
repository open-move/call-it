import { ClockIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { formatExpiryDistance } from "@/lib/format"

/**
 * Live "time remaining" for a strategy round, ticking once a second. Renders
 * the distance to the round's market expiry, or a settling state once it has
 * elapsed. Only mounts client-side (strategy data loads after hydration), so
 * the per-second clock never causes an SSR mismatch.
 */
export function RoundCountdown({ expiryMs }: { expiryMs: number }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1_000)

    return () => window.clearInterval(intervalId)
  }, [])

  const hasElapsed = expiryMs - nowMs <= 0

  return (
    <div className="flex items-center gap-1.5">
      <ClockIcon className="size-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        {hasElapsed ? "Round" : "Ends in"}
      </span>
      <span className="text-xs font-medium text-foreground tabular-nums">
        {hasElapsed ? "Settling" : formatExpiryDistance(expiryMs, nowMs)}
      </span>
    </div>
  )
}
