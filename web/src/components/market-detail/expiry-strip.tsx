import { DetailExpiryStrip } from "@/components/shared/detail/detail-expiry-strip"
import type { ExpiryOption } from "@/lib/types/market"

export interface ExpiryStripProps {
  expiryOptions: ExpiryOption[]
  selectedOracleId: string
}

function getExpiryHref(option: ExpiryOption) {
  return `/markets/${option.oracleId}`
}

export function ExpiryStrip({
  expiryOptions,
  selectedOracleId,
}: ExpiryStripProps) {
  return (
    <DetailExpiryStrip
      expiryOptions={expiryOptions}
      getHref={getExpiryHref}
      selectedOracleId={selectedOracleId}
    />
  )
}
