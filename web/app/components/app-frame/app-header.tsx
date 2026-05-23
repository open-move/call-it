import { Link } from "react-router"

import { Badge, BadgeTone } from "~/components/primitives/badge"
import { Button } from "~/components/primitives/button"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "~/components/primitives/navigation-menu"
import { cn } from "~/lib/utils"

enum AppNavStatus {
  Active = "active",
  Available = "available",
  Soon = "soon",
}

interface AppNavItem {
  href: string
  label: string
  status: AppNavStatus
}

const appNavItems: AppNavItem[] = [
  { href: "/", label: "Trade", status: AppNavStatus.Active },
  { href: "/portfolio", label: "Portfolio", status: AppNavStatus.Available },
  { href: "/earn", label: "Earn", status: AppNavStatus.Available },
  { href: "/risk", label: "Risk", status: AppNavStatus.Available },
  { href: "/automate", label: "Automate", status: AppNavStatus.Soon },
]

function getNavLinkClassName(status: AppNavStatus) {
  return cn(
    navigationMenuTriggerStyle(),
    "h-9 gap-2 bg-transparent px-2 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground focus:bg-transparent data-[active=true]:bg-transparent data-[active=true]:text-foreground",
    status === AppNavStatus.Active && "font-semibold text-foreground",
    status === AppNavStatus.Soon && "text-muted-foreground/70"
  )
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          className="text-base leading-none font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
          to="/"
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

        <Button size="sm">Connect Wallet</Button>
      </div>
    </header>
  )
}
