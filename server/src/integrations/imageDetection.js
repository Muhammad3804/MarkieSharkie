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
//   fake         used when SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET are empty: every image scores 0.02
//                (genuine), so the app runs end to end without keys. Tests swap in their own detector.

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

const fake = async () => ({ score: 0.02 })

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

// score -> verification_status. At or below the genuine threshold: genuine. Anything above it is flagged (not
// published; an admin decides, REQ-10): scores from IMAGE_DETECTION_FLAG_THRESHOLD up are marked high confidence
// in the admin queue, the ones in between are borderline. Scope 2.4: the AI only suggests, a person decides.
export function classifyScore(score) {
  return score <= env.imageDetection.genuineThreshold ? 'genuine' : 'flagged'
}

// What the AI check is running on, for the admin's "Test the AI check" panel. live = a real provider is called.
export function detectorInfo() {
  const { provider, timeoutMs, flagThreshold, genuineThreshold } = env.imageDetection
  const name = detector ? 'custom' : provider
  return { provider: name, live: name === 'sightengine', timeoutMs, flagThreshold, genuineThreshold }
}
