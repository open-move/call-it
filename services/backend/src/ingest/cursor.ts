// Named ingest pipelines. Each owns an independent row in `ingest_cursors`, so
// pipelines advance separately and can start at different checkpoints.
export const PIPELINE = {
  ARENA: "arena",
} as const

export type PipelineName = (typeof PIPELINE)[keyof typeof PIPELINE]
