import { Link, useLocation } from "@tanstack/react-router"
import { Fragment, useState } from "react"
import { MenuIcon, XIcon } from "lucide-react"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import { DynamicWalletWidget } from "@/components/dynamic/wallet-widget"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import { cn } from "@/lib/utils"

import {
  AppNavStatus,
  appNavItems,
  vaultNavItems,
} from "./app-nav"
import type { VaultNavItem } from "./app-nav"
import { BrandMark } from "./brand-mark"

function getNavLinkClassName(status: AppNavStatus) {
  return cn(
    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-150 outline-none hover:bg-muted/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
    status === AppNavStatus.Active && "bg-primary/8 text-primary",
    status === AppNavStatus.Soon && "text-muted-foreground/55"
  )
}

function getMobileNavLinkClassName(status: AppNavStatus) {
  return cn(
    "flex items-center justify-between rounded-md px-3 py-3 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-150 hover:bg-muted/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
    status === AppNavStatus.Active && "bg-primary/8 text-primary",
    status === AppNavStatus.Soon && "text-muted-foreground/55"
  )
}

function isHrefActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`)
}

function isVaultPath(pathname: string) {
  return (
    isHrefActive(pathname, "/shield") ||
    isHrefActive(pathname, "/range-ladder") ||
    isHrefActive(pathname, "/protection")
  )
}

function getVaultTriggerClassName(isActive: boolean) {
  return cn(
    "flex h-auto items-center gap-1 rounded-md bg-transparent px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-150 outline-none hover:bg-muted/25 hover:text-foreground focus:bg-muted/25 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none data-popup-open:bg-muted/25 data-popup-open:text-foreground",
    isActive && "bg-primary/8 text-primary"
  )
}

function VaultDropdownLink({
  isActive,
  item,
}: {
  isActive: boolean
  item: VaultNavItem
}) {
  return (
    <NavigationMenuLink
      className={cn(
        "group w-44 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-150 hover:bg-muted/35 hover:text-foreground focus:bg-muted/35",
        isActive && "bg-primary/8 text-primary"
      )}
      render={<Link to={item.href} />}
    >
      {item.label}
    </NavigationMenuLink>
  )
}

export function AppHeader() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const { pathname } = useLocation()

  function getItemStatus(item: (typeof appNavItems)[number]) {
    if (item.status === AppNavStatus.Soon) {
      return item.status
    }

    const isActive = isHrefActive(pathname, item.href)

    return isActive ? AppNavStatus.Active : AppNavStatus.Available
  }

  const isVaultActive = isVaultPath(pathname)

  return (
    <Collapsible open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
      <header className="sticky top-0 z-40 border-b border-border/35 bg-background/92 text-foreground backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 w-full max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <Link
              className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
              to="/"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <BrandMark />
              <span className="text-base leading-none font-semibold tracking-[-0.02em] text-foreground">
                CallIt
              </span>
            </Link>

            <NavigationMenu className="hidden flex-none md:flex">
              <NavigationMenuList className="gap-0.5">
                {appNavItems.map((item) => (
                  <Fragment key={item.href}>
                    <NavigationMenuItem>
                      <NavigationMenuLink
                        aria-current={
                          getItemStatus(item) === AppNavStatus.Active
                            ? "page"
                            : undefined
                        }
                        className={getNavLinkClassName(getItemStatus(item))}
                        render={<Link to={item.href} />}
                      >
                        <span>{item.label}</span>
                        {item.status === AppNavStatus.Soon && (
                          <Badge
                            className="border-border/40 bg-muted/30 px-1.5 py-0 text-[9px] text-muted-foreground"
                            tone={BadgeTone.Simulated}
                          >
                            Soon
                          </Badge>
                        )}
                      </NavigationMenuLink>
                    </NavigationMenuItem>

                    {item.href === "/earn" ? (
                      <NavigationMenuItem>
                        <NavigationMenuTrigger
                          aria-current={isVaultActive ? "page" : undefined}
                          className={getVaultTriggerClassName(isVaultActive)}
                        >
                          Vaults
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className="border border-border/40 bg-popover text-popover-foreground shadow-xl">
                          <div className="grid gap-1 p-1.5">
                            {vaultNavItems.map((vaultItem) => (
                              <VaultDropdownLink
                                isActive={isHrefActive(pathname, vaultItem.href)}
                                item={vaultItem}
                                key={vaultItem.href}
                              />
                            ))}
                          </div>
                        </NavigationMenuContent>
                      </NavigationMenuItem>
                    ) : null}
                  </Fragment>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <DynamicWalletWidget />
            </div>
            <CollapsibleTrigger
              className="md:hidden"
              render={
                <Button
                  aria-label="Toggle navigation"
                  className="text-muted-foreground hover:bg-muted/25 hover:text-foreground focus-visible:ring-primary/30"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              {isMobileNavOpen ? <XIcon /> : <MenuIcon />}
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="border-t border-border/35 md:hidden">
          <nav
            aria-label="Mobile navigation"
            className="mx-auto flex w-full max-w-[96rem] flex-col gap-1 px-4 py-3 sm:px-6"
          >
            {appNavItems.map((item) => (
              <Fragment key={item.href}>
                <Link
                  className={getMobileNavLinkClassName(getItemStatus(item))}
                  onClick={() => setIsMobileNavOpen(false)}
                  to={item.href}
                >
                  <span>{item.label}</span>
                  {item.status === AppNavStatus.Soon && (
                    <Badge
                      className="border-border/40 bg-muted/30 px-1.5 py-0 text-[9px] text-muted-foreground"
                      tone={BadgeTone.Simulated}
                    >
                      Soon
                    </Badge>
                  )}
                </Link>

                {item.href === "/earn" ? (
                  <div className="mt-1 rounded-md bg-muted/15 px-2 py-2">
                    <div
                      className={cn(
                        "px-1 pb-1 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase",
                        isVaultActive && "text-primary"
                      )}
                    >
                      Vaults
                    </div>
                    {vaultNavItems.map((vaultItem) => (
                      <Link
                        className={cn(
                          "block rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-150 hover:bg-muted/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                          isHrefActive(pathname, vaultItem.href) &&
                            "bg-primary/8 text-primary"
                        )}
                        key={vaultItem.href}
                        onClick={() => setIsMobileNavOpen(false)}
                        to={vaultItem.href}
                      >
                        {vaultItem.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </Fragment>
            ))}
            <div className="mt-3 sm:hidden">
              <DynamicWalletWidget />
            </div>
          </nav>
        </CollapsibleContent>
      </header>
    </Collapsible>
  )
}
