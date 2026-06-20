import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Avatar as DicebearAvatar, Style } from "@dicebear/core"
import glyphs from "@dicebear/styles/glyphs.json"
import { useEffect, useMemo, useState } from "react"
import { formatAddress } from "@mysten/sui/utils"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DatabaseZapIcon,
  LogOutIcon,
  PiggyBankIcon,
  SettingsIcon,
  SquareArrowOutUpRightIcon,
  WalletCardsIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu"
import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import { usePredictAccount } from "@/lib/providers/predict-account"

const walletButtonClassName =
  "border border-border/40 bg-muted/30 text-foreground shadow-none hover:bg-muted/45 hover:text-foreground focus-visible:ring-primary/30"

const signInButtonClassName =
  "border border-primary/40 bg-primary text-primary-foreground shadow-none hover:bg-primary/90 hover:text-primary-foreground focus-visible:ring-primary/30"

const glyphsStyle = new Style(glyphs)

function getExplorerUrl(address: string) {
  return `https://testnet.suivision.xyz/account/${address}`
}

function WalletAvatar({
  address,
  className,
}: {
  address: string
  className?: string
}) {
  const avatar = useMemo(() => {
    return new DicebearAvatar(glyphsStyle, {
      seed: address,
      size: 128,
    }).toDataUri()
  }, [address])

  return <img alt="Wallet avatar" className={className} src={avatar} />
}

function formatCompactDecimalUnits(value: bigint | undefined) {
  if (value === undefined) {
    return "--"
  }

  const decimalValue = Number(
    formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)
  )

  if (!Number.isFinite(decimalValue)) {
    return formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 2)
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimalValue >= 10_000 ? 1 : 2,
    notation: "compact",
  }).format(decimalValue)
}

function formatFullDecimalUnits(value: bigint | undefined) {
  return value === undefined
    ? "--"
    : formatDecimalUnits(value, PREDICT_QUOTE_DECIMALS, 4)
}

function AccountValue({
  isLoading,
  value,
}: {
  isLoading?: boolean
  value: string
}) {
  return (
    <div className="mt-1 min-w-0 font-mono text-base break-all text-foreground tabular-nums sm:text-lg">
      {isLoading ? "--" : value}
    </div>
  )
}

function AccountSection({
  icon: Icon,
  label,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  isLoading,
}: {
  icon: typeof WalletCardsIcon
  isLoading?: boolean
  label: string
  primaryLabel: string
  primaryValue: string
  secondaryLabel?: string
  secondaryValue?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-card/70 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <div
        className={`mt-4 grid gap-4 ${secondaryLabel && secondaryValue ? "sm:grid-cols-2" : ""}`}
      >
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{primaryLabel}</div>
          <AccountValue isLoading={isLoading} value={primaryValue} />
        </div>
        {secondaryLabel && secondaryValue ? (
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">
              {secondaryLabel}
            </div>
            <AccountValue isLoading={isLoading} value={secondaryValue} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AccountHubDialog({
  address,
  email,
  onOpenChange,
  onOpenDynamicProfile,
  onSignOut,
  open,
}: {
  address?: string
  email?: string
  onOpenChange: (open: boolean) => void
  onOpenDynamicProfile: () => void
  onSignOut: () => Promise<void>
  open: boolean
}) {
  const predictAccount = usePredictAccount()

  useEffect(() => {
    if (open && address) {
      void predictAccount.refreshAccount()
    }
  }, [address, open])

  const walletDusdcBalance = predictAccount.walletDusdcBalance
  const managerDusdcBalance = predictAccount.managerDusdcBalance
  const availableDusdcBalance =
    walletDusdcBalance === undefined && managerDusdcBalance === undefined
      ? undefined
      : (walletDusdcBalance ?? 0n) + (managerDusdcBalance ?? 0n)
  const walletDusdcLabel = formatFullDecimalUnits(walletDusdcBalance)
  const availableDusdcLabel = formatFullDecimalUnits(availableDusdcBalance)
  const walletAddressBalanceLabel = formatFullDecimalUnits(
    predictAccount.walletDusdcAddressBalance
  )
  const walletPlpLabel =
    predictAccount.walletPlpBalance === undefined
      ? "--"
      : `${formatDecimalUnits(predictAccount.walletPlpBalance, PREDICT_QUOTE_DECIMALS, 4)}`
  const managerBalanceLabel = formatFullDecimalUnits(managerDusdcBalance)
  const isLoadingAccount = predictAccount.status === "loading"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] border-0 shadow-none ring-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>
            Wallet, trading account, and strategy balances in one place.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 overflow-hidden">
          <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="text-sm break-all text-foreground">
              {address ? formatAddress(address) : "No wallet connected"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {email || "Wallet session"}
            </div>
          </div>

          <div className="grid gap-3">
            <AccountSection
              icon={WalletCardsIcon}
              isLoading={isLoadingAccount}
              label="Wallet"
              primaryLabel="Wallet DUSDC"
              primaryValue={walletDusdcLabel}
              secondaryLabel="Address balance"
              secondaryValue={walletAddressBalanceLabel}
            />
            <AccountSection
              icon={DatabaseZapIcon}
              isLoading={isLoadingAccount}
              label="Trading Account"
              primaryLabel="Available DUSDC"
              primaryValue={availableDusdcLabel}
              secondaryLabel="Trading DUSDC"
              secondaryValue={managerBalanceLabel}
            />
            <AccountSection
              icon={PiggyBankIcon}
              isLoading={isLoadingAccount}
              label="Strategy Shares"
              primaryLabel="PLP"
              primaryValue={walletPlpLabel}
            />
          </div>
        </div>

        <DialogFooter
          className="flex-wrap gap-2 sm:justify-end"
          showCloseButton
        >
          <Button
            className="w-full sm:w-auto"
            render={<Link to="/earn" />}
            type="button"
            variant="outline"
          >
            Open Earn
          </Button>
          <Button
            className="w-full sm:w-auto"
            render={<Link to="/portfolio" />}
            type="button"
            variant="outline"
          >
            Open Portfolio
          </Button>
          <Button
            className="w-full sm:w-auto"
            type="button"
            variant="outline"
            onClick={onOpenDynamicProfile}
          >
            Wallet Settings
          </Button>
          <Button
            className="w-full sm:w-auto"
            type="button"
            variant="outline"
            onClick={() => void onSignOut()}
          >
            Sign Out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AccountMenuMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/35 bg-muted/20 px-2.5 py-2">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-xs text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function AccountDropdown({
  address,
  email,
  onOpenDynamicProfile,
  onSignOut,
  onOpenProfile,
}: {
  address: string
  email?: string
  onOpenDynamicProfile: () => void
  onSignOut: () => Promise<void>
  onOpenProfile: () => void
}) {
  const [didCopyAddress, setDidCopyAddress] = useState(false)
  const predictAccount = usePredictAccount()
  const formattedAddress = formatAddress(address)
  const secondaryLabel = email || "--"
  const availableDusdcBalance =
    predictAccount.walletDusdcBalance === undefined &&
    predictAccount.managerDusdcBalance === undefined
      ? undefined
      : (predictAccount.walletDusdcBalance ?? 0n) +
        (predictAccount.managerDusdcBalance ?? 0n)
  const availableDusdcLabel = formatFullDecimalUnits(availableDusdcBalance)
  const walletPlpLabel = formatFullDecimalUnits(predictAccount.walletPlpBalance)
  const compactDusdcLabel =
    predictAccount.status === "loading"
      ? "--"
      : formatCompactDecimalUnits(availableDusdcBalance)

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address)
      setDidCopyAddress(true)
      window.setTimeout(() => setDidCopyAddress(false), 1500)
    } catch {
      setDidCopyAddress(false)
    }
  }

  function openExplorer() {
    window.open(getExplorerUrl(address), "_blank", "noopener,noreferrer")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Account menu"
            className="group h-8 gap-2 border border-border/35 bg-muted/20 px-2.5 text-foreground shadow-none transition-[background-color,border-color,color] duration-150 hover:border-border/50 hover:bg-muted/30 hover:text-foreground focus-visible:ring-primary/30"
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <span className="text-xs font-medium text-foreground">
          {formattedAddress}
        </span>
        <span aria-hidden="true" className="size-1 rounded-full bg-border" />
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {compactDusdcLabel}
        </span>
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          DUSDC
        </span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform duration-150 group-data-popup-open:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <div className="flex items-center gap-3 px-2 py-2">
            <WalletAvatar
              address={address}
              className="size-10 rounded-md ring-1 ring-border/50"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">
                {formattedAddress}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {secondaryLabel}
              </span>
            </span>
            <Button
              aria-label="Copy wallet address"
              className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation()
                void copyAddress()
              }}
            >
              {didCopyAddress ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
            <AccountMenuMetric label="Available" value={availableDusdcLabel} />
            <AccountMenuMetric label="PLP" value={walletPlpLabel} />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenProfile}>
            <WalletCardsIcon className="size-3.5" />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/portfolio" />}>
            <WalletCardsIcon className="size-3.5" />
            Portfolio
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenDynamicProfile}>
            <SettingsIcon className="size-3.5" />
            Wallet Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openExplorer}>
            <SquareArrowOutUpRightIcon className="size-3.5" />
            View in Explorer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive focus:[&_svg]:text-destructive"
            variant="destructive"
            onClick={() => void onSignOut()}
          >
            <LogOutIcon className="size-3.5" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountCluster({
  address,
  email,
  onOpenDynamicProfile,
  onSignOut,
  onOpenProfile,
}: {
  address: string
  email?: string
  onOpenDynamicProfile: () => void
  onSignOut: () => Promise<void>
  onOpenProfile: () => void
}) {
  return (
    <AccountDropdown
      address={address}
      email={email}
      onOpenDynamicProfile={onOpenDynamicProfile}
      onOpenProfile={onOpenProfile}
      onSignOut={onSignOut}
    />
  )
}

function DynamicWalletButton() {
  const {
    primaryWallet,
    sdkHasLoaded,
    handleLogOut,
    setShowAuthFlow,
    setShowDynamicUserProfile,
    user,
  } = useDynamicContext()
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)

  if (!sdkHasLoaded) {
    return (
      <Button
        className={signInButtonClassName}
        disabled
        size="sm"
        type="button"
      >
        Sign In
      </Button>
    )
  }

  if (primaryWallet) {
    return (
      <>
        <AccountCluster
          address={primaryWallet.address}
          email={user?.email}
          onOpenDynamicProfile={() => setShowDynamicUserProfile(true)}
          onOpenProfile={() => setIsAccountModalOpen(true)}
          onSignOut={handleLogOut}
        />
        <AccountHubDialog
          address={primaryWallet.address}
          email={user?.email}
          open={isAccountModalOpen}
          onOpenChange={setIsAccountModalOpen}
          onOpenDynamicProfile={() => setShowDynamicUserProfile(true)}
          onSignOut={handleLogOut}
        />
      </>
    )
  }

  if (user) {
    return (
      <>
        <Button
          className={walletButtonClassName}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setIsAccountModalOpen(true)}
        >
          Account
        </Button>
        <AccountHubDialog
          email={user.email}
          open={isAccountModalOpen}
          onOpenChange={setIsAccountModalOpen}
          onOpenDynamicProfile={() => setShowDynamicUserProfile(true)}
          onSignOut={handleLogOut}
        />
      </>
    )
  }

  return (
    <Button
      className={signInButtonClassName}
      size="sm"
      type="button"
      onClick={() => setShowAuthFlow(true)}
    >
      Sign In
    </Button>
  )
}

export function DynamicWalletWidget() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <Button
        className={signInButtonClassName}
        disabled
        size="sm"
        type="button"
      >
        Sign In
      </Button>
    )
  }

  return <DynamicWalletButton />
}
