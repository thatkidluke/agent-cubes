/**
 * The circuit-board view: the same task as the cubes, drawn as a PCB. Each
 * step is a part, its kind chosen by the kind of step and its size by the work
 * expected of it, with a row of LEDs for its progress, one LED per slice of
 * its calls and coloured by the kind of work. Copper traces join the parts in
 * order, winding from row to row, and carry current once a step is done; thin
 * amber traces show which step waits for which. Agents sit on the parts they
 * drive as probes and travel along the traces; an OLED module along the top
 * shows the whole task, the calls per minute, the context window, cost and
 * time left.
 *
 * The board is an object of its own, the same in light and dark mode; its
 * solder mask comes in a few colours.
 */
import type { CubeRun, CubeStatus } from '../types'
import { foldSteps, KIND_COLOR, sceneSteps, SLOTS, STATUS_GLYPH, stripSmil, type Big, type DrawOptions } from './iso'
import { expected, stepKind, type StepKind } from './model'
import { CONTEXT_AMBER, CONTEXT_RED } from './overlays'
import { perMinute } from './pictos'
import { tr } from './i18n'
import { esc, memo, n1, phaseLock } from './svg'

const MONO = 'ui-monospace,Consolas,Menlo,monospace'
const SANS = 'system-ui,-apple-system,Segoe UI,sans-serif'
/** The most parts drawn before finished runs fold into one. */
const MAX_CHIPS = 24
/** The Svg element's limit on its markup. */
const MAX_SOURCE = 131072

const ST: Record<CubeStatus, string> = { pending: '#64748b', running: '#38bdf8', done: '#34d399', error: '#fb7185', waiting: '#fbbf24' }

/** A solder mask and what goes with it. */
export type BoardTheme = {
  id: string
  /** German and English name for the picker. */
  name: [string, string]
  /** The mask: a gradient of three stops. */
  bg: [string, string, string]
  edge: string
  via: string
  /** A trace that carries current, the copper under it, and its core while it does not. */
  trace: string
  copper: string
  core: string
  /** Silkscreen, and the texts under the parts. */
  silk: string
  text: string
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'green', name: ['Grün', 'Green'], bg: ['#0b3a30', '#07271f', '#041a15'], edge: '#0f766e', via: '#14b8a6', trace: '#5eead4', copper: '#0a4a40', core: '#17806f', silk: '#5eead4', text: '#d1fae5' },
  { id: 'black', name: ['Schwarz-Gold', 'Black and gold'], bg: ['#1c1c22', '#111115', '#08080a'], edge: '#a16207', via: '#eab308', trace: '#fcd34d', copper: '#3a2f10', core: '#8a6a1c', silk: '#fcd34d', text: '#fef3c7' },
  { id: 'blue', name: ['Blau', 'Blue'], bg: ['#0c2a5e', '#081c40', '#051229'], edge: '#2563eb', via: '#60a5fa', trace: '#7dd3fc', copper: '#0b3a7a', core: '#2f6fd6', silk: '#bfdbfe', text: '#dbeafe' },
  { id: 'white', name: ['Weiß', 'White'], bg: ['#f4f6f9', '#e4e9f0', '#cdd5e0'], edge: '#94a3b8', via: '#64748b', trace: '#0ea5e9', copper: '#b3c0d0', core: '#7c8da3', silk: '#475569', text: '#0f172a' },
  { id: 'red', name: ['Rot', 'Red'], bg: ['#5c1212', '#3d0a0a', '#260606'], edge: '#b91c1c', via: '#f87171', trace: '#fde68a', copper: '#6b1515', core: '#b45309', silk: '#fecaca', text: '#fee2e2' },
]
export const boardThemeById = (id: string | undefined): BoardTheme => BOARD_THEMES.find(t => t.id === id) ?? BOARD_THEMES[0]!

/** What the board shows beyond the run: context and motion as for the cubes, plus its own. */
export type BoardOptions = DrawOptions & {
  /** The solder mask's id. */
  theme?: string
  /** The task's cost and the time left, as short texts; null or absent leaves them out. */
  cost?: string | null
  left?: string | null
  /** A tiny board for the widget: parts and traces only. */
  mini?: boolean
}

type Drawing = { source: string; width: number; height: number; alt: string }
type Size = 'small' | 'normal' | 'large'
/** A part's place: its centre, its row and the row's direction, its width, its LEDs. */
type Geo = { x: number; y: number; row: number; dir: number; cw: number; seg: number }

/** A part's code, printed on it, per kind of step. */
const PART: Record<StepKind, string> = { work: 'CPU', research: 'MEM', test: 'TST', review: 'OPT', docs: 'ROM', setup: 'PWR', ship: 'I/O' }

export function buildBoard(r: CubeRun, targetWidth: number, now = 0, selected = -1, opts: BoardOptions = {}): Drawing {
  const steps = sceneSteps(r, now)
  const bigs = foldSteps(steps, MAX_CHIPS)
  const posOf: number[] = []
  for (const b of bigs) for (let k = 0; k < b.count; k++) posOf[b.index + k] = b.pos
  const selPos = selected >= 0 && selected < posOf.length ? posOf[selected]! : -1
  const overall = steps.reduce((s, b) => s + (b.status === 'done' ? SLOTS : b.fill), 0) / (SLOTS * steps.length)
  const ctxRaw = opts.context
  const ctx = typeof ctxRaw === 'number' && Number.isFinite(ctxRaw) ? Math.round(Math.max(0, Math.min(1, ctxRaw)) * 100) / 100 : null
  const still = opts.motion === false
  const mini = opts.mini === true
  const W = Math.round(Math.max(mini ? 140 : 260, targetWidth))
  const theme = boardThemeById(opts.theme)
  const done = steps.filter(b => b.status === 'done').length
  const working = steps.filter(b => b.badges.length > 0).map(b => b.index + 1)
  const alt = tr(
    `Platine: ${done} von ${steps.length} Chips fertig${working.length ? `, gearbeitet wird an Chip ${working.join(', ')}` : ''}`,
    `Circuit board: ${done} of ${steps.length} chips done${working.length ? `, working on chip ${working.join(', ')}` : ''}`,
  )

  // Each part's kind from its step's title, its size from the work expected of it against the plan's average.
  const hasPlan = r.tasks.length > 0
  const exp = hasPlan ? r.tasks.map((_t, i) => expected(r, i).ms) : []
  const mean = exp.length > 0 ? exp.reduce((a, b) => a + b, 0) / exp.length : 0
  const parts: Array<{ kind: StepKind; size: Size }> = bigs.map(b => {
    if (!hasPlan || b.count > 1) return { kind: 'work', size: 'normal' }
    const ratio = mean > 0 ? (exp[b.index] ?? mean) / mean : 1
    return { kind: stepKind(b.name), size: ratio < 0.6 ? 'small' : ratio > 1.6 ? 'large' : 'normal' }
  })
  // Calls per minute, read at the minute, so the scope moves once a minute or with a new call.
  const rate = perMinute(r.calls.map(c => c.at), Math.floor(now / 60_000) * 60_000 + 59_999)
  const info = { cost: opts.cost ?? null, left: opts.left ?? null, rate }

  // Everything that shows; nothing that only moves with the clock.
  const key = JSON.stringify([W, selPos, ctx, still, mini, theme.id, overall, info, parts, bigs])
  return memo(mini ? 'board-mini' : 'board', key, () => {
    const scene: Scene = { bigs, posOf, parts, W, selPos, overall, ctx, done, total: steps.length, still, mini, theme, info }
    let out = draw(scene, 1)
    if (out.source.length > MAX_SOURCE) out = draw(scene, 0)
    const source = still ? stripSmil(out.source) : out.source
    return { source: phaseLock(source, now), width: W, height: out.height, alt }
  })
}

type Scene = {
  bigs: Big[]
  posOf: number[]
  parts: Array<{ kind: StepKind; size: Size }>
  W: number
  selPos: number
  overall: number
  ctx: number | null
  done: number
  total: number
  still: boolean
  mini: boolean
  theme: BoardTheme
  info: { cost: string | null; left: string | null; rate: number[] }
}

function draw(sc: Scene, detail: 0 | 1): { source: string; height: number } {
  const { bigs, W, overall, ctx, still, mini, theme } = sc
  // One unit scales the board for narrow panes.
  const u = mini ? 0.56 : Math.max(0.72, Math.min(1, W / 560))
  const CH = 68 * u
  const GX = (mini ? 24 : 40) * u
  const RG = (mini ? 30 : 78) * u
  const side = (mini ? 16 : 30) * u
  const n = bigs.length
  const widthOf = (size: Size) => (size === 'small' ? 84 : size === 'large' ? 126 : 100) * u
  const segOf = (size: Size) => (size === 'small' ? 10 : size === 'large' ? 16 : 12)

  // Rows: parts in order, as many as fit; the rows wind, left to right, then right to left.
  const avail = W - 2 * side
  const rows: number[][] = []
  let rowW = 0
  bigs.forEach((_b, i) => {
    const cw = widthOf(sc.parts[i]!.size)
    const row = rows[rows.length - 1]
    if (!row || rowW + GX + cw > avail) {
      rows.push([i])
      rowW = cw
    } else {
      row.push(i)
      rowW += GX + cw
    }
  })
  const top = mini ? 8 : 12
  const dispH = mini ? 0 : 46 * u
  const gy0 = top + dispH + (mini ? 12 : 32) * u
  const geo: Geo[] = []
  rows.forEach((row, ri) => {
    const dir = ri % 2 ? -1 : 1
    const total = row.reduce((s, i) => s + widthOf(sc.parts[i]!.size), 0) + (row.length - 1) * GX
    let x = (W - total) / 2
    const order = dir > 0 ? row : [...row].reverse()
    for (const i of order) {
      const cw = widthOf(sc.parts[i]!.size)
      geo[i] = { x: x + cw / 2, y: gy0 + ri * (CH + RG) + CH / 2, row: ri, dir, cw, seg: segOf(sc.parts[i]!.size) }
      x += cw + GX
    }
  })
  const H = Math.ceil(gy0 + rows.length * CH + (rows.length - 1) * RG + (mini ? 16 : 66) * u)
  const live = bigs.some(b => b.isLive)
  const allDone = n > 0 && bigs.every(b => b.status === 'done')
  const finale = allDone && !still && bigs.some(b => b.justDone)

  const defs =
    `<linearGradient id="bd-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${theme.bg[0]}"/><stop offset="0.55" stop-color="${theme.bg[1]}"/><stop offset="1" stop-color="${theme.bg[2]}"/></linearGradient>` +
    `<linearGradient id="bd-chip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27324a"/><stop offset="0.12" stop-color="#151c2e"/><stop offset="1" stop-color="#0a0f1c"/></linearGradient>` +
    `<linearGradient id="bd-pin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6a1c"/><stop offset="0.5" stop-color="#f6d67a"/><stop offset="1" stop-color="#9a7620"/></linearGradient>` +
    `<linearGradient id="bd-oled" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03110f"/><stop offset="1" stop-color="#010807"/></linearGradient>` +
    `<linearGradient id="bd-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.1"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="bd-light" cx="0.25" cy="0.1" r="0.9"><stop offset="0" stop-color="${theme.trace}" stop-opacity="0.12"/><stop offset="1" stop-color="${theme.trace}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="bd-lens" cx="0.35" cy="0.35" r="0.8"><stop offset="0" stop-color="#bae6fd"/><stop offset="0.5" stop-color="#1d4ed8"/><stop offset="1" stop-color="#020617"/></radialGradient>` +
    `<filter id="bd-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${n1(2.2 * u)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<filter id="bd-drop" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="${n1(2.5 * u)}"/></filter>` +
    (detail > 0
      ? `<pattern id="bd-via" width="${n1(18 * u)}" height="${n1(18 * u)}" patternUnits="userSpaceOnUse"><circle cx="${n1(9 * u)}" cy="${n1(9 * u)}" r="${n1(0.9 * u)}" fill="${theme.via}" fill-opacity="0.28"/></pattern>`
      : '')

  const out: string[] = []
  const rr = n1(14 * u)

  // ── The board: solder mask, a fine grid of vias, a lit corner, mounting holes, its name in silkscreen ──
  out.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${rr}" fill="url(#bd-bg)" stroke="${allDone ? ST.done : theme.edge}" stroke-width="1.5"/>`)
  if (detail > 0) {
    out.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${rr}" fill="url(#bd-via)"/>`)
    out.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${rr}" fill="url(#bd-light)"/>`)
    if (!mini) {
      out.push(`<rect x="${n1(5 * u)}" y="${n1(5 * u)}" width="${n1(W - 10 * u)}" height="${n1(H - 10 * u)}" rx="${n1(10 * u)}" fill="none" stroke="${theme.silk}" stroke-opacity="0.16" stroke-width="0.8"/>`)
      for (const hx of [12, W - 12]) out.push(`<circle cx="${hx}" cy="${H - 12}" r="${n1(4.6 * u)}" fill="#020a08" stroke="url(#bd-pin)" stroke-width="${n1(1.8 * u)}"/>`)
      out.push(`<text x="${n1(26 * u)}" y="${n1(H - 9 * u)}" font-family="${MONO}" font-size="${n1(8.5 * u)}" letter-spacing="${n1(1.6 * u)}" fill="${theme.silk}" fill-opacity="0.5">AGENT CUBES · PCB-01</text>`)
    }
  }

  // ── Traces: wide copper, a bright core where current has flowed, pulses running into a part in work ──
  let traceNo = 0
  const traceOf = (d: string, lit: boolean, flowing: boolean) => {
    let s = `<path d="${d}" fill="none" stroke="${theme.copper}" stroke-width="${n1(6.5 * u)}" stroke-linecap="round" stroke-linejoin="round"/>`
    s += lit
      ? // A halo drawn as a wider, fainter stroke: a filter draws nothing on a straight line, whose box has no height.
        `<path d="${d}" fill="none" stroke="${theme.trace}" stroke-opacity="0.3" stroke-width="${n1(5.5 * u)}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${d}" fill="none" stroke="${theme.trace}" stroke-width="${n1(2.2 * u)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${d}" fill="none" stroke="${theme.core}" stroke-width="${n1(1.6 * u)}" stroke-linecap="round" stroke-linejoin="round"/>`
    if (flowing) {
      s += `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${n1(2.2 * u)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${n1(5 * u)} ${n1(17 * u)}"><animate attributeName="stroke-dashoffset" values="${n1(22 * u)};0" dur="0.7s" repeatCount="indefinite"/></path>`
    }
    // The finale: once every step is done, a wave of light runs along each trace in turn.
    if (finale) {
      s += `<path d="${d}" pathLength="100" fill="none" stroke="#ffffff" stroke-width="${n1(3.2 * u)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="16 100" stroke-dashoffset="16"><animate attributeName="stroke-dashoffset" values="16;-100" dur="0.5s" begin="${n1(traceNo * 0.12)}s" fill="freeze"/></path>`
    }
    traceNo++
    return s
  }
  const pad = (x: number, y: number) => `<rect x="${n1(x - 2.5 * u)}" y="${n1(y - 4 * u)}" width="${n1(5 * u)}" height="${n1(8 * u)}" rx="${n1(1.2 * u)}" fill="url(#bd-pin)"/>`

  // The supply: from the display module down to the first part.
  if (n > 0 && !mini) {
    const a = geo[0]!
    const cl = a.x - a.cw / 2
    out.push(traceOf(`M${n1(cl - 15 * u)} ${n1(top + dispH)}V${n1(a.y)}H${n1(cl)}`, overall > 0 || live, live && bigs[0]!.isLive))
    out.push(pad(cl, a.y))
  }
  /** Where the trace from part i to the next turns, when they stand in different rows. */
  const turnX: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const a = geo[i]!
    const b = geo[i + 1]!
    const lit = bigs[i]!.status === 'done'
    const flowing = lit && bigs[i + 1]!.isLive && !still
    if (a.row === b.row) {
      const x1 = a.x + (a.dir * a.cw) / 2
      const x2 = b.x - (a.dir * b.cw) / 2
      out.push(traceOf(`M${n1(x1)} ${n1(a.y)}H${n1(x2)}`, lit, flowing))
      out.push(pad(x1, a.y), pad(x2, a.y))
      // A small resistor on the line, for the look of it.
      if (detail > 0 && !mini) {
        const mx = (x1 + x2) / 2
        out.push(
          `<rect x="${n1(mx - 6 * u)}" y="${n1(a.y - 3.2 * u)}" width="${n1(12 * u)}" height="${n1(6.4 * u)}" rx="${n1(1.5 * u)}" fill="#1b2433" stroke="#94a3b8" stroke-opacity="0.7" stroke-width="0.7"/>` +
            `<rect x="${n1(mx - 2.6 * u)}" y="${n1(a.y - 3.2 * u)}" width="${n1(1.6 * u)}" height="${n1(6.4 * u)}" fill="#f59e0b"/><rect x="${n1(mx + 1 * u)}" y="${n1(a.y - 3.2 * u)}" width="${n1(1.6 * u)}" height="${n1(6.4 * u)}" fill="#a855f7"/>`,
        )
      }
    } else {
      // The turn to the next row: out to the side, down, and back in.
      const sa = a.x + (a.dir * a.cw) / 2
      const sb = b.x + (a.dir * b.cw) / 2
      const ox = (a.dir > 0 ? Math.max(sa, sb) : Math.min(sa, sb)) + a.dir * (mini ? 9 : 17) * u
      turnX[i] = ox
      out.push(traceOf(`M${n1(sa)} ${n1(a.y)}H${n1(ox)}V${n1(b.y)}H${n1(sb)}`, lit, flowing))
      out.push(pad(sa, a.y), pad(sb, b.y))
    }
  }

  // ── Dependencies: a thin amber trace on the other layer, from the step waited for to the one that waits ──
  if (!mini) {
    for (const big of bigs) {
      const to = geo[big.pos]!
      const from = [...new Set(big.blockedBy.map(j => sc.posOf[j] ?? -1).filter(p => p >= 0 && p !== big.pos))]
      for (const p of from) {
        const a = geo[p]!
        const bulge = (a.row === to.row ? 26 : 0) * u
        const mx = (a.x + to.x) / 2
        const my = (a.y + to.y) / 2 + bulge + CH / 2
        const title = tr(`Schritt ${big.label} wartet auf Schritt ${bigs[p]!.label}`, `Step ${big.label} waits for step ${bigs[p]!.label}`)
        out.push(
          `<g><title>${esc(title)}</title><path d="M${n1(a.x)} ${n1(a.y)}Q${n1(mx)} ${n1(my)} ${n1(to.x)} ${n1(to.y)}" fill="none" stroke="${ST.waiting}" stroke-opacity="0.85" stroke-width="${n1(1.4 * u)}" stroke-dasharray="${n1(4 * u)} ${n1(3 * u)}" stroke-linecap="round"/>` +
            `<circle cx="${n1(mx)}" cy="${n1((a.y + to.y) / 2 + (bulge + CH / 2) / 2)}" r="${n1(2.6 * u)}" fill="#04080f" stroke="${ST.waiting}" stroke-width="1"/></g>`,
        )
      }
    }
  }

  // ── The display module ──
  if (!mini) out.push(display(sc, { u, x: side - 10 * u, top, dispH, live, allDone, done: sc.done, total: sc.total, ctx }))

  // ── The parts ──
  for (const big of bigs) {
    const g = geo[big.pos]!
    // An agent arriving from another part travels along the trace: out by the turn where there is one.
    const flights = big.badges.map(bd => {
      const fp = bd.from >= 0 ? (sc.posOf[bd.from] ?? -1) : -1
      if (fp < 0 || fp === big.pos || still) return null
      const f = geo[fp]!
      const via = fp === big.pos - 1 && f.row !== g.row ? turnX[fp] : undefined
      return { dx: f.x - g.x, dy: f.y - g.y, via: via === undefined ? undefined : via - g.x }
    })
    out.push(chip(big, g, sc.parts[big.pos]!, flights, { u, CH, still, selected: big.pos === sc.selPos, detail, mini, theme }))
  }

  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${out.join('')}</svg>`
  return { source, height: H }
}

type DisplayOptions = { u: number; x: number; top: number; dispH: number; live: boolean; allDone: boolean; done: number; total: number; ctx: number | null }

/** The OLED module: the whole task in LEDs, a scope of the calls per minute, the parts done, context, cost and time left. */
function display(sc: Scene, o: DisplayOptions): string {
  const { u, x, top, dispH, live, allDone, ctx } = o
  const { W, overall, theme, info, still } = sc
  const w = W - 2 * x
  const lit = allDone ? ST.done : theme.trace
  const pct = Math.round(Math.max(0, Math.min(1, overall)) * 100)
  let s = `<rect x="${n1(x)}" y="${top}" width="${n1(w)}" height="${n1(dispH)}" rx="${n1(7 * u)}" fill="#020a08" opacity="0.55" filter="url(#bd-drop)"/>`
  s += `<rect x="${n1(x)}" y="${top}" width="${n1(w)}" height="${n1(dispH)}" rx="${n1(7 * u)}" fill="url(#bd-oled)" stroke="${theme.edge}" stroke-width="1.2"/>`
  s += `<text x="${n1(x + 11 * u)}" y="${n1(top + dispH * 0.68)}" font-family="${MONO}" font-size="${n1(21 * u)}" font-weight="700" fill="${lit}" filter="url(#bd-glow)">${pct}%</text>`

  // From the right: parts and context, then cost and time left, then the scope; the LED bar takes the rest.
  let right = x + w - 8 * u
  const line1 = top + dispH * 0.42
  const line2 = top + dispH * 0.78
  const fsz = n1(10.5 * u)
  {
    const bw = 100 * u
    const rx = right - bw
    const ctxCol = ctx === null ? '#5b7f7a' : ctx >= CONTEXT_RED ? ST.error : ctx >= CONTEXT_AMBER ? ST.waiting : '#e2e8f0'
    s += `<text x="${n1(rx)}" y="${n1(line1)}" font-family="${MONO}" font-size="${fsz}" fill="#cbd5e1">CHIPS <tspan font-weight="700" fill="${lit}">${o.done}/${o.total}</tspan></text>`
    s += `<text x="${n1(rx)}" y="${n1(line2)}" font-family="${MONO}" font-size="${fsz}" fill="${ctxCol}"><title>${tr('Füllstand des Kontextfensters', 'How full the context window is')}</title>CTX <tspan font-weight="700">${ctx === null ? '--' : Math.round(ctx * 100) + '%'}</tspan></text>`
    if (ctx !== null) {
      const cw = 30 * u
      s += `<rect x="${n1(rx + 62 * u)}" y="${n1(line2 - 8 * u)}" width="${n1(cw)}" height="${n1(8 * u)}" rx="${n1(2 * u)}" fill="#12302c"/><rect x="${n1(rx + 62 * u)}" y="${n1(line2 - 8 * u)}" width="${n1(cw * ctx)}" height="${n1(8 * u)}" rx="${n1(2 * u)}" fill="${ctxCol}"/>`
    }
    right = rx - 12 * u
  }
  if ((info.cost || info.left) && w > 400 * u) {
    const bw = 96 * u
    const rx = right - bw
    if (info.cost) s += `<text x="${n1(rx)}" y="${n1(line1)}" font-family="${MONO}" font-size="${fsz}" fill="#cbd5e1"><title>${tr('Geschätzte Kosten dieses Auftrags', "This task's estimated cost")}</title>COST <tspan font-weight="700" fill="#fde68a">${esc(info.cost)}</tspan></text>`
    if (info.left) s += `<text x="${n1(rx)}" y="${n1(line2)}" font-family="${MONO}" font-size="${fsz}" fill="#cbd5e1"><title>${tr('Geschätzte Restzeit', 'Estimated time left')}</title>ETA <tspan font-weight="700" fill="#e2e8f0">${esc(info.left)}</tspan></text>`
    right = rx - 12 * u
  }
  if (info.rate.some(v => v > 0) && w > 500 * u) {
    // A scope: calls per minute over the last seven minutes.
    const sw = 60 * u
    const sx = right - sw
    const sy = top + 8 * u
    const sh = dispH - 16 * u
    const max = Math.max(1, ...info.rate)
    const pts = info.rate.map((v, k) => `${n1(sx + 3 * u + ((sw - 6 * u) * k) / (info.rate.length - 1))},${n1(sy + sh - 3 * u - (v / max) * (sh - 6 * u))}`)
    s += `<g><title>${tr('Tool-Aufrufe pro Minute', 'Tool calls per minute')}</title><rect x="${n1(sx)}" y="${n1(sy)}" width="${n1(sw)}" height="${n1(sh)}" rx="${n1(3 * u)}" fill="#04140f" stroke="${theme.edge}" stroke-opacity="0.7"/>`
    s += `<line x1="${n1(sx)}" y1="${n1(sy + sh / 2)}" x2="${n1(sx + sw)}" y2="${n1(sy + sh / 2)}" stroke="${theme.trace}" stroke-opacity="0.18"/>`
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${theme.trace}" stroke-width="${n1(1.6 * u)}" stroke-linejoin="round" stroke-linecap="round"/>`
    const last = pts[pts.length - 1]!.split(',')
    const pulse = live && !still ? `<animate attributeName="r" values="${n1(1.8 * u)};${n1(3.2 * u)};${n1(1.8 * u)}" dur="1.2s" repeatCount="indefinite"/>` : ''
    s += `<circle cx="${last[0]}" cy="${last[1]}" r="${n1(2 * u)}" fill="#ffffff">${pulse}</circle></g>`
    right = sx - 12 * u
  }
  const barX = x + 72 * u
  const barW = right - barX
  if (barW > 44 * u) {
    const segs = Math.max(6, Math.min(28, Math.floor(barW / (7 * u))))
    const sw = barW / segs
    const on = Math.round(Math.max(0, Math.min(1, overall)) * segs)
    for (let k = 0; k < segs; k++) {
      const isOn = k < on
      const blink = !isOn && k === on && live && !still ? `<animate attributeName="fill-opacity" values="0.12;0.75;0.12" dur="1.2s" repeatCount="indefinite"/>` : ''
      s += `<rect x="${n1(barX + k * sw)}" y="${n1(top + dispH / 2 - 6.5 * u)}" width="${n1(sw - 1.8 * u)}" height="${n1(13 * u)}" rx="${n1(1.4 * u)}" fill="${isOn || blink ? lit : '#12302c'}"${blink ? ' fill-opacity="0.12"' : ''}>${blink}</rect>`
    }
  }
  return s + `<rect x="${n1(x)}" y="${top}" width="${n1(w)}" height="${n1(dispH)}" rx="${n1(7 * u)}" fill="url(#bd-gloss)"/>`
}

type ChipOptions = { u: number; CH: number; still: boolean; selected: boolean; detail: 0 | 1; mini: boolean; theme: BoardTheme }
type Flight = { dx: number; dy: number; via: number | undefined } | null

/** What marks a part's kind, in the free corner beside pin one. */
function partMark(kind: StepKind, L: number, T: number, u: number): string {
  const x = L + 9 * u
  const y = T + 6 * u
  switch (kind) {
    case 'research': {
      // Memory: a bank of cells.
      let s = ''
      for (let k = 0; k < 5; k++) s += `<rect x="${n1(x + k * 4.6 * u)}" y="${n1(y)}" width="${n1(3 * u)}" height="${n1(9 * u)}" rx="${n1(0.6 * u)}" fill="#475569"/>`
      return s
    }
    case 'test':
      // Test points.
      return [0, 1, 2].map(k => `<circle cx="${n1(x + 3 * u + k * 8 * u)}" cy="${n1(y + 4.5 * u)}" r="${n1(2.7 * u)}" fill="url(#bd-pin)" stroke="#04080f" stroke-width="0.6"/>`).join('')
    case 'review':
      // A lens.
      return `<circle cx="${n1(x + 6 * u)}" cy="${n1(y + 4.5 * u)}" r="${n1(5.4 * u)}" fill="url(#bd-lens)" stroke="#7dd3fc" stroke-width="0.9"/>`
    case 'docs':
      // A paper label.
      return `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(24 * u)}" height="${n1(9 * u)}" rx="${n1(1.2 * u)}" fill="#e2e8f0"/><path d="M${n1(x + 3 * u)} ${n1(y + 3 * u)}h${n1(18 * u)}M${n1(x + 3 * u)} ${n1(y + 6 * u)}h${n1(12 * u)}" stroke="#64748b" stroke-width="${n1(1 * u)}"/>`
    case 'setup':
      // Cooling fins.
      return [0, 1, 2].map(k => `<rect x="${n1(x)}" y="${n1(y + k * 3.4 * u)}" width="${n1(24 * u)}" height="${n1(2 * u)}" rx="${n1(1 * u)}" fill="#94a3b8"/>`).join('')
    case 'ship':
      // A port.
      return `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(24 * u)}" height="${n1(9 * u)}" rx="${n1(4.5 * u)}" fill="#020617" stroke="#cbd5e1" stroke-width="0.9"/><rect x="${n1(x + 5 * u)}" y="${n1(y + 3.6 * u)}" width="${n1(14 * u)}" height="${n1(1.8 * u)}" fill="#94a3b8"/>`
    default:
      // A processor: its die.
      return `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(9 * u)}" height="${n1(9 * u)}" rx="${n1(1.2 * u)}" fill="none" stroke="#94a3b8" stroke-width="0.9"/><rect x="${n1(x + 2.6 * u)}" y="${n1(y + 2.6 * u)}" width="${n1(3.8 * u)}" height="${n1(3.8 * u)}" fill="#94a3b8"/>`
  }
}

/** One step as a part: pins, a body in its status colour, its kind and number, a row of LEDs, and what sits on it. */
function chip(big: Big, g: Geo, part: { kind: StepKind; size: Size }, flights: Flight[], o: ChipOptions): string {
  const { u, CH, still, mini, theme } = o
  const CW = g.cw
  const SEG = g.seg
  const L = g.x - CW / 2
  const T = g.y - CH / 2
  const col = ST[big.status]
  const ghost = big.isGhost
  const liveNow = big.isLive && !still
  let s = `<g${ghost ? ' opacity="0.6"' : ''}><title>${esc(big.title)}</title>`

  // A stack of folded steps: two more packages peek out behind.
  if (big.count > 1) {
    for (const k of [2, 1]) s += `<rect x="${n1(L + 4 * k * u)}" y="${n1(T - 4 * k * u)}" width="${n1(CW)}" height="${n1(CH)}" rx="${n1(7 * u)}" fill="#0a0f1c" stroke="${col}" stroke-opacity="0.45"/>`
  }
  // A soft shadow on the board, then the pins along the top and bottom.
  s += `<rect x="${n1(L + 2 * u)}" y="${n1(T + 4 * u)}" width="${n1(CW)}" height="${n1(CH)}" rx="${n1(7 * u)}" fill="#000000" opacity="0.45" filter="url(#bd-drop)"/>`
  let pins = ''
  const pw = 5 * u
  const pinCount = part.size === 'small' ? 6 : part.size === 'large' ? 9 : 7
  for (let k = 1; k <= pinCount; k++) {
    const px = L + (CW * k) / (pinCount + 1) - pw / 2
    pins += `<rect x="${n1(px)}" y="${n1(T - 6 * u)}" width="${n1(pw)}" height="${n1(7 * u)}" rx="${n1(1 * u)}"/><rect x="${n1(px)}" y="${n1(T + CH - 1 * u)}" width="${n1(pw)}" height="${n1(7 * u)}" rx="${n1(1 * u)}"/>`
  }
  s += `<g fill="url(#bd-pin)">${pins}</g>`

  // The package: its edge in the status colour, glowing and breathing while in work.
  const breathe = liveNow ? `<animate attributeName="stroke-opacity" values="1;0.4;1" dur="${big.status === 'waiting' ? '0.9s' : '1.6s'}" repeatCount="indefinite"/>` : ''
  s += `<rect x="${n1(L)}" y="${n1(T)}" width="${n1(CW)}" height="${n1(CH)}" rx="${n1(7 * u)}" fill="url(#bd-chip)" stroke="${col}" stroke-width="${big.isLive ? n1(1.9 * u) : n1(1.2 * u)}"${ghost ? ' stroke-dasharray="3 3"' : ''}${big.isLive ? ' filter="url(#bd-glow)"' : ''}>${breathe}</rect>`
  if (o.detail > 0) {
    s += `<rect x="${n1(L)}" y="${n1(T)}" width="${n1(CW)}" height="${n1(CH)}" rx="${n1(7 * u)}" fill="url(#bd-gloss)"/>`
    s += `<path d="M${n1(L)} ${n1(g.y - 5 * u)}a${n1(5 * u)} ${n1(5 * u)} 0 0 1 0 ${n1(10 * u)}" fill="#04080f" stroke="${col}" stroke-opacity="0.5" stroke-width="0.8"/>`
    // The part's kind: a mark in the corner and its code beside the status LED.
    if (!mini) {
      s += partMark(part.kind, L, T, u)
      s += `<text x="${n1(L + CW - 20 * u)}" y="${n1(T + 14 * u)}" font-family="${MONO}" font-size="${n1(7.5 * u)}" letter-spacing="${n1(0.6 * u)}" text-anchor="end" fill="#7c8aa3">${PART[part.kind]}</text>`
    }
  }
  if (big.stuck) {
    const pulse = still ? '' : `<animate attributeName="stroke-opacity" values="0.9;0.2;0.9" dur="1.4s" repeatCount="indefinite"/>`
    s += `<rect x="${n1(L - 3 * u)}" y="${n1(T - 3 * u)}" width="${n1(CW + 6 * u)}" height="${n1(CH + 6 * u)}" rx="${n1(9 * u)}" fill="none" stroke="#ef4444" stroke-width="${n1(1.6 * u)}" filter="url(#bd-glow)">${pulse}</rect>`
  }

  // The status LED in the corner.
  const blink = liveNow ? `<animate attributeName="opacity" values="1;0.25;1" dur="1.1s" repeatCount="indefinite"/>` : ''
  s += `<circle cx="${n1(L + CW - 11 * u)}" cy="${n1(T + 11 * u)}" r="${n1(3.6 * u)}" fill="${ghost ? '#334155' : col}"${ghost ? '' : ' filter="url(#bd-glow)"'}>${blink}</circle>`

  // The number (or a stack's range) with its status glyph, shrunk to fit.
  const fs = Math.min(21 * u, (CW - 30 * u) / (big.label.length * 0.62 + 1))
  s += `<text x="${n1(g.x)}" y="${n1(T + CH * 0.58)}" font-family="${MONO}" font-size="${n1(fs)}" font-weight="700" text-anchor="middle" fill="${ghost ? '#94a3b8' : '#f1f5f9'}"><tspan font-size="${n1(fs * 0.68)}" fill="${col}">${STATUS_GLYPH[big.status]}</tspan> ${esc(big.label)}</text>`

  // Waiting for the person: a push button on the part, blinking amber.
  if (big.status === 'waiting') {
    const bx = L + 9 * u
    const by = g.y + 1 * u
    const press = still ? '' : `<animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite"/>`
    s += `<g><title>${tr('Wartet auf dich', 'Waiting for you')}</title><rect x="${n1(bx)}" y="${n1(by)}" width="${n1(13 * u)}" height="${n1(13 * u)}" rx="${n1(3 * u)}" fill="#1f2937" stroke="#94a3b8" stroke-width="0.9"/><circle cx="${n1(bx + 6.5 * u)}" cy="${n1(by + 6.5 * u)}" r="${n1(4 * u)}" fill="${ST.waiting}" filter="url(#bd-glow)">${press}</circle></g>`
  }

  // The LEDs: one per slice of the step's calls, coloured by the kind of work.
  const lit = big.kind === 'solid' ? SEG : big.fill > 0 ? Math.max(1, Math.round((Math.min(big.fill, SLOTS) / SLOTS) * SEG)) : 0
  const bw = (CW - 20 * u) / SEG
  const by = T + CH - 16 * u
  for (let k = 0; k < SEG; k++) {
    const x = L + 10 * u + k * bw
    const base = `x="${n1(x)}" y="${n1(by)}" width="${n1(bw - 1.6 * u)}" height="${n1(8 * u)}" rx="${n1(1.2 * u)}"`
    if (k < lit) {
      const kind = big.kinds.length > 0 ? big.kinds[Math.min(big.kinds.length - 1, Math.floor((k * big.kinds.length) / lit))] : undefined
      const c = big.status === 'done' ? ST.done : big.status === 'error' ? ST.error : kind === 'err' ? '#ef4444' : kind ? KIND_COLOR[kind] : col
      // The newest LED flickers on as its call ends.
      const land = big.landing && !still && k === lit - 1 ? `<animate attributeName="opacity" values="0.1;1;0.3;1" dur="0.6s" fill="freeze"/>` : ''
      s += `<rect ${base} fill="${c}">${land}</rect>`
    } else if (k === lit && liveNow) {
      s += `<rect ${base} fill="${col}" fill-opacity="0.15"><animate attributeName="fill-opacity" values="0.12;0.7;0.12" dur="1.2s" repeatCount="indefinite"/></rect>`
    } else s += `<rect ${base} fill="#1a2336"/>`
  }

  // A flash over the package when its step is done just now.
  if (big.justDone && !still) {
    s += `<rect x="${n1(L)}" y="${n1(T)}" width="${n1(CW)}" height="${n1(CH)}" rx="${n1(7 * u)}" fill="#ffffff" opacity="0" pointer-events="none"><animate attributeName="opacity" values="0.75;0" dur="0.9s" fill="freeze"/></rect>`
  }
  if (o.selected) s += `<rect x="${n1(L - 4 * u)}" y="${n1(T - 4 * u)}" width="${n1(CW + 8 * u)}" height="${n1(CH + 8 * u)}" rx="${n1(10 * u)}" fill="none" stroke="#fbbf24" stroke-width="2" filter="url(#bd-glow)"/>`

  // Failed calls as a red count, a warning sign for a stuck step, the last test run and a waiting step's diode as tags.
  let mx = L + 2 * u
  if (big.errors > 0) {
    const er = 7.5 * u
    s += `<g><title>${big.errors} ${tr('fehlgeschlagene Tool-Aufrufe', 'failed tool calls')}</title><circle cx="${n1(mx)}" cy="${n1(T + 1 * u)}" r="${n1(er)}" fill="#ef4444" stroke="#ffffff" stroke-width="1"/><text x="${n1(mx)}" y="${n1(T + 1 * u + er * 0.4)}" font-family="${SANS}" font-size="${n1(er * 1.15)}" font-weight="700" text-anchor="middle" fill="#ffffff">${big.errors > 9 ? '9+' : big.errors}</text></g>`
    mx += 17 * u
  }
  if (big.stuck) {
    const t = 8 * u
    s += `<g><title>${tr('Hängt', 'Stuck')}: ${esc(big.stuck)}</title><path d="M${n1(mx)} ${n1(T - 7 * u)}l${n1(t)} ${n1(t * 1.7)}h${n1(-2 * t)}z" fill="${ST.waiting}" stroke="#0f172a" stroke-opacity="0.6" stroke-width="0.8" stroke-linejoin="round"/><text x="${n1(mx)}" y="${n1(T + 4.5 * u)}" font-family="${SANS}" font-size="${n1(10 * u)}" font-weight="800" text-anchor="middle" fill="#0f172a">!</text></g>`
    // Smoke rising from a part that is stuck, while things move.
    if (!still) {
      for (let k = 0; k < 3; k++) {
        const sx = g.x - 8 * u + k * 8 * u
        s += `<circle cx="${n1(sx)}" cy="${n1(T - 6 * u)}" r="${n1((2.6 + k * 0.6) * u)}" fill="#cbd5e1" opacity="0" pointer-events="none"><animate attributeName="cy" values="${n1(T - 6 * u)};${n1(T - 30 * u)}" dur="2.4s" begin="${n1(k * 0.8)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.45;0" dur="2.4s" begin="${n1(k * 0.8)}s" repeatCount="indefinite"/></circle>`
      }
    }
  }
  if (big.test) {
    const ok = big.test === 'pass'
    s += `<g><title>${ok ? tr('Letzter Testlauf bestanden', 'Last test run passed') : tr('Letzter Testlauf fehlgeschlagen', 'Last test run failed')}</title><rect x="${n1(L + CW - 20 * u)}" y="${n1(T + CH - 5 * u)}" width="${n1(24 * u)}" height="${n1(12 * u)}" rx="${n1(3 * u)}" fill="${ok ? '#16a34a' : '#e11d48'}" stroke="#04080f" stroke-width="1"/><text x="${n1(L + CW - 8 * u)}" y="${n1(T + CH + 4.4 * u)}" font-family="${SANS}" font-size="${n1(9 * u)}" font-weight="700" text-anchor="middle" fill="#ffffff">T${ok ? '✓' : '✕'}</text></g>`
  }
  // A diode at the part that waits for another: blocking in amber, conducting in green once it is free.
  if ((big.blockedBy.length > 0 || big.unlocked) && !mini) {
    const free = big.blockedBy.length === 0
    const c = free ? ST.done : ST.waiting
    const dx = L - 4 * u
    const dy = T + CH - 5 * u
    const fade = free && !still ? `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="2.6s" fill="freeze"/>` : ''
    const title = free ? tr('Frei: der Schritt, auf den er gewartet hat, ist fertig', 'Free: the step it waited for is done') : tr('Wartet auf einen anderen Schritt', 'Waits for another step')
    s +=
      `<g${free && still ? ' opacity="0"' : ''}><title>${title}</title>${fade}<rect x="${n1(dx)}" y="${n1(dy)}" width="${n1(24 * u)}" height="${n1(12 * u)}" rx="${n1(3 * u)}" fill="#04080f" stroke="${c}" stroke-width="1"/>` +
      `<path d="M${n1(dx + 4 * u)} ${n1(dy + 6 * u)}h${n1(4 * u)}M${n1(dx + 8 * u)} ${n1(dy + 2.5 * u)}v${n1(7 * u)}l${n1(7 * u)} ${n1(-3.5 * u)}zM${n1(dx + 15 * u)} ${n1(dy + 2.5 * u)}v${n1(7 * u)}M${n1(dx + 15 * u)} ${n1(dy + 6 * u)}h${n1(5 * u)}" fill="${c}" stroke="${c}" stroke-width="${n1(1.1 * u)}" stroke-linejoin="round"/></g>`
  }
  s += `</g>`

  if (!mini) {
    // Under the part: its name in silkscreen, its time or share, and the lines it changed.
    let cy = T + CH + 18 * u
    if (big.count === 1 && big.name) {
      const max = Math.max(6, Math.floor((CW + 26 * u) / (8.5 * u * 0.6)))
      const name = big.name.replace(/\s+/g, ' ').trim()
      s += `<text x="${n1(g.x)}" y="${n1(cy)}" font-family="${MONO}" font-size="${n1(8.5 * u)}" text-anchor="middle" fill="${theme.silk}" fill-opacity="${ghost ? 0.45 : 0.8}">${esc(name.length > max ? name.slice(0, max - 1) + '…' : name)}</text>`
      cy += 14 * u
    }
    s += `<text x="${n1(g.x)}" y="${n1(cy)}" font-family="${MONO}" font-size="${n1(Math.max(10, 11.5 * u))}" font-weight="600" text-anchor="middle" fill="${theme.text}" fill-opacity="${ghost ? 0.45 : 0.9}">${esc(big.caption)}</text>`
    if (big.added > 0 || big.removed > 0) {
      const k = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))
      const plus = big.added > 0 ? `<tspan fill="${theme.id === 'white' ? '#15803d' : '#4ade80'}">+${k(big.added)}</tspan>` : ''
      const minus = big.removed > 0 ? `<tspan fill="${theme.id === 'white' ? '#be123c' : '#fb7185'}">−${k(big.removed)}</tspan>` : ''
      s += `<text x="${n1(g.x)}" y="${n1(cy + 13 * u)}" font-family="${MONO}" font-size="${n1(Math.max(10, 10.5 * u))}" font-weight="600" text-anchor="middle"><title>${tr(`${big.added} Zeilen hinzugefügt, ${big.removed} entfernt`, `${big.added} lines added, ${big.removed} removed`)}</title>${plus}${plus && minus ? ' ' : ''}${minus}</text>`
    }
  }

  // Agents as probes on the part's top edge; one arriving travels over from where it was.
  const shown = big.badges.slice(0, 3)
  shown.forEach((bd, j) => {
    const bx = L + CW - 26 * u - j * 16 * u
    const byy = T - 7 * u
    const r = 7.6 * u
    const bob = bd.isLive && !still ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.6;0 0" dur="1.8s" begin="${n1(j * 0.3)}s" repeatCount="indefinite"/>` : ''
    const f = flights[j]
    const fly = !f
      ? ''
      : f.via === undefined
        ? `<animateTransform attributeName="transform" type="translate" values="${n1(f.dx)} ${n1(f.dy)};0 0" calcMode="spline" keySplines="0.4 0 0.2 1" dur="0.9s" fill="freeze"/>`
        : `<animateTransform attributeName="transform" type="translate" values="${n1(f.dx)} ${n1(f.dy)};${n1(f.via - (bx - g.x))} ${n1(f.dy)};${n1(f.via - (bx - g.x))} 0;0 0" keyTimes="0;0.3;0.7;1" dur="1.1s" fill="freeze"/>`
    const more = j === 2 && big.badges.length > 3
    s +=
      `<g>${fly}<g><title>${esc(more ? `+${big.badges.length - 2}` : bd.title)}</title>${bob}` +
      `<circle cx="${n1(bx)}" cy="${n1(byy)}" r="${n1(r + 2 * u)}" fill="none" stroke="${bd.color}" stroke-opacity="0.5" stroke-width="1.2"/>` +
      `<circle cx="${n1(bx)}" cy="${n1(byy)}" r="${n1(r)}" fill="${bd.color}" stroke="#04140f" stroke-width="1.4"/>` +
      `<text x="${n1(bx)}" y="${n1(byy + r * 0.4)}" font-family="${SANS}" font-size="${n1(r * 1.1)}" font-weight="700" text-anchor="middle" fill="#0f172a">${more ? '+' : esc(bd.letter)}</text></g></g>`
  })
  return s
}
