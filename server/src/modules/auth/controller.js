import { env } from '../../config/env.js'
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../../config/constants.js'
import * as service from './service.js'

// Thin: read the request, call one service, shape the response (docs/architecture.md "Layers").

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
})

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, { ...baseCookieOptions(), expires: new Date(expiresAt) })
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions())
}

const userAgentOf = (req) => (req.get('user-agent') ?? '').slice(0, 512) || null

function sendSession(res, session) {
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt)
  res.set('Cache-Control', 'no-store')
  const body = { accessToken: session.accessToken, user: session.user, homePath: session.homePath }
  if (session.firstLogin !== undefined) body.firstLogin = session.firstLogin // login only, not refresh
  res.status(200).json(body)
}

export async function register(req, res) {
  const result = await service.register(req.body)
  res.status(201).json(result)
}

export async function login(req, res) {
  const session = await service.login(req.body, { userAgent: userAgentOf(req) })
  sendSession(res, session)
}

export async function refresh(req, res) {
  try {
    const session = await service.refresh(req.cookies?.[REFRESH_COOKIE], { userAgent: userAgentOf(req) })
    sendSession(res, session)
  } catch (err) {
    clearRefreshCookie(res) // any failed refresh ends the session in the browser too
    throw err
  }
}

export async function logout(req, res) {
  await service.logout(req.cookies?.[REFRESH_COOKIE])
  clearRefreshCookie(res)
  res.status(204).end()
}

// REQ-2 password reset. Same 200 answer whether or not the email has an account.
export async function forgotPassword(req, res) {
  res.set('Cache-Control', 'no-store')
  res.status(200).json(await service.requestPasswordReset(req.body))
}

export async function verifyResetCode(req, res) {
  res.set('Cache-Control', 'no-store')
  res.status(200).json(await service.verifyResetCode(req.body))
}

export async function resetPassword(req, res) {
  await service.resetPassword(req.body)
  clearRefreshCookie(res) // every session ended, this browser's too
  res.set('Cache-Control', 'no-store')
  res.status(200).json({ message: 'Password changed. Log in with your new password.' })
}
