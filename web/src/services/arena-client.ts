import { BACKEND_URL } from "@/lib/config"
import { arenaPageModel } from "@/lib/arena/mock-data"
import type {
  ArenaActivity,
  ArenaCall,
  ArenaCreator,
  ArenaPageModel,
} from "@/lib/arena/types"

export interface ArenaCallDetail {
  activity: ArenaActivity[]
  call: ArenaCall
  creator?: ArenaCreator
}

export interface ArenaCreatorDetail {
  calls: ArenaCall[]
  creator: ArenaCreator
}

// Reads go through the backend when BACKEND_URL is configured; otherwise (or on
// any failure) Arena falls back to the local mock so the app stays usable.
async function fetchBackend<T>(path: string): Promise<T | null> {
  if (BACKEND_URL === "") {
    return null
  }

  try {
    const response = await fetch(`${BACKEND_URL}${path}`)
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  }
}

export async function getArenaPageModel(): Promise<ArenaPageModel> {
  const live = await fetchBackend<ArenaPageModel>("/arena")
  return live ?? arenaPageModel
}

function findMockCall(callId: string): ArenaCallDetail | undefined {
  const call = arenaPageModel.calls.find((entry) => entry.id === callId)
  if (!call) {
    return undefined
  }

  const creator = arenaPageModel.creators.find(
    (entry) => entry.handle === call.creatorHandle
  )
  const activity = arenaPageModel.activity.filter(
    (entry) => entry.callLabel === call.market
  )

  return { activity, call, creator }
}

export async function getArenaCall(
  callId: string
): Promise<ArenaCallDetail | undefined> {
  const live = await fetchBackend<ArenaCallDetail>(
    `/arena/calls/${encodeURIComponent(callId)}`
  )
  return live ?? findMockCall(callId)
}

function findMockCreator(handle: string): ArenaCreatorDetail | undefined {
  const creator = arenaPageModel.creators.find(
    (entry) => entry.handle === handle
  )
  if (!creator) {
    return undefined
  }

  const calls = arenaPageModel.calls.filter(
    (entry) => entry.creatorHandle === handle
  )

  return { calls, creator }
}

export async function getArenaCreator(
  addressOrHandle: string
): Promise<ArenaCreatorDetail | undefined> {
  const live = await fetchBackend<ArenaCreatorDetail>(
    `/arena/creators/${encodeURIComponent(addressOrHandle)}`
  )
  return live ?? findMockCreator(addressOrHandle)
}
