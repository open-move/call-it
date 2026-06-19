import {
  ARENA_OBJECT_ID,
  ARENA_PACKAGE_ID,
  ARENA_ROOT_ID,
} from "@/lib/config"
import { arenaPageModel } from "@/lib/arena/mock-data"
import type { ArenaPageModel } from "@/lib/arena/types"

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
