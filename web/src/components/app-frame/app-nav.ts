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

export interface VaultNavItem {
  href: VaultNavHref
  label: string
}

export type AppNavHref =
  | "/"
  | "/markets"
  | "/arena"
  | "/earn"
  | "/portfolio"
  | "/risk"
  | "/leaderboard"

export type VaultNavHref = "/shield" | "/range-ladder"

export const appNavItems: AppNavItem[] = [
  { href: "/markets", label: "Trade", status: AppNavStatus.Active },
  { href: "/earn", label: "Earn", status: AppNavStatus.Available },
  { href: "/risk", label: "Risk", status: AppNavStatus.Available },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    status: AppNavStatus.Available,
  },
  { href: "/portfolio", label: "Portfolio", status: AppNavStatus.Available },
]

export const vaultNavItems: VaultNavItem[] = [
  { href: "/shield", label: "Shield" },
  { href: "/range-ladder", label: "Range Ladder" },
]
