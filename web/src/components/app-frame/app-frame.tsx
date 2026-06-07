import type { ReactNode } from "react"

import { AppHeader } from "./app-header"

export interface AppFrameProps {
  children?: ReactNode
}

export function AppFrame({ children }: AppFrameProps) {
  return (
    <div className="min-h-svh w-full">
      <AppHeader />
      {children}
    </div>
  )
}
