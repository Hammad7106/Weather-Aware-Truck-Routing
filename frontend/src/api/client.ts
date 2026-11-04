import { API_BASE_URL } from '../config'

/** Error raised for any non-2xx API response, carrying the server's message when present. */
export class ApiError extends Error {
  readonly status: number
  readonly details: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'detail' in payload && String(payload.detail)) ||
      `Request failed (${response.status})`
    throw new ApiError(response.status, message, payload)
  }

  return payload as T
}

export interface HealthResponse {
  status: 'ok'
  routing_configured: boolean
}

export const getHealth = (signal?: AbortSignal) =>
  apiRequest<HealthResponse>('/api/health', { signal })
