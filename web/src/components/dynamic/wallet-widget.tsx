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
  MoonIcon,
  SquareArrowOutUpRightIcon,
  SunIcon,
  WalletCardsIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu"
import { useSession } from "@/lib/auth/session"
import { formatDecimalUnits } from "@/lib/amounts"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"
import { usePredictAccount } from "@/lib/providers/predict-account"
import { useTheme } from "@/lib/theme"
import type { Theme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { BackendError } from "@/services/backend-client"

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

const THEME_OPTIONS: { icon: typeof SunIcon; label: string; value: Theme }[] = [
  { icon: SunIcon, label: "Light", value: "light" },
  { icon: MoonIcon, label: "Dark", value: "dark" },
]

function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border/40 bg-muted/30 p-0.5">
      {THEME_OPTIONS.map(({ icon: Icon, label, value }) => {
        const isActive = theme === value

        return (
          <button
            aria-pressed={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors duration-150",
              isActive
                ? "bg-card text-foreground ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={value}
            onClick={() => setTheme(value)}
            type="button"
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function AccountHubDialog({
  address,
  email,
  onOpenChange,
  onSignOut,
  open,
}: {
  address?: string
  email?: string
  onOpenChange: (open: boolean) => void
  onSignOut: () => Promise<void>
  open: boolean
}) {
  const session = useSession()
  const [didCopyAddress, setDidCopyAddress] = useState(false)
  const formattedAddress = address ? formatAddress(address) : null

  // Username + email come from our own backend session (PATCH /me), not the
  // wallet provider.
  const sessionUser = session.user
  const sessionEmail = sessionUser?.email ?? email
  const currentUsername = sessionUser?.username ?? ""
  const canEditUsername = session.status === "authenticated"

  const [username, setUsername] = useState(currentUsername)
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<{
    kind: "error" | "success"
    text: string
  }>()

  // Seed the field from the saved username each time the modal opens, so a
  // discarded edit doesn't linger between sessions.
  useEffect(() => {
    if (open) {
      setUsername(sessionUser?.username ?? "")
      setUsernameStatus(undefined)
    }
  }, [open])

  // Backend rule: 3–20 lowercase letters, digits, or underscores.
  const normalizedUsername = username.trim().toLowerCase()
  const isUsernameValid = /^[a-z0-9_]{3,20}$/.test(normalizedUsername)
  const isUsernameDirty = normalizedUsername !== currentUsername
  const canSaveUsername =
    canEditUsername && isUsernameDirty && isUsernameValid && !isSavingUsername

  async function handleSaveUsername() {
    if (!canSaveUsername) {
      return
    }
    setUsernameStatus(undefined)
    setIsSavingUsername(true)
    try {
      await session.updateProfile({ username: normalizedUsername })
      setUsernameStatus({ kind: "success", text: "Username updated." })
    } catch (error) {
      const text =
        error instanceof BackendError && error.status === 409
          ? "That username is taken."
          : error instanceof Error && error.message
            ? error.message
            : "Could not update username."
      setUsernameStatus({ kind: "error", text })
    } finally {
      setIsSavingUsername(false)
    }
  }

  async function copyAddress() {
    if (!address) {
      return
    }
    try {
      await navigator.clipboard.writeText(address)
      setDidCopyAddress(true)
      window.setTimeout(() => setDidCopyAddress(false), 1500)
    } catch {
      setDidCopyAddress(false)
    }
  }

  function openExplorer() {
    if (!address) {
      return
    }
    window.open(getExplorerUrl(address), "_blank", "noopener,noreferrer")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            Account
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your identity, appearance, and settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {address ? (
              <WalletAvatar
                address={address}
                className="size-10 shrink-0 rounded-md ring-1 ring-border/50"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm text-foreground tabular-nums">
                {formattedAddress ?? "No wallet connected"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {currentUsername ? `@${currentUsername}` : "Sui wallet"}
              </div>
            </div>
            {address ? (
              <>
                <Button
                  aria-label="Copy wallet address"
                  className="size-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() => void copyAddress()}
                >
                  {didCopyAddress ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                </Button>
                <Button
                  aria-label="View wallet in explorer"
                  className="size-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={openExplorer}
                >
                  <SquareArrowOutUpRightIcon className="size-3.5" />
                </Button>
              </>
            ) : null}
          </div>

          <div className="h-px bg-foreground/10" />

          <div className="space-y-2">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="account-username"
            >
              Username
            </label>
            <div className="flex items-center gap-2">
              <Input
                autoComplete="off"
                className="flex-1 bg-muted/25 text-sm shadow-none ring-0 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
                disabled={!canEditUsername}
                id="account-username"
                maxLength={20}
                onChange={(event) =>
                  setUsername(event.target.value.toLowerCase())
                }
                placeholder="Set a username"
                spellCheck={false}
                value={username}
              />
              <Button
                disabled={!canSaveUsername}
                onClick={() => void handleSaveUsername()}
                size="sm"
                type="button"
              >
                {isSavingUsername ? "Saving" : "Save"}
              </Button>
            </div>
            {usernameStatus ? (
              <p
                className={cn(
                  "text-xs",
                  usernameStatus.kind === "success"
                    ? "text-outcome-up"
                    : "text-destructive"
                )}
              >
                {usernameStatus.text}
              </p>
            ) : (
              <p
                className={cn(
                  "text-xs",
                  isUsernameDirty && !isUsernameValid
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                3–20 lowercase letters, numbers, or underscores.
              </p>
            )}
          </div>

          {sessionEmail ? (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Email
              </span>
              <div className="truncate text-sm text-foreground">
                {sessionEmail}
              </div>
            </div>
          ) : null}

          <div className="h-px bg-foreground/10" />

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              Appearance
            </span>
            <ThemeToggle />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-end">
          <Button
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/30 sm:w-auto"
            type="button"
            variant="ghost"
            onClick={() => void onSignOut()}
          >
            <LogOutIcon className="size-3.5" />
            Sign out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const predictAccount = usePredictAccount()
  const formattedAddress = formatAddress(address)
  const secondaryLabel = email || "Wallet session"
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
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          void predictAccount.refreshAccount()
        }
      }}
    >
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
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex items-center gap-2.5 px-2 pt-1 pb-2">
          <WalletAvatar
            address={address}
            className="size-9 shrink-0 rounded-md ring-1 ring-border/50"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-xs text-foreground tabular-nums">
              {formattedAddress}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {secondaryLabel}
            </div>
          </div>
          <Button
            aria-label="Copy wallet address"
            className="size-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
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
          <Button
            aria-label="View wallet in explorer"
            className="size-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              openExplorer()
            }}
          >
            <SquareArrowOutUpRightIcon className="size-3.5" />
          </Button>
        </div>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">Available</span>
            <span className="font-mono text-sm font-medium text-foreground tabular-nums">
              {availableDusdcLabel}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                DUSDC
              </span>
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">PLP</span>
            <span className="font-mono text-xs text-foreground tabular-nums">
              {walletPlpLabel}
            </span>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem className="text-sm" render={<Link to="/portfolio" />}>
          <WalletCardsIcon className="size-4" />
          Portfolio
        </DropdownMenuItem>
        <DropdownMenuItem className="text-sm" onClick={onOpenProfile}>
          <DatabaseZapIcon className="size-4" />
          Account details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-sm text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive focus:[&_svg]:text-destructive"
          variant="destructive"
          onClick={() => void onSignOut()}
        >
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
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
    <AccountDropdown
      address={address}
      email={email}
      onOpenProfile={onOpenProfile}
      onSignOut={onSignOut}
    />
  )
}

function DynamicWalletButton() {
  const { primaryWallet, sdkHasLoaded, handleLogOut, setShowAuthFlow, user } =
    useDynamicContext()
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
          onOpenProfile={() => setIsAccountModalOpen(true)}
          onSignOut={handleLogOut}
        />
        <AccountHubDialog
          address={primaryWallet.address}
          email={user?.email}
          open={isAccountModalOpen}
          onOpenChange={setIsAccountModalOpen}
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
