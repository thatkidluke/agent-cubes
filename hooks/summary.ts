/**
 * The finished run's summary as a picture: a ring for the steps done with the
 * headline figures beside it, a bar for working versus waiting, a bar for the
 * kinds of work, the code changed and the tests run, and one bar per step, as
 * long as the step took and tinted by its kind. Follows light and dark mode
 * through the same classes as the gauges.
 */
import { ellipsis, esc, n1 } from './svg'
import { FONT, STYLE } from './gauges'
import { WORK_COLOR } from './scene'
import { stepKind, WORK_KINDS, WORK_LABEL, workOf, type RunSummary, type StepKind, type WorkKind } from './model'
import { AMBER, BLUE, GREEN, RED } from './pictos'
import { tr } from './i18n'
import { fmtDuration } from './panel/format'
import type { CubeRun } from '../types'

const STEP_COLOR: Record<StepKind, string> = {
  research: '#3b82f6',
  setup: '#64748b',
  work: '#06b6d4',
  test: '#22c55e',
  review: '#a855f7',
  docs: '#eab308',
  ship: '#f97316',
}

const STEP_LABEL: Record<StepKind, () => string> = {
  research: () => tr('Recherche', 'Research'),
  setup: () => tr('Einrichtung', 'Setup'),
  work: () => tr('Arbeit', 'Work'),
  test: () => tr('Tests', 'Tests'),
  review: () => tr('Review', 'Review'),
  docs: () => tr('Doku', 'Docs'),
  ship: () => tr('Auslieferung', 'Shipping'),
}

const MAX_STEPS = 10

const text = (x: number, y: number, size: number, cls: string, body: string, extra = '') =>
  `<text class="${cls}" x="${n1(x)}" y="${n1(y)}" font-family="${FONT}" font-size="${size}"${extra}>${body}</text>`

/** A rounded bar of segments [value, colour], `w` wide, with a faint track behind. */
function stackedBar(x: number, y: number, w: number, h: number, segs: Array<[number, string]>): string {
  const total = segs.reduce((s, [v]) => s + v, 0)
  let s = `<rect class="acg-gf" x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${h}" rx="${h / 2}"/>`
  if (total <= 0) return s
  const id = `sum-bar-${Math.round(x)}-${Math.round(y)}`
  s += `<clipPath id="${id}"><rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${h}" rx="${h / 2}"/></clipPath><g clip-path="url(#${id})">`
  let cx = x
  for (const [v, col] of segs) {
    if (v <= 0) continue
    const sw = (w * v) / total
    s += `<rect x="${n1(cx)}" y="${n1(y)}" width="${n1(sw + 0.5)}" height="${h}" fill="${col}"/>`
    cx += sw
  }
  return s + `</g>`
}

/** A dot and a label, for a legend; returns the markup and how wide it is. */
function legendItem(x: number, y: number, col: string, label: string): [string, number] {
  const w = 14 + label.length * 6.2 + 12
  return [`<circle cx="${n1(x + 4)}" cy="${n1(y - 4)}" r="4" fill="${col}"/>` + text(x + 12, y, 11, 'acg-lb', esc(label)), w]
}

function legend(x: number, y: number, maxW: number, items: Array<[string, string]>): { svg: string; height: number } {
  let s = ''
  let cx = x
  let cy = y
  for (const [col, label] of items) {
    const [m, w] = legendItem(cx, cy, col, label)
    if (cx > x && cx + w > x + maxW) {
      cx = x
      cy += 16
      const [m2, w2] = legendItem(cx, cy, col, label)
      s += m2
      cx += w2
      continue
    }
    s += m
    cx += w
  }
  return { svg: s, height: cy - y + 16 }
}

const section = (x: number, y: number, label: string) => text(x, y, 11, 'acg-lb', esc(label.toUpperCase()), ' font-weight="600" letter-spacing="0.6"')

export function buildSummary(r: CubeRun, s: RunSummary, width: number): { source: string; width: number; height: number; alt: string } {
  const W = width
  const parts: string[] = []
  let y = 0

  // ── The ring and the headline figures ──
  const R = 34
  const cx = R + 6
  const cy = R + 6
  const frac = s.steps > 0 ? s.done / s.steps : 0
  const circ = 2 * Math.PI * R
  const ringCol = frac >= 1 ? GREEN : AMBER
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#94a3b8" stroke-opacity="0.22" stroke-width="9"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${ringCol}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${n1(circ * frac)} ${n1(circ)}" transform="rotate(-90 ${cx} ${cy})"/>`,
    text(cx, cy + 2, 17, 'acg-vp', `${s.done}/${s.steps}`, ' font-weight="700" text-anchor="middle"'),
    text(cx, cy + 16, 10, 'acg-lb', esc(tr('Schritte', 'steps')), ' text-anchor="middle"'),
  )
  const stats: Array<[string, string, string, string?]> = [
    ['◷', tr('Dauer', 'Time'), fmtDuration(s.ms)],
    ['$', tr('Kosten', 'Cost'), s.usd === null ? '–' : `≈ $${s.usd.toFixed(2)}`],
    ['⌁', tr('Tool-Aufrufe', 'Tool calls'), `${s.calls}`, s.errors > 0 ? `${s.errors} ✕` : undefined],
    ['⑂', tr('Subagents', 'Subagents'), String(s.agents)],
  ]
  const gx = cx + R + 22
  const colW = (W - gx) / 2
  stats.forEach(([icon, label, value, note], k) => {
    const x = gx + (k % 2) * colW
    const yy = 18 + Math.floor(k / 2) * 40
    parts.push(text(x, yy, 11, 'acg-lb', `${esc(icon)} ${esc(label)}`))
    parts.push(text(x, yy + 19, 17, 'acg-vp', esc(value), ' font-weight="700"'))
    if (note) parts.push(text(x + value.length * 10 + 8, yy + 19, 12, 'acg-vp', esc(note), ` font-weight="600" style="fill:${RED}"`))
  })
  y = 2 * R + 36

  // ── Working versus waiting ──
  const work = Math.max(0, s.ms - s.waitMs)
  parts.push(section(0, y, tr('Zeit', 'Time')))
  y += 8
  parts.push(stackedBar(0, y, W, 12, [[work, BLUE], [s.waitMs, AMBER]]))
  y += 28
  {
    const l = legend(0, y, W, [
      [BLUE, `${tr('Arbeit', 'Working')} ${fmtDuration(work)}`],
      [AMBER, `${tr('Wartezeit auf dich', 'Waiting for you')} ${s.waitMs > 0 ? '≈ ' + fmtDuration(s.waitMs) : '0:00'}`],
    ])
    parts.push(l.svg)
    y += l.height + 10
  }

  // ── Kinds of work, from the calls ──
  const byKind = new Map<WorkKind, number>()
  for (const c of r.calls) byKind.set(workOf(c), (byKind.get(workOf(c)) ?? 0) + 1)
  const kinds = WORK_KINDS.filter(k => (byKind.get(k) ?? 0) > 0)
  if (kinds.length > 0) {
    const total = kinds.reduce((t, k) => t + (byKind.get(k) ?? 0), 0)
    parts.push(section(0, y, tr('Arbeitsarten', 'Kinds of work')))
    y += 8
    parts.push(stackedBar(0, y, W, 12, kinds.map(k => [byKind.get(k) ?? 0, WORK_COLOR[k]])))
    y += 28
    const l = legend(0, y, W, kinds.map(k => [WORK_COLOR[k], `${WORK_LABEL[k]} ${Math.round(((byKind.get(k) ?? 0) / total) * 100)} %`]))
    parts.push(l.svg)
    y += l.height + 10
  }

  // ── Code and tests side by side: each only when the task changed lines or ran tests ──
  {
    const half = (W - 16) / 2
    const lines = s.added + s.removed
    const runs = s.testsPassed + s.testsFailed
    const cols: Array<{ title: string; bar: [number, string][]; value: string; note: string }> = []
    if (lines > 0) cols.push({ title: 'Code', bar: [[s.added, GREEN], [s.removed, RED]], value: `<tspan style="fill:${GREEN}">+${s.added}</tspan>  <tspan style="fill:${RED}">−${s.removed}</tspan>`, note: '' })
    if (runs > 0)
      cols.push({
        title: tr('Tests', 'Tests'),
        bar: [[s.testsPassed, GREEN], [s.testsFailed, RED]],
        value: `<tspan style="fill:${GREEN}">${s.testsPassed} ✓</tspan>  <tspan style="fill:${RED}">${s.testsFailed} ✕</tspan>`,
        note: s.lastTest ? `${tr('zuletzt', 'last')} ${s.lastTest === 'pass' ? '✓' : '✕'}` : '',
      })
    if (cols.length > 0) {
      cols.forEach((c, k) => {
        const x = k * (half + 16)
        parts.push(section(x, y, c.title), stackedBar(x, y + 8, half, 12, c.bar), text(x, y + 38, 15, 'acg-vp', c.value, ' font-weight="700"'))
        if (c.note) parts.push(text(x + 96, y + 38, 11, 'acg-lb', esc(c.note)))
      })
      y += 60
    }
  }

  // ── One bar per step: as long as it took, tinted by its kind ──
  const steps = r.tasks.map((t, i) => ({
    i,
    title: t.title,
    kind: stepKind(t.title),
    ms: t.startedAt && t.endedAt > t.startedAt ? t.endedAt - t.startedAt : 0,
    done: t.status === 'done',
  }))
  if (steps.length > 0) {
    parts.push(section(0, y, tr('Schritte', 'Steps')))
    y += 10
    const longest = Math.max(1, ...steps.map(st => st.ms))
    const shown = steps.slice(0, MAX_STEPS)
    const rowH = 30
    for (const st of shown) {
      const label = `${String(st.i + 1).padStart(2, '0')}  ${st.title}`
      const maxChars = Math.max(8, Math.floor((W - 60) / 6.6))
      const bw = st.ms > 0 ? Math.max(6, ((W - 56) * st.ms) / longest) : 0
      parts.push(
        `<g><title>${esc(`${st.title}: ${st.ms > 0 ? fmtDuration(st.ms) : '–'} (${STEP_LABEL[st.kind]()})`)}</title>`,
        text(0, y + 11, 11.5, 'acg-lb', esc(ellipsis(label, maxChars))),
        `<rect class="acg-gf" x="0" y="${n1(y + 16)}" width="${n1(W - 56)}" height="8" rx="4"/>`,
        bw > 0 ? `<rect x="0" y="${n1(y + 16)}" width="${n1(bw)}" height="8" rx="4" fill="${STEP_COLOR[st.kind]}" fill-opacity="${st.done ? 1 : 0.45}"/>` : '',
        text(W, y + 24, 11.5, 'acg-vp', esc(st.ms > 0 ? fmtDuration(st.ms) : '–'), ' text-anchor="end" font-weight="600"'),
        `</g>`,
      )
      y += rowH
    }
    if (steps.length > shown.length) {
      parts.push(text(0, y + 6, 11, 'acg-lb', esc(tr(`… und ${steps.length - shown.length} weitere`, `… and ${steps.length - shown.length} more`))))
      y += 16
    }
    const used = [...new Set(shown.map(st => st.kind))]
    const l = legend(0, y + 8, W, used.map(k => [STEP_COLOR[k], STEP_LABEL[k]()]))
    parts.push(l.svg)
    y += l.height + 4
  }

  const height = Math.ceil(y)
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(W)}" height="${height}" viewBox="0 0 ${n1(W)} ${height}">${STYLE}${parts.join('')}</svg>`
  const alt = tr(
    `Zusammenfassung: ${s.done} von ${s.steps} Schritten, Dauer ${fmtDuration(s.ms)}, ${s.calls} Tool-Aufrufe, ${s.errors} Fehler, Code +${s.added} −${s.removed}`,
    `Summary: ${s.done} of ${s.steps} steps, time ${fmtDuration(s.ms)}, ${s.calls} tool calls, ${s.errors} errors, code +${s.added} −${s.removed}`,
  )
  return { source, width: W, height, alt }
}
