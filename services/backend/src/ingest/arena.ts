import type { Config } from "../config.ts"
import type { CheckpointContext } from "../db/repo.ts"
import { isArenaEventType, parseArenaEvent } from "../domains/arena.ts"
import { bytesToHex } from "../sui/bcs.ts"
import type { CheckpointEvent } from "../sui/checkpoint.ts"
import { PIPELINE } from "./cursor.ts"
import type { CheckpointHandler, PipelineDefinition } from "./events.ts"

export function arenaPipeline(config: Config): PipelineDefinition {
  return {
    handler: makeArenaHandler(),
    name: PIPELINE.ARENA,
    packageId: config.arenaPackageId,
  }
}

function makeArenaHandler(): CheckpointHandler {
  return async (ctx: CheckpointContext, event: CheckpointEvent): Promise<void> => {
    if (!isArenaEventType(event.meta.eventType)) {
      return
    }

    await ctx.insertRawEvent({
      contents: event.contents === null ? null : bytesToHex([...event.contents]),
      json: event.json === null ? null : JSON.stringify(event.json),
      meta: event.meta,
    })

    const parsed = parseArenaEvent(event)
    if (parsed === null) {
      return
    }

    switch (parsed.kind) {
      case "CallLaunched":
        await ctx.applyCallLaunched(event.meta, parsed.value)
        return
      case "CallBacked":
        await ctx.applyParticipation(event.meta, "back", parsed.value)
        return
      case "CallFaded":
        await ctx.applyParticipation(event.meta, "fade", parsed.value)
        return
      case "CreatorBondClaimed":
        await ctx.applyBondClaimed(event.meta, parsed.value)
        return
      case "CreatorBondReclaimed":
        await ctx.applyBondReclaimed(event.meta, parsed.value)
        return
      default:
        return
    }
  }
}
