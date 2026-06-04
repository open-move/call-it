import { Link, useLocation } from "react-router"
import { useState } from "react"
import { MenuIcon, XIcon } from "lucide-react"

import { Badge, BadgeTone } from "~/components/primitives/badge"
import { DynamicWalletWidget } from "~/components/dynamic/wallet-widget"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "~/components/ui/navigation-menu"
import { cn } from "~/lib/utils"

import { AppNavStatus, appNavItems } from "./app-nav"

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

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 place-items-center rounded-md bg-primary text-[15px] font-black text-primary-foreground shadow-[0_0_24px_oklch(0.8974_0.1487_115.6236_/_18%)]"
    >
      C
    </span>
  )
}

export function AppHeader() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const { pathname } = useLocation()

  function getItemStatus(item: (typeof appNavItems)[number]) {
    if (item.status === AppNavStatus.Soon) {
      return item.status
    }

    const isActive =
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)

    return isActive ? AppNavStatus.Active : AppNavStatus.Available
  }

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
                <span className="font-mono text-[10px] leading-none font-semibold tracking-[0.32em] text-primary uppercase">
                  Predict
                </span>
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
                          className="border-white/10 bg-white/[0.06] px-1.5 py-0 text-[9px] text-white/58"
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
              <Link
                className={getMobileNavLinkClassName(getItemStatus(item))}
                key={item.href}
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
