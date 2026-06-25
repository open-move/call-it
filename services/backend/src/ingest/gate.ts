export class IngestGate {
  private current: Promise<void> = Promise.resolve()

  async runExclusive<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.current
    let release: () => void = () => undefined
    this.current = previous.then(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )

    await previous
    try {
      return await run()
    } finally {
      release()
    }
  }
}

export class IngestGates {
  private readonly gates = new Map<string, IngestGate>()

  get(pipeline: string): IngestGate {
    const existing = this.gates.get(pipeline)
    if (existing !== undefined) {
      return existing
    }
    const gate = new IngestGate()
    this.gates.set(pipeline, gate)
    return gate
  }
}
