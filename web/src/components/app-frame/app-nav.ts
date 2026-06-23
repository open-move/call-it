import {
  BlocksIcon,
  CandlestickChartIcon,
  CoinsIcon,
  GaugeIcon,
  type LucideIcon,
  ServerIcon,
  SwordsIcon,
  TrophyIcon,
  WalletIcon,
} from "lucide-react"

export enum AppNavStatus {
  Active = "active",
  Available = "available",
  Soon = "soon",
}

export interface AppNavItem {
  href: AppNavHref
  label: string
  status: AppNavStatus
  icon: LucideIcon
  /** Shown inline in the desktop bar. The rest collapse into "More". */
  desktopPrimary: boolean
  /** Shown as a tab in the mobile bottom bar. The rest collapse into "More". */
  mobileTab: boolean
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
  | "/keeper"

export const appNavItems: AppNavItem[] = [
  {
    href: "/markets",
    label: "Trade",
    status: AppNavStatus.Active,
    icon: CandlestickChartIcon,
    desktopPrimary: true,
    mobileTab: true,
  },
  {
    href: "/arena",
    label: "Arena",
    status: AppNavStatus.Available,
    icon: SwordsIcon,
    desktopPrimary: true,
    mobileTab: true,
  },
  {
    href: "/earn",
    label: "Earn",
    status: AppNavStatus.Available,
    icon: CoinsIcon,
    desktopPrimary: true,
    mobileTab: true,
  },
  {
    href: "/strategies",
    label: "Strategies",
    status: AppNavStatus.Available,
    icon: BlocksIcon,
    desktopPrimary: true,
    mobileTab: false,
  },
  {
    href: "/risk",
    label: "Risk",
    status: AppNavStatus.Available,
    icon: GaugeIcon,
    desktopPrimary: false,
    mobileTab: false,
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    status: AppNavStatus.Available,
    icon: TrophyIcon,
    desktopPrimary: false,
    mobileTab: false,
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    status: AppNavStatus.Available,
    icon: WalletIcon,
    desktopPrimary: true,
    mobileTab: true,
  },
  {
    href: "/keeper",
    label: "Keeper",
    status: AppNavStatus.Available,
    icon: ServerIcon,
    desktopPrimary: false,
    mobileTab: false,
  },
]

export function isNavHrefActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`)
}

export const desktopPrimaryNavItems = appNavItems.filter(
  (item) => item.desktopPrimary
)
export const desktopMoreNavItems = appNavItems.filter(
  (item) => !item.desktopPrimary
)
export const mobileTabNavItems = appNavItems.filter((item) => item.mobileTab)
export const mobileMoreNavItems = appNavItems.filter((item) => !item.mobileTab)
