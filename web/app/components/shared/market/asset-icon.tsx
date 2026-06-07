import { useState } from "react"

export interface AssetIconProps {
  assetIconUrl?: string
  assetName: string
  assetSymbol: string
  className?: string
}

export function AssetIcon({
  assetIconUrl,
  assetName,
  assetSymbol,
  className = "size-7 sm:size-8",
}: AssetIconProps) {
  const [hasError, setHasError] = useState(false)

  if (assetIconUrl && !hasError) {
    return (
      <img
        alt={`${assetName} icon`}
        className={`${className} shrink-0 rounded-full`}
        onError={() => setHasError(true)}
        src={assetIconUrl}
      />
    )
  }

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground`}
    >
      {assetSymbol.slice(0, 3)}
    </span>
  )
}
