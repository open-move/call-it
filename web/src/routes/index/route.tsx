import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"
import { BrandMark } from "@/components/app-frame/brand-mark"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <BrandMark className="size-16" />
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          CallIt Predict
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Trade directional and range positions on your favorite assets with
          precision and speed.
        </p>
        <Link
          to="/markets"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          View Markets
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
    </main>
  )
}
