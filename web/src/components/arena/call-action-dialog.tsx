import { useState } from "react"

import { TicketRow, TicketSection } from "@/components/shared/ticket/ticket"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { ArenaCall } from "@/lib/arena/types"

import { formatDusdc, oppositeMarket, percentFormatter } from "./atoms"

export type CallActionMode = "back" | "fade"

export function CallActionDialog({
  call,
  mode,
}: {
  call: ArenaCall
  mode: CallActionMode
}) {
  const [amount, setAmount] = useState("")

  const isBack = mode === "back"
  // Back takes the call's side; fade takes the opposite. Binary price ≈ the
  // implied probability of the side you take, payout 1 per contract. Idealized
  // preview — the live quote adds spread.
  const backPrice =
    call.direction === "up" ? call.fairUpProbability : 1 - call.fairUpProbability
  const price = isBack ? backPrice : 1 - backPrice
  const market = isBack ? call.market : oppositeMarket(call.market)

  const quantity = Number(amount)
  const hasQuantity =
    amount.trim() !== "" && !Number.isNaN(quantity) && quantity > 0
  const premium = price * quantity
  const potentialProfit = quantity - premium

  const previewValue = (value: number) =>
    hasQuantity ? formatDusdc(value) : "—"

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className={cn(
              "shadow-none",
              isBack
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : "bg-muted/40 text-foreground hover:bg-muted/55"
            )}
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {isBack ? "Back" : "Fade"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isBack ? "Back this call" : "Fade this call"}</DialogTitle>
          <DialogDescription>
            {isBack ? "Take the same side as " : "Take the opposite side of "}
            <span className="text-foreground">{call.creatorHandle}</span> — opens
            a native Predict position.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border/35 bg-muted/20 px-3 py-2.5">
            <div className="text-sm font-medium text-foreground">{market}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {percentFormatter.format(price)}
              </span>{" "}
              chance
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Contracts
            </span>
            <div className="relative">
              <Input
                className="border-border/35 bg-muted/25 pr-20 font-mono text-sm shadow-none ring-0 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                value={amount}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                Contracts
              </span>
            </div>
          </label>

          <TicketSection>
            <TicketRow label="Price" value={formatDusdc(price)} />
            <TicketRow label="Premium" value={previewValue(premium)} />
            <TicketRow label="Max loss" value={previewValue(premium)} />
            <TicketRow
              label="Potential profit"
              value={previewValue(potentialProfit)}
            />
          </TicketSection>
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            }
          />
          <Button disabled type="button">
            {isBack ? "Back call" : "Fade call"}
          </Button>
        </DialogFooter>

        <p className="text-center text-[11px] text-muted-foreground">
          {isBack ? "Backing" : "Fading"} goes live once Arena is deployed.
        </p>
      </DialogContent>
    </Dialog>
  )
}
