import { WalletIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function ConnectPortfolioCard({ onConnect }: { onConnect: () => void }) {
  return (
    <Card className="flex min-h-96 items-center justify-center rounded-md border-0 bg-card px-4 py-12 text-center shadow-none ring-0">
      <div className="max-w-sm">
        <div className="mx-auto grid size-10 place-items-center rounded-md bg-primary/12 text-primary">
          <WalletIcon className="size-5" />
        </div>
        <h2 className="mt-4 text-base font-medium text-foreground">
          Connect wallet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          View DUSDC, PLP, and open Predict positions in one compact ledger.
        </p>
        <Button className="mt-5" size="sm" type="button" onClick={onConnect}>
          Connect Wallet
        </Button>
      </div>
    </Card>
  )
}
