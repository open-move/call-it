import { Link } from "@tanstack/react-router"

const footerLinks = [
  { label: "Trade", to: "/markets" },
  { label: "Strategies", to: "/strategies" },
  { label: "Portfolio", to: "/portfolio" },
  { label: "Risk", to: "/risk" },
] as const

export function AppFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/30">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link
          className="text-sm leading-none font-semibold tracking-[-0.03em] text-foreground transition-colors hover:text-foreground/80"
          to="/"
        >
          Call<span className="text-primary">It</span>
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <nav className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-medium text-muted-foreground">
            {footerLinks.map((link) => (
              <Link
                className="transition-colors hover:text-foreground"
                key={link.to}
                to={link.to}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <span
            aria-hidden="true"
            className="hidden h-3.5 w-px bg-border/60 sm:block"
          />

          <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
            Testnet
          </span>
        </div>
      </div>
    </footer>
  )
}
