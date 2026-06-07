import { z } from "zod"

export const marketSearchSchema = z.object({
  side: z.enum(["up", "down"]).optional().catch(undefined),
  strike: z.coerce.number().positive().optional().catch(undefined),
})

export function getInitialSide(value?: "up" | "down") {
  if (value === "up") {
    return "above" as const
  }

  if (value === "down") {
    return "below" as const
  }

  return undefined
}
