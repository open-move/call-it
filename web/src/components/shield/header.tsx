export function ShieldProductHeader() {
  return (
    <div className="mx-auto max-w-5xl rounded-md bg-card px-4 py-3">
      <div className="text-sm leading-none font-medium tracking-[-0.01em]">
        Tail Hedge PLP · Predict LP + downside hedge
      </div>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
        Hold hPLP strategy shares while the strategy manages PLP supply, hedge
        spend, settlement, and roll-forward with a tail hedge below spot.
      </p>
    </div>
  )
}
