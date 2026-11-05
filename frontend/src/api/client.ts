import { API_BASE_URL } from '../config'

/** Field-level validation messages returned with a 400 response. */
export type FieldErrors = Record<string, unknown>

/** Error raised for any failed request, carrying the server's message and field errors. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: FieldErrors
  /** The full response body, for errors that carry extra data (e.g. weather_request). */
  readonly body: unknown

  constructor(
    status: number,
    message: string,
    code = 'error',
    fieldErrors: FieldErrors = {},
    body: unknown = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.body = body
  }

  /** Worth retrying: network failures and upstream (5xx) errors, but not missing config. */
  get isTransient(): boolean {
    return this.status === 0 || (this.status >= 500 && this.code !== 'not_configured')
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  query?: Record<string, string | number | undefined>
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, query, ...rest } = options
  // Resolving against the page origin also supports a relative (same-origin) API base URL.
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const data = (payload ?? {}) as { detail?: unknown; code?: unknown; errors?: FieldErrors }
    throw new ApiError(
      response.status,
      typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`,
      typeof data.code === 'string' ? data.code : 'error',
      data.errors ?? {},
      payload,
    )
  }
  return payload as T
}
