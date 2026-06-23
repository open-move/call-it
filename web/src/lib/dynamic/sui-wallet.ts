import type { SuiTransactionSigner } from "@/services/predict-transactions"

export const RECONNECT_SUI_WALLET_MESSAGE =
  "Reconnect wallet to approve Sui transactions."

interface SuiWalletCandidate extends SuiTransactionSigner {
  sync?: () => Promise<void>
}

export function isSuiTransactionSigner(
  value: unknown
): value is SuiTransactionSigner {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const candidate = value as { signTransaction?: unknown }

  return typeof candidate.signTransaction === "function"
}

export async function getReadySuiTransactionSigner(value: unknown) {
  if (!isSuiTransactionSigner(value)) {
    return undefined
  }

  const wallet = value as SuiWalletCandidate

  // Mirror Dynamic's own signMessage flow: bring the connector to an active
  // state with sync() before signing, rather than gating on isConnected().
  // Embedded (email/social) WaaS wallets report no "connected accounts", so
  // isConnected() returns false for them and wrongly blocks signing — sync()
  // works for both embedded and injected wallets, and throws (→ reconnect
  // message) only when the wallet genuinely can't be made active.
  try {
    if (typeof wallet.sync === "function") {
      await wallet.sync()
    }
  } catch {
    return undefined
  }

  return wallet
}
