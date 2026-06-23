import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Link } from "@tanstack/react-router"
import { EllipsisIcon } from "lucide-react"

import { Badge, BadgeTone } from "@/components/primitives/badge"
import { cn } from "@/lib/utils"

import { AppNavStatus, isNavHrefActive, mobileMoreNavItems } from "./app-nav"
import { MobileTabItemContent } from "./mobile-tab-item"

export function MobileMoreSheet({
  active,
  pathname,
}: {
  active: boolean
  pathname: string
}) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger className="group flex flex-1 flex-col items-center justify-center gap-1 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
        <MobileTabItemContent
          active={active}
          icon={EllipsisIcon}
          label="More"
        />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 bg-black/40 duration-150 supports-backdrop-filter:backdrop-blur-xs md:hidden" />
        <DialogPrimitive.Popup className="data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-6 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-6 fixed inset-x-0 bottom-0 z-50 rounded-t-xl bg-popover pb-[max(0.75rem,env(safe-area-inset-bottom))] text-popover-foreground ring-1 ring-foreground/10 duration-200 outline-none md:hidden">
          <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-foreground/15" />
          <DialogPrimitive.Title className="px-4 pt-3 pb-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            More
          </DialogPrimitive.Title>
          <div className="px-2 pb-1">
            {mobileMoreNavItems.map((item) => {
              const Icon = item.icon
              const itemActive = isNavHrefActive(pathname, item.href)
              return (
                <DialogPrimitive.Close
                  key={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:bg-muted",
                    itemActive ? "text-primary" : "text-foreground"
                  )}
                  render={<Link to={item.href} />}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      itemActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.status === AppNavStatus.Soon ? (
                    <Badge
                      className="border-border/40 bg-muted/30 px-1.5 py-0 text-[9px] text-muted-foreground"
                      tone={BadgeTone.Simulated}
                    >
                      Soon
                    </Badge>
                  ) : itemActive ? (
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-primary"
                    />
                  ) : null}
                </DialogPrimitive.Close>
              )
            })}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
