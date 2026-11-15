// Canvas hex map. Draws whatever the parent hands it; it holds no simulation state.
import { useEffect, useRef, useState } from 'react'
import type { SandboxCell } from '../../../types/contracts.ts'
import { cellAt } from './geometry.ts'
import type { GridGeometry } from './geometry.ts'
import { FIRE_COLOURS } from './palette.ts'

/** Per-cell fire state for one frame: 0 unburned, 1 burning, 2 burned. */
export type FireFrame = Uint8Array

export interface HexMark {
  /** One or two characters drawn on the hex. */
  glyph: string
  colour: string
}

interface Props {
  cells: SandboxCell[]
  geo: GridGeometry
  /** Base fill per cell (land cover, fuel or terrain layer). */
  colours: string[]
  fire?: FireFrame | null
  ignitions?: ReadonlySet<number>
  marks?: ReadonlyMap<number, HexMark>
  /** The drawn area of interest, outlined if given. */
  area?: GeoJSON.Polygon | null
  onCellClick?: (index: number) => void
  onHover?: (index: number) => void
  /** Colour of the village mark; pick one that reads on the current layer's village fill. */
  villageInk?: string
  maxHeight?: number
  ariaLabel: string
}

const PAD = 6

export function HexMap({
  cells,
  geo,
  colours,
  fire,
  ignitions,
  marks,
  area,
  onCellClick,
  onHover,
  villageInk = '#1a1a19',
  maxHeight = 640,
  ariaLabel,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setWidth(Math.floor(el.clientWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The drawing area keeps the grid's aspect ratio and never exceeds maxHeight.
  const inner = Math.max(0, Math.min(width - 2 * PAD, (maxHeight - 2 * PAD) / geo.aspect))
  const cssW = Math.round(inner + 2 * PAD)
  const cssH = Math.round(inner * geo.aspect + 2 * PAD)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || inner <= 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    const sx = (x: number) => PAD + x * inner
    const r = geo.hexSize * inner

    const trace = (i: number) => {
      const o = geo.outlines[i]
      ctx.beginPath()
      ctx.moveTo(sx(o[0]), sx(o[1]))
      for (let k = 2; k < o.length; k += 2) ctx.lineTo(sx(o[k]), sx(o[k + 1]))
      ctx.closePath()
    }

    // 1. Base layer + fire state.
    ctx.lineWidth = 0.6
    for (let i = 0; i < cells.length; i++) {
      const state = fire ? fire[i] : 0
      trace(i)
      ctx.fillStyle = state === 2 ? FIRE_COLOURS.burned : state === 1 ? FIRE_COLOURS.burning : colours[i]
      ctx.fill()
      ctx.strokeStyle = state === 2 ? FIRE_COLOURS.burnedEdge : 'rgba(13,13,13,0.55)'
      ctx.stroke()
      if (state === 1) {
        ctx.beginPath()
        ctx.arc(sx(geo.centres[i * 2]), sx(geo.centres[i * 2 + 1]), r * 0.4, 0, Math.PI * 2)
        ctx.fillStyle = FIRE_COLOURS.burningCore
        ctx.fill()
      }
    }

    // 2. Rivers and villages stay readable on every layer and under fire.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < cells.length; i++) {
      const asset = cells[i].asset_type
      if (asset !== 'village' && asset !== 'river') continue
      const state = fire ? fire[i] : 0
      trace(i)
      if (asset === 'river') {
        ctx.lineWidth = 1.2
        ctx.strokeStyle = '#a9d0ff'
        ctx.stroke()
      } else {
        ctx.lineWidth = 2
        ctx.strokeStyle = state === 0 ? '#ffffff' : '#ff8f8f'
        ctx.stroke()
        ctx.font = `700 ${Math.max(9, r * 1.15)}px system-ui, sans-serif`
        ctx.fillStyle = state === 0 ? villageInk : '#ffb3b3'
        ctx.fillText(state === 0 ? '⌂' : '✕', sx(geo.centres[i * 2]), sx(geo.centres[i * 2 + 1]) + 0.5)
      }
    }

    // 3. Ignition points.
    if (ignitions) {
      for (const i of ignitions) {
        const cx = sx(geo.centres[i * 2])
        const cy = sx(geo.centres[i * 2 + 1])
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
        ctx.fillStyle = FIRE_COLOURS.ignition
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = '#ffffff'
        ctx.stroke()
      }
    }

    // 4. Deployed resources.
    if (marks) {
      ctx.font = `700 ${Math.max(8, r * 0.85)}px system-ui, sans-serif`
      for (const [i, mark] of marks) {
        const cx = sx(geo.centres[i * 2])
        const cy = sx(geo.centres[i * 2 + 1])
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2)
        ctx.fillStyle = mark.colour
        ctx.fill()
        ctx.lineWidth = 1.2
        ctx.strokeStyle = '#0d0d0d'
        ctx.stroke()
        ctx.fillStyle = '#0d0d0d'
        ctx.fillText(mark.glyph, cx, cy + 0.5)
      }
    }

    // 5. Drawn area of interest.
    if (area) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, cssW, cssH)
      ctx.clip()
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = '#ffffff'
      for (const ring of area.coordinates) {
        ctx.beginPath()
        ring.forEach(([lon, lat], k) => {
          const [x, y] = geo.toUnit(lat, lon)
          if (k === 0) ctx.moveTo(sx(x), sx(y))
          else ctx.lineTo(sx(x), sx(y))
        })
        ctx.closePath()
        ctx.stroke()
      }
      ctx.restore()
    }
  }, [cells, geo, colours, fire, ignitions, marks, area, villageInk, inner, cssW, cssH])

  const locate = (e: React.MouseEvent<HTMLCanvasElement>): number => {
    if (inner <= 0) return -1
    const rect = e.currentTarget.getBoundingClientRect()
    return cellAt(geo, (e.clientX - rect.left - PAD) / inner, (e.clientY - rect.top - PAD) / inner)
  }

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        style={{ width: cssW, height: cssH }}
        className={`mx-auto block rounded-md bg-page ${onCellClick ? 'cursor-crosshair' : ''}`}
        onClick={
          onCellClick
            ? (e) => {
                const i = locate(e)
                if (i >= 0) onCellClick(i)
              }
            : undefined
        }
        onMouseMove={onHover ? (e) => onHover(locate(e)) : undefined}
        onMouseLeave={onHover ? () => onHover(-1) : undefined}
      />
    </div>
  )
}
