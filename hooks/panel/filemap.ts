/**
 * The FILES card: where in the project the agents were. One tile per file a
 * call named, grouped by its folder; the tile is as wide as the file was
 * busy, amber where it was written and blue where it was only read, with the
 * lines changed or the number of reads below its name. Pure string builder;
 * follows light and dark mode through the theme classes of `gauges.ts`.
 */
import type { CubeRun } from '../../types'
import { FONT, themed } from '../gauges'
import { tr } from '../i18n'
import { WORK_COLOR } from '../iso'
import { GREEN as ADD, RED as DEL } from '../pictos'
import { esc, n1, type Drawing } from '../svg'
import { clip } from './live'

export type FileStat = {
  name: string
  /** The folder it lies in, by its own name only; '' when the call gave none. */
  dir: string
  reads: number
  writes: number
  added: number
  removed: number
  errors: number
  /** When it was touched last. */
  last: number
}

const MAX_TILES = 18

/** How busy a file was: every touch counts, a write double, and the lines changed a little. */
export const fileWeight = (f: FileStat) => 1 + f.reads + 2 * f.writes + (f.added + f.removed) / 10

/** Every file the run's calls named, the busiest first. */
export function fileStats(r: CubeRun): FileStat[] {
  const by = new Map<string, FileStat>()
  for (const c of r.calls) {
    if (!c.file) continue
    const dir = c.dir ?? ''
    const key = `${dir}/${c.file}`
    const f = by.get(key) ?? { name: c.file, dir, reads: 0, writes: 0, added: 0, removed: 0, errors: 0, last: 0 }
    if (c.status === 'error') f.errors++
    else if (c.kind === 'write') {
      f.writes++
      f.added += c.add
      f.removed += c.del
    } else f.reads++
    f.last = Math.max(f.last, c.at)
    by.set(key, f)
  }
  return [...by.values()].sort((a, b) => fileWeight(b) - fileWeight(a) || a.name.localeCompare(b.name))
}

/** Null while no call has named a file. */
export function buildFileMap(r: CubeRun, width: number): Drawing | null {
  const all = fileStats(r)
  if (all.length === 0) return null
  const shown = all.slice(0, MAX_TILES)
  const newest = shown.reduce((m, f) => Math.max(m, f.last), 0)
  // Folders in the order of their busiest file; a folder's files stay together.
  const dirs = [...new Set(shown.map(f => f.dir))]
  const TH = 38
  const GAP = 6
  let s = ''
  let x = 0
  let y = 0
  for (const dir of dirs) {
    const files = shown.filter(f => f.dir === dir)
    // The folder's name stands in the row, before its first file.
    if (dirs.length > 1 || dir) {
      const name = clip(dir ? `${dir}/` : tr('ohne Ordner', 'no folder'), Math.min(width, 110), 10)
      const lw = [...name].length * 5.8 + 8
      if (x > 0 && x + lw + 66 > width) {
        x = 0
        y += TH + GAP
      }
      s += `<text class="acg-lb" x="${n1(x)}" y="${y + TH / 2 + 3.5}" font-family="${FONT}" font-size="10" font-weight="600">${esc(name)}</text>`
      x += lw
    }
    for (const f of files) {
      const w = Math.min(width, Math.max(66, Math.round(58 + 20 * Math.log2(fileWeight(f)))))
      if (x > 0 && x + w > width) {
        x = 0
        y += TH + GAP
      }
      const isWritten = f.writes > 0
      const col = isWritten ? WORK_COLOR.write : WORK_COLOR.read
      const isNewest = f.last === newest
      const tip = `${f.dir ? `${f.dir}/` : ''}${f.name}: ${f.reads} ${tr('gelesen', 'read')}, ${f.writes} ${tr('geschrieben', 'written')}, +${f.added} −${f.removed}${f.errors ? `, ${f.errors} ${tr('Fehler', 'errors')}` : ''}`
      s += `<g><title>${esc(tip)}</title>`
      s += `<rect x="${n1(x + 0.5)}" y="${y + 0.5}" width="${n1(w - 1)}" height="${TH - 1}" rx="7" fill="${col}" fill-opacity="${isWritten ? 0.2 : 0.12}" stroke="${col}" stroke-opacity="${isNewest ? 0.95 : 0.5}" stroke-width="${isNewest ? 1.6 : 1}"/>`
      s += `<text class="acg-vp" x="${n1(x + 8)}" y="${y + 16}" font-family="${FONT}" font-size="11" font-weight="600">${esc(clip(f.name, w - 16, 11))}</text>`
      const sub = isWritten
        ? `<tspan fill="${ADD}">+${f.added}</tspan> <tspan fill="${DEL}">−${f.removed}</tspan>${f.reads > 0 ? ` · ${f.reads}×` : ''}`
        : `${f.reads}× ${tr('gelesen', 'read')}`
      s += `<text class="acg-lb" x="${n1(x + 8)}" y="${y + 30}" font-family="${FONT}" font-size="10">${sub}</text>`
      if (f.errors > 0) s += `<circle cx="${n1(x + w - 9)}" cy="${y + 10}" r="3.5" fill="${DEL}"/>`
      s += `</g>`
      x += w + GAP
    }
    x += 6
  }
  y += TH + GAP
  const rest = all.length - shown.length
  if (rest > 0) {
    s += `<text class="acg-lb" x="0" y="${y + 9}" font-family="${FONT}" font-size="10">${esc(tr(`+ ${rest} weitere Dateien`, `+ ${rest} more files`))}</text>`
    y += 16
  }
  const height = Math.max(TH, y - 4)
  const written = all.filter(f => f.writes > 0).length
  const alt = tr(`${all.length} Dateien, ${written} geschrieben`, `${all.length} files, ${written} written`) + `: ${shown.slice(0, 6).map(f => f.name).join(', ')}`
  return { source: themed(width, height, s), width, height, alt }
}
