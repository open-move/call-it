import { Link } from "react-router"
import { useState } from "react"
import { MenuIcon, XIcon } from "lucide-react"

import { Badge, BadgeTone } from "~/components/primitives/badge"
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
  navigationMenuTriggerStyle,
} from "~/components/ui/navigation-menu"
import { cn } from "~/lib/utils"

import { AppNavStatus, appNavItems } from "./app-nav"

function getNavLinkClassName(status: AppNavStatus) {
  return cn(
    navigationMenuTriggerStyle(),
    "h-9 gap-2 bg-transparent px-2 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground focus:bg-transparent data-[active=true]:bg-transparent data-[active=true]:text-foreground",
    status === AppNavStatus.Active && "font-semibold text-foreground",
    status === AppNavStatus.Soon && "text-muted-foreground/70"
  )
}

function getMobileNavLinkClassName(status: AppNavStatus) {
  return cn(
    "flex items-center justify-between py-3 text-base text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none",
    status === AppNavStatus.Active && "font-semibold text-foreground",
    status === AppNavStatus.Soon && "text-muted-foreground/70"
  )
}

export function AppHeader() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  return (
    <Collapsible open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            className="text-base leading-none font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
            to="/"
            onClick={() => setIsMobileNavOpen(false)}
          >
            CallIt
          </Link>

          <NavigationMenu className="hidden flex-none md:flex">
            <NavigationMenuList className="gap-1">
              {appNavItems.map((item) => (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink
                    active={item.status === AppNavStatus.Active}
                    className={getNavLinkClassName(item.status)}
                    render={<Link to={item.href} />}
                  >
                    <span>{item.label}</span>
                    {item.status === AppNavStatus.Soon && (
                      <Badge className="px-1.5 py-0 text-[10px]" tone={BadgeTone.Simulated}>
                        Soon
                      </Badge>
                    )}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="flex items-center gap-2">
            <Button className="hidden sm:inline-flex" size="sm">
              Connect Wallet
            </Button>
            <CollapsibleTrigger
              className="md:hidden"
              render={<Button aria-label="Toggle navigation" size="icon-sm" variant="ghost" />}
            >
              {isMobileNavOpen ? <XIcon /> : <MenuIcon />}
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="border-t border-border/80 md:hidden">
          <nav
            aria-label="Mobile navigation"
            className="mx-auto flex w-full max-w-7xl flex-col px-4 py-3 sm:px-6"
          >
            {appNavItems.map((item) => (
              <Link
                className={getMobileNavLinkClassName(item.status)}
                key={item.href}
                onClick={() => setIsMobileNavOpen(false)}
                to={item.href}
              >
                <span>{item.label}</span>
                {item.status === AppNavStatus.Soon && (
                  <Badge className="px-1.5 py-0 text-[10px]" tone={BadgeTone.Simulated}>
                    Soon
                  </Badge>
                )}
              </Link>
            ))}
            <Button className="mt-3 w-full sm:hidden" size="sm">
              Connect Wallet
            </Button>
          </nav>
        </CollapsibleContent>
      </header>
    </Collapsible>
  )
}
