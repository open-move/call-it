import { getAuthToken, useIsLoggedIn } from "@dynamic-labs/sdk-react-core"
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"

import {
  backendConfigured,
  backendRequest,
  setBackendAuthToken,
} from "@/services/backend-client"

// App-wide identity. On Dynamic auth we exchange the Dynamic JWT for our own
// backend session JWT (POST /auth/session), hold the backend user + linked
// wallets here, and push the backend token into the shared client so authed
// requests carry it. Non-custodial: this gates backend reads/mutations only;
// chain writes stay wallet-signed.

export interface SessionUser {
  avatarUrl: string | null
  displayName: string | null
  email: string | null
  id: string
  username: string | null
}

export interface SessionWallet {
  address: string
  chain: string
  isPrimary: boolean
}

export interface ProfileInput {
  avatarUrl?: string
  displayName?: string
  username?: string
}

// unconfigured: BACKEND_URL is empty (backend not wired) — the app still works
// off mock data. anonymous: no wallet/Dynamic session. loading: exchanging.
// authenticated: backend session established. error: exchange failed.
export type SessionStatus =
  | "unconfigured"
  | "anonymous"
  | "loading"
  | "authenticated"
  | "error"

interface SessionExchange {
  token: string
  user: SessionUser
  wallets: SessionWallet[]
}

interface ProfileResponse {
  user: SessionUser
  wallets: SessionWallet[]
}

interface SessionContextValue {
  status: SessionStatus
  updateProfile: (input: ProfileInput) => Promise<SessionUser>
  user: SessionUser | null
  wallets: SessionWallet[]
}

const SessionContext = createContext<SessionContextValue | null>(null)

interface SessionState {
  status: SessionStatus
  user: SessionUser | null
  wallets: SessionWallet[]
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const isLoggedIn = useIsLoggedIn()
  const configured = backendConfigured()
  const [state, setState] = useState<SessionState>({
    status: configured ? "anonymous" : "unconfigured",
    user: null,
    wallets: [],
  })

  useEffect(() => {
    if (!configured) {
      setBackendAuthToken(null)
      setState({ status: "unconfigured", user: null, wallets: [] })
      return
    }
    const dynamicJwt = isLoggedIn ? getAuthToken() : undefined
    if (typeof dynamicJwt !== "string" || dynamicJwt.length === 0) {
      setBackendAuthToken(null)
      setState({ status: "anonymous", user: null, wallets: [] })
      return
    }

    let cancelled = false
    setState((current) => ({ ...current, status: "loading" }))
    backendRequest<SessionExchange>("/auth/session", {
      body: { dynamicJwt },
      method: "POST",
    })
      .then((result) => {
        if (cancelled) {
          return
        }
        setBackendAuthToken(result.token)
        setState({ status: "authenticated", user: result.user, wallets: result.wallets })
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setBackendAuthToken(null)
        setState({ status: "error", user: null, wallets: [] })
      })

    return () => {
      cancelled = true
    }
  }, [isLoggedIn, configured])

  const updateProfile = useCallback(async (input: ProfileInput): Promise<SessionUser> => {
    const result = await backendRequest<ProfileResponse>("/me", {
      auth: true,
      body: input,
      method: "PATCH",
    })
    setState((current) => ({ ...current, user: result.user, wallets: result.wallets }))
    return result.user
  }, [])

  const value: SessionContextValue = {
    status: state.status,
    updateProfile,
    user: state.user,
    wallets: state.wallets,
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (context === null) {
    throw new Error("useSession must be used within a SessionProvider")
  }
  return context
}
