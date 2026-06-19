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
  protectionNavItems,
  type ProtectionNavItem,
} from "./app-nav"
import { BrandMark } from "./brand-mark"

function getNavLinkClassName(status: AppNavStatus) {
  return cn(
    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-normal text-white/62 transition-colors outline-none hover:text-white/78 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none",
    status === AppNavStatus.Active && "text-primary",
    status === AppNavStatus.Soon && "text-white/45"
  )
}

function getMobileNavLinkClassName(status: AppNavStatus) {
  return cn(
    "flex items-center justify-between rounded-md px-3 py-3 text-sm font-normal text-white/62 transition-colors hover:text-white/78 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none",
    status === AppNavStatus.Active && "text-primary",
    status === AppNavStatus.Soon && "text-white/45"
  )
}

function isHrefActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`)
}

function isProtectionPath(pathname: string) {
  return (
    isHrefActive(pathname, "/shield") ||
    isHrefActive(pathname, "/protect") ||
    isHrefActive(pathname, "/range-ladder") ||
    isHrefActive(pathname, "/protection")
  )
}

function getProtectionTriggerClassName(isActive: boolean) {
  return cn(
    "flex h-auto items-center gap-1 rounded-md bg-transparent px-2.5 py-1.5 text-sm font-normal text-white/62 transition-colors outline-none hover:bg-transparent hover:text-white/78 focus:bg-transparent focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none data-popup-open:bg-white/[0.04] data-popup-open:text-white/78",
    isActive && "text-primary"
  )
}

function ProtectionDropdownLink({ item }: { item: ProtectionNavItem }) {
  return (
    <NavigationMenuLink
      className="group w-44 rounded-md px-2.5 py-2 text-sm font-normal text-white/62 hover:bg-white/[0.06] hover:text-white/78 focus:bg-white/[0.06]"
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

  const isProtectionActive = isProtectionPath(pathname)

  return (
    <Collapsible open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#111112]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              className="flex shrink-0 items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none"
              to="/"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <BrandMark />
              <span className="flex items-baseline gap-2">
                <span className="text-lg leading-none font-semibold tracking-tight text-white">
                  CallIt
                </span>
                <span className="text-[10px] leading-none font-semibold tracking-[0.32em] text-primary uppercase">
                  Predict
                </span>
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
                            className="border-white/10 bg-white/[0.06] px-1.5 py-0 text-[9px] text-white/58"
                            tone={BadgeTone.Simulated}
                          >
                            Soon
                          </Badge>
                        )}
                      </NavigationMenuLink>
                    </NavigationMenuItem>

                    {item.href === "/markets" ? (
                      <NavigationMenuItem>
                        <NavigationMenuTrigger
                          aria-current={isProtectionActive ? "page" : undefined}
                          className={getProtectionTriggerClassName(
                            isProtectionActive
                          )}
                        >
                          Protection
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className="bg-[#111112] text-white">
                          <div className="grid gap-1 p-1.5">
                            {protectionNavItems.map((protectionItem) => (
                              <ProtectionDropdownLink
                                item={protectionItem}
                                key={protectionItem.href}
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
                  className="text-white/76 hover:bg-white/[0.08] hover:text-white"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              {isMobileNavOpen ? <XIcon /> : <MenuIcon />}
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="border-t border-white/10 md:hidden">
          <nav
            aria-label="Mobile navigation"
            className="mx-auto flex w-full max-w-[96rem] flex-col gap-1 px-4 py-3 sm:px-6"
          >
            {appNavItems.map((item) => (
              <div key={item.href}>
                <Link
                  className={getMobileNavLinkClassName(getItemStatus(item))}
                  onClick={() => setIsMobileNavOpen(false)}
                  to={item.href}
                >
                  <span>{item.label}</span>
                  {item.status === AppNavStatus.Soon && (
                    <Badge
                      className="border-white/10 bg-white/[0.06] px-1.5 py-0 text-[9px] text-white/58"
                      tone={BadgeTone.Simulated}
                    >
                      Soon
                    </Badge>
                  )}
                </Link>

                {item.href === "/markets" ? (
                  <div className="mt-1 rounded-md bg-white/[0.03] px-2 py-2">
                    <div
                      className={cn(
                        "px-1 pb-1 font-mono text-[10px] tracking-[0.18em] text-white/38 uppercase",
                        isProtectionActive && "text-primary"
                      )}
                    >
                      Protection
                    </div>
                    {protectionNavItems.map((protectionItem) => (
                      <Link
                        className="block rounded-md px-2 py-2 text-sm text-white/62 transition-colors hover:bg-white/[0.06] hover:text-white/78 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none"
                        key={protectionItem.href}
                        onClick={() => setIsMobileNavOpen(false)}
                        to={protectionItem.href}
                      >
                        {protectionItem.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
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
