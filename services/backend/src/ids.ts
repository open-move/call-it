import { monotonicFactory } from "ulid"

// CallIt's own internal identifier namespace. Every projection row gets a ULID
// minted here, decoupling our entity ids from chain object ids (which we keep
// as unique natural keys for joins + idempotent ingest).
//
// Monotonic: ids minted within the same millisecond stay strictly increasing,
// so lexicographic id order == insertion order. Time-sorted reads (e.g. the
// activity feed) can order by id directly and never reshuffle same-ms rows.
const nextUlid = monotonicFactory()

export function newId(): string {
  return nextUlid()
}
