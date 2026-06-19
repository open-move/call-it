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

export interface ProtectionNavItem {
  href: ProtectionNavHref
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

export type ProtectionNavHref = "/shield" | "/protect" | "/range-ladder"

export const appNavItems: AppNavItem[] = [
  { href: "/markets", label: "Trade", status: AppNavStatus.Active },
  { href: "/arena", label: "Arena", status: AppNavStatus.Available },
  { href: "/earn", label: "Earn", status: AppNavStatus.Available },
  { href: "/risk", label: "Risk", status: AppNavStatus.Available },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    status: AppNavStatus.Available,
  },
  { href: "/portfolio", label: "Portfolio", status: AppNavStatus.Available },
]

export const protectionNavItems: ProtectionNavItem[] = [
  { href: "/shield", label: "Shield" },
  { href: "/protect", label: "Protect" },
  { href: "/range-ladder", label: "Range Ladder" },
]
