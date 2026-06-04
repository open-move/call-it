import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Avatar as DicebearAvatar, Style } from "@dicebear/core"
import glyphs from "@dicebear/styles/glyphs.json"
import { useEffect, useMemo, useState } from "react"
import { formatAddress } from "@mysten/sui/utils"
import {
  CheckIcon,
  CoinsIcon,
  CopyIcon,
  LogOutIcon,
  SettingsIcon,
  SquareArrowOutUpRightIcon,
  UserRoundIcon,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/primitives/dropdown-menu"
import { formatDecimalUnits } from "~/lib/callit/trading/amounts"
import {
  PREDICT_QUOTE_ASSET,
  PREDICT_QUOTE_DECIMALS,
} from "~/lib/deepbook/config"
import { getSuiGrpcClient } from "~/lib/deepbook/sui-client"

const walletButtonClassName =
  "border-0 bg-white/[0.06] text-white/88 shadow-none hover:bg-white/[0.1] hover:text-white focus-visible:ring-white/20"

const signInButtonClassName =
  "border-0 bg-white text-[#111112] shadow-none hover:bg-white/88 focus-visible:ring-white/25"

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

function BalanceSegment({ walletAddress }: { walletAddress: string }) {
  const [balance, setBalance] = useState<bigint>()
  const [isLoadingBalance, setIsLoadingBalance] = useState(true)

  useEffect(() => {
    let isStale = false

    async function loadBalance() {
      setIsLoadingBalance(true)

      try {
        const response = await getSuiGrpcClient().getBalance({
          coinType: PREDICT_QUOTE_ASSET,
          owner: walletAddress,
        })

        if (!isStale) {
          setBalance(BigInt(response.balance.balance))
        }
      } catch {
        if (!isStale) {
          setBalance(undefined)
        }
      } finally {
        if (!isStale) {
          setIsLoadingBalance(false)
        }
      }
    }

    void loadBalance()

    return () => {
      isStale = true
    }
  }, [walletAddress])

  const balanceLabel = isLoadingBalance
    ? "--"
    : balance === undefined
      ? "--"
      : formatDecimalUnits(balance, PREDICT_QUOTE_DECIMALS, 4)

  return (
    <div
      aria-label={`DUSDC balance ${balanceLabel}`}
      className="flex items-center gap-2"
    >
      <CoinsIcon className="size-3.5 text-white/38" />
      <span className="font-mono text-xs text-white/72 tabular-nums">
        {balanceLabel}
      </span>
    </div>
  )
}

function AccountDropdown({
  address,
  email,
  onSignOut,
  onOpenProfile,
}: {
  address: string
  email?: string
  onSignOut: () => Promise<void>
  onOpenProfile: () => void
}) {
  const [didCopyAddress, setDidCopyAddress] = useState(false)
  const formattedAddress = formatAddress(address)
  const secondaryLabel = email || "--"

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
            className="border-0 bg-transparent text-white/50 shadow-none hover:bg-white/[0.055] hover:text-white/80 focus-visible:ring-white/20"
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <WalletAvatar address={address} className="size-5 rounded-md" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <div className="flex items-center gap-3 px-2 py-2">
            <WalletAvatar address={address} className="size-10 rounded-md" />
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenProfile}>
            <UserRoundIcon className="size-3.5" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenProfile}>
            <SettingsIcon className="size-3.5" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openExplorer}>
            <SquareArrowOutUpRightIcon className="size-3.5" />
            View in Explorer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-400 focus:bg-red-500/10 focus:text-red-400 [&_svg]:text-red-400 focus:[&_svg]:text-red-400"
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
  onSignOut,
  onOpenProfile,
}: {
  address: string
  email?: string
  onSignOut: () => Promise<void>
  onOpenProfile: () => void
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md bg-white/[0.045] px-2.5 py-1.5 shadow-none">
      <BalanceSegment walletAddress={address} />
      <span aria-hidden="true" className="h-3 w-px bg-white/14" />
      <AccountDropdown
        address={address}
        email={email}
        onOpenProfile={onOpenProfile}
        onSignOut={onSignOut}
      />
    </div>
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
      <AccountCluster
        address={primaryWallet.address}
        email={user?.email}
        onOpenProfile={() => setShowDynamicUserProfile(true)}
        onSignOut={handleLogOut}
      />
    )
  }

  if (user) {
    return (
      <Button
        className={walletButtonClassName}
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => setShowDynamicUserProfile(true)}
      >
        Account
      </Button>
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
