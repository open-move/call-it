import { Link, useLocation } from "@tanstack/react-router"
import { ChevronDownIcon } from "lucide-react"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu"
import { DynamicWalletWidget } from "@/components/dynamic/wallet-widget"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { cn } from "@/lib/utils"

import {
  AppNavStatus,
  desktopMoreNavItems,
  desktopPrimaryNavItems,
  isNavHrefActive,
  mobileMoreNavItems,
  mobileTabNavItems,
  type AppNavItem,
} from "./app-nav"
import { BrandMark } from "./brand-mark"
import { MobileMoreSheet } from "./mobile-more-sheet"
import { MobileTabItemContent } from "./mobile-tab-item"

function getNavLinkClassName(status: AppNavStatus) {
  return cn(
    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 outline-none hover:bg-transparent focus:bg-transparent focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none data-[active=true]:bg-transparent",
    status === AppNavStatus.Active
      ? "text-primary"
      : "text-muted-foreground hover:text-foreground",
    status === AppNavStatus.Soon && "text-muted-foreground/55"
  )
}

function getItemStatus(item: AppNavItem, pathname: string) {
  if (item.status === AppNavStatus.Soon) {
    return item.status
  }

  return isNavHrefActive(pathname, item.href)
    ? AppNavStatus.Active
    : AppNavStatus.Available
}

function SoonBadge() {
  return (
    <Badge
      className="border-border/40 bg-muted/30 px-1.5 py-0 text-[9px] text-muted-foreground"
      tone={BadgeTone.Simulated}
    >
      Soon
    </Badge>
  )
}

function DesktopMoreMenu({ pathname }: { pathname: string }) {
  const isActive = desktopMoreNavItems.some((item) =>
    isNavHrefActive(pathname, item.href)
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "group flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          isActive
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        More
        <ChevronDownIcon className="size-3.5 transition-transform duration-150 group-data-popup-open:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {desktopMoreNavItems.map((item) => {
          const Icon = item.icon
          return (
            <DropdownMenuItem
              key={item.href}
              className={cn(
                isNavHrefActive(pathname, item.href) &&
                  "text-primary focus:text-primary"
              )}
              render={<Link to={item.href} />}
            >
              <Icon className="size-3.5" />
              <span className="flex-1">{item.label}</span>
              {item.status === AppNavStatus.Soon ? <SoonBadge /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileTabBar({ pathname }: { pathname: string }) {
  const moreActive = mobileMoreNavItems.some((item) =>
    isNavHrefActive(pathname, item.href)
  )

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-background from-55% via-background to-transparent pt-8 md:hidden"
    >
      <div className="pointer-events-auto mx-auto flex max-w-md items-stretch justify-around gap-1 px-2 pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {mobileTabNavItems.map((item) => {
          const active = isNavHrefActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={active ? "page" : undefined}
              className="group flex flex-1 flex-col items-center justify-center gap-1 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <MobileTabItemContent
                active={active}
                icon={item.icon}
                label={item.label}
              />
            </Link>
          )
        })}

        <MobileMoreSheet active={moreActive} pathname={pathname} />
      </div>
    </nav>
  )
}

export function AppHeader() {
  const { pathname } = useLocation()
  const onLanding = pathname === "/"

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 text-foreground",
          onLanding
            ? "bg-transparent"
            : "border-b border-border/35 bg-background/92 backdrop-blur-xl"
        )}
      >
        <div className="mx-auto flex min-h-14 w-full max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <Link
              className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
              to="/"
            >
              <BrandMark />
              <span className="text-base leading-none font-semibold tracking-[-0.03em] text-foreground">
                Call<span className="text-primary">It</span>
              </span>
            </Link>

            <div className="hidden items-center gap-0.5 md:flex">
              <NavigationMenu className="flex-none">
                <NavigationMenuList className="gap-0.5">
                  {desktopPrimaryNavItems.map((item) => {
                    const status = getItemStatus(item, pathname)
                    return (
                      <NavigationMenuItem key={item.href}>
                        <NavigationMenuLink
                          aria-current={
                            status === AppNavStatus.Active ? "page" : undefined
                          }
                          className={getNavLinkClassName(status)}
                          render={<Link to={item.href} />}
                        >
                          <span>{item.label}</span>
                          {item.status === AppNavStatus.Soon ? (
                            <SoonBadge />
                          ) : null}
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    )
                  })}
                </NavigationMenuList>
              </NavigationMenu>
              <DesktopMoreMenu pathname={pathname} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DynamicWalletWidget />
          </div>
        </div>
      </header>

      <MobileTabBar pathname={pathname} />
    </>
  )
}
