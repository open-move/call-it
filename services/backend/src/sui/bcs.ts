// BCS decode helpers shared across domain decoders.
//
// Move -> BCS conventions (decoders are built with @mysten/sui/bcs in the
// domain modules):
//   u64                       -> bcs.u64()            (decimal string, BigInt-safe)
//   address / ID              -> bcs.Address          (0x-prefixed hex; normalize lowercase)
//   bool                      -> bcs.bool()
//   vector<u8>                -> bcs.vector(bcs.u8())  (number[]; hex-encode for storage)
//   std::type_name::TypeName  -> bcs.struct({ name: bcs.struct({ bytes: bcs.vector(bcs.u8()) }) })
//                                then UTF-8 decode the bytes.

const textDecoder = new TextDecoder()

export function normalizeAddress(value: string): string {
  const lower = value.toLowerCase()
  return lower.startsWith("0x") ? lower : `0x${lower}`
}

export function bytesToHex(value: number[]): string {
  return value.map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function typeNameToString(value: { name: { bytes: number[] } }): string {
  return textDecoder.decode(Uint8Array.from(value.name.bytes))
}

// Parse a Move event type string like
// `0xpkg::arena::CallLaunched<0x2::sui::SUI>` into { module, name }.
// Generics (`<...>`) are stripped before splitting.
export function parseEventType(eventType: string): { module: string; name: string } {
  const withoutGenerics = eventType.replace(/<.*>$/, "")
  const parts = withoutGenerics.split("::")
  const module = parts[1] ?? ""
  const name = parts[2] ?? ""
  return { module, name }
}
