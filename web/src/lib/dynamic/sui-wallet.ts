import type {SuiTransactionSigner} from "@/services/predict-transactions";

export const RECONNECT_SUI_WALLET_MESSAGE =
  "Reconnect wallet to approve Sui transactions."

interface SuiWalletCandidate extends SuiTransactionSigner {
  isConnected?: () => Promise<boolean>
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

  try {
    if (typeof wallet.isConnected === "function") {
      const isConnected = await wallet.isConnected()

      if (!isConnected) {
        return undefined
      }
    }

    if (typeof wallet.sync === "function") {
      await wallet.sync()
    }
  } catch {
    return undefined
  }

  return wallet
}
