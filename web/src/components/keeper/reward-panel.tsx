import { Badge, BadgeTone } from "@/components/primitives/badge"
import { DataRow } from "@/components/primitives/data-row"
import { Panel, PanelTone } from "@/components/primitives/panel"
import { truncateMiddle } from "@/lib/keeper/helpers"
import type { KeeperStatus } from "@/services/keeper-client"

export function RewardVaultPanel({ status }: { status: KeeperStatus }) {
  const deployed = status.rewardVaultId !== null

  return (
    <Panel tone={deployed ? PanelTone.Accent : PanelTone.Default} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Reward vault
        </div>
        <Badge tone={deployed ? BadgeTone.Live : BadgeTone.Neutral}>
          {deployed ? "Active" : "Not deployed"}
        </Badge>
      </div>

      {deployed ? (
        <div>
          <DataRow label="Vault" mono value={truncateMiddle(status.rewardVaultId ?? "")} />
          <DataRow label="Tip policy" value="Fixed reward per full redemption" />
          <DataRow label="Routing" mono value="redeem_with_reward" />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-muted-foreground text-pretty">
            The keeper currently redeems unrewarded (gas-funded). Deploy the
            <span className="font-mono"> keeper_rewards </span>
            vault and set <span className="font-mono">KEEPER_REWARD_VAULT_ID</span> to
            pay the executor a fixed, operator-funded tip per redemption.
          </p>
          <div>
            <DataRow label="Tip policy" value="Fixed, admin-set, opt-in" />
            <DataRow label="Funding" value="Operator-funded vault" />
            <DataRow label="Status" tone="warning" value="Awaiting deployment" />
          </div>
        </div>
      )}
    </Panel>
  )
}
