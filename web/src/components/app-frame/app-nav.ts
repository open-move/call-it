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
  { href: "/shield", label: "Shield", status: AppNavStatus.Available },
  { href: "/earn", label: "Earn", status: AppNavStatus.Available },
  { href: "/portfolio", label: "Portfolio", status: AppNavStatus.Available },
]
