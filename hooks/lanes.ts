/**
 * The agent timeline: one thin lane per agent under the cubes, its tool calls
 * as coloured bars over the run's time, and the phases in which the run waited
 * for the person as amber bands. A small SVG of its own, so the main drawing
 * does not grow.
 */
import type { CubeRun } from '../types'
import { tr } from './i18n'
import { agentColor, agentInitial, KIND_COLOR, MAIN_COLOR, PALETTE } from './iso'
import { esc, n1 } from './svg'

const ROW = 14
const LABEL = 22
const PAD = 4
/** Bars thinner than this are widened to it, so a quick call still shows. */
const MIN_BAR = 1.5
/** Lanes drawn at most: the main agent and the latest subagents. */
const MAX_LANES = 7

export function buildLanes(r: CubeRun, now: number, width: number): { source: string; width: number; height: number; alt: string } | null {
  if (r.calls.length === 0) return null
  // From the run's start, or from its first call where the start is not known.
  const t0 = r.startedAt || Math.min(...r.calls.map(c => c.at))
  const t1 = Math.max(t0 + 1000, r.endedAt || now)
  const agents = r.agents.map((a, k) => ({ a, k })).slice(-(MAX_LANES - 1))
  const lanes = [
    { id: '', letter: 'H', color: MAIN_COLOR, name: tr('Hauptagent', 'Main agent') },
    ...agents.map(({ a, k }) => ({ id: a.id, letter: agentInitial(a.name), color: agentColor(k), name: a.name })),
  ]
  const height = PAD * 2 + lanes.length * ROW
  const x0 = LABEL
  const x1 = width - PAD
  const xOf = (t: number) => x0 + ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * (x1 - x0)
  const parts: string[] = []

  // Waiting for the person: amber bands across all lanes.
  const waits = [...(r.waits ?? []), ...(r.waitSince ? [{ start: r.waitSince, end: now }] : [])]
  for (const w of waits) {
    const a = xOf(w.start)
    const b = Math.max(a + MIN_BAR, xOf(w.end))
    parts.push(
      `<rect x="${n1(a)}" y="${PAD}" width="${n1(b - a)}" height="${lanes.length * ROW}" fill="${PALETTE.waiting[1]}" fill-opacity="0.18">` +
        `<title>${esc(tr('Wartet auf dich', 'Waiting for you'))}</title></rect>`,
    )
  }

  lanes.forEach((lane, li) => {
    const y = PAD + li * ROW
    // Lane track and its badge.
    parts.push(`<rect x="${x0}" y="${n1(y + ROW / 2 - 0.5)}" width="${n1(x1 - x0)}" height="1" fill="#94a3b8" fill-opacity="0.35"/>`)
    parts.push(
      `<g><title>${esc(lane.name)}</title><circle cx="${n1(LABEL / 2)}" cy="${n1(y + ROW / 2)}" r="5.5" fill="${lane.color}"/>` +
        `<text x="${n1(LABEL / 2)}" y="${n1(y + ROW / 2 + 3)}" font-size="7.5" font-weight="700" font-family="system-ui,sans-serif" fill="#0f172a" text-anchor="middle">${esc(lane.letter)}</text></g>`,
    )
    // Its calls as bars, coloured by kind of work; failed ones red.
    for (const c of r.calls) {
      if (c.agentId !== lane.id) continue
      const a = xOf(c.at)
      const end = c.ms ? c.at + c.ms : c.status === 'running' || c.status === 'waiting' ? now : c.at
      const b = Math.max(a + MIN_BAR, xOf(end))
      const col = c.status === 'error' ? PALETTE.error[1] : KIND_COLOR[c.kind]
      parts.push(
        `<rect x="${n1(a)}" y="${n1(y + 3)}" width="${n1(b - a)}" height="${ROW - 6}" rx="1.5" fill="${col}"><title>${esc(`${c.tool}${c.detail ? ` · ${c.detail}` : ''}`)}</title></rect>`,
      )
    }
  })

  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`
  const alt = tr(
    `Zeitstrahl: ${lanes.length} Agents, ${waits.length} Wartephasen`,
    `Timeline: ${lanes.length} agents, ${waits.length} waiting phases`,
  )
  return { source, width, height, alt }
}
