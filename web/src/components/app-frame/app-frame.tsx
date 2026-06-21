import type { ReactNode } from "react"

import { AppFooter } from "./app-footer"
import { AppHeader } from "./app-header"

export interface AppFrameProps {
  children?: ReactNode
}

export function AppFrame({ children }: AppFrameProps) {
  return (
    <div className="flex min-h-svh w-full flex-col">
      <AppHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <AppFooter />
    </div>
  )
}
