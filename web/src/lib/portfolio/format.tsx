import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function formatQuantity(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

export function formatCents(value: number | null) {
  return value === null ? "--" : `${(value * 100).toFixed(1)}c`
}

export function formatDusdcNumber(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })
}

export function formatDusdc(value: number, maximumFractionDigits = 2) {
  return `${formatDusdcNumber(value, maximumFractionDigits)} DUSDC`
}

export function formatSignedDusdc(value: number, maximumFractionDigits = 2) {
  if (value > 0) {
    return `+${formatDusdc(value, maximumFractionDigits)}`
  }

  if (value < 0) {
    return `-${formatDusdc(Math.abs(value), maximumFractionDigits)}`
  }

  return formatDusdc(0, maximumFractionDigits)
}

export function formatPnlAxisTick(value: number) {
  if (Math.abs(value) < 0.005) {
    return "0 DUSDC"
  }

  const absoluteValue = Math.abs(value)
  const fractionDigits = absoluteValue < 10 ? 2 : absoluteValue < 100 ? 1 : 0

  return value < 0
    ? `-${formatDusdc(absoluteValue, fractionDigits)}`
    : formatDusdc(absoluteValue, fractionDigits)
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value)
}

export function DusdcValue({
  className,
  maximumFractionDigits = 2,
  unitClassName,
  value,
}: {
  className?: string
  maximumFractionDigits?: number
  unitClassName?: string
  value: number
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-mono tabular-nums">
        {formatDusdcNumber(value, maximumFractionDigits)}
      </span>
      <span
        className={cn(
          "text-[0.62em] font-medium tracking-normal text-current opacity-70",
          unitClassName
        )}
      >
        DUSDC
      </span>
    </span>
  )
}

export function SignedDusdcValue({
  className,
  maximumFractionDigits = 2,
  unitClassName,
  value,
}: {
  className?: string
  maximumFractionDigits?: number
  unitClassName?: string
  value: number
}) {
  const absoluteValue = Math.abs(value)
  const prefix = value > 0 ? "+" : value < 0 ? "-" : ""

  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-mono tabular-nums">
        {prefix}
        {formatDusdcNumber(absoluteValue, maximumFractionDigits)}
      </span>
      <span
        className={cn(
          "text-[0.62em] font-medium tracking-normal text-current opacity-70",
          unitClassName
        )}
      >
        DUSDC
      </span>
    </span>
  )
}
