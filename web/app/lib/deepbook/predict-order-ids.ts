import { type SuiClientTypes } from "@mysten/sui/client"

import { getSuiGrpcClient } from "./sui-client"
import {
  type DirectionalPositionMintEvent,
  type DirectionalPositionRedeemEvent,
  type ManagerPositionSummary,
  type RangeMintEvent,
  type RangeRedeemEvent,
} from "./predict-types"

type DirectionalOrderEvent =
  | DirectionalPositionMintEvent
  | DirectionalPositionRedeemEvent
type RangeOrderEvent = RangeMintEvent | RangeRedeemEvent
type ManagedOrderEvent = DirectionalOrderEvent | RangeOrderEvent

const NEG_INF_STRIKE = "0"
const POS_INF_STRIKE = "18446744073709551615"

const transactionEventsCache = new Map<
  string,
  Promise<SuiClientTypes.Event[]>
>()

function readDecimalString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString()
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return value
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readOptionalDecimalString(value: unknown) {
  const decimalString = readDecimalString(value)

  if (decimalString) {
    return decimalString
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? readDecimalString(value[0]) : undefined
  }

  if (!isRecord(value)) {
    return undefined
  }

  return (
    readDecimalString(value.some) ??
    readDecimalString(value.Some) ??
    readDecimalString(value.value)
  )
}

function readEventDecimal(event: SuiClientTypes.Event, key: string) {
  if (!event.json) {
    return undefined
  }

  return readDecimalString(event.json[key])
}

function readEventString(event: SuiClientTypes.Event, key: string) {
  const value = event.json?.[key]

  return typeof value === "string" ? value : undefined
}

function decimalEquals(value: unknown, expectedValue: number | string) {
  const decimalString = readDecimalString(value)

  return (
    decimalString !== undefined && decimalString === expectedValue.toString()
  )
}

function hasMatchingManager(
  event: SuiClientTypes.Event,
  row: ManagedOrderEvent
) {
  return readEventString(event, "predict_manager_id") === row.manager_id
}

function getDirectionalLowerStrike(row: { is_up: boolean; strike: number }) {
  return row.is_up ? row.strike : NEG_INF_STRIKE
}

function getDirectionalHigherStrike(row: { is_up: boolean; strike: number }) {
  return row.is_up ? POS_INF_STRIKE : row.strike
}

function isMatchingDirectionalOrderMintedEvent(
  event: SuiClientTypes.Event,
  row: DirectionalPositionMintEvent
) {
  if (!event.eventType.endsWith("::order_events::OrderMinted")) {
    return false
  }

  if (!event.json || !hasMatchingManager(event, row)) {
    return false
  }

  return (
    decimalEquals(event.json.lower_strike, getDirectionalLowerStrike(row)) &&
    decimalEquals(event.json.higher_strike, getDirectionalHigherStrike(row)) &&
    decimalEquals(event.json.quantity, row.quantity)
  )
}

function isOrderRedeemedEvent(event: SuiClientTypes.Event) {
  return (
    event.eventType.endsWith("::order_events::LiveOrderRedeemed") ||
    event.eventType.endsWith("::order_events::SettledOrderRedeemed") ||
    event.eventType.endsWith("::order_events::LiquidatedOrderRedeemed")
  )
}

function isMatchingDirectionalOrderRedeemedEvent(
  event: SuiClientTypes.Event,
  row: DirectionalPositionRedeemEvent
) {
  if (!isOrderRedeemedEvent(event)) {
    return false
  }

  if (!event.json || !hasMatchingManager(event, row)) {
    return false
  }

  return decimalEquals(event.json.quantity_closed, row.quantity)
}

function isMatchingOrderMintedEvent(
  event: SuiClientTypes.Event,
  row: RangeMintEvent
) {
  if (!event.eventType.endsWith("::order_events::OrderMinted")) {
    return false
  }

  if (!event.json || !hasMatchingManager(event, row)) {
    return false
  }

  return (
    decimalEquals(event.json.lower_strike, row.lower_strike) &&
    decimalEquals(event.json.higher_strike, row.higher_strike) &&
    decimalEquals(event.json.quantity, row.quantity)
  )
}

function isMatchingOrderRedeemedEvent(
  event: SuiClientTypes.Event,
  row: RangeRedeemEvent
) {
  if (!isOrderRedeemedEvent(event)) {
    return false
  }

  if (!event.json || !hasMatchingManager(event, row)) {
    return false
  }

  return decimalEquals(event.json.quantity_closed, row.quantity)
}

function getOrderIdFromEvent(event: SuiClientTypes.Event) {
  return readEventDecimal(event, "order_id")
}

function getReplacementOrderIdFromEvent(event: SuiClientTypes.Event) {
  return event.json
    ? readOptionalDecimalString(event.json.replacement_order_id)
    : undefined
}

async function getTransactionEvents(digest: string) {
  const cachedEvents = transactionEventsCache.get(digest)

  if (cachedEvents) {
    return cachedEvents
  }

  const eventsPromise = getSuiGrpcClient()
    .getTransaction({ digest, include: { events: true } })
    .then((result) =>
      result.$kind === "Transaction" ? result.Transaction.events : []
    )

  transactionEventsCache.set(digest, eventsPromise)
  return eventsPromise
}

function findDirectionalMintOrderId(
  row: DirectionalPositionMintEvent,
  events: SuiClientTypes.Event[]
) {
  const indexedEvent = events[row.event_index]
  const indexedOrderId =
    indexedEvent && isMatchingDirectionalOrderMintedEvent(indexedEvent, row)
      ? getOrderIdFromEvent(indexedEvent)
      : undefined

  if (indexedOrderId) {
    return indexedOrderId
  }

  for (const event of events) {
    if (isMatchingDirectionalOrderMintedEvent(event, row)) {
      return getOrderIdFromEvent(event)
    }
  }

  return undefined
}

function findDirectionalRedeemOrderIds(
  row: DirectionalPositionRedeemEvent,
  events: SuiClientTypes.Event[]
) {
  const indexedEvent = events[row.event_index]

  if (
    indexedEvent &&
    isMatchingDirectionalOrderRedeemedEvent(indexedEvent, row)
  ) {
    return {
      orderId: getOrderIdFromEvent(indexedEvent),
      replacementOrderId: getReplacementOrderIdFromEvent(indexedEvent),
    }
  }

  for (const event of events) {
    if (isMatchingDirectionalOrderRedeemedEvent(event, row)) {
      return {
        orderId: getOrderIdFromEvent(event),
        replacementOrderId: getReplacementOrderIdFromEvent(event),
      }
    }
  }

  return {}
}

function findRangeMintOrderId(
  row: RangeMintEvent,
  events: SuiClientTypes.Event[]
) {
  const indexedEvent = events[row.event_index]
  const indexedOrderId =
    indexedEvent && isMatchingOrderMintedEvent(indexedEvent, row)
      ? getOrderIdFromEvent(indexedEvent)
      : undefined

  if (indexedOrderId) {
    return indexedOrderId
  }

  for (const event of events) {
    if (isMatchingOrderMintedEvent(event, row)) {
      return getOrderIdFromEvent(event)
    }
  }

  return undefined
}

function findRangeRedeemOrderIds(
  row: RangeRedeemEvent,
  events: SuiClientTypes.Event[]
) {
  const indexedEvent = events[row.event_index]

  if (indexedEvent && isMatchingOrderRedeemedEvent(indexedEvent, row)) {
    return {
      orderId: getOrderIdFromEvent(indexedEvent),
      replacementOrderId: getReplacementOrderIdFromEvent(indexedEvent),
    }
  }

  for (const event of events) {
    if (isMatchingOrderRedeemedEvent(event, row)) {
      return {
        orderId: getOrderIdFromEvent(event),
        replacementOrderId: getReplacementOrderIdFromEvent(event),
      }
    }
  }

  return {}
}

async function hydrateDirectionalMintOrderId(
  event: DirectionalPositionMintEvent
) {
  if (event.order_id) {
    return event
  }

  const events = await getTransactionEvents(event.digest)
  const orderId = findDirectionalMintOrderId(event, events)

  return orderId ? { ...event, order_id: orderId } : event
}

async function hydrateDirectionalRedeemOrderId(
  event: DirectionalPositionRedeemEvent
) {
  if (event.order_id && event.replacement_order_id) {
    return event
  }

  const events = await getTransactionEvents(event.digest)
  const { orderId, replacementOrderId } = findDirectionalRedeemOrderIds(
    event,
    events
  )

  return {
    ...event,
    order_id: event.order_id ?? orderId,
    replacement_order_id: event.replacement_order_id ?? replacementOrderId,
  }
}

async function hydrateRangeMintOrderId(event: RangeMintEvent) {
  if (event.order_id) {
    return event
  }

  const events = await getTransactionEvents(event.digest)
  const orderId = findRangeMintOrderId(event, events)

  return orderId ? { ...event, order_id: orderId } : event
}

async function hydrateRangeRedeemOrderId(event: RangeRedeemEvent) {
  if (event.order_id && event.replacement_order_id) {
    return event
  }

  const events = await getTransactionEvents(event.digest)
  const { orderId, replacementOrderId } = findRangeRedeemOrderIds(event, events)

  return {
    ...event,
    order_id: event.order_id ?? orderId,
    replacement_order_id: event.replacement_order_id ?? replacementOrderId,
  }
}

function getDirectionalPositionKey(
  position: Pick<
    ManagerPositionSummary,
    "expiry" | "is_up" | "manager_id" | "oracle_id" | "strike"
  >
) {
  return `${position.manager_id}:${position.oracle_id}:${position.expiry}:${position.strike}:${position.is_up ? "up" : "down"}`
}

export async function hydrateDirectionalActivityOrderIds({
  minted,
  redeemed,
}: {
  minted: DirectionalPositionMintEvent[]
  redeemed: DirectionalPositionRedeemEvent[]
}) {
  const [hydratedMinted, hydratedRedeemed] = await Promise.all([
    Promise.all(minted.map(hydrateDirectionalMintOrderId)),
    Promise.all(redeemed.map(hydrateDirectionalRedeemOrderId)),
  ])

  return {
    minted: hydratedMinted,
    redeemed: hydratedRedeemed,
  }
}

export function applyDirectionalActivityOrderIds({
  minted,
  redeemed,
  summaries,
}: {
  minted: DirectionalPositionMintEvent[]
  redeemed: DirectionalPositionRedeemEvent[]
  summaries: ManagerPositionSummary[]
}) {
  const orderIdsByPosition = new Map<string, Set<string>>()

  function getOrderIds(key: string) {
    const existingOrderIds = orderIdsByPosition.get(key)

    if (existingOrderIds) {
      return existingOrderIds
    }

    const orderIds = new Set<string>()

    orderIdsByPosition.set(key, orderIds)
    return orderIds
  }

  minted.forEach((event) => {
    if (!event.order_id) {
      return
    }

    getOrderIds(getDirectionalPositionKey(event)).add(event.order_id)
  })

  redeemed.forEach((event) => {
    const orderIds = getOrderIds(getDirectionalPositionKey(event))

    if (event.order_id) {
      orderIds.delete(event.order_id)
    }

    if (event.replacement_order_id) {
      orderIds.add(event.replacement_order_id)
    }
  })

  return summaries.map((summary) => {
    const existingOrderIds = summary.order_ids ?? []
    const hydratedOrderIds = Array.from(
      orderIdsByPosition.get(getDirectionalPositionKey(summary)) ?? []
    )

    if (existingOrderIds.length === 0 && hydratedOrderIds.length === 0) {
      return summary
    }

    return {
      ...summary,
      order_ids: Array.from(
        new Set([...existingOrderIds, ...hydratedOrderIds])
      ),
    }
  })
}

export async function hydrateRangeActivityOrderIds({
  minted,
  redeemed,
}: {
  minted: RangeMintEvent[]
  redeemed: RangeRedeemEvent[]
}) {
  const [hydratedMinted, hydratedRedeemed] = await Promise.all([
    Promise.all(minted.map(hydrateRangeMintOrderId)),
    Promise.all(redeemed.map(hydrateRangeRedeemOrderId)),
  ])

  return {
    minted: hydratedMinted,
    redeemed: hydratedRedeemed,
  }
}
