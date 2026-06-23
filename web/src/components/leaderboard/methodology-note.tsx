import { Card, CardContent } from "@/components/ui/card"

export function MethodologyNote({ assumptions }: { assumptions: string[] }) {
  return (
    <Card className="rounded-lg border-0 bg-card py-0 shadow-none ring-0">
      <CardContent className="px-4 py-3">
        <div className="text-sm leading-none font-medium tracking-[-0.01em] text-foreground">
          Methodology
        </div>
        <div className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
          {assumptions.map((assumption) => (
            <p key={assumption}>{assumption}</p>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
