import pino from "pino"

export const logger = pino({
  formatters: {
    level(label) {
      return { level: label }
    },
  },
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
})

export function toLogFields(value: unknown) {
  return normalizeForLog(value)
}

function normalizeForLog(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForLog)
  }
  if (typeof value === "object" && value !== null) {
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      output[key] = normalizeForLog(child)
    }
    return output
  }
  return value
}
