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

const dynamicCssOverrides = `
  .modal-component__backdrop {
    background: var(--dynamic-modal-backdrop-background) !important;
    backdrop-filter: var(--dynamic-modal-backdrop-filter) !important;
  }

  .modal-card,
  .dynamic-widget-modal {
    background: var(--dynamic-base-1) !important;
    border: var(--dynamic-modal-border) !important;
    border-radius: var(--dynamic-border-radius) !important;
    box-shadow: none !important;
    color: var(--dynamic-text-primary) !important;
  }

  .modal-card--sharp-mobile-bottom-radius {
    border-bottom-left-radius: var(--dynamic-border-radius) !important;
    border-bottom-right-radius: var(--dynamic-border-radius) !important;
  }

  .list-tile,
  .wallet-list-item__tile,
  .chain-card,
  .connect-with-wallet-button,
  .icon-list-tile {
    background: var(--dynamic-wallet-list-tile-background) !important;
    border: var(--dynamic-wallet-list-tile-border) !important;
    border-radius: var(--dynamic-border-radius) !important;
    box-shadow: none !important;
  }

  .list-tile:hover,
  .wallet-list-item__tile:hover,
  .chain-card:hover,
  .connect-with-wallet-button:hover,
  .icon-list-tile:hover {
    background: var(--dynamic-wallet-list-tile-background-hover) !important;
    border: var(--dynamic-wallet-list-tile-border-hover) !important;
    box-shadow: none !important;
  }

  .typography-button button,
  button[data-testid="ListTile"],
  button[data-testid="submit-form"] {
    border-radius: var(--dynamic-connect-button-radius) !important;
  }
`

function getDocumentTheme(): DynamicTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function useDynamicTheme(isClient: boolean) {
  const [theme, setTheme] = useState<DynamicTheme>("dark")

  useEffect(() => {
    if (!isClient) {
      return
    }

    setTheme(getDocumentTheme())

    const observer = new MutationObserver(() => {
      setTheme(getDocumentTheme())
    })

    observer.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    })

    return () => observer.disconnect()
  }, [isClient])

  return theme
}

export function DynamicProvider({ children }: DynamicProviderProps) {
  const [isClient, setIsClient] = useState(false)
  const theme = useDynamicTheme(isClient)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return children
  }

  return (
    <DynamicContextProvider
      theme={theme}
      settings={{
        cssOverrides: dynamicCssOverrides,
        environmentId: import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID,
        initialAuthenticationMode: "connect-and-sign",
        walletConnectors: [SuiWalletConnectors],
      }}
    >
      {children}
      <DynamicUserProfile />
    </DynamicContextProvider>
  )
}
