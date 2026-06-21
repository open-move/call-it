import { BACKEND_URL } from "@/lib/config"

// Shared client for the CallIt backend. Reads compose the backend when
// BACKEND_URL is set (otherwise callers fall back to mock); authed requests
// attach the backend session JWT. The token is held in module scope and set by
// the SessionProvider on the client — it is never read or set during SSR, where
// only public reads run.
let authToken: string | null = null

export function setBackendAuthToken(token: string | null): void {
  authToken = token
}

export function backendConfigured(): boolean {
  return BACKEND_URL !== ""
}

export class BackendError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "BackendError"
  }
}

interface RequestOptions {
  auth?: boolean
  body?: unknown
  method?: string
  signal?: AbortSignal
}

// Lenient read: returns null when the backend is unconfigured or on any failure,
// so public-read callers can fall back to mock data.
export async function backendFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T | null> {
  if (BACKEND_URL === "") {
    return null
  }
  try {
    const response = await rawRequest(path, options)
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  }
}

// Strict request: throws BackendError(status) on a non-2xx response. Use for the
// auth exchange and mutations where the caller needs the failure (e.g. a 409
// username conflict or a 401).
export async function backendRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  if (BACKEND_URL === "") {
    throw new BackendError(0, "backend not configured")
  }
  const response = await rawRequest(path, options)
  if (!response.ok) {
    throw new BackendError(response.status, await readError(response))
  }
  return (await response.json()) as T
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers = new Headers()
  if (options.auth && authToken !== null) {
    headers.set("authorization", `Bearer ${authToken}`)
  }
  let body: string | undefined
  if (options.body !== undefined) {
    headers.set("content-type", "application/json")
    body = JSON.stringify(options.body)
  }
  return fetch(`${BACKEND_URL}${path}`, {
    body,
    headers,
    method: options.method ?? "GET",
    signal: options.signal,
  })
}

async function readError(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json()
    if (
      data !== null &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      return (data as { error: string }).error
    }
  } catch {
    // fall through to status text
  }
  return response.statusText
}
