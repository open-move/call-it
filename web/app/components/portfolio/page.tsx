import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { ArrowRightIcon, ShieldAlertIcon, Wallet2Icon } from "lucide-react"
import { useEffect, useState } from "react"

import { loadPortfolioPageDataForWallet } from "~/lib/callit/portfolio/loaders"
import { Badge, BadgeTone } from "~/components/primitives/badge"
import { Metric } from "~/components/primitives/metric"
import { Panel, PanelTone } from "~/components/primitives/panel"
import { Button } from "~/components/ui/button"
import { formatUsd } from "~/lib/callit/format"
import {
  type PortfolioActivityItem,
  type PortfolioPageData,
  type PortfolioPosition,
  PortfolioPositionKind,
  PortfolioPositionStatus,
} from "~/lib/callit/portfolio/types"
import { cn } from "~/lib/utils"

function getStatusTone(status: PortfolioPositionStatus) {
  switch (status) {
    case PortfolioPositionStatus.Active:
      return BadgeTone.Live
    case PortfolioPositionStatus.Redeemable:
      return BadgeTone.Warning
    case PortfolioPositionStatus.Settled:
      return BadgeTone.Neutral
  }
}

function getStatusLabel(status: PortfolioPositionStatus) {
  switch (status) {
    case PortfolioPositionStatus.Active:
      return "Active"
    case PortfolioPositionStatus.Redeemable:
      return "Claimable"
    case PortfolioPositionStatus.Settled:
      return "Settled"
  }
}

function getKindLabel(kind: PortfolioPositionKind) {
  switch (kind) {
    case PortfolioPositionKind.Binary:
      return "Binary"
    case PortfolioPositionKind.Range:
      return "Range"
    case PortfolioPositionKind.Liquidity:
      return "PLP"
  }
}

function getVisiblePositions(
  positions: PortfolioPosition[],
  status: PortfolioPositionStatus
) {
  return positions.filter((position) => position.status === status)
}

export function Page() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <Panel tone={PanelTone.Elevated}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={BadgeTone.Live}>Portfolio</Badge>
              <Badge tone={BadgeTone.Neutral}>Live Predict data</Badge>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Positions, claims, and manager balance in one place.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              The portfolio now resolves the latest PredictManager for the
              connected wallet, then reads live summary and position data from
              the Predict server.
            </p>
          </div>

          <PortfolioActions isClient={isClient} />
        </div>
      </Panel>

      {isClient ? (
        <PortfolioContent />
      ) : (
        <PortfolioLoadingState />
      )}
    </main>
  )
}

function PortfolioActions({ isClient }: { isClient: boolean }) {
  if (!isClient) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Button className="min-w-40" disabled type="button">
          Loading wallet
        </Button>
        <Button className="min-w-40" disabled type="button" variant="outline">
          Redeem selected
        </Button>
      </div>
    )
  }

  return <PortfolioActionsClient />
}

function PortfolioActionsClient() {
  const { primaryWallet, sdkHasLoaded, setShowAuthFlow, user } =
    useDynamicContext()
  const hasWalletIdentity = Boolean(primaryWallet?.address || user)

  if (!sdkHasLoaded) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Button className="min-w-40" disabled type="button">
          Loading wallet
        </Button>
        <Button className="min-w-40" disabled type="button" variant="outline">
          Redeem selected
        </Button>
      </div>
    )
  }

  if (!hasWalletIdentity) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          className="min-w-40"
          type="button"
          onClick={() => setShowAuthFlow(true)}
        >
          Sign in to load portfolio
        </Button>
        <Button className="min-w-40" disabled type="button" variant="outline">
          Redeem selected
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button className="min-w-40" disabled type="button">
        Wallet detected
      </Button>
      <Button className="min-w-40" disabled type="button" variant="outline">
        Redeem selected
      </Button>
    </div>
  )
}

function PortfolioContent() {
  const { primaryWallet, sdkHasLoaded, user } = useDynamicContext()
  const isSignedIn = sdkHasLoaded && Boolean(primaryWallet || user)
  const walletAddress = primaryWallet?.address
  const [data, setData] = useState<PortfolioPageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isSignedIn) {
    return <PortfolioSignedOutState />
  }

  useEffect(() => {
    if (!walletAddress) {
      setData(null)
      setIsLoading(false)
      setErrorMessage("Connect a Sui wallet in Dynamic to load Predict data.")
      return
    }

    const resolvedWalletAddress = walletAddress
    let isCancelled = false

    async function loadPortfolio() {
      try {
        if (!isCancelled) {
          setIsLoading(true)
        }

        const nextData = await loadPortfolioPageDataForWallet(
          resolvedWalletAddress
        )

        if (isCancelled) {
          return
        }

        if (!nextData) {
          setData(null)
          setErrorMessage("No PredictManager was found for this wallet yet.")
          return
        }

        setData(nextData)
        setErrorMessage(null)
      } catch (error) {
        if (!isCancelled) {
          setData(null)
          setErrorMessage("Unable to load portfolio data from the Predict server.")
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadPortfolio()
    const intervalId = window.setInterval(loadPortfolio, 15_000)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [walletAddress])

  if (isLoading) {
    return <PortfolioLoadingState />
  }

  if (errorMessage || !data) {
    return (
      <PortfolioUnavailableState
        message={errorMessage ?? "Portfolio data is not available right now."}
      />
    )
  }

  const activePositions = getVisiblePositions(
    data.positions,
    PortfolioPositionStatus.Active
  )
  const redeemablePositions = getVisiblePositions(
    data.positions,
    PortfolioPositionStatus.Redeemable
  )
  const settledPositions = getVisiblePositions(
    data.positions,
    PortfolioPositionStatus.Settled
  )

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <Metric
            label="Manager Balance"
            value={formatUsd(data.summary.managerBalanceUsd)}
            detail="Available quote balance and settled proceeds"
          />
        </Panel>
        <Panel>
          <Metric
            label="Active Exposure"
            value={data.summary.activePositions}
            detail="Open positions still awaiting settlement"
          />
        </Panel>
        <Panel>
          <Metric
            label="Claimable"
            value={formatUsd(data.summary.claimableAmountUsd)}
            detail="Settled positions ready to redeem"
          />
        </Panel>
        <Panel>
          <Metric
            label="Realized PnL"
            value={formatUsd(data.summary.realizedPnlUsd)}
            detail="Net redeemed profit and loss"
          />
        </Panel>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
        <div className="space-y-4">
          <PositionSection
            actionLabel="Monitor open risk"
            description="Live positions should lead the page. This keeps active exposure and expiry risk visible before secondary history."
            positions={activePositions}
            title="Active Positions"
          />
          <PositionSection
            actionLabel="Prioritize claims"
            description="Claimable rows separate settled-but-unredeemed value from everything else, which matches the next user action."
            positions={redeemablePositions}
            title="Redeemable"
          />
          <PositionSection
            actionLabel="Review outcomes"
            description="Settled history closes the loop on what expired, what paid out, and what already moved through the manager."
            positions={settledPositions}
            title="Settled History"
          />
        </div>

        <div className="space-y-4">
          <Panel className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Wallet2Icon className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Live Resolution
                </h2>
                <p className="text-sm text-muted-foreground">
                  Current wallet and manager read path.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <ReadinessRow
                label="Wallet address"
                value={walletAddress ?? "Wallet unavailable"}
              />
              <ReadinessRow
                label="Refresh policy"
                value="Manager + portfolio refetched every 15s"
              />
              <ReadinessRow
                label="Data source"
                value="Predict /managers + /summary + /positions/summary"
              />
              <ReadinessRow
                label="Redeem actions"
                value="Add after data model stabilizes"
              />
            </div>
          </Panel>

          <Panel className="space-y-4" tone={PanelTone.Accent}>
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-chart-4/12 text-chart-4">
                <ShieldAlertIcon className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Portfolio Notes
                </h2>
                <p className="text-sm text-muted-foreground">
                  Keep the first version tight.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>Do not block this page on full PnL precision or keeper automation.</p>
              <p>Ship clean sections first, then wire real Predict-backed summaries and claim flows.</p>
              <p>PLP can join later as a separate exposure module once vault endpoints are live in the app.</p>
            </div>
          </Panel>

          <Panel className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                Activity
              </h2>
              <span className="text-xs text-muted-foreground">
                {data.activity.length} events
              </span>
            </div>
            <div className="space-y-3">
              {data.activity.map((item) => (
                <ActivityRow item={item} key={item.id} />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

function PortfolioSignedOutState() {
  const { setShowAuthFlow } = useDynamicContext()

  return (
    <Panel className="space-y-4" tone={PanelTone.Accent}>
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Wallet2Icon className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Sign in to view portfolio
          </h2>
          <p className="text-sm text-muted-foreground">
            Portfolio data should load after Dynamic auth resolves the user wallet and linked Predict manager.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setShowAuthFlow(true)}>
          Sign in with Dynamic
        </Button>
        <Button disabled type="button" variant="outline">
          Manager summary unavailable
        </Button>
      </div>
    </Panel>
  )
}

function PortfolioUnavailableState({ message }: { message: string | null }) {
  return (
    <Panel className="space-y-4" tone={PanelTone.Accent}>
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-chart-4/12 text-chart-4">
          <ShieldAlertIcon className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Portfolio unavailable
          </h2>
          <p className="text-sm text-muted-foreground">
            {message ?? "Portfolio data is not available right now."}
          </p>
        </div>
      </div>
    </Panel>
  )
}

function PortfolioLoadingState() {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Panel className="min-h-30 animate-pulse" key={index}>
            <div />
          </Panel>
        ))}
      </section>
      <Panel className="min-h-64 animate-pulse">
        <div />
      </Panel>
    </>
  )
}

function PositionSection({
  actionLabel,
  description,
  positions,
  title,
}: {
  actionLabel: string
  description: string
  positions: PortfolioPosition[]
  title: string
}) {
  return (
    <Panel className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs text-muted-foreground">{actionLabel}</span>
      </div>

      <div className="space-y-3">
        {positions.map((position) => (
          <PositionRow key={position.id} position={position} />
        ))}
      </div>
    </Panel>
  )
}

function PositionRow({ position }: { position: PortfolioPosition }) {
  return (
    <div className="rounded-md border border-border/60 bg-surface-raised/75 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              {position.assetSymbol}
            </div>
            <Badge className="text-[10px]" tone={getStatusTone(position.status)}>
              {getStatusLabel(position.status)}
            </Badge>
            <Badge className="text-[10px]" tone={BadgeTone.Neutral}>
              {getKindLabel(position.kind)}
            </Badge>
          </div>
          <div className="mt-3 text-base font-semibold text-foreground">
            {position.outcomeLabel}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {position.settlementLabel}
          </div>
        </div>

        <div className="text-left lg:text-right">
          <div className="font-mono text-lg font-semibold tracking-[-0.03em] text-foreground">
            {position.valueLabel}
          </div>
          {position.pnlLabel && (
            <div
              className={cn(
                "mt-1 text-sm",
                position.pnlLabel.startsWith("+")
                  ? "text-outcome-up"
                  : "text-muted-foreground"
              )}
            >
              {position.pnlLabel}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 border-t border-border/40 pt-3 text-sm text-muted-foreground sm:grid-cols-3">
        <MetaItem label="Entry" value={position.entryPriceLabel} />
        <MetaItem label="Size" value={position.quantityLabel} />
        <MetaItem label="Expiry" value={position.expiryLabel} />
      </div>
    </div>
  )
}

function ActivityRow({ item }: { item: PortfolioActivityItem }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-surface-raised/60 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-foreground">
            {item.actionLabel}
          </div>
          <ArrowRightIcon className="size-3 text-muted-foreground" />
          <div className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            {item.assetSymbol}
          </div>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {item.detailLabel}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-semibold text-foreground">
          {item.amountLabel}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {item.timeLabel}
        </div>
      </div>
    </div>
  )
}

function ReadinessRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/30 pb-3 last:border-b-0 last:pb-0">
      <div className="text-foreground">{label}</div>
      <div className="max-w-52 text-right text-muted-foreground">{value}</div>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 text-foreground">{value}</div>
    </div>
  )
}
