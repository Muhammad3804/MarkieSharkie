import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { Bounds, OrbitControls, useBounds, useGLTF, useProgress } from '@react-three/drei'
import { SphereGeometry, SRGBColorSpace, TextureLoader, Vector3 } from 'three'

// Lazy chunk (loaded by Walkthrough.jsx): the .glb viewer and the 360° panorama viewer.
// - frameloop="demand": a frame is drawn only when something changes (drag, buttons), so an idle view costs nothing
//   and nothing moves on its own (reduced motion is respected by default; no auto-rotate, no damping).
// - Drag / touch to look around (OrbitControls handles mouse, touch and pinch); buttons for people who can't drag.
// - On unmount the model's geometries, materials and textures are disposed, the loader caches cleared, and
//   react-three-fiber releases the WebGL context.

export default function WalkthroughViewer({ file, name, reducedMotion }) {
  const controls = useRef(null)
  const bounds = useRef(null)
  const isPanorama = file.assetType === 'panorama_360'
  const label = isPanorama
    ? `360° view of ${name || 'the hall'}. Drag to look around, or use the buttons.`
    : `3D model of ${name || 'the hall'}. Drag to turn it, pinch or scroll to zoom, or use the buttons.`

  return (
    <figure className="relative h-full w-full">
      <div role="img" aria-label={label} className="h-full w-full touch-none">
        <Canvas frameloop="demand" dpr={[1, 2]} camera={isPanorama ? { position: [0, 0, 0.1], fov: 75, near: 0.1, far: 1000 } : { position: [6, 4, 8], fov: 45, near: 0.05, far: 2000 }}>
          <color attach="background" args={['#f7f5f3']} />
          <Suspense fallback={null}>{isPanorama ? <Panorama url={file.url} /> : <Model url={file.url} reducedMotion={reducedMotion} boundsRef={bounds} />}</Suspense>
          {isPanorama ? (
            <OrbitControls ref={controls} makeDefault enableZoom={false} enablePan={false} enableDamping={false} rotateSpeed={-0.35} target={[0, 0, 0]} />
          ) : (
            <OrbitControls ref={controls} makeDefault enableDamping={false} />
          )}
        </Canvas>
      </div>
      <Progress label={isPanorama ? '360° view' : '3D model'} />
      <Buttons controls={controls} bounds={bounds} isPanorama={isPanorama} />
    </figure>
  )
}

// ---------------------------------------------------------------- .glb

// Frees everything a loaded glTF scene holds on the GPU.
function disposeScene(scene) {
  scene.traverse((object) => {
    if (!object.isMesh) return
    object.geometry?.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!material) continue
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose()
      material.dispose()
    }
  })
}

function Model({ url, reducedMotion, boundsRef }) {
  // No Draco / Meshopt decoders: they would be fetched from a CDN. A compressed file fails with a friendly message.
  const { scene } = useGLTF(url, false, false)
  useEffect(
    () => () => {
      disposeScene(scene)
      useGLTF.clear(url)
    },
    [scene, url],
  )
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9a9ac', 1.6]} />
      <directionalLight position={[10, 20, 10]} intensity={1.8} />
      <directionalLight position={[-10, 8, -6]} intensity={0.6} />
      {/* Fits the camera to the model, whatever units or size it was exported in. */}
      <Bounds fit clip observe margin={1.15} maxDuration={reducedMotion ? 0 : 0.6}>
        <primitive object={scene} />
        <BoundsApi apiRef={boundsRef} />
      </Bounds>
    </>
  )
}

// Hands Bounds' api to the Reset button (it lives outside the Canvas).
function BoundsApi({ apiRef }) {
  const api = useBounds()
  useEffect(() => {
    apiRef.current = api
    return () => {
      apiRef.current = null
    }
  }, [api, apiRef])
  return null
}

// ---------------------------------------------------------------- 360° panorama

// Photo colours (sRGB) and a little anisotropic filtering so the floor and ceiling stay sharp.
function prepareTexture(texture, gl) {
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy())
  texture.needsUpdate = true
}

// Equirectangular image on the inside of a sphere; the camera sits at the centre.
function Panorama({ url }) {
  const texture = useLoader(TextureLoader, url)
  const { gl, invalidate } = useThree()
  // Mirror the sphere's geometry (not the mesh) so its inside faces the camera and the image isn't flipped, and turn
  // it so the view starts at the middle of the photo (where 360° cameras put "straight ahead").
  const geometry = useMemo(() => new SphereGeometry(50, 64, 32).scale(-1, 1, 1).rotateY(-Math.PI / 2), [])
  useEffect(() => {
    prepareTexture(texture, gl)
    invalidate()
  }, [texture, gl, invalidate])
  useEffect(
    () => () => {
      geometry.dispose()
      texture.dispose()
      useLoader.clear(TextureLoader, url)
    },
    [geometry, texture, url],
  )
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

// ---------------------------------------------------------------- overlay

function Progress({ label }) {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-map/80">
      <span className="text-[14px] font-medium text-ink-strong">
        Loading the {label}… {Math.round(progress)}%
      </span>
      <span className="h-1.5 w-48 overflow-hidden rounded-full bg-primary/15">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(progress)}%` }} />
      </span>
    </div>
  )
}

const buttonClass =
  'flex size-10 cursor-pointer items-center justify-center rounded-full bg-white text-ink-strong shadow-chip hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const UP = new Vector3(0, 1, 0)

// Button actions on three's OrbitControls (c) and drei's Bounds api, outside React state.
function turnView(c, angle) {
  const offset = c.object.position.clone().sub(c.target).applyAxisAngle(UP, angle)
  c.object.position.copy(c.target).add(offset)
  c.update()
}

function zoomView(c, factor, isPanorama) {
  if (isPanorama) {
    // No dolly inside a sphere: narrow or widen the field of view instead.
    c.object.fov = Math.min(95, Math.max(35, c.object.fov * factor))
    c.object.updateProjectionMatrix()
  } else {
    c.object.position.copy(c.target).add(c.object.position.clone().sub(c.target).multiplyScalar(factor))
  }
  c.update()
}

function resetView(c, bounds, isPanorama) {
  if (isPanorama) {
    c.object.fov = 75
    c.object.updateProjectionMatrix()
    c.reset()
  } else {
    bounds?.refresh().clip().fit()
  }
}

function Buttons({ controls, bounds, isPanorama }) {
  const turn = (angle) => controls.current && turnView(controls.current, angle)
  const zoom = (factor) => controls.current && zoomView(controls.current, factor, isPanorama)
  const reset = () => controls.current && resetView(controls.current, bounds.current, isPanorama)
  return (
    <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-2">
      <button type="button" className={buttonClass} onClick={() => turn(isPanorama ? -Math.PI / 6 : Math.PI / 8)} aria-label={isPanorama ? 'Look left' : 'Turn the model left'}>
        <Icon d="M15 18l-6-6 6-6" />
      </button>
      <button type="button" className={buttonClass} onClick={() => turn(isPanorama ? Math.PI / 6 : -Math.PI / 8)} aria-label={isPanorama ? 'Look right' : 'Turn the model right'}>
        <Icon d="M9 18l6-6-6-6" />
      </button>
      <button type="button" className={buttonClass} onClick={() => zoom(0.8)} aria-label="Zoom in">
        <Icon d="M12 5v14M5 12h14" />
      </button>
      <button type="button" className={buttonClass} onClick={() => zoom(1.25)} aria-label="Zoom out">
        <Icon d="M5 12h14" />
      </button>
      <button type="button" className={buttonClass} onClick={reset} aria-label="Reset the view">
        <Icon d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
      </button>
    </div>
  )
}

function Icon({ d }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
