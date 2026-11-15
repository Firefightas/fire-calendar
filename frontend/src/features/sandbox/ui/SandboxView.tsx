// The sandbox screen for one loaded grid.
import { useMemo, useState } from 'react'
import type { SandboxGrid } from '../../../types/contracts.ts'
import { buildGeometry } from './geometry.ts'
import { HexMap } from './HexMap.tsx'
import { CellReadout, Legend } from './Legend.tsx'
import { landcoverColours } from './palette.ts'

interface Props {
  grid: SandboxGrid
  area: GeoJSON.Polygon | null
}

export function SandboxView({ grid, area }: Props) {
  const cells = grid.cells
  const geo = useMemo(() => buildGeometry(cells, grid.h3_resolution), [cells, grid.h3_resolution])
  const colours = useMemo(() => landcoverColours(cells), [cells])
  const [hovered, setHovered] = useState(-1)

  return (
    <div className="rounded-lg border border-hairline bg-surface p-3">
      <HexMap
        cells={cells}
        geo={geo}
        colours={colours}
        area={area}
        onHover={setHovered}
        ariaLabel="Hex map of the sandbox area, coloured by land cover"
      />
      <CellReadout cell={hovered >= 0 ? cells[hovered] : null} classes={grid.landcover_classes} />
      <Legend />
    </div>
  )
}
