/**
 * The TIMELINE card: the task as a band of time. Every call is a stroke in the
 * colour of its kind of work, as wide as it took; the gaps between them are
 * the agent thinking. The main agent's calls run in the upper lane, the
 * subagents' in a lane below, waiting for the person lies amber behind both,
 * and a strip underneath says which step was in work. Pure string builder;
 * follows light and dark mode through the theme classes of `gauges.ts`.
 */
import type { CubeRun } from '../../types'
import { FONT, themed } from '../gauges'
import { tr } from '../i18n'
import { PALETTE, WORK_COLOR } from '../iso'
import { workOf } from '../model'
import { AMBER as WAIT, RED as BAD } from '../pictos'
import { esc, n1, type Drawing } from '../svg'
import { cubeNo, fmtDuration } from './format'

/** The longest stretch without a call running, in ms: the agent thinking, or waiting. */
export function longestGap(r: CubeRun, end: number): number {
  let covered = r.startedAt || (r.calls[0]?.at ?? 0)
  let gap = 0
  for (const c of [...r.calls].sort((a, b) => a.at - b.at)) {
    if (c.at > covered) gap = Math.max(gap, c.at - covered)
    covered = Math.max(covered, c.at + (c.ms || 0))
  }
  return Math.max(gap, end - covered)
}

/** Null while there is nothing to show: no call yet. `now` is where the band ends while the run goes on. */
export function buildTimeline(r: CubeRun, now: number, width: number): Drawing | null {
  if (r.calls.length === 0) return null
  // Calls beyond the stored ones are gone: the band then begins at the first one kept.
  const isCut = r.toolCalls > r.calls.length
  const t0 = isCut || !r.startedAt ? r.calls[0]!.at : r.startedAt
  const t1 = Math.max(t0 + 1000, r.endedAt || now)
  const span = t1 - t0
  const gx = 16
  const W = width - gx
  const X = (t: number) => gx + (Math.max(t0, Math.min(t1, t)) - t0) / span * W
  const hasSubs = r.calls.some(c => c.agentId)
  const mainY = 2
  const mainH = 16
  const subY = mainY + mainH + 3
  const subH = 10
  const lanesEnd = hasSubs ? subY + subH : mainY + mainH

  let s = ''
  // The lanes, and who they belong to.
  s += `<rect class="acg-gf" x="${gx}" y="${mainY}" width="${n1(W)}" height="${mainH}" rx="3"/>`
  s += `<text class="acg-lb" x="0" y="${mainY + 12}" font-family="${FONT}" font-size="10" font-weight="700">H</text>`
  if (hasSubs) {
    s += `<rect class="acg-gf" x="${gx}" y="${subY}" width="${n1(W)}" height="${subH}" rx="3"/>`
    s += `<text class="acg-lb" x="0" y="${subY + 8.5}" font-family="${FONT}" font-size="9" font-weight="700">S</text>`
  }
  // Waiting for the person, behind the calls.
  const waits = [...(r.waits ?? []), ...(r.waitSince ? [{ start: r.waitSince, end: t1 }] : [])]
  for (const w of waits) {
    if (w.end <= t0) continue
    const x = X(w.start)
    s += `<rect x="${n1(x)}" y="${mainY}" width="${n1(Math.max(1.5, X(w.end) - x))}" height="${lanesEnd - mainY}" fill="${WAIT}" fill-opacity="0.22"><title>${tr('Wartet auf dich', 'Waiting for you')}: ${fmtDuration(w.end - w.start)}</title></rect>`
  }
  // The calls.
  for (const c of r.calls) {
    const isSub = c.agentId !== ''
    const x = X(c.at)
    const end = c.status === 'running' || c.status === 'waiting' ? t1 : c.at + c.ms
    const w = Math.max(1.6, X(end) - x)
    const col = c.status === 'error' ? BAD : WORK_COLOR[workOf(c)]
    const tip = `${c.tool}${c.detail ? ` · ${c.detail.slice(0, 40)}` : ''}`
    s += `<rect x="${n1(x)}" y="${isSub ? subY : mainY}" width="${n1(w)}" height="${isSub ? subH : mainH}" rx="0.8" fill="${col}"${isSub ? ' fill-opacity="0.85"' : ''}><title>${esc(tip)}</title></rect>`
  }
  // The steps: which one was in work when, with its number where there is room.
  const stripY = lanesEnd + 5
  let hasSteps = false
  let labelEnd = -Infinity
  r.tasks.forEach((t, i) => {
    if (!t.startedAt) return
    const a = X(t.startedAt)
    const b = X(t.endedAt || t1)
    if (b - a < 1) return
    hasSteps = true
    const col = t.status === 'done' ? PALETTE.done[1] : PALETTE.running[1]
    s += `<rect x="${n1(a + 0.5)}" y="${stripY}" width="${n1(Math.max(1, b - a - 1))}" height="4" rx="2" fill="${col}"><title>${esc(`${cubeNo(i)} ${t.title}`)}</title></rect>`
    const mid = (a + b) / 2
    if (b - a < 16 || mid - 7 < labelEnd) return
    labelEnd = mid + 7
    s += `<text class="acg-lb" x="${n1(mid)}" y="${stripY + 14}" font-family="${FONT}" font-size="9" text-anchor="middle">${cubeNo(i)}</text>`
  })
  // The foot: where the band begins and ends, and what it says in a line.
  const footY = (hasSteps ? stripY + 16 : lanesEnd + 4) + 12
  const gap = longestGap(r, t1)
  const note = tr(`${r.calls.length} Aufrufe · längste Pause ${fmtDuration(gap)}`, `${r.calls.length} calls · longest pause ${fmtDuration(gap)}`)
  s += `<text class="acg-lb" x="${gx}" y="${footY}" font-family="${FONT}" font-size="10">${isCut ? '…' : '0:00'}</text>`
  s += `<text class="acg-lb" x="${n1(gx + W / 2)}" y="${footY}" font-family="${FONT}" font-size="10" text-anchor="middle">${esc(note)}</text>`
  s += `<text class="acg-lb" x="${n1(width)}" y="${footY}" font-family="${FONT}" font-size="10" text-anchor="end">${esc(fmtDuration(span))}</text>`
  const height = footY + 4
  return { source: themed(width, height, s), width, height, alt: `${tr('Zeitstrahl', 'Timeline')}: ${note}, ${fmtDuration(span)}` }
}
