import { SuiGrpcClient } from "@mysten/sui/grpc"
import { z } from "zod"

import type { Config } from "../config.ts"

export type SuiClient = SuiGrpcClient

const protobufJsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      kind: z.union([
        z.object({ boolValue: z.boolean(), oneofKind: z.literal("boolValue") }).transform((value) => value.boolValue),
        z
          .object({ listValue: z.object({ values: z.array(protobufJsonValueSchema) }), oneofKind: z.literal("listValue") })
          .transform((value) => value.listValue.values),
        z.object({ nullValue: z.unknown().optional(), oneofKind: z.literal("nullValue") }).transform(() => null),
        z.object({ numberValue: z.number(), oneofKind: z.literal("numberValue") }).transform((value) => value.numberValue),
        z.object({ oneofKind: z.literal("stringValue"), stringValue: z.string() }).transform((value) => value.stringValue),
        z
          .object({
            oneofKind: z.literal("structValue"),
            structValue: z.object({ fields: z.record(z.string(), protobufJsonValueSchema) }),
          })
          .transform((value) => value.structValue.fields),
        z.object({ oneofKind: z.undefined() }).transform(() => null),
      ]),
    })
    .transform((value) => value.kind)
)

export function createSuiClient(config: Config): SuiClient {
  return new SuiGrpcClient({
    baseUrl: config.suiRpcUrl,
    network: config.suiNetwork,
  })
}

export function protobufValueToJson(value: unknown): unknown {
  return value === undefined ? null : protobufJsonValueSchema.parse(value)
}
