// The one fetch wrapper for the real API (docs/api-and-security.md). JSON in and out, cookies included (the refresh
// token is an httpOnly cookie on /api/auth), and the access token in an Authorization header. The access token lives
// in this module's memory only: never in localStorage or sessionStorage (NFR-4).
//
// Errors come back from the server as { error: { code, message, details? } }; they are thrown as ApiError with
// { status, code, message, fieldErrors } where fieldErrors is { [field]: firstMessage } from `details`.

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '')

const NETWORK_MESSAGE = 'We can’t reach MarkieSharkie right now. Check your connection and try again.'
const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

let accessToken = null
export const setAccessToken = (token) => {
  accessToken = token || null
}
export const hasAccessToken = () => accessToken !== null

export class ApiError extends Error {
  constructor({ status, code, message, fieldErrors = {}, details }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.details = details
  }
}

function toApiError(status, body) {
  const error = body?.error ?? {}
  const fieldErrors = {}
  if (Array.isArray(error.details)) {
    for (const item of error.details) {
      if (item?.field && item.message && !fieldErrors[item.field]) fieldErrors[item.field] = item.message
    }
  }
  return new ApiError({
    status,
    code: error.code ?? `HTTP_${status}`,
    message: error.message ?? GENERIC_MESSAGE,
    fieldErrors,
    details: error.details,
  })
}

// Set by api/auth.js: refresh() -> true when a new access token was issued; onUnauthorized(error) when the session
// is gone for good (refresh failed too).
let refreshHandler = null
let unauthorizedHandler = null
export function configureAuth({ refresh, onUnauthorized }) {
  refreshHandler = refresh
  unauthorizedHandler = onUnauthorized
}

// apiFetch(path, { method, body, auth }) -> parsed JSON (null for 204). `auth: false` for the public auth routes:
// no Authorization header, and a 401 from them (wrong password, expired refresh) is just an error, not a logout.
export async function apiFetch(path, { method = 'GET', body, auth = true, retry = true, signal } = {}) {
  // FormData (file uploads) goes as multipart: the browser sets the Content-Type with its boundary.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const headers = { Accept: 'application/json' }
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError({ status: 0, code: 'NETWORK', message: NETWORK_MESSAGE })
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (response.ok) return data

  const error = toApiError(response.status, data)
  if (response.status === 401 && auth) {
    // The access token expired (15 min): get a new one once and repeat the request.
    if (retry && refreshHandler && (await refreshHandler().catch(() => false))) {
      return apiFetch(path, { method, body, auth, retry: false, signal })
    }
    unauthorizedHandler?.(error)
  }
  throw error
}
