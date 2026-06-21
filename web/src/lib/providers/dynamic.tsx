import {
  DynamicContextProvider,
  DynamicUserProfile,
} from "@dynamic-labs/sdk-react-core"
import { SuiWalletConnectors } from "@dynamic-labs/sui"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"

import { SessionProvider } from "@/lib/auth/session"
import { PredictAccountProvider } from "@/lib/providers/predict-account"

export interface DynamicProviderProps {
  children: ReactNode
}

type DynamicTheme = "dark" | "light"

const dynamicCssOverrides = `
  .modal-card,
  .dynamic-widget-modal {
    background: var(--dynamic-base-1) !important;
    border: 0 !important;
    border-radius: var(--dynamic-border-radius) !important;
    box-shadow: none !important;
  }

  .modal-card--sharp-mobile-bottom-radius {
    border-bottom-left-radius: var(--dynamic-border-radius) !important;
    border-bottom-right-radius: var(--dynamic-border-radius) !important;
  }
`

function getDocumentTheme(): DynamicTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function syncDynamicTheme() {
  document.body.dataset.dynamicTheme = getDocumentTheme()
}

function DynamicThemeSync() {
  useEffect(() => {
    syncDynamicTheme()

    const timeoutId = window.setTimeout(syncDynamicTheme, 0)
    const observer = new MutationObserver(syncDynamicTheme)

    observer.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    })

    return () => {
      window.clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [])

  return null
}

export function DynamicProvider({ children }: DynamicProviderProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return children
  }

  return (
    <DynamicContextProvider
      settings={{
        cssOverrides: dynamicCssOverrides,
        environmentId: import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID,
        initialAuthenticationMode: "connect-and-sign",
        walletConnectors: [SuiWalletConnectors],
      }}
    >
      <SessionProvider>
        <PredictAccountProvider>{children}</PredictAccountProvider>
      </SessionProvider>
      <DynamicUserProfile />
      <DynamicThemeSync />
    </DynamicContextProvider>
  )
}
