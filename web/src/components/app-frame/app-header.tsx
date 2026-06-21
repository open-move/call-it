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
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { cn } from "@/lib/utils"

import { AppNavStatus, appNavItems } from "./app-nav"
import { BrandMark } from "./brand-mark"

function getNavLinkClassName(status: AppNavStatus) {
  return cn(
    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-[background-color,color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
    status === AppNavStatus.Active
      ? "text-primary"
      : "text-muted-foreground hover:bg-muted/25 hover:text-foreground",
    status === AppNavStatus.Soon && "text-muted-foreground/55"
  )
}

function getMobileNavLinkClassName(status: AppNavStatus) {
  return cn(
    "flex items-center justify-between rounded-md px-3 py-3 text-sm font-medium transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
    status === AppNavStatus.Active
      ? "text-primary"
      : "text-muted-foreground hover:bg-muted/25 hover:text-foreground",
    status === AppNavStatus.Soon && "text-muted-foreground/55"
  )
}

function isHrefActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`)
}

export function AppHeader() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const { pathname } = useLocation()
  const onLanding = pathname === "/"

  function getItemStatus(item: (typeof appNavItems)[number]) {
    if (item.status === AppNavStatus.Soon) {
      return item.status
    }

    const isActive = isHrefActive(pathname, item.href)

    return isActive ? AppNavStatus.Active : AppNavStatus.Available
  }

  return (
    <Collapsible open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
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
              onClick={() => setIsMobileNavOpen(false)}
            >
              <BrandMark />
              <span className="text-base leading-none font-semibold tracking-[-0.03em] text-foreground">
                Call<span className="text-primary">It</span>
              </span>
            </Link>

            <NavigationMenu className="hidden flex-none md:flex">
              <NavigationMenuList className="gap-0.5">
                {appNavItems.map((item) => (
                  <NavigationMenuItem key={item.href}>
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

        <CollapsibleContent className="border-t border-border/35 bg-background/95 backdrop-blur-xl md:hidden">
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
