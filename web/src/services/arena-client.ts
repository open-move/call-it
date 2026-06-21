import type {
  ArenaActivity,
  ArenaCall,
  ArenaCreator,
  ArenaPageModel,
} from "@/lib/arena/types"
import { backendFetch } from "@/services/backend-client"

export interface ArenaCallDetail {
  activity: ArenaActivity[]
  call: ArenaCall
  creator?: ArenaCreator
}

export interface ArenaCreatorDetail {
  calls: ArenaCall[]
  creator: ArenaCreator
}

// Empty page shown when the backend is unconfigured or unreachable. No mock
// data — the arena renders its empty state rather than fabricated calls.
const EMPTY_PAGE_MODEL: ArenaPageModel = {
  activity: [],
  calls: [],
  creators: [],
  summary: {
    activeCalls: 0,
    bondedPlp: 0,
    creatorCount: 0,
    participantCount: 0,
  },
}

// Arena reads compose the backend when configured; otherwise (or on any failure)
// `backendFetch` returns null and we degrade to an empty page. These are public
// reads — no auth needed.
export async function getArenaPageModel(): Promise<ArenaPageModel> {
  const live = await backendFetch<ArenaPageModel>("/arena")
  return live ?? EMPTY_PAGE_MODEL
}

export async function getArenaCall(
  callId: string
): Promise<ArenaCallDetail | undefined> {
  const live = await backendFetch<ArenaCallDetail>(
    `/arena/calls/${encodeURIComponent(callId)}`
  )
  return live ?? undefined
}

export async function getArenaCreator(
  addressOrHandle: string
): Promise<ArenaCreatorDetail | undefined> {
  const live = await backendFetch<ArenaCreatorDetail>(
    `/arena/creators/${encodeURIComponent(addressOrHandle)}`
  )
  return live ?? undefined
}
