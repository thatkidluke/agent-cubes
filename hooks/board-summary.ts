/**
 * The finished run's summary in the circuit board's style: a test report on a
 * piece of the board. Readouts for steps, time, cost and calls on an OLED
 * strip, LED bars for working versus waiting, the kinds of work, code and
 * tests, and a bar per step as long as it took.
 */
import type { CallKind, CubeRun } from '../types'
import { boardThemeById } from './board'
import { KIND_COLOR } from './iso'
import { KIND_LABEL, stepKind, type RunSummary } from './model'
import { tr } from './i18n'
import { fmtDuration } from './panel/format'
import { esc, n1 } from './svg'

const MONO = 'ui-monospace,Consolas,Menlo,monospace'
const GREEN = '#34d399'
const RED = '#fb7185'
const AMBER = '#fbbf24'
const BLUE = '#38bdf8'
const MAX_STEPS = 10
const PART: Record<string, string> = { work: 'CPU', research: 'MEM', test: 'TST', review: 'OPT', docs: 'ROM', setup: 'PWR', ship: 'I/O' }

/** A bar of LEDs, `segs` of them, lit in the colours of its parts in proportion. */
function ledBar(x: number, y: number, w: number, segs: number, parts: Array<[number, string]>): string {
  const total = parts.reduce((s, [v]) => s + v, 0)
  const sw = w / segs
  let s = ''
  let acc = 0
  let pi = 0
  for (let k = 0; k < segs; k++) {
    let col = '#1a2336'
    if (total > 0) {
      const at = ((k + 0.5) / segs) * total
      while (pi < parts.length - 1 && at > acc + parts[pi]![0]) acc += parts[pi++]![0]
      col = parts[pi]![1]
    }
    s += `<rect x="${n1(x + k * sw)}" y="${n1(y)}" width="${n1(sw - 1.6)}" height="9" rx="1.3" fill="${col}"/>`
  }
  return s
}

export function buildBoardSummary(r: CubeRun, s: RunSummary, width: number, themeId?: string): { source: string; width: number; height: number; alt: string } {
  const th = boardThemeById(themeId)
  const W = Math.round(width)
  const pad = 16
  const iw = W - 2 * pad
  const out: string[] = []
  const silk = (x: number, y: number, t: string, extra = '') => `<text x="${n1(x)}" y="${n1(y)}" font-family="${MONO}" font-size="9.5" letter-spacing="1.2" fill="${th.silk}" fill-opacity="0.75"${extra}>${esc(t)}</text>`
  const val = (x: number, y: number, t: string, col = th.text, size = 12, extra = '') => `<text x="${n1(x)}" y="${n1(y)}" font-family="${MONO}" font-size="${size}" font-weight="700" fill="${col}"${extra}>${t}</text>`
  let y = 14

  // ── Heading and a stamp ──
  const allDone = s.steps > 0 && s.done === s.steps
  out.push(silk(pad, y + 8, tr('PRÜFPROTOKOLL · PCB-01', 'TEST REPORT · PCB-01')))
  const stamp = allDone && s.errors === 0 && s.lastTest !== 'fail' ? ['PASS', GREEN] : allDone ? [tr('FERTIG', 'DONE'), AMBER] : [tr('OFFEN', 'OPEN'), RED]
  out.push(`<rect x="${n1(W - pad - 62)}" y="${y - 4}" width="62" height="20" rx="4" fill="none" stroke="${stamp[1]}" stroke-width="1.6"/>` + val(W - pad - 31, y + 10.5, stamp[0]!, stamp[1], 11.5, ' text-anchor="middle" letter-spacing="1.5"'))
  y += 28

  // ── The readouts on an OLED strip ──
  out.push(`<rect x="${pad}" y="${y}" width="${iw}" height="50" rx="7" fill="#020a08" stroke="${th.edge}" stroke-width="1.1"/>`)
  const cells: Array<[string, string, string]> = [
    [tr('SCHRITTE', 'STEPS'), `${s.done}/${s.steps}`, allDone ? GREEN : th.trace],
    [tr('DAUER', 'TIME'), fmtDuration(s.ms), '#e2e8f0'],
    [tr('KOSTEN', 'COST'), s.usd === null ? '--' : `$${s.usd.toFixed(2)}`, '#fde68a'],
    [tr('AUFRUFE', 'CALLS'), `${s.calls}${s.errors > 0 ? `<tspan fill="${RED}" font-size="11"> ${s.errors}✕</tspan>` : ''}`, '#e2e8f0'],
  ]
  cells.forEach(([label, value, col], k) => {
    const cx = pad + 12 + (k * (iw - 16)) / cells.length
    out.push(`<text x="${n1(cx)}" y="${y + 18}" font-family="${MONO}" font-size="9" letter-spacing="1" fill="#7c8aa3">${label}</text>` + val(cx, y + 38, value, col, 16))
  })
  y += 66

  // ── Bars: working versus waiting, the kinds of work, code and tests ──
  const segs = Math.max(16, Math.min(44, Math.floor(iw / 8)))
  const bar = (label: string, parts: Array<[number, string]>, legend: string) => {
    out.push(silk(pad, y + 7, label))
    y += 12
    out.push(ledBar(pad, y, iw, segs, parts))
    y += 22
    out.push(`<text x="${pad}" y="${y}" font-family="${MONO}" font-size="10.5" fill="${th.text}" fill-opacity="0.85">${legend}</text>`)
    y += 16
  }
  const work = Math.max(0, s.ms - s.waitMs)
  const dot = (c: string) => `<tspan fill="${c}">●</tspan> `
  bar(tr('ZEIT', 'TIME'), [[work, BLUE], [s.waitMs, AMBER]], `${dot(BLUE)}${tr('Arbeit', 'Working')} ${fmtDuration(work)}   ${dot(AMBER)}${tr('Warten', 'Waiting')} ${s.waitMs > 0 ? '≈ ' + fmtDuration(s.waitMs) : '0:00'}`)
  const byKind = new Map<CallKind, number>()
  for (const c of r.calls) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1)
  const kinds = (['read', 'write', 'run', 'agent', 'other'] as CallKind[]).filter(k => (byKind.get(k) ?? 0) > 0)
  if (kinds.length > 0) {
    const total = kinds.reduce((t, k) => t + (byKind.get(k) ?? 0), 0)
    bar(tr('ARBEITSARTEN', 'KINDS OF WORK'), kinds.map(k => [byKind.get(k) ?? 0, KIND_COLOR[k]]), kinds.map(k => `${dot(KIND_COLOR[k])}${esc(KIND_LABEL[k])} ${Math.round(((byKind.get(k) ?? 0) / total) * 100)}%`).join('  '))
  }
  if (s.added + s.removed > 0) bar('CODE', [[s.added, GREEN], [s.removed, RED]], `<tspan fill="${GREEN}" font-weight="700">+${s.added}</tspan>  <tspan fill="${RED}" font-weight="700">−${s.removed}</tspan>`)
  if (s.testsPassed + s.testsFailed > 0) bar('TESTS', [[s.testsPassed, GREEN], [s.testsFailed, RED]], `<tspan fill="${GREEN}" font-weight="700">${s.testsPassed} ✓</tspan>  <tspan fill="${RED}" font-weight="700">${s.testsFailed} ✕</tspan>`)

  // ── A bar per step: as long as it took, its part's code in front ──
  const steps = r.tasks.map((t, i) => ({ i, title: t.title, ms: t.startedAt && t.endedAt > t.startedAt ? t.endedAt - t.startedAt : 0, done: t.status === 'done', part: PART[stepKind(t.title)] ?? 'CPU' }))
  if (steps.length > 0) {
    out.push(silk(pad, y + 7, tr('SCHRITTE', 'STEPS')))
    y += 16
    const longest = Math.max(1, ...steps.map(st => st.ms))
    const barX = pad + 34
    const barW = iw - 34 - 50
    for (const st of steps.slice(0, MAX_STEPS)) {
      const maxChars = Math.max(8, Math.floor(barW / 6.4))
      const label = `${String(st.i + 1).padStart(2, '0')} ${st.title.replace(/\s+/g, ' ')}`
      out.push(
        `<g><title>${esc(`${st.title}: ${st.ms > 0 ? fmtDuration(st.ms) : '–'}`)}</title>` +
          `<text x="${pad}" y="${y + 19}" font-family="${MONO}" font-size="8.5" letter-spacing="0.6" fill="#7c8aa3">${st.part}</text>` +
          `<text x="${barX}" y="${y + 8}" font-family="${MONO}" font-size="10.5" fill="${th.text}" fill-opacity="0.9">${esc(label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label)}</text>` +
          ledBar(barX, y + 12, barW, Math.max(10, Math.floor(barW / 8)), st.ms > 0 ? [[st.ms, st.done ? GREEN : BLUE], [longest - st.ms, '#1a2336']] : []) +
          val(W - pad, y + 20, st.ms > 0 ? fmtDuration(st.ms) : '–', th.text, 10.5, ' text-anchor="end"') +
          `</g>`,
      )
      y += 30
    }
    if (steps.length > MAX_STEPS) {
      out.push(`<text x="${barX}" y="${y + 6}" font-family="${MONO}" font-size="10" fill="${th.text}" fill-opacity="0.7">${esc(tr(`… und ${steps.length - MAX_STEPS} weitere`, `… and ${steps.length - MAX_STEPS} more`))}</text>`)
      y += 16
    }
  }
  const H = Math.ceil(y + 12)
  const defs = `<linearGradient id="bs-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${th.bg[0]}"/><stop offset="0.55" stop-color="${th.bg[1]}"/><stop offset="1" stop-color="${th.bg[2]}"/></linearGradient><pattern id="bs-via" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="0.9" fill="${th.via}" fill-opacity="0.25"/></pattern>`
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>` +
    `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="url(#bs-bg)" stroke="${allDone ? GREEN : th.edge}" stroke-width="1.5"/><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="url(#bs-via)"/>` +
    out.join('') +
    `</svg>`
  const alt = tr(
    `Prüfprotokoll: ${s.done} von ${s.steps} Schritten, Dauer ${fmtDuration(s.ms)}, ${s.calls} Tool-Aufrufe, ${s.errors} Fehler, Code +${s.added} −${s.removed}`,
    `Test report: ${s.done} of ${s.steps} steps, time ${fmtDuration(s.ms)}, ${s.calls} tool calls, ${s.errors} errors, code +${s.added} −${s.removed}`,
  )
  return { source, width: W, height: H, alt }
}
