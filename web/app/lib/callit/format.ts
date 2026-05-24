export function formatCompactUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value >= 10_000 ? 0 : 1,
    notation: "compact",
    style: "currency",
  }).format(value)
}
