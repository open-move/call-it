export enum AppNavStatus {
  Active = "active",
  Available = "available",
  Soon = "soon",
}

export interface AppNavItem {
  href: string
  label: string
  status: AppNavStatus
}

export const appNavItems: AppNavItem[] = [
  { href: "/", label: "Trade", status: AppNavStatus.Active },
  { href: "/portfolio", label: "Portfolio", status: AppNavStatus.Available },
  { href: "/earn", label: "Earn", status: AppNavStatus.Available },
  { href: "/risk", label: "Risk", status: AppNavStatus.Available },
  { href: "/automate", label: "Automate", status: AppNavStatus.Soon },
]
