// Refreshes the static JSON fallback in public/data/ (TEAM_PLAN §1, frontend/README.md).
// For each region and file: data/processed/<region>/<file> if it exists, else contracts/mocks/<region>/<file>.
// Runs before `npm run dev` and `npm run build`. Never fails the build: if a source is
// missing (e.g. a deploy that only checks out frontend/), the committed copy is kept.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(frontend, '..')
const out = join(frontend, 'public', 'data')
const FILES = ['calendar.json', 'calibration.json', 'sandbox_grid.json']

function copyJson(src, dest) {
  const compact = JSON.stringify(JSON.parse(readFileSync(src, 'utf8')))
  mkdirSync(dirname(dest), { recursive: true })
  if (existsSync(dest) && readFileSync(dest, 'utf8') === compact) return false
  writeFileSync(dest, compact)
  return true
}

const regionsSrc = join(repo, 'contracts', 'regions.json')
if (!existsSync(regionsSrc)) {
  console.log('[sync-data] contracts/ not found; keeping the committed public/data/')
  process.exit(0)
}

copyJson(regionsSrc, join(out, 'regions.json'))
const regions = JSON.parse(readFileSync(regionsSrc, 'utf8')).regions

for (const { id } of regions) {
  for (const file of FILES) {
    const candidates = [
      ['processed', join(repo, 'data', 'processed', id, file)],
      ['mock', join(repo, 'contracts', 'mocks', id, file)],
    ]
    const found = candidates.find(([, path]) => existsSync(path))
    if (!found) {
      console.log(`[sync-data] ${id}/${file}: no source yet, skipped`)
      continue
    }
    const changed = copyJson(found[1], join(out, id, file))
    if (changed) console.log(`[sync-data] ${id}/${file} <- ${found[0]}`)
  }
}
