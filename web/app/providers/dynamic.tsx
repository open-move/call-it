import {
  DynamicContextProvider,
  DynamicUserProfile,
} from "@dynamic-labs/sdk-react-core"
import { SuiWalletConnectors } from "@dynamic-labs/sui"
import { type ReactNode, useEffect, useState } from "react"

export interface DynamicProviderProps {
  children: ReactNode
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
        walletConnectors: [SuiWalletConnectors],
      }}
    >
      {children}
      <DynamicUserProfile />
    </DynamicContextProvider>
  )
}
