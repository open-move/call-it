import { ArrowUpRightIcon } from "lucide-react"

import { BadgeTone } from "@/components/primitives/badge"
import { DataRow } from "@/components/primitives/data-row"
import { suivisionObjectUrl, truncateMiddle } from "@/lib/keeper/helpers"
import type { KeeperStatus } from "@/services/keeper-client"

import { StatusDot } from "./table-controls"

export function RewardVaultPanel({ status }: { status: KeeperStatus }) {
  // Whether this keeper is routing redemptions through a reward vault, which
  // reflects its config, not whether a vault exists on-chain.
  const active = status.rewardVaultId !== null

  return (
    <div className="space-y-3 rounded-lg bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Reward vault
        </div>
        <StatusDot tone={active ? BadgeTone.Live : BadgeTone.Neutral}>
          {active ? "Active" : "Inactive"}
        </StatusDot>
      </div>

      {active ? (
        <div>
          <DataRow
            label="Vault"
            mono
            value={
              <a
                className="group inline-flex items-center gap-1 underline-offset-4 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                href={suivisionObjectUrl(status.rewardVaultId ?? "")}
                rel="noreferrer"
                target="_blank"
              >
                {truncateMiddle(status.rewardVaultId ?? "")}
                <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </a>
            }
          />
          <DataRow
            label="Tip policy"
            value="Fixed reward per full redemption"
          />
          <DataRow label="Routing" mono value="redeem_with_reward" />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-pretty text-muted-foreground">
            This keeper redeems for free. Point it at a reward vault to earn a
            fixed, operator-funded tip per redemption.
          </p>
          <div>
            <DataRow label="Tip policy" value="Fixed, admin-set, opt-in" />
            <DataRow label="Funding" value="Operator-funded vault" />
          </div>
        </div>
      )}
    </div>
  )
}
