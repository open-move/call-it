import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import {
  PREDICT_LP_ASSET,
  PREDICT_OBJECT_ID,
  PREDICT_QUOTE_ASSET,
} from "@/lib/config"
import type { ManagerSummary } from "@/lib/types/predict"
import {
  getManagerSummary,
  getPredictManagers,
} from "@/services/predict-client"
import {
  buildCreateManagerTransaction,
  executeSuiTransaction,
  findCreatedManagerId,
} from "@/services/predict-transactions"
import type { SuiTransactionSigner } from "@/services/predict-transactions"
import { getSuiGrpcClient } from "@/services/sui-client"
import { sleep } from "@/lib/utils"

type PredictAccountStatus = "idle" | "loading" | "ready" | "error"

interface PredictAccountState {
  errorMessage?: string
  isCreatingManager: boolean
  managerId?: string
  managerSummary?: ManagerSummary
  status: PredictAccountStatus
  walletAddress?: string
  walletDusdcBalance?: bigint
  walletPlpBalance?: bigint
}

interface PredictAccountContextValue extends PredictAccountState {
  adoptManagerId: (managerId: string) => void
  ensureManager: (signer: SuiTransactionSigner) => Promise<string>
  refreshAccount: () => Promise<void>
}

const PredictAccountContext = createContext<PredictAccountContextValue | null>(
  null
)

const idlePredictAccountValue: PredictAccountContextValue = {
  adoptManagerId: () => undefined,
  ensureManager: async () => {
    throw new Error("Connect wallet to create a trading account.")
  },
  isCreatingManager: false,
  refreshAccount: async () => undefined,
  status: "idle",
}

function getManagerCacheKey(walletAddress: string) {
  return `predict-manager:${PREDICT_OBJECT_ID}:${walletAddress}`
}

function readCachedManagerId(walletAddress: string) {
  if (typeof window === "undefined") {
    return undefined
  }

  return (
    window.localStorage.getItem(getManagerCacheKey(walletAddress)) ?? undefined
  )
}

function writeCachedManagerId(walletAddress: string, managerId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(getManagerCacheKey(walletAddress), managerId)
}

async function loadAccountState(
  walletAddress: string,
  preferredManagerId?: string
): Promise<Partial<PredictAccountState>> {
  const client = getSuiGrpcClient()
  const [dusdcResult, plpResult, managersResult] = await Promise.allSettled([
    client.getBalance({ coinType: PREDICT_QUOTE_ASSET, owner: walletAddress }),
    client.getBalance({ coinType: PREDICT_LP_ASSET, owner: walletAddress }),
    getPredictManagers(walletAddress),
  ])
  const managerId =
    managersResult.status === "fulfilled"
      ? (managersResult.value.at(0)?.manager_id ?? preferredManagerId)
      : preferredManagerId
  let managerSummary: ManagerSummary | undefined

  if (managerId) {
    try {
      managerSummary = await getManagerSummary(managerId)
    } catch {
      managerSummary = undefined
    }
  }

  if (managerId) {
    writeCachedManagerId(walletAddress, managerId)
  }

  return {
    managerId,
    managerSummary,
    walletDusdcBalance:
      dusdcResult.status === "fulfilled"
        ? BigInt(dusdcResult.value.balance.balance)
        : undefined,
    walletPlpBalance:
      plpResult.status === "fulfilled"
        ? BigInt(plpResult.value.balance.balance)
        : undefined,
  }
}

export function PredictAccountProvider({ children }: { children: ReactNode }) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <PredictAccountContext.Provider value={idlePredictAccountValue}>
        {children}
      </PredictAccountContext.Provider>
    )
  }

  return <PredictAccountProviderClient>{children}</PredictAccountProviderClient>
}

function PredictAccountProviderClient({ children }: { children: ReactNode }) {
  const { primaryWallet } = useDynamicContext()
  const walletAddress = primaryWallet?.address
  const requestIdRef = useRef(0)
  const ensureManagerPromiseRef = useRef<Promise<string> | null>(null)
  const [accountState, setAccountState] = useState<PredictAccountState>({
    isCreatingManager: false,
    status: "idle",
  })

  function adoptManagerId(managerId: string) {
    if (!walletAddress) {
      return
    }

    writeCachedManagerId(walletAddress, managerId)
    setAccountState((current) => ({
      ...current,
      managerId,
      status: current.status === "idle" ? "ready" : current.status,
      walletAddress,
    }))
  }

  async function refreshAccount() {
    const nextRequestId = requestIdRef.current + 1
    requestIdRef.current = nextRequestId

    if (!walletAddress) {
      setAccountState({ isCreatingManager: false, status: "idle" })
      return
    }

    const cachedManagerId = readCachedManagerId(walletAddress)
    setAccountState((current) => ({
      ...current,
      errorMessage: undefined,
      managerId: current.managerId ?? cachedManagerId,
      status: "loading",
      walletAddress,
    }))

    try {
      const nextState = await loadAccountState(walletAddress, cachedManagerId)

      if (requestIdRef.current !== nextRequestId) {
        return
      }

      setAccountState((current) => ({
        ...current,
        ...nextState,
        errorMessage: undefined,
        status: "ready",
        walletAddress,
      }))
    } catch (error) {
      if (requestIdRef.current !== nextRequestId) {
        return
      }

      setAccountState((current) => ({
        ...current,
        errorMessage:
          error instanceof Error ? error.message : "Failed to load account.",
        status: "error",
        walletAddress,
      }))
    }
  }

  async function waitForManagerState(address: string) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const managerId = readCachedManagerId(address)
      const nextState = await loadAccountState(address, managerId)

      if (nextState.managerId) {
        setAccountState((current) => ({
          ...current,
          ...nextState,
          errorMessage: undefined,
          status: "ready",
          walletAddress: address,
        }))
        return nextState.managerId
      }

      await sleep(1_000)
    }

    throw new Error(
      "Trading account creation confirmed, but the indexer has not caught up"
    )
  }

  async function ensureManager(signer: SuiTransactionSigner) {
    if (!walletAddress) {
      throw new Error("Connect wallet to create a trading account.")
    }

    if (accountState.managerId) {
      return accountState.managerId
    }

    if (ensureManagerPromiseRef.current) {
      return ensureManagerPromiseRef.current
    }

    const createPromise = (async () => {
      setAccountState((current) => ({
        ...current,
        errorMessage: undefined,
        isCreatingManager: true,
        walletAddress,
      }))

      try {
        const createResult = await executeSuiTransaction(
          signer,
          buildCreateManagerTransaction(walletAddress)
        )
        const managerId =
          findCreatedManagerId(createResult.events) ??
          (await waitForManagerState(walletAddress))

        if (!managerId) {
          throw new Error("Could not resolve trading account after creation")
        }

        writeCachedManagerId(walletAddress, managerId)
        setAccountState((current) => ({
          ...current,
          isCreatingManager: false,
          managerId,
          status: "ready",
          walletAddress,
        }))

        return managerId
      } catch (error) {
        setAccountState((current) => ({
          ...current,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Failed to create trading account.",
          isCreatingManager: false,
          status: "error",
          walletAddress,
        }))
        throw error
      } finally {
        ensureManagerPromiseRef.current = null
      }
    })()

    ensureManagerPromiseRef.current = createPromise
    return createPromise
  }

  useEffect(() => {
    void refreshAccount()
  }, [walletAddress])

  return (
    <PredictAccountContext.Provider
      value={{
        ...accountState,
        adoptManagerId,
        ensureManager,
        refreshAccount,
      }}
    >
      {children}
    </PredictAccountContext.Provider>
  )
}

export function usePredictAccount() {
  const context = useContext(PredictAccountContext)

  if (!context) {
    throw new Error(
      "usePredictAccount must be used within PredictAccountProvider"
    )
  }

  return context
}
