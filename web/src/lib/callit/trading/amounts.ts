export function parseDecimalUnits(value: string, decimals: number) {
  const trimmedValue = value.trim()

  if (!/^\d*(\.\d*)?$/.test(trimmedValue)) {
    return null
  }

  const [wholeRaw = "", fractionRaw = ""] = trimmedValue.split(".")
  const whole = wholeRaw === "" ? "0" : wholeRaw
  const fraction = fractionRaw.padEnd(decimals, "0").slice(0, decimals)
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction)

  return units > 0n ? units : null
}

export function formatDecimalUnits(
  value: bigint,
  decimals: number,
  maximumFractionDigits = decimals
) {
  const scale = 10n ** BigInt(decimals)
  const whole = value / scale
  const fraction = value % scale

  if (maximumFractionDigits === 0 || fraction === 0n) {
    return whole.toString()
  }

  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "")

  return fractionText ? `${whole}.${fractionText}` : whole.toString()
}

export function formatUnitPrice(cost: bigint, quantity: bigint) {
  if (quantity === 0n) {
    return "--"
  }

  const scaledPrice = (cost * 10_000n) / quantity
  const whole = scaledPrice / 10_000n
  const fraction = (scaledPrice % 10_000n).toString().padStart(4, "0")

  return `${whole}.${fraction.replace(/0+$/, "") || "0"}`
}
