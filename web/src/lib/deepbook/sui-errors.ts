export interface SuiMoveAbort {
  code: number
  command?: string
  functionName: string
  instruction?: number
  message: string
  moduleName: string
  packageId: string
}

export type SuiFailure =
  | {
      kind: "move_abort"
      abort: SuiMoveAbort
    }
  | {
      kind: "failure"
      message: string
    }

const moveAbortPattern =
  /MoveAbort(?: in ([^,]+))?, abort code: (\d+), in '([^']+)'(?: \(instruction (\d+)\))?/

export function parseSuiFailure(message: string): SuiFailure {
  const match = moveAbortPattern.exec(message)

  if (!match) {
    return { kind: "failure", message }
  }

  const [, command, code, target, instruction] = match
  const [packageId, moduleName, functionName] = target?.split("::") ?? []

  if (!packageId || !moduleName || !functionName || !code) {
    return { kind: "failure", message }
  }

  return {
    kind: "move_abort",
    abort: {
      code: Number(code),
      command,
      functionName,
      instruction: instruction ? Number(instruction) : undefined,
      message,
      moduleName,
      packageId,
    },
  }
}

export function getSuiFailureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
