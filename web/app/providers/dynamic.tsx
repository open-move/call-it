import {
  DynamicContextProvider,
  DynamicUserProfile,
} from "@dynamic-labs/sdk-react-core"
import { SuiWalletConnectors } from "@dynamic-labs/sui"
import { type ReactNode, useEffect, useState } from "react"

export interface DynamicProviderProps {
  children: ReactNode
}

type DynamicTheme = "dark" | "light"

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
        environmentId: import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID,
        initialAuthenticationMode: "connect-and-sign",
        walletConnectors: [SuiWalletConnectors],
      }}
    >
      {children}
      <DynamicUserProfile />
      <DynamicThemeSync />
    </DynamicContextProvider>
  )
}
