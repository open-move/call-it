import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"

import { AssetIcon } from "@/components/shared/market/asset-icon"
import { TicketMessage } from "@/components/shared/ticket/ticket"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { parseDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import {
  getReadySuiTransactionSigner,
  RECONNECT_SUI_WALLET_MESSAGE,
} from "@/lib/dynamic/sui-wallet"
import { useAppRouteRefresh } from "@/lib/hooks/router"
import { formatExpiry, formatExpiryDistance } from "@/lib/format"
import { loadActiveMarketSnapshots } from "@/lib/market-loaders"
import type { MarketSnapshot } from "@/lib/types/market"
import { cn } from "@/lib/utils"
import { executeLaunchCall } from "@/services/arena-transactions"
import { formatPredictTradeError } from "@/services/predict-quotes"

type LaunchDirection = "up" | "down"

const MIN_BOND_DUSDC = 10

const directions: { icon: typeof ArrowUpIcon; label: string; value: LaunchDirection }[] = [
  { icon: ArrowUpIcon, label: "Up", value: "up" },
  { icon: ArrowDownIcon, label: "Down", value: "down" },
]

const usdFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "USD",
})

// Only active, future-expiry markets are launchable.
function isLaunchableMarket(market: MarketSnapshot, nowMs: number) {
  return market.status === "active" && market.expiryMs > nowMs
}

function formatExpiryCountdown(expiryMs: number, nowMs: number) {
  const distance = formatExpiryDistance(expiryMs, nowMs)

  return distance === "Expired" ? distance : `in ${distance}`
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function LaunchCallDialog() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // useDynamicContext throws "Store not initialized" during SSR, so render a
  // static trigger until mounted, then the real (wallet-aware) dialog.
  if (!isClient) {
    return (
      <Button disabled size="sm" type="button" variant="outline">
        <PlusIcon className="size-3.5" />
        Launch call
      </Button>
    )
  }

  return <LaunchCallDialogClient />
}

function LaunchCallDialogClient() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const refreshRoute = useAppRouteRefresh()
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState<LaunchDirection>("up")
  const [strike, setStrike] = useState("")
  const [bond, setBond] = useState("")

  const [markets, setMarkets] = useState<MarketSnapshot[]>([])
  const [marketsError, setMarketsError] = useState<string>()
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<string>()
  const [selectedOracleId, setSelectedOracleId] = useState<string>()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [statusKind, setStatusKind] = useState<"neutral" | "success">("neutral")
  const [errorMessage, setErrorMessage] = useState<string>()

  const walletAddress = primaryWallet?.address

  // Filter to launchable markets, then derive the asset → expiry options.
  const nowMs = Date.now()
  const launchableMarkets = markets.filter((market) =>
    isLaunchableMarket(market, nowMs)
  )
  const assets = [
    ...new Set(launchableMarkets.map((market) => market.assetSymbol)),
  ]
  const assetOptions = assets.map((symbol) => {
    const sample = launchableMarkets.find(
      (market) => market.assetSymbol === symbol
    )

    return {
      iconUrl: sample?.assetIconUrl,
      name: sample?.assetName ?? symbol,
      spotUsd: sample?.currentPriceUsd ?? 0,
      symbol,
    }
  })
  const assetMarkets = selectedAsset
    ? launchableMarkets
        .filter((market) => market.assetSymbol === selectedAsset)
        .sort((first, second) => first.expiryMs - second.expiryMs)
    : []
  const selectedMarket = assetMarkets.find(
    (market) => market.oracleId === selectedOracleId
  )

  const bondNumber = Number(bond)
  const bondBelowMin =
    bond.trim() !== "" &&
    (Number.isNaN(bondNumber) || bondNumber < MIN_BOND_DUSDC)
  const strikeNumber = Number(strike)
  const hasStrike =
    strike.trim() !== "" && !Number.isNaN(strikeNumber) && strikeNumber > 0
  const bondUnits = parseDecimalUnits(bond, PREDICT_QUOTE_DECIMALS)

  // Live oracle list comes from Predict; the dialog only loads it when opened.
  useEffect(() => {
    if (!open || markets.length > 0) {
      return
    }

    let isStale = false
    setIsLoadingMarkets(true)
    setMarketsError(undefined)

    loadActiveMarketSnapshots()
      .then((nextMarkets) => {
        if (isStale) {
          return
        }

        setMarkets(nextMarkets)
      })
      .catch((error: unknown) => {
        if (isStale) {
          return
        }

        setMarketsError(
          error instanceof Error ? error.message : "Failed to load markets."
        )
      })
      .finally(() => {
        if (!isStale) {
          setIsLoadingMarkets(false)
        }
      })

    return () => {
      isStale = true
    }
  }, [open, markets.length])

  // Default the strike to the selected market's spot; the user can override.
  useEffect(() => {
    if (selectedMarket) {
      setStrike(String(Math.round(selectedMarket.currentPriceUsd)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarket?.oracleId])

  const isLaunchDisabled =
    isSubmitting ||
    !selectedMarket ||
    !hasStrike ||
    !bondUnits ||
    bondBelowMin ||
    (!!walletAddress && bondNumber < MIN_BOND_DUSDC)

  const actionLabel = !walletAddress
    ? "Connect wallet"
    : isSubmitting
      ? "Launching"
      : "Launch call"

  function resetState() {
    setStatusMessage(undefined)
    setStatusKind("neutral")
    setErrorMessage(undefined)
  }

  function handleSelectAsset(asset: string) {
    setSelectedAsset(asset)
    setSelectedOracleId(undefined)
    setStrike("")
  }

  async function handleSubmit() {
    resetState()

    if (!selectedMarket) {
      setErrorMessage("Select a market to call.")
      return
    }

    if (!walletAddress) {
      setShowAuthFlow(true)
      return
    }

    const signer = await getReadySuiTransactionSigner(primaryWallet)

    if (!signer) {
      setErrorMessage(RECONNECT_SUI_WALLET_MESSAGE)
      setShowAuthFlow(true)
      return
    }

    if (!hasStrike) {
      setErrorMessage("Enter a strike price.")
      return
    }

    if (!bondUnits || bondNumber < MIN_BOND_DUSDC) {
      setErrorMessage(`Bond must be at least ${MIN_BOND_DUSDC} DUSDC.`)
      return
    }

    setIsSubmitting(true)
    setStatusMessage("Launching call")

    try {
      await executeLaunchCall(
        {
          bondAmount: bondUnits,
          isUp: direction === "up",
          oracleId: selectedMarket.oracleId,
          strikePriceUsd: strikeNumber,
          walletAddress,
        },
        signer
      )

      setStatusMessage("Call launched")
      setStatusKind("success")
      refreshRoute()
      window.setTimeout(() => {
        setOpen(false)
      }, 900)
    } catch (error) {
      setStatusMessage(undefined)
      setStatusKind("neutral")
      setErrorMessage(formatPredictTradeError(error, "Launch failed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)

        if (!nextOpen) {
          resetState()
          setSelectedAsset(undefined)
          setSelectedOracleId(undefined)
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <PlusIcon className="size-3.5" />
            Launch call
          </Button>
        }
      />
      <DialogContent className="gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            Launch a call
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Asset
            </span>
            {isLoadingMarkets ? (
              <div className="rounded-md border border-border/35 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
                Loading markets…
              </div>
            ) : marketsError ? (
              <TicketMessage kind="error">{marketsError}</TicketMessage>
            ) : assets.length === 0 ? (
              <div className="rounded-md border border-border/35 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
                No active markets available.
              </div>
            ) : (
              <Select
                onValueChange={(value) => handleSelectAsset(value as string)}
                value={selectedAsset ?? null}
              >
                <SelectTrigger className="w-full border-border/35 bg-muted/25 shadow-none">
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {assetOptions.map((option) => (
                    <SelectItem key={option.symbol} value={option.symbol}>
                      <AssetIcon
                        assetIconUrl={option.iconUrl}
                        assetName={option.name}
                        assetSymbol={option.symbol}
                        className="size-5"
                      />
                      <span className="font-medium">{option.symbol}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                        {usdFormatter.format(option.spotUsd)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedAsset && assetMarkets.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Expiry
              </span>
              <Select
                onValueChange={(value) => setSelectedOracleId(value as string)}
                value={selectedOracleId ?? null}
              >
                <SelectTrigger className="w-full border-border/35 bg-muted/25 shadow-none">
                  <SelectValue placeholder="Select expiry">
                    {(value) => {
                      const market = assetMarkets.find(
                        (option) => option.oracleId === value
                      )

                      return market
                        ? formatExpiry(market.expiryMs)
                        : "Select expiry"
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {assetMarkets.map((market) => (
                    <SelectItem key={market.oracleId} value={market.oracleId}>
                      <span className="font-medium">
                        {formatExpiry(market.expiryMs)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatExpiryCountdown(market.expiryMs, nowMs)}
                      </span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                        {usdFormatter.format(market.currentPriceUsd)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Field label="Direction">
            <div aria-label="Direction" className="grid grid-cols-2 gap-2">
              {directions.map((option) => {
                const isSelected = direction === option.value
                const Icon = option.icon

                return (
                  <Button
                    aria-pressed={isSelected}
                    className={cn(
                      "border border-border/35 bg-muted/25 text-muted-foreground shadow-none hover:bg-muted/35 hover:text-foreground",
                      isSelected &&
                        (option.value === "up"
                          ? "border-outcome-up/30 bg-outcome-up/10 text-outcome-up hover:bg-outcome-up/15"
                          : "border-outcome-down/30 bg-outcome-down/10 text-outcome-down hover:bg-outcome-down/15")
                    )}
                    key={option.value}
                    onClick={() => setDirection(option.value)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Icon className="size-3" />
                    {option.label}
                  </Button>
                )
              })}
            </div>
          </Field>

          <Field label="Strike price">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                className="border-border/35 bg-muted/25 pl-6 font-mono text-sm shadow-none ring-0 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
                inputMode="decimal"
                onChange={(event) => setStrike(event.target.value)}
                placeholder="0"
                value={strike}
              />
            </div>
          </Field>

          <Field label="Bond">
            <div className="space-y-1">
              <div className="relative">
                <Input
                  className="border-border/35 bg-muted/25 pr-16 font-mono text-sm shadow-none ring-0 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
                  inputMode="decimal"
                  onChange={(event) => setBond(event.target.value)}
                  placeholder="10"
                  value={bond}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                  DUSDC
                </span>
              </div>
              <p
                className={cn(
                  "text-[11px]",
                  bondBelowMin ? "text-warning" : "text-muted-foreground"
                )}
              >
                Minimum {MIN_BOND_DUSDC} DUSDC — supplied as PLP to bond your
                call.
              </p>
            </div>
          </Field>

          {(errorMessage || statusMessage) && (
            <TicketMessage
              kind={
                errorMessage
                  ? "error"
                  : statusKind === "success"
                    ? "success"
                    : "neutral"
              }
            >
              {errorMessage ?? statusMessage}
            </TicketMessage>
          )}
        </div>

        <DialogFooter>
          <Button
            className="w-full active:scale-[0.98]"
            disabled={isLaunchDisabled}
            onClick={handleSubmit}
            size="lg"
            type="button"
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
