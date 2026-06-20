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
  | "/arena"
  | "/earn"
  | "/strategies"
  | "/portfolio"
  | "/risk"
  | "/leaderboard"

export const appNavItems: AppNavItem[] = [
  { href: "/markets", label: "Trade", status: AppNavStatus.Active },
  { href: "/earn", label: "Earn", status: AppNavStatus.Available },
  { href: "/strategies", label: "Strategies", status: AppNavStatus.Available },
  { href: "/risk", label: "Risk", status: AppNavStatus.Available },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    status: AppNavStatus.Available,
  },
  { href: "/portfolio", label: "Portfolio", status: AppNavStatus.Available },
]
