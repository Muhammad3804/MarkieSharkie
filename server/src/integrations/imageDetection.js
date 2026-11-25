import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

// REQ-9 AI image detection (docs/architecture.md "IImageDetection"). Server only: the API user and secret never
// reach the browser (NFR-4).
//
// detect({ buffer, mimeType, fileName }) -> { score } where score = probability (0..1) that the image is
// AI-generated. Throws when the service can't answer (timeout, network, bad credentials, quota); the caller then
// leaves the image 'pending' (REQ-9 "service down -> image stays pending") and never blocks the listing (NFR-2).
//
// Providers:
//   sightengine  POST https://api.sightengine.com/1.0/check.json, models=genai -> type.ai_generated
//   fake         used when SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET are empty: every image scores 0.02, so the
//                app runs end to end without keys; a file containing the bytes "MARKIE-AI-TEST" scores 0.95 (to
//                demo an AI rejection locally). Never used when Sightengine keys are set. Tests swap in their own.

const SIGHTENGINE_URL = 'https://api.sightengine.com/1.0/check.json'

async function sightengine({ buffer, mimeType, fileName }) {
  const { apiUser, apiSecret, timeoutMs } = env.imageDetection
  const form = new FormData()
  form.append('media', new Blob([buffer], { type: mimeType }), fileName)
  form.append('models', 'genai')
  form.append('api_user', apiUser)
  form.append('api_secret', apiSecret)
  const response = await fetch(SIGHTENGINE_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs) })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.status !== 'success') {
    // Sightengine puts the reason in error.message; it never contains our secret.
    throw new Error(`sightengine: ${data?.error?.message ?? `HTTP ${response.status}`}`)
  }
  const score = Number(data?.type?.ai_generated)
  if (!Number.isFinite(score)) throw new Error('sightengine: no ai_generated score in the answer')
  return { score }
}

const AI_TEST_MARKER = Buffer.from('MARKIE-AI-TEST')
const fake = async ({ buffer }) => ({ score: Buffer.isBuffer(buffer) && buffer.includes(AI_TEST_MARKER) ? 0.95 : 0.02 })

let detector = null
let announced = false
function current() {
  if (detector) return detector
  if (env.imageDetection.provider === 'sightengine') return sightengine
  if (!announced && !env.isTest) {
    logger.info(
      '[imageDetection] using fake adapter (set SIGHTENGINE_API_USER and SIGHTENGINE_API_SECRET for real checks)',
    )
    announced = true
  }
  return fake
}

export const detectAiImage = (input) => current()(input)

// Tests (and a future second provider) replace the detector. Pass null to go back to the configured one.
export function setImageDetector(fn) {
  detector = fn
}

// srs-alignment #42: score (0..1) against the admin's threshold (percent, 0..100). The score is compared as a percent
// rounded to 2 decimals, so 0.7 is exactly 70 (0.7 * 100 is 70.00000000000001 in floating point).
// At or above the threshold -> rejected_ai; below -> accepted.
export const scorePercent = (score) => Math.round(score * 10_000) / 100

export function decideByThreshold(score, threshold) {
  return scorePercent(score) >= Number(threshold) ? 'rejected_ai' : 'accepted'
}

// What the AI check is running on, for the admin's "Test the AI check" panel. live = a real provider is called.
export function detectorInfo() {
  const { provider, timeoutMs } = env.imageDetection
  const name = detector ? 'custom' : provider
  return { provider: name, live: name === 'sightengine', timeoutMs }
}
