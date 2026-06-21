import type {
  ArenaActivity,
  ArenaCall,
  ArenaCreator,
  ArenaPageModel,
  ArenaSummary,
} from "./types"

export const arenaCalls = [
  {
    backers: 48,
    bondPlp: 18_400,
    createdAt: "12m ago",
    creatorAvatarSeed: "mira",
    creatorHandle: "mira",
    creatorName: "Mira Chen",
    creatorWinRate: 0.68,
    direction: "up",
    expiryMs: Date.now() + 3 * 60 * 60 * 1000,
    faders: 31,
    fairUpProbability: 0.62,
    id: "call-btc-104k",
    market: "BTC above 104,000",
    status: "active",
    strikeUsd: 104_000,
  },
  {
    backers: 36,
    bondPlp: 12_750,
    createdAt: "28m ago",
    creatorAvatarSeed: "salt",
    creatorHandle: "saltedged",
    creatorName: "Salt Edge",
    creatorWinRate: 0.6,
    direction: "down",
    expiryMs: Date.now() + 5 * 60 * 60 * 1000,
    faders: 42,
    fairUpProbability: 0.58,
    id: "call-btc-101k",
    market: "BTC below 101,000",
    status: "active",
    strikeUsd: 101_000,
  },
  {
    backers: 22,
    bondPlp: 9_900,
    createdAt: "1h ago",
    creatorAvatarSeed: "north",
    creatorHandle: "northstar",
    creatorName: "North Star",
    creatorWinRate: 0.64,
    direction: "up",
    expiryMs: Date.now() + 28 * 60 * 60 * 1000,
    faders: 18,
    fairUpProbability: 0.47,
    id: "call-btc-108k",
    market: "BTC above 108,000",
    status: "active",
    strikeUsd: 108_000,
  },
  {
    backers: 57,
    bondPlp: 21_300,
    createdAt: "5h ago",
    creatorAvatarSeed: "glyph",
    creatorHandle: "glyphdesk",
    creatorName: "Glyph Desk",
    creatorWinRate: 0.65,
    direction: "down",
    expiryMs: Date.now() - 5 * 60 * 60 * 1000,
    faders: 29,
    fairUpProbability: 0.34,
    id: "call-btc-99000",
    market: "BTC below 99,000",
    status: "settled",
    strikeUsd: 99_000,
    winState: "won",
  },
] satisfies ArenaCall[]

export const arenaCreators = [
  {
    bondPlp: 64_200,
    callCount: 31,
    handle: "mira",
    id: "creator-mira",
    name: "Mira Chen",
    settledCount: 22,
    winCount: 15,
  },
  {
    bondPlp: 52_900,
    callCount: 26,
    handle: "glyphdesk",
    id: "creator-glyph",
    name: "Glyph Desk",
    settledCount: 20,
    winCount: 13,
  },
  {
    bondPlp: 38_100,
    callCount: 19,
    handle: "saltedged",
    id: "creator-salt",
    name: "Salt Edge",
    settledCount: 15,
    winCount: 9,
  },
  {
    bondPlp: 33_700,
    callCount: 17,
    handle: "northstar",
    id: "creator-north",
    name: "North Star",
    settledCount: 11,
    winCount: 7,
  },
] satisfies ArenaCreator[]

export const arenaActivity = [
  {
    actor: "mira",
    callLabel: "BTC above 104,000",
    id: "activity-launch-btc-104k",
    kind: "launched",
    timestamp: "12m ago",
  },
  {
    actor: "0x91b2...7f10",
    callLabel: "BTC below 101,000",
    id: "activity-fade-btc-101k",
    kind: "faded",
    timestamp: "19m ago",
  },
  {
    actor: "0x3ac4...d882",
    callLabel: "BTC above 104,000",
    id: "activity-back-btc-104k",
    kind: "backed",
    timestamp: "24m ago",
  },
  {
    actor: "glyphdesk",
    callLabel: "BTC below 99,000",
    id: "activity-claim-btc-99000",
    kind: "claimed",
    timestamp: "2h ago",
  },
] satisfies ArenaActivity[]

function buildArenaSummary(calls: ArenaCall[], creators: ArenaCreator[]) {
  return {
    activeCalls: calls.filter((call) => call.status === "active").length,
    bondedPlp: calls.reduce((total, call) => total + call.bondPlp, 0),
    creatorCount: creators.length,
    participantCount: calls.reduce(
      (total, call) => total + call.backers + call.faders,
      0
    ),
  } satisfies ArenaSummary
}

export const arenaPageModel = {
  activity: arenaActivity,
  calls: arenaCalls,
  creators: arenaCreators,
  dataMode: "mock",
  summary: buildArenaSummary(arenaCalls, arenaCreators),
} satisfies ArenaPageModel
