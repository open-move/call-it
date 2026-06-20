import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"

import { BrandMark } from "@/components/app-frame/brand-mark"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({
  component: Home,
})

const valuePillars = [
  {
    label: "Directional",
    text: "Take a side when the market setup is clear.",
  },
  {
    label: "Range-bound",
    text: "Express a thesis when movement matters less than the band.",
  },
  {
    label: "DUSDC settled",
    text: "Keep outcomes and accounting in one settlement unit.",
  },
] as const

const mechanicSteps = [
  "Choose the outcome shape.",
  "Size the position in DUSDC.",
  "Track settlement from portfolio.",
] as const

function Home() {
  return (
    <main className="landing-stage min-h-[calc(100dvh-3.5rem)] overflow-hidden">
      <section className="relative mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-[96rem] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="landing-orbit landing-orbit-a" />
        <div className="landing-orbit landing-orbit-b" />
        <div className="landing-noise" />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark className="size-9 bg-primary/12" />
            <span className="text-sm font-medium tracking-[-0.01em] text-foreground">
              CallIt Predict
            </span>
          </div>
          <Button
            className="hidden h-9 px-3 sm:inline-flex"
            render={<Link to="/markets" />}
            type="button"
          >
            Trade Markets
          </Button>
        </div>

        <div className="relative z-10 grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,0.78fr)_minmax(26rem,0.64fr)] lg:py-10">
          <HeroCopy />
          <OutcomeField />
        </div>
      </section>

      <ValueStrip />
      <MechanicSection />
      <FinalCta />
    </main>
  )
}

function HeroCopy() {
  return (
    <div className="callit-stage-in max-w-4xl">
      <p className="mb-6 max-w-sm text-sm leading-6 text-primary">
        Crypto outcome markets, built for decisive positions.
      </p>
      <h1 className="max-w-5xl text-6xl leading-[0.88] font-semibold tracking-[-0.075em] text-foreground sm:text-7xl lg:text-8xl">
        Position before consensus
      </h1>
      <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
        Trade crypto market outcomes with directional and range positions,
        settled in DUSDC.
      </p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button
          className="h-11 px-5"
          render={<Link to="/markets" />}
          size="lg"
          type="button"
        >
          Trade Markets
          <ArrowRightIcon className="size-4" />
        </Button>
        <Button
          className="h-11 px-5"
          render={<Link to="/portfolio" />}
          size="lg"
          type="button"
          variant="secondary"
        >
          View Portfolio
        </Button>
      </div>
    </div>
  )
}

function OutcomeField() {
  return (
    <div className="callit-stage-in landing-outcome-field relative mx-auto aspect-[0.9] w-full max-w-[32rem] lg:mx-0 lg:ml-auto">
      <div className="landing-field-ring landing-field-ring-outer" />
      <div className="landing-field-ring landing-field-ring-middle" />
      <div className="landing-field-ring landing-field-ring-inner" />
      <div className="landing-strike-line landing-strike-line-a" />
      <div className="landing-strike-line landing-strike-line-b" />

      <div className="landing-field-core">
        <BrandMark className="size-12 bg-primary/14" />
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-primary uppercase">
            CallIt
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Before consensus
          </div>
        </div>
      </div>
    </div>
  )
}

function ValueStrip() {
  return (
    <section className="relative border-y border-border/35 bg-background/35">
      <div className="mx-auto grid w-full max-w-[96rem] gap-px px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
        {valuePillars.map((pillar) => (
          <article
            className="group border-border/35 py-8 lg:border-x lg:px-8"
            key={pillar.label}
          >
            <h2 className="text-xl font-medium tracking-[-0.035em] text-foreground">
              {pillar.label}
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              {pillar.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

function MechanicSection() {
  return (
    <section className="relative mx-auto grid w-full max-w-[96rem] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.82fr_1fr] lg:px-8 lg:py-28">
      <div className="max-w-xl">
        <h2 className="text-4xl leading-[0.96] font-semibold tracking-[-0.06em] text-foreground sm:text-5xl">
          Built around the moment before price agrees.
        </h2>
      </div>

      <div className="grid gap-3">
        {mechanicSteps.map((step, index) => (
          <div
            className="grid grid-cols-[3rem_minmax(0,1fr)] items-center border-t border-border/45 py-5 last:border-b"
            key={step}
          >
            <span className="font-mono text-xs text-primary">0{index + 1}</span>
            <p className="text-lg tracking-[-0.02em] text-foreground">{step}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="relative mx-auto w-full max-w-[96rem] px-4 pb-10 sm:px-6 lg:px-8">
      <div className="landing-cta-band grid gap-6 px-5 py-7 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.055em] text-foreground sm:text-4xl">
            When the setup appears, call it.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Enter the market from one page, then follow the outcome through
            settlement.
          </p>
        </div>
        <Button
          className="h-11 justify-self-start px-5 lg:justify-self-end"
          render={<Link to="/markets" />}
          size="lg"
          type="button"
        >
          Trade Markets
          <ArrowRightIcon className="size-4" />
        </Button>
      </div>
    </section>
  )
}
