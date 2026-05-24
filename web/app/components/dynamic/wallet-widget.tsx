import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useEffect, useState } from "react"

import { Button } from "~/components/ui/button"

function formatWalletAddress(address: string) {
  if (address.length <= 12) {
    return address
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function DynamicWalletButton() {
  const { primaryWallet, sdkHasLoaded, setShowAuthFlow, setShowDynamicUserProfile, user } =
    useDynamicContext()

  if (!sdkHasLoaded) {
    return (
      <Button disabled size="sm" type="button">
        Sign In
      </Button>
    )
  }

  if (primaryWallet) {
    return (
      <Button
        size="sm"
        type="button"
        variant="outline"
        onClick={() => setShowDynamicUserProfile(true)}
      >
        {formatWalletAddress(primaryWallet.address)}
      </Button>
    )
  }

  if (user) {
    return (
      <Button
        size="sm"
        type="button"
        variant="outline"
        onClick={() => setShowDynamicUserProfile(true)}
      >
        Account
      </Button>
    )
  }

  return (
    <Button size="sm" type="button" onClick={() => setShowAuthFlow(true)}>
      Sign In
    </Button>
  )
}

export function DynamicWalletWidget() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <Button disabled size="sm" type="button">
        Sign In
      </Button>
    )
  }

  return <DynamicWalletButton />
}
