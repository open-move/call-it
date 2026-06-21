import { BadgeTone } from "@/components/primitives/badge"
import { PREDICT_QUOTE_DECIMALS } from "@/lib/config"

const SUI_DECIMALS = 9

function fromBaseUnits(value: string, decimals: number): number {
  // Display-only; precision past Number is irrelevant for a dashboard.
  return Number(value) / 10 ** decimals
}

export function formatSui(mist: string): string {
  return `${fromBaseUnits(mist, SUI_DECIMALS).toLocaleString("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  })} SUI`
}

export function formatDusdc(baseUnits: string): string {
  return `${fromBaseUnits(baseUnits, PREDICT_QUOTE_DECIMALS).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} dUSDC`
}

export function formatCount(value: string | number | null): string {
  if (value === null) {
    return "--"
  }
  return Number(value).toLocaleString("en-US")
}

export function truncateMiddle(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 1) {
    return value
  }
  return `${value.slice(0, lead)}…${value.slice(-tail)}`
}

export function sideLabel(isUp: boolean): string {
  return isUp ? "Up" : "Down"
}

export function suivisionTxUrl(digest: string): string {
  return `https://testnet.suivision.xyz/txblock/${digest}`
}

export interface TxStatusMeta {
  label: string
  tone: BadgeTone
}

const TX_STATUS_META: Record<string, TxStatusMeta> = {
  dry_run: { label: "Dry run", tone: BadgeTone.Simulated },
  failed: { label: "Failed", tone: BadgeTone.Risk },
  sim_failed: { label: "Sim failed", tone: BadgeTone.Warning },
  submitted: { label: "Submitted", tone: BadgeTone.Neutral },
  succeeded: { label: "Redeemed", tone: BadgeTone.Live },
}

export function txStatusMeta(status: string): TxStatusMeta {
  return TX_STATUS_META[status] ?? { label: status, tone: BadgeTone.Neutral }
}

/// A keeper-issued tx digest is synthetic (dry-run / local failure markers use a
/// non-hex id); only real on-chain digests should link out.
export function isOnChainDigest(digest: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,}$/.test(digest) && !digest.includes(":")
}
