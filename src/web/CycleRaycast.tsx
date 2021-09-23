import * as React from 'react'
import * as THREE from 'three'
import { useRef, useEffect } from 'react'
import { useThree } from '@react-three/fiber'

const noReactDomError = () => {
  throw new Error(`Html component requires a 'react-dom' package, please install it`)
}

let ReactDOM: typeof import('react-dom') = {
  unmountComponentAtNode: noReactDomError as any,
  render: noReactDomError as any,
} as typeof import('react-dom')

// workaround to not to break apps that doesn't have react-dom,
// don't use Html component and import from the root
// e.g. `import { OrbitControls } from '@react-three/drei'`
try {
  ReactDOM = require('react-dom')
} catch {
  // react-dom isn't installed
}

export type CycleRaycastProps = {
  children?: (hits: THREE.Intersection[], cycle: number) => React.ReactElement
  preventDefault?: boolean
  scroll?: boolean
  keyCode?: number
  portal?: React.MutableRefObject<HTMLElement>
}

export function CycleRaycast({
  children,
  portal,
  preventDefault = true,
  scroll = true,
  keyCode = 9,
}: CycleRaycastProps) {
  const cycle = useRef(0)
  const raycaster = useThree((state) => state.raycaster)
  const get = useThree((state) => state.get)
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    let hits: THREE.Intersection[] = []
    let lastEvent: PointerEvent = undefined!
    let prev = raycaster.filter
    const target = portal?.current ?? gl.domElement.parentNode

    // Create dom status
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.top = '0px'
    el.style.left = '0px'
    el.style.pointerEvents = 'none'
    if (target) target.appendChild(el)

    // Render custom status
    const renderStatus = () =>
      target &&
      children &&
      ReactDOM.render(hits.length ? children(hits, Math.round(cycle.current) % hits.length) : (null as any), el)

    // Overwrite the raycasters custom filter (this only exists in r3f)
    raycaster.filter = (intersections, state) => {
      // Reset cycle when the intersections change
      let clone = [...intersections]
      if (
        clone.length !== hits.length ||
        !hits.every((hit) => clone.map((e) => e.object.uuid).includes(hit.object.uuid))
      ) {
        cycle.current = 0
        hits = clone
        renderStatus()
      }
      // Run custom filter if there is one
      if (prev) clone = prev(clone, state)
      // Cycle through the actual raycast intersects
      for (let i = 0; i < Math.round(cycle.current) % clone.length; i++) {
        const first = clone.shift() as THREE.Intersection
        clone = [...clone, first]
      }
      return clone
    }

    // Cycle, refresh events and render status
    const refresh = (fn) => {
      cycle.current = fn(cycle.current)
      // Cancel hovered elements and fake a pointer-move
      get().events.handlers?.onPointerCancel(undefined as any)
      get().events.handlers?.onPointerMove(lastEvent)
      renderStatus()
    }

    // Key events
    const tabEvent = (event: KeyboardEvent) => {
      if (event.keyCode || event.which === keyCode) {
        if (preventDefault) event.preventDefault()
        if (hits.length > 1) refresh((current) => current + 1)
      }
    }

    // Wheel events
    const wheelEvent = (event: WheelEvent) => {
      if (preventDefault) event.preventDefault()
      let delta = 0
      if (!event) event = window.event as WheelEvent
      if ((event as any).wheelDelta) delta = (event as any).wheelDelta / 120
      else if (event.detail) delta = -event.detail / 3
      if (hits.length > 1) refresh((current) => Math.abs(current - delta))
    }

    // Catch last move event and position custom status
    const moveEvent = (event: PointerEvent) => (
      (lastEvent = event), (el.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`)
    )

    document.addEventListener('pointermove', moveEvent, { passive: true })
    if (scroll) document.addEventListener('wheel', wheelEvent)
    document.addEventListener('keydown', tabEvent)

    return () => {
      // Clean up
      raycaster.filter = prev
      document.removeEventListener('keydown', tabEvent)
      if (scroll) document.removeEventListener('wheel', wheelEvent)
      document.removeEventListener('pointermove', moveEvent)
      if (target) target.removeChild(el)
    }
  }, [gl, get, raycaster, children, preventDefault, scroll, keyCode])
  return null
}