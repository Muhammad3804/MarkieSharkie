import { Component, lazy, Suspense, useEffect, useState } from 'react'

// REQ-11 / EUC-06: shows a hall's uploaded walkthrough, a .glb model (model_3d) or a 360° JPEG (panorama_360).
// This file stays small and has no three.js: it checks WebGL and the file first, then lazy-loads the viewer
// (WalkthroughViewer.jsx pulls in three.js + drei as their own chunk, never the main bundle).
// Unmounting it (closing the view) frees the WebGL context, geometries and textures.

const Viewer = lazy(() => import('./WalkthroughViewer.jsx'))

// Same limits as the server's upload rules (server/src/lib/fileType.js UPLOAD_RULES.walkthrough).
const MAX_BYTES = { model_3d: 50 * 1024 * 1024, panorama_360: 20 * 1024 * 1024 }
const EXPECTED_TYPES = { model_3d: ['model/gltf-binary', 'application/octet-stream'], panorama_360: ['image/jpeg'] }
const KIND_LABEL = { model_3d: '3D model', panorama_360: '360° view' }

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return Boolean(gl)
  } catch {
    return false
  }
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// HEAD first, so an oversized or wrong file is refused before the browser downloads it.
// -> '' when fine, else a message for the person.
async function checkFile(file, signal) {
  if (!MAX_BYTES[file.assetType]) return 'This walkthrough type can’t be shown.'
  let response
  try {
    response = await fetch(file.url, { method: 'HEAD', signal })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    return 'We couldn’t load this walkthrough. Check your connection and try again.'
  }
  if (!response.ok) return 'This walkthrough file is no longer available.'
  const size = Number(response.headers.get('content-length'))
  if (size > MAX_BYTES[file.assetType]) {
    return `This file is too large to show here (${Math.round(size / 1024 / 1024)} MB).`
  }
  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim()
  if (type && !EXPECTED_TYPES[file.assetType].includes(type)) return `This file isn’t a ${KIND_LABEL[file.assetType]} we can show.`
  return ''
}

class ViewerBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.warn('[walkthrough] could not show the file', error)
  }
  render() {
    return this.state.failed ? <Fallback>{`We couldn’t open this ${this.props.label}. The file may be damaged or use a format we don’t support.`}</Fallback> : this.props.children
  }
}

function Fallback({ children }) {
  return (
    <div role="status" className="flex h-full min-h-[200px] flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="text-[14px] font-medium text-ink-strong">{children}</p>
      <p className="text-[13px] text-muted-warm">You can still look through the hall’s photos.</p>
    </div>
  )
}

// file = { url, assetType }. `name` = the hall's name, for the accessible label.
export default function Walkthrough({ file, name, className = 'h-[340px] sm:h-[420px]' }) {
  const [webgl] = useState(hasWebGL)
  const [reducedMotion] = useState(prefersReducedMotion)
  const [check, setCheck] = useState({ url: null, message: '' })

  useEffect(() => {
    if (!webgl) return undefined
    const controller = new AbortController()
    checkFile(file, controller.signal)
      .then((message) => setCheck({ url: file.url, message }))
      .catch(() => {})
    return () => controller.abort()
  }, [file, webgl])

  const label = KIND_LABEL[file.assetType] ?? 'walkthrough'
  let body
  if (!webgl) body = <Fallback>3D and 360° views need WebGL, which this browser or device doesn’t have turned on.</Fallback>
  else if (check.url !== file.url) body = <Loading label={label} />
  else if (check.message) body = <Fallback>{check.message}</Fallback>
  else
    body = (
      <ViewerBoundary label={label}>
        <Suspense fallback={<Loading label={label} />}>
          <Viewer file={file} name={name} reducedMotion={reducedMotion} />
        </Suspense>
      </ViewerBoundary>
    )

  return <div className={`relative w-full overflow-hidden rounded-2xl border border-line bg-map ${className}`}>{body}</div>
}

function Loading({ label }) {
  return (
    <div role="status" aria-live="polite" className="flex h-full items-center justify-center gap-3 text-[14px] text-muted-warm">
      <span aria-hidden="true" className="size-5 rounded-full border-2 border-primary/25 border-t-primary motion-safe:animate-spin" />
      Loading the {label}…
    </div>
  )
}
