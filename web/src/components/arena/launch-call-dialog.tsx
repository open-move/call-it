import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react"
import { type ReactNode, useState } from "react"

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

type LaunchDirection = "up" | "down"

const directions: { icon: typeof ArrowUpIcon; label: string; value: LaunchDirection }[] = [
  { icon: ArrowUpIcon, label: "Up", value: "up" },
  { icon: ArrowDownIcon, label: "Down", value: "down" },
]

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function LaunchCallDialog() {
  const [direction, setDirection] = useState<LaunchDirection>("up")
  const [strike, setStrike] = useState("")
  const [bond, setBond] = useState("")
  const [note, setNote] = useState("")

  const bondAmount = Number(bond)
  const bondBelowMin =
    bond.trim() !== "" && (Number.isNaN(bondAmount) || bondAmount < 10)

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <PlusIcon className="size-3.5" />
            Launch call
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Launch a call</DialogTitle>
          <DialogDescription>
            Post a public call on a BTC market. Backers take your side, faders
            take the other — settled on-chain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Market">
            <div className="flex items-center gap-2 rounded-md border border-border/35 bg-muted/25 px-3 py-2 text-sm font-medium text-foreground">
              <span className="flex size-5 items-center justify-center rounded-full bg-[#f7931a] text-[10px] font-bold text-black">
                ₿
              </span>
              BTC
            </div>
          </Field>

          <Field label="Direction">
            <div aria-label="Direction" className="grid grid-cols-2 gap-2">
              {directions.map((option) => {
                const isSelected = direction === option.value
                const Icon = option.icon

                return (
                  <Button
                    aria-pressed={isSelected}
                    className={cn(
                      "border border-border/35 bg-muted/25 text-muted-foreground shadow-none hover:bg-muted/35 hover:text-foreground",
                      isSelected &&
                        (option.value === "up"
                          ? "border-outcome-up/30 bg-outcome-up/10 text-outcome-up hover:bg-outcome-up/15"
                          : "border-outcome-down/30 bg-outcome-down/10 text-outcome-down hover:bg-outcome-down/15")
                    )}
                    key={option.value}
                    onClick={() => setDirection(option.value)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Icon className="size-3" />
                    {option.label}
                  </Button>
                )
              })}
            </div>
          </Field>

          <Field label="Strike price">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                className="border-border/35 bg-muted/25 pl-6 font-mono text-sm shadow-none ring-0 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
                inputMode="decimal"
                onChange={(event) => setStrike(event.target.value)}
                placeholder="0"
                value={strike}
              />
            </div>
          </Field>

          <Field label="Bond">
            <div className="space-y-1">
              <div className="relative">
                <Input
                  className="border-border/35 bg-muted/25 pr-16 font-mono text-sm shadow-none ring-0 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
                  inputMode="decimal"
                  onChange={(event) => setBond(event.target.value)}
                  placeholder="10"
                  value={bond}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                  DUSDC
                </span>
              </div>
              <p
                className={cn(
                  "text-[11px]",
                  bondBelowMin ? "text-warning" : "text-muted-foreground"
                )}
              >
                Minimum 10 DUSDC — supplied as PLP to bond your call.
              </p>
            </div>
          </Field>

          <Field label="Note (optional)">
            <Input
              className="border-border/35 bg-muted/25 text-sm shadow-none ring-0 placeholder:text-muted-foreground/65 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
              maxLength={140}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why this call?"
              value={note}
            />
          </Field>
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
            Launch call
          </Button>
        </DialogFooter>

        <p className="text-center text-[11px] text-muted-foreground">
          Launching goes live once Arena is deployed.
        </p>
      </DialogContent>
    </Dialog>
  )
}
