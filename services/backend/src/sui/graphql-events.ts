import { z } from "zod";

import type { CheckpointEvent } from "./checkpoint.ts";
import { normalizeAddress } from "./bcs.ts";

const GRAPHQL_EVENT_PAGE_SIZE = 100;

const checkpointSchema = z.object({
  sequenceNumber: z.number().int().nonnegative(),
});

const pageInfoSchema = z.object({
  endCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
});

const graphqlEventEdgeSchema = z.object({
  cursor: z.string(),
  node: z.object({
    contents: z.object({
      json: z.unknown(),
      type: z.object({ repr: z.string() }),
    }),
    sender: z.object({ address: z.string() }),
    sequenceNumber: z.number().int().nonnegative(),
    timestamp: z.string().nullable(),
    transaction: z.object({
      digest: z.string(),
      effects: z.object({ checkpoint: checkpointSchema }),
    }),
  }),
});

const eventPageDataSchema = z.object({
  events: z.object({
    edges: z.array(graphqlEventEdgeSchema),
    pageInfo: pageInfoSchema,
  }),
});

const latestCheckpointDataSchema = z.object({ checkpoint: checkpointSchema });

// GraphQL returns `data: null` (not absent) on a query-level error, so accept
// null here — otherwise the schema throws before we can surface `errors`.
const graphqlResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullish(),
    errors: z
      .array(
        z.object({
          message: z.string(),
        }),
      )
      .optional(),
  });

// The testnet GraphQL endpoint intermittently returns transient errors / null
// data under load; retry a few times with linear backoff before giving up.
const GRAPHQL_MAX_ATTEMPTS = 5;
const GRAPHQL_RETRY_BASE_MS = 500;

const strategyModuleEventsQuery = `
  query StrategyModuleEvents(
    $module: String!
    $afterCheckpoint: UInt53!
    $beforeCheckpoint: UInt53!
    $cursor: String
  ) {
    events(
      first: ${GRAPHQL_EVENT_PAGE_SIZE}
      after: $cursor
      filter: {
        module: $module
        afterCheckpoint: $afterCheckpoint
        beforeCheckpoint: $beforeCheckpoint
      }
    ) {
      edges {
        cursor
        node {
          sequenceNumber
          timestamp
          contents {
            json
            type { repr }
          }
          sender { address }
          transaction {
            digest
            effects {
              checkpoint { sequenceNumber }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const latestCheckpointQuery = `
  query LatestCheckpoint {
    checkpoint { sequenceNumber }
  }
`;

export interface StrategyModuleEventPage {
  events: CheckpointEvent[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

export async function getLatestGraphqlCheckpoint(url: string): Promise<bigint> {
  const data = await graphqlRequest(
    url,
    latestCheckpointQuery,
    {},
    latestCheckpointDataSchema,
  );
  return BigInt(data.checkpoint.sequenceNumber);
}

export async function fetchStrategyModuleEventPage(input: {
  afterCheckpoint: bigint;
  beforeCheckpoint: bigint;
  cursor: string | null;
  packageId: string;
  url: string;
}): Promise<StrategyModuleEventPage> {
  const data = await graphqlRequest(
    input.url,
    strategyModuleEventsQuery,
    {
      afterCheckpoint: bigintToSafeNumber(input.afterCheckpoint),
      beforeCheckpoint: bigintToSafeNumber(input.beforeCheckpoint),
      cursor: input.cursor,
      module: `${normalizeAddress(input.packageId)}::strategy`,
    },
    eventPageDataSchema,
  );

  return {
    events: data.events.edges.map((edge) =>
      graphqlEventEdgeToCheckpointEvent(edge),
    ),
    hasNextPage: data.events.pageInfo.hasNextPage,
    nextCursor: data.events.pageInfo.endCursor,
  };
}

export function graphqlEventEdgeToCheckpointEvent(
  edge: z.infer<typeof graphqlEventEdgeSchema>,
): CheckpointEvent {
  const eventType = normalizeMoveType(edge.node.contents.type.repr);
  const parts = eventTypeWithoutGenerics(eventType).split("::");
  const packageId = parts[0] ?? "";
  const module = parts[1] ?? "";
  const checkpoint = edge.node.transaction.effects.checkpoint.sequenceNumber;
  const eventIndex = edge.node.sequenceNumber;

  return {
    contents: null,
    json: edge.node.contents.json,
    meta: {
      checkpoint,
      checkpointTimestampMs: parseGraphqlTimestamp(edge.node.timestamp),
      digest: edge.node.transaction.digest,
      eventId: `${edge.node.transaction.digest}:${eventIndex}`,
      eventIndex,
      eventType,
      module,
      packageId,
      sender: normalizeAddress(edge.node.sender.address),
      // GraphQL exposes the per-transaction event sequence but not the
      // checkpoint-local transaction index. The page order is already the source
      // of truth for replay order; this field is retained for raw-event shape.
      txIndex: 0,
    },
  };
}

async function graphqlRequest<T extends z.ZodType>(
  url: string,
  query: string,
  variables: Record<string, number | string | null>,
  dataSchema: T,
): Promise<z.infer<T>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= GRAPHQL_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await graphqlRequestOnce(url, query, variables, dataSchema);
    } catch (error) {
      lastError = error;
      if (attempt < GRAPHQL_MAX_ATTEMPTS) {
        await sleep(GRAPHQL_RETRY_BASE_MS * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function graphqlRequestOnce<T extends z.ZodType>(
  url: string,
  query: string,
  variables: Record<string, number | string | null>,
  dataSchema: T,
): Promise<z.infer<T>> {
  const response = await fetch(url, {
    body: JSON.stringify({ query, variables }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      `GraphQL request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body: unknown = await response.json();
  const parsed = graphqlResponseSchema(dataSchema).parse(body);
  if (parsed.errors !== undefined && parsed.errors.length > 0) {
    throw new Error(
      `GraphQL request failed: ${parsed.errors.map((error) => error.message).join("; ")}`,
    );
  }
  if (parsed.data === undefined || parsed.data === null) {
    throw new Error("GraphQL response did not include data");
  }
  return parsed.data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bigintToSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `checkpoint ${value.toString()} exceeds Number.MAX_SAFE_INTEGER`,
    );
  }
  return Number(value);
}

function parseGraphqlTimestamp(value: string | null): number {
  if (value === null) {
    return 0;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`invalid GraphQL event timestamp ${value}`);
  }
  return timestamp;
}

function normalizeMoveType(value: string): string {
  const parts = value.split("::");
  if (parts.length === 0) {
    return value;
  }
  parts[0] = normalizeAddress(parts[0] ?? "");
  return parts.join("::");
}

function eventTypeWithoutGenerics(value: string): string {
  return value.replace(/<.*>$/, "");
}
