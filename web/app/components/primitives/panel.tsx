import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "~/lib/utils"

export enum PanelTone {
  Default = "default",
  Elevated = "elevated",
  Accent = "accent",
}

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  tone?: PanelTone
}

const panelToneClassName: Record<PanelTone, string> = {
  [PanelTone.Default]: "border-border bg-card/86",
  [PanelTone.Elevated]:
    "border-primary/20 bg-popover/92 shadow-[0_24px_80px_oklch(0_0_0_/_28%)]",
  [PanelTone.Accent]:
    "border-primary/35 bg-primary/8 shadow-[0_0_48px_oklch(0.775_0.153_202.5_/_10%)]",
}

export function Panel({
  children,
  className,
  tone = PanelTone.Default,
  ...props
}: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-md border p-5 backdrop-blur-xl",
        panelToneClassName[tone],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
