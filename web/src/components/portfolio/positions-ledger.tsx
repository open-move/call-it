import { useNavigate } from "@tanstack/react-router"
import { SearchIcon } from "lucide-react"

import { ActivityTabsFrame } from "@/components/shared/activity/activity-tabs-frame"
import { PositionTable } from "@/components/shared/activity/position-table"
import { Input } from "@/components/ui/input"
import {
  getPortfolioMarketSearch,
  getTabCount,
  portfolioTabs,
} from "@/lib/portfolio/helpers"
import type { PortfolioPosition, PortfolioTab } from "@/lib/portfolio/helpers"
import { ActivityTable, getPortfolioPositionTableRows } from "./activity-table"

export function PositionsLedger({
  activeTab,
  isLoading,
  onRedeemPosition,
  onSearchChange,
  onTabChange,
  positions,
  redeemingPositionId,
  searchQuery,
  totalPositions,
}: {
  activeTab: PortfolioTab
  isLoading: boolean
  onRedeemPosition: (position: PortfolioPosition) => void
  onSearchChange: (value: string) => void
  onTabChange: (value: PortfolioTab) => void
  positions: PortfolioPosition[]
  redeemingPositionId?: string
  searchQuery: string
  totalPositions: PortfolioPosition[]
}) {
  const navigate = useNavigate()
  const searchInput = (
    <div className="relative w-full lg:w-72">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-8 pl-8"
        placeholder="Search markets"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </div>
  )

  return (
    <ActivityTabsFrame
      cardClassName="min-h-96"
      headerClassName="h-auto flex-col items-stretch gap-3 px-4 py-3 lg:h-11 lg:flex-row lg:items-center lg:py-0"
      headerContent={searchInput}
      tabsClassName="min-h-96"
      value={activeTab}
      onValueChange={onTabChange}
      tabs={portfolioTabs.map((tab) => ({
        content:
          tab.value === "activity" ? (
            <ActivityTable isLoading={isLoading} positions={positions} />
          ) : (
            <div className="h-full min-h-0 p-3">
              <PositionTable
                emptyMessage="No positions in this view."
                isLoading={isLoading}
                loadingMessage="Loading portfolio positions."
                rows={getPortfolioPositionTableRows({
                  onAddPosition: (position) => {
                    void navigate({
                      params: { oracleId: position.oracleId },
                      search: getPortfolioMarketSearch(position),
                      to: "/markets/$oracleId",
                    })
                  },
                  onLifecyclePosition: onRedeemPosition,
                  positions,
                  redeemingPositionId,
                })}
              />
            </div>
          ),
        count: getTabCount(totalPositions, tab.value),
        label: tab.label,
        value: tab.value,
      }))}
    />
  )
}
