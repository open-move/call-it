// Named ingest pipelines. Each owns an independent row in `ingest_cursors`, so
// pipelines advance separately and can start at different checkpoints.
export const PIPELINE = {
  ARENA: "arena",
  BULLISH_UPSIDE: "strategy:bullish-upside",
  HEDGED_PLP: "strategy:hedged-plp",
  PLP_COLLAR: "strategy:plp-collar",
  RANGE_LADDER: "strategy:range-ladder",
  STRANGLE: "strategy:strangle",
} as const

export type PipelineName = (typeof PIPELINE)[keyof typeof PIPELINE]
