import {
  ARENA_OBJECT_ID,
  ARENA_PACKAGE_ID,
  ARENA_ROOT_ID,
} from "@/lib/config"
import { arenaPageModel } from "@/lib/arena/mock-data"
import type {
  ArenaActivity,
  ArenaCall,
  ArenaCreator,
  ArenaPageModel,
} from "@/lib/arena/types"

export interface ArenaClientConfig {
  arenaObjectId: string
  arenaPackageId: string
  arenaRootId: string
  isConfigured: boolean
}

export function getArenaClientConfig() {
  return {
    arenaObjectId: ARENA_OBJECT_ID,
    arenaPackageId: ARENA_PACKAGE_ID,
    arenaRootId: ARENA_ROOT_ID,
    isConfigured: !!ARENA_PACKAGE_ID && !!ARENA_ROOT_ID && !!ARENA_OBJECT_ID,
  } satisfies ArenaClientConfig
}

export async function getArenaPageModel(): Promise<ArenaPageModel> {
  const config = getArenaClientConfig()

  if (!config.isConfigured) {
    return arenaPageModel
  }

  // Live Arena object/event reads will replace this model once deployment IDs
  // and an event indexing strategy are configured.
  return arenaPageModel
}

export interface ArenaCallDetail {
  activity: ArenaActivity[]
  call: ArenaCall
  creator?: ArenaCreator
}

export async function getArenaCall(
  callId: string
): Promise<ArenaCallDetail | undefined> {
  const model = await getArenaPageModel()
  const call = model.calls.find((entry) => entry.id === callId)

  if (!call) {
    return undefined
  }

  const creator = model.creators.find(
    (entry) => entry.handle === call.creatorHandle
  )
  const activity = model.activity.filter(
    (entry) => entry.callLabel === call.market
  )

  return { activity, call, creator }
}

export interface ArenaCreatorDetail {
  calls: ArenaCall[]
  creator: ArenaCreator
}

export async function getArenaCreator(
  handle: string
): Promise<ArenaCreatorDetail | undefined> {
  const model = await getArenaPageModel()
  const creator = model.creators.find((entry) => entry.handle === handle)

  if (!creator) {
    return undefined
  }

  const calls = model.calls.filter((entry) => entry.creatorHandle === handle)

  return { calls, creator }
}
