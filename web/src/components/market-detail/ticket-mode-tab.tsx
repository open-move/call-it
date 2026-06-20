import { TabsTrigger } from "@/components/ui/tabs"
import { getModeIcon, getModeLabel } from "@/lib/market-detail/helpers"
import type { TicketMode } from "@/lib/market-detail/types"

export function TicketModeTab({ mode }: { mode: TicketMode }) {
  const ModeIcon = getModeIcon(mode)

  return (
    <TabsTrigger
      className="rounded-none border-0 !border-transparent text-sm font-medium text-muted-foreground shadow-none ring-0 transition-[background-color,color] duration-150 outline-none after:hidden hover:bg-muted/25 hover:text-foreground focus-visible:!border-transparent focus-visible:!ring-2 focus-visible:!ring-primary/30 focus-visible:!outline-none data-active:!border-transparent data-active:!bg-primary/8 data-active:!text-primary dark:data-active:!border-transparent"
      value={mode}
    >
      <ModeIcon className="size-3.5" />
      {getModeLabel(mode)}
    </TabsTrigger>
  )
}
