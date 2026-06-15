export enum AppNavStatus {
  Active = "active",
  Available = "available",
  Soon = "soon",
}

export interface AppNavItem {
  href: AppNavHref
  label: string
  status: AppNavStatus
}

export type AppNavHref =
  | "/"
  | "/markets"
  | "/protection"
  | "/shield"
  | "/earn"
  | "/portfolio"

export const appNavItems: AppNavItem[] = [
  { href: "/markets", label: "Trade", status: AppNavStatus.Active },
  {
    href: "/protection",
    label: "Protection",
    status: AppNavStatus.Available,
  },
  { href: "/earn", label: "Earn", status: AppNavStatus.Available },
  { href: "/portfolio", label: "Portfolio", status: AppNavStatus.Available },
]
