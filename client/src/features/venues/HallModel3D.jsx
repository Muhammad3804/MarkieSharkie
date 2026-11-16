import { Component, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { BoxGeometry, EdgesGeometry, PlaneGeometry, Vector3 } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// A simple 3D model of a hall built from its size and layout (docs/srs-alignment.md #16: the dimension-based
// generator, an extra next to REQ-11 uploads). Units are feet. Lazy-load this file: three.js is large.
// Zones are cells of a 3 x 3 grid: row 0 = back wall, column 0 = left as you face the back wall.
const COLORS = { floor: '#ece6e2', wall: '#d1bfc2', edge: '#71696b', stage: '#7a1731', door: '#b88025', table: '#ffffff', cloth: '#f1e3e7' }
const CELL_NAMES = ['back left', 'back centre', 'back right', 'middle left', 'middle centre', 'middle right', 'front left', 'front centre', 'front right']
// Used when the host hasn't marked a zone: stage at the back, entrance at the front, seating in the middle.
const DEFAULT_ZONES = { stage: 1, entrance: 7, seating: 4 }

const cellCentre = (cell, length, width) => ({ x: ((cell % 3) - 1) * (width / 3), z: (Math.floor(cell / 3) - 1) * (length / 3) })

// Outline of a geometry (three's EdgesGeometry), so walls read clearly even when transparent.
function Outline({ geometry }) {
  const edges = useMemo(() => new EdgesGeometry(geometry), [geometry])
  useEffect(() => () => edges.dispose(), [edges])
  return (
    <lineSegments geometry={edges}>
      <lineBasicMaterial color={COLORS.edge} />
    </lineSegments>
  )
}

// Geometries passed through the geometry prop aren't disposed by react-three-fiber; free them when they change.
function useDisposable(geometry) {
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

function Wall({ size, ...props }) {
  const [w, h] = size
  const geometry = useDisposable(useMemo(() => new PlaneGeometry(w, h), [w, h]))
  return (
    <group {...props}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={COLORS.wall} transparent opacity={0.28} side={2} depthWrite={false} />
      </mesh>
      <Outline geometry={geometry} />
    </group>
  )
}

function Room({ length, width, ceiling }) {
  const floor = useDisposable(useMemo(() => new BoxGeometry(width, 0.5, length), [width, length]))
  const box = useDisposable(useMemo(() => new BoxGeometry(width, ceiling, length), [width, ceiling, length]))
  return (
    <group>
      <group position={[0, -0.25, 0]}>
        <mesh geometry={floor}>
          <meshStandardMaterial color={COLORS.floor} />
        </mesh>
        <Outline geometry={floor} />
      </group>
      <Wall position={[0, ceiling / 2, -length / 2]} size={[width, ceiling]} />
      <Wall position={[-width / 2, ceiling / 2, 0]} rotation={[0, Math.PI / 2, 0]} size={[length, ceiling]} />
      <Wall position={[width / 2, ceiling / 2, 0]} rotation={[0, -Math.PI / 2, 0]} size={[length, ceiling]} />
      {/* Front wall and ceiling as outlines only, so you can see inside. */}
      <group position={[0, ceiling / 2, 0]}>
        <Outline geometry={box} />
      </group>
    </group>
  )
}

// three's OrbitControls on the canvas. frameloop="demand", so each change asks for a new frame.
// Created once per canvas. A second effect places the camera when the hall changes (not on resize, so turning a
// phone or collapsing its address bar keeps the user's view): further back on narrow canvases so the whole room
// fits. That spot is "home" for the Reset button.
function Controls({ controlsRef, homeRef, target, start, maxDistance, minDistance }) {
  const { camera, gl, invalidate } = useThree()
  const [x, y, z] = target
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.maxPolarAngle = Math.PI / 2.1
    controls.addEventListener('change', invalidate)
    controlsRef.current = controls
    return () => {
      controls.removeEventListener('change', invalidate)
      controls.dispose()
      controlsRef.current = null
    }
  }, [camera, gl, invalidate, controlsRef])
  useEffect(() => {
    const controls = controlsRef.current
    const aspect = gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight)
    homeRef.current = start.clone().multiplyScalar(Math.max(1.15, 1.35 / aspect))
    camera.position.copy(homeRef.current)
    controls.target.set(x, y, z)
    controls.minDistance = minDistance
    controls.maxDistance = maxDistance
    controls.update()
  }, [camera, gl, controlsRef, homeRef, x, y, z, start, minDistance, maxDistance])
  return null
}

function Stage({ cell, length, width }) {
  const stageWidth = Math.min(width * 0.3, 40)
  const depth = Math.min(length * 0.22, 24)
  const { x, z } = cellCentre(cell, length, width)
  // Stages against a wall sit flush with it.
  const row = Math.floor(cell / 3)
  const zPos = row === 0 ? -length / 2 + depth / 2 : row === 2 ? length / 2 - depth / 2 : z
  return (
    <mesh position={[x, 1.5, zPos]} castShadow>
      <boxGeometry args={[stageWidth, 3, depth]} />
      <meshStandardMaterial color={COLORS.stage} />
    </mesh>
  )
}

// A doorway on the wall closest to the entrance cell.
function Entrance({ cell, length, width }) {
  const row = Math.floor(cell / 3)
  const col = cell % 3
  const { x, z } = cellCentre(cell, length, width)
  const door = [Math.min(10, width / 4), 9, 0.8]
  if (row === 0) return <Door position={[x, 4.5, -length / 2]} size={door} />
  if (row === 2) return <Door position={[x, 4.5, length / 2]} size={door} />
  if (col === 0) return <Door position={[-width / 2, 4.5, z]} size={door} rotation={[0, Math.PI / 2, 0]} />
  if (col === 2) return <Door position={[width / 2, 4.5, z]} size={door} rotation={[0, Math.PI / 2, 0]} />
  return <Door position={[x, 4.5, length / 2]} size={door} />
}

function Door({ size, ...props }) {
  return (
    <mesh {...props}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={COLORS.door} />
    </mesh>
  )
}

// Round tables of ten around the seating spot (a band two cells wide, clamped to the room), or across the floor
// when seating isn't marked. Spacing scales with the room so small halls still show several tables.
function Tables({ cell, stageCell, length, width, spread }) {
  const tables = useMemo(() => {
    const spacing = Math.min(12, Math.max(7, Math.max(length, width) / 9))
    const centre = cellCentre(cell, length, width)
    const bandW = (width * 2) / 3
    const bandL = (length * 2) / 3
    const clamp = (value, half, room) => Math.max(-room / 2 + half, Math.min(room / 2 - half, value))
    const area = spread
      ? { x: 0, z: 0, w: width * 0.8, l: length * 0.8 }
      : { x: clamp(centre.x, bandW / 2, width), z: clamp(centre.z, bandL / 2, length), w: bandW - 4, l: bandL - 4 }
    const stage = cellCentre(stageCell, length, width)
    const columns = Math.max(1, Math.floor(area.w / spacing))
    const rows = Math.max(1, Math.floor(area.l / spacing))
    const list = []
    for (let r = 0; r < rows && list.length < 60; r++) {
      for (let c = 0; c < columns && list.length < 60; c++) {
        const x = area.x - ((columns - 1) * spacing) / 2 + c * spacing
        const z = area.z - ((rows - 1) * spacing) / 2 + r * spacing
        // Keep tables off the stage.
        if (Math.abs(x - stage.x) < width / 6 && Math.abs(z - stage.z) < length / 6) continue
        list.push([x, z])
      }
    }
    return list
  }, [cell, stageCell, length, width, spread])
  const radius = Math.min(2.8, Math.max(length, width) / 40)
  return tables.map(([x, z]) => (
    <group key={`${x}:${z}`} position={[x, 0, z]}>
      <mesh position={[0, 1.25, 0]}>
        <cylinderGeometry args={[radius * 0.93, radius * 0.93, 2.5, 20]} />
        <meshStandardMaterial color={COLORS.cloth} />
      </mesh>
      <mesh position={[0, 2.55, 0]}>
        <cylinderGeometry args={[radius, radius, 0.1, 20]} />
        <meshStandardMaterial color={COLORS.table} />
      </mesh>
    </group>
  ))
}

// three.js/WebGL can fail (old devices, blocked GPU). Show a message instead of crashing the page.
class WebGlBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.warn('[3d] could not render the hall model', error)
  }
  render() {
    if (this.state.failed) {
      return <p className="flex h-full items-center justify-center p-6 text-center text-[14px] text-muted-warm">3D view isn’t available on this device.</p>
    }
    return this.props.children
  }
}

const controlButton =
  'flex size-10 cursor-pointer items-center justify-center rounded-full bg-white text-ink-strong shadow-chip hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export default function HallModel3D({ name, lengthFt, widthFt, ceilingFt, zones = {}, className = 'h-[320px]' }) {
  const controls = useRef(null)
  const home = useRef(null)
  const length = Math.max(10, Number(lengthFt) || 0)
  const width = Math.max(10, Number(widthFt) || 0)
  const ceiling = Math.max(8, Number(ceilingFt) || 0)
  const stage = zones.stage ?? DEFAULT_ZONES.stage
  const entrance = zones.entrance ?? DEFAULT_ZONES.entrance
  const seating = zones.seating ?? null
  const span = Math.max(length, width)
  // Front-right corner, high enough to see over the front wall: the whole room fills most of the frame.
  const start = useMemo(() => new Vector3(width * 0.55, Math.max(ceiling * 1.6, span * 0.5), length * 0.8), [width, ceiling, span, length])

  // Buttons for people who can't drag: orbit around the centre, zoom, reset.
  function orbit(angle) {
    const c = controls.current
    if (!c) return
    const offset = c.object.position.clone().sub(c.target)
    offset.applyAxisAngle(new Vector3(0, 1, 0), angle)
    c.object.position.copy(c.target).add(offset)
    c.update()
  }
  function zoom(factor) {
    const c = controls.current
    if (!c) return
    const offset = c.object.position.clone().sub(c.target).multiplyScalar(factor)
    if (offset.length() < span * 0.4 || offset.length() > span * 3) return
    c.object.position.copy(c.target).add(offset)
    c.update()
  }
  function reset() {
    const c = controls.current
    if (!c) return
    c.object.position.copy(home.current)
    c.target.set(0, ceiling / 3, 0)
    c.update()
  }

  const summary =
    `3D model of ${name || 'the hall'}: ${length} by ${width} feet with a ${ceiling} foot ceiling. ` +
    `Stage at the ${CELL_NAMES[stage]}, entrance at the ${CELL_NAMES[entrance]}` +
    (seating == null ? ', tables across the floor.' : `, seating at the ${CELL_NAMES[seating]}.`)

  return (
    <figure className="relative overflow-hidden rounded-2xl border border-line bg-map">
      <div role="img" aria-label={summary} className={`${className} w-full touch-none`}>
        <WebGlBoundary>
          <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: start.toArray(), fov: 45, near: 1, far: span * 10 }}>
            <color attach="background" args={['#f7f5f3']} />
            <ambientLight intensity={1.4} />
            <directionalLight position={[width, ceiling * 3, length]} intensity={1.6} />
            <Room length={length} width={width} ceiling={ceiling} />
            <Stage cell={stage} length={length} width={width} />
            <Entrance cell={entrance} length={length} width={width} />
            <Tables cell={seating ?? 4} stageCell={stage} length={length} width={width} spread={seating == null} />
            <Controls controlsRef={controls} homeRef={home} target={[0, ceiling / 3, 0]} start={start} minDistance={span * 0.4} maxDistance={span * 3} />
          </Canvas>
        </WebGlBoundary>
      </div>
      <div className="absolute right-3 top-3 flex gap-2">
        <button type="button" className={controlButton} onClick={() => orbit(-Math.PI / 8)} aria-label="Turn the model left">
          <Arrow d="M15 18l-6-6 6-6" />
        </button>
        <button type="button" className={controlButton} onClick={() => orbit(Math.PI / 8)} aria-label="Turn the model right">
          <Arrow d="M9 18l6-6-6-6" />
        </button>
        <button type="button" className={controlButton} onClick={() => zoom(0.8)} aria-label="Zoom in">
          <Arrow d="M12 5v14M5 12h14" />
        </button>
        <button type="button" className={controlButton} onClick={() => zoom(1.25)} aria-label="Zoom out">
          <Arrow d="M5 12h14" />
        </button>
        <button type="button" className={controlButton} onClick={reset} aria-label="Reset the view">
          <Arrow d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
        </button>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-white px-4 py-2.5 text-[13px] text-muted-warm">
        <Legend color={COLORS.stage}>Stage</Legend>
        <Legend color={COLORS.door}>Entrance</Legend>
        <Legend color={COLORS.cloth} ring>
          Tables
        </Legend>
        <span>Drag to turn · scroll or pinch to zoom</span>
      </figcaption>
    </figure>
  )
}

function Arrow({ d }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function Legend({ color, ring, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-3 rounded-sm ${ring ? 'border border-outline-strong' : ''}`} style={{ background: color }} aria-hidden="true" />
      {children}
    </span>
  )
}
