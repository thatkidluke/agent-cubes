/**
 * The circuit-board view: the same task as the cubes, drawn as a PCB. Each
 * step is a chip with a row of LEDs for its progress, one LED per slice of its
 * calls and coloured by the kind of work; copper traces join the chips in
 * order, winding from row to row, and carry current once a step is done.
 * Agents sit on the chips they drive as probes; an OLED module along the top
 * shows the whole task and the context window.
 *
 * The board is an object of its own, dark in light and dark mode alike.
 */
import type { CubeRun, CubeStatus } from '../types'
import { foldSteps, KIND_COLOR, sceneSteps, SLOTS, STATUS_GLYPH, stripSmil, type Big, type DrawOptions } from './iso'
import { CONTEXT_AMBER, CONTEXT_RED } from './overlays'
import { tr } from './i18n'
import { esc, memo, n1, phaseLock } from './svg'

const MONO = 'ui-monospace,Consolas,Menlo,monospace'
const SANS = 'system-ui,-apple-system,Segoe UI,sans-serif'
/** LEDs per chip, and the most chips drawn before finished runs fold into one. */
const SEG = 12
const MAX_CHIPS = 24
/** The Svg element's limit on its markup. */
const MAX_SOURCE = 131072

const ST: Record<CubeStatus, string> = { pending: '#64748b', running: '#38bdf8', done: '#34d399', error: '#fb7185', waiting: '#fbbf24' }
const TRACE = '#5eead4'

type Drawing = { source: string; width: number; height: number; alt: string }

export function buildBoard(r: CubeRun, targetWidth: number, now = 0, selected = -1, opts: DrawOptions = {}): Drawing {
  const steps = sceneSteps(r, now)
  const bigs = foldSteps(steps, MAX_CHIPS)
  const posOf: number[] = []
  for (const b of bigs) for (let k = 0; k < b.count; k++) posOf[b.index + k] = b.pos
  const selPos = selected >= 0 && selected < posOf.length ? posOf[selected]! : -1
  const overall = steps.reduce((s, b) => s + (b.status === 'done' ? SLOTS : b.fill), 0) / (SLOTS * steps.length)
  const ctxRaw = opts.context
  const ctx = typeof ctxRaw === 'number' && Number.isFinite(ctxRaw) ? Math.round(Math.max(0, Math.min(1, ctxRaw)) * 100) / 100 : null
  const still = opts.motion === false
  const W = Math.round(Math.max(260, targetWidth))
  const done = steps.filter(b => b.status === 'done').length
  const working = steps.filter(b => b.badges.length > 0).map(b => b.index + 1)
  const alt = tr(
    `Platine: ${done} von ${steps.length} Chips fertig${working.length ? `, gearbeitet wird an Chip ${working.join(', ')}` : ''}`,
    `Circuit board: ${done} of ${steps.length} chips done${working.length ? `, working on chip ${working.join(', ')}` : ''}`,
  )
  // Everything that shows; nothing that only moves with the clock.
  const key = JSON.stringify([W, selPos, ctx, still, overall, bigs])
  return memo('board', key, () => {
    let out = draw(bigs, W, selPos, overall, ctx, done, steps.length, still, 1)
    if (out.source.length > MAX_SOURCE) out = draw(bigs, W, selPos, overall, ctx, done, steps.length, still, 0)
    const source = still ? stripSmil(out.source) : out.source
    return { source: phaseLock(source, now), width: W, height: out.height, alt }
  })
}

function draw(bigs: Big[], W: number, selPos: number, overall: number, ctx: number | null, done: number, total: number, still: boolean, detail: 0 | 1): { source: string; height: number } {
  // One unit scales the board for narrow panes.
  const u = Math.max(0.72, Math.min(1, W / 560))
  const CW = 100 * u
  const CH = 68 * u
  const GX = 40 * u
  const RG = 62 * u
  const side = 30 * u
  const n = bigs.length
  const cols = Math.max(1, Math.min(n, Math.floor((W - 2 * side + GX) / (CW + GX))))
  const rows = Math.ceil(n / cols)
  const gridW = cols * CW + (cols - 1) * GX
  const gx0 = (W - gridW) / 2
  const top = 12
  const dispH = 46 * u
  const gy0 = top + dispH + 32 * u
  const H = Math.ceil(gy0 + rows * CH + (rows - 1) * RG + 58 * u)
  const live = bigs.some(b => b.isLive)
  const allDone = n > 0 && bigs.every(b => b.status === 'done')

  /** Where a chip stands: the rows wind, left to right, then right to left. */
  const at = (pos: number) => {
    const row = Math.floor(pos / cols)
    const c = pos % cols
    const dir = row % 2 ? -1 : 1
    const col = dir > 0 ? c : cols - 1 - c
    return { x: gx0 + col * (CW + GX) + CW / 2, y: gy0 + row * (CH + RG) + CH / 2, row, dir }
  }

  const defs =
    `<linearGradient id="bd-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3a30"/><stop offset="0.55" stop-color="#07271f"/><stop offset="1" stop-color="#041a15"/></linearGradient>` +
    `<linearGradient id="bd-chip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27324a"/><stop offset="0.12" stop-color="#151c2e"/><stop offset="1" stop-color="#0a0f1c"/></linearGradient>` +
    `<linearGradient id="bd-pin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6a1c"/><stop offset="0.5" stop-color="#f6d67a"/><stop offset="1" stop-color="#9a7620"/></linearGradient>` +
    `<linearGradient id="bd-oled" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03110f"/><stop offset="1" stop-color="#010807"/></linearGradient>` +
    `<linearGradient id="bd-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.1"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="bd-light" cx="0.25" cy="0.1" r="0.9"><stop offset="0" stop-color="#5eead4" stop-opacity="0.12"/><stop offset="1" stop-color="#5eead4" stop-opacity="0"/></radialGradient>` +
    `<filter id="bd-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${n1(2.2 * u)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<filter id="bd-drop" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="${n1(2.5 * u)}"/></filter>` +
    (detail > 0
      ? `<pattern id="bd-via" width="${n1(18 * u)}" height="${n1(18 * u)}" patternUnits="userSpaceOnUse"><circle cx="${n1(9 * u)}" cy="${n1(9 * u)}" r="${n1(0.9 * u)}" fill="#14b8a6" fill-opacity="0.28"/></pattern>`
      : '')

  const parts: string[] = []

  // ── The board: solder mask, a fine grid of vias, a lit corner, four mounting holes ──
  parts.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${n1(14 * u)}" fill="url(#bd-bg)" stroke="${allDone ? ST.done : '#0f766e'}" stroke-width="1.5"/>`)
  if (detail > 0) {
    parts.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${n1(14 * u)}" fill="url(#bd-via)"/>`)
    parts.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${n1(14 * u)}" fill="url(#bd-light)"/>`)
    parts.push(`<rect x="${n1(5 * u)}" y="${n1(5 * u)}" width="${n1(W - 10 * u)}" height="${n1(H - 10 * u)}" rx="${n1(10 * u)}" fill="none" stroke="#2dd4bf" stroke-opacity="0.16" stroke-width="0.8"/>`)
    for (const [hx, hy] of [[12, H - 12], [W - 12, H - 12]] as const) {
      parts.push(`<circle cx="${n1(hx * 1)}" cy="${n1(hy)}" r="${n1(4.6 * u)}" fill="#020a08" stroke="url(#bd-pin)" stroke-width="${n1(1.8 * u)}"/>`)
    }
    parts.push(`<text x="${n1(26 * u)}" y="${n1(H - 9 * u)}" font-family="${MONO}" font-size="${n1(8.5 * u)}" letter-spacing="${n1(1.6 * u)}" fill="#5eead4" fill-opacity="0.45">AGENT CUBES · PCB-01</text>`)
  }

  // ── Traces: wide copper, a bright core where current has flowed, pulses running into a chip in work ──
  const traceOf = (d: string, lit: boolean, flowing: boolean) => {
    let s = `<path d="${d}" fill="none" stroke="#0a4a40" stroke-width="${n1(6.5 * u)}" stroke-linecap="round" stroke-linejoin="round"/>`
    s += lit
      ? // A halo drawn as a wider, fainter stroke: a filter draws nothing on a straight line, whose box has no height.
        `<path d="${d}" fill="none" stroke="${TRACE}" stroke-opacity="0.3" stroke-width="${n1(5.5 * u)}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${d}" fill="none" stroke="${TRACE}" stroke-width="${n1(2.2 * u)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${d}" fill="none" stroke="#17806f" stroke-width="${n1(1.6 * u)}" stroke-linecap="round" stroke-linejoin="round"/>`
    if (flowing) {
      s += `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${n1(2.2 * u)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${n1(5 * u)} ${n1(17 * u)}"><animate attributeName="stroke-dashoffset" values="${n1(22 * u)};0" dur="0.7s" repeatCount="indefinite"/></path>`
    }
    return s
  }
  const pad = (x: number, y: number) => `<rect x="${n1(x - 2.5 * u)}" y="${n1(y - 4 * u)}" width="${n1(5 * u)}" height="${n1(8 * u)}" rx="${n1(1.2 * u)}" fill="url(#bd-pin)"/>`

  // The supply: from the display module down to the first chip.
  if (n > 0) {
    const a = at(0)
    const cl = a.x - CW / 2
    const bx = cl - 15 * u
    parts.push(traceOf(`M${n1(bx)} ${n1(top + dispH)}V${n1(a.y)}H${n1(cl)}`, overall > 0 || live, live && bigs[0]!.isLive))
    parts.push(pad(cl, a.y))
  }
  for (let i = 0; i < n - 1; i++) {
    const a = at(i)
    const b = at(i + 1)
    const lit = bigs[i]!.status === 'done'
    const flowing = lit && bigs[i + 1]!.isLive
    if (a.row === b.row) {
      const x1 = a.x + (a.dir * CW) / 2
      const x2 = b.x - (a.dir * CW) / 2
      parts.push(traceOf(`M${n1(x1)} ${n1(a.y)}H${n1(x2)}`, lit, flowing))
      parts.push(pad(x1, a.y), pad(x2, a.y))
      // A small resistor on the line, for the look of it.
      if (detail > 0) {
        const mx = (x1 + x2) / 2
        parts.push(
          `<rect x="${n1(mx - 6 * u)}" y="${n1(a.y - 3.2 * u)}" width="${n1(12 * u)}" height="${n1(6.4 * u)}" rx="${n1(1.5 * u)}" fill="#1b2433" stroke="#94a3b8" stroke-opacity="0.7" stroke-width="0.7"/>` +
            `<rect x="${n1(mx - 2.6 * u)}" y="${n1(a.y - 3.2 * u)}" width="${n1(1.6 * u)}" height="${n1(6.4 * u)}" fill="#f59e0b"/><rect x="${n1(mx + 1 * u)}" y="${n1(a.y - 3.2 * u)}" width="${n1(1.6 * u)}" height="${n1(6.4 * u)}" fill="#a855f7"/>`,
        )
      }
    } else {
      // The turn to the next row: out to the side, down, and back in.
      const sx = a.x + (a.dir * CW) / 2
      const ox = sx + a.dir * 17 * u
      parts.push(traceOf(`M${n1(sx)} ${n1(a.y)}H${n1(ox)}V${n1(b.y)}H${n1(sx)}`, lit, flowing))
      parts.push(pad(sx, a.y), pad(sx, b.y))
    }
  }

  // ── The display module: the whole task in LEDs, the chips done, the context window ──
  {
    const x = side - 10 * u
    const w = W - 2 * x
    const pct = Math.round(Math.max(0, Math.min(1, overall)) * 100)
    let s = `<rect x="${n1(x)}" y="${top}" width="${n1(w)}" height="${n1(dispH)}" rx="${n1(7 * u)}" fill="#020a08" opacity="0.55" filter="url(#bd-drop)"/>`
    s += `<rect x="${n1(x)}" y="${top}" width="${n1(w)}" height="${n1(dispH)}" rx="${n1(7 * u)}" fill="url(#bd-oled)" stroke="#134e4a" stroke-width="1.2"/>`
    s += `<text x="${n1(x + 11 * u)}" y="${n1(top + dispH * 0.68)}" font-family="${MONO}" font-size="${n1(21 * u)}" font-weight="700" fill="${allDone ? ST.done : TRACE}" filter="url(#bd-glow)">${pct}%</text>`
    const rightW = 104 * u
    const barX = x + 72 * u
    const barW = w - 72 * u - rightW - 10 * u
    if (barW > 50 * u) {
      const segs = Math.max(8, Math.min(28, Math.floor(barW / (7 * u))))
      const sw = barW / segs
      const lit = Math.round(Math.max(0, Math.min(1, overall)) * segs)
      for (let k = 0; k < segs; k++) {
        const on = k < lit
        const blink = !on && k === lit && live ? `<animate attributeName="fill-opacity" values="0.12;0.75;0.12" dur="1.2s" repeatCount="indefinite"/>` : ''
        s += `<rect x="${n1(barX + k * sw)}" y="${n1(top + dispH / 2 - 6.5 * u)}" width="${n1(sw - 1.8 * u)}" height="${n1(13 * u)}" rx="${n1(1.4 * u)}" fill="${on ? (allDone ? ST.done : TRACE) : blink ? TRACE : '#0c3a34'}"${blink ? ' fill-opacity="0.12"' : ''}>${blink}</rect>`
      }
    }
    const rx = x + w - rightW
    const ctxCol = ctx === null ? '#5b7f7a' : ctx >= CONTEXT_RED ? ST.error : ctx >= CONTEXT_AMBER ? ST.waiting : '#99f6e4'
    s += `<text x="${n1(rx)}" y="${n1(top + dispH * 0.42)}" font-family="${MONO}" font-size="${n1(10.5 * u)}" fill="#99f6e4">CHIPS <tspan font-weight="700">${done}/${total}</tspan></text>`
    s += `<text x="${n1(rx)}" y="${n1(top + dispH * 0.78)}" font-family="${MONO}" font-size="${n1(10.5 * u)}" fill="${ctxCol}"><title>${tr('Füllstand des Kontextfensters', 'How full the context window is')}</title>CTX <tspan font-weight="700">${ctx === null ? '--' : Math.round(ctx * 100) + '%'}</tspan></text>`
    if (ctx !== null) {
      const bw = 34 * u
      s += `<rect x="${n1(rx + 62 * u)}" y="${n1(top + dispH * 0.78 - 8 * u)}" width="${n1(bw)}" height="${n1(8 * u)}" rx="${n1(2 * u)}" fill="#0c3a34"/><rect x="${n1(rx + 62 * u)}" y="${n1(top + dispH * 0.78 - 8 * u)}" width="${n1(bw * ctx)}" height="${n1(8 * u)}" rx="${n1(2 * u)}" fill="${ctxCol}"/>`
    }
    s += `<rect x="${n1(x)}" y="${top}" width="${n1(w)}" height="${n1(dispH)}" rx="${n1(7 * u)}" fill="url(#bd-gloss)"/>`
    parts.push(s)
  }

  // ── The chips ──
  for (const big of bigs) parts.push(chip(big, at(big.pos), { u, CW, CH, still, selected: big.pos === selPos, detail }))

  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${parts.join('')}</svg>`
  return { source, height: H }
}

type ChipOptions = { u: number; CW: number; CH: number; still: boolean; selected: boolean; detail: 0 | 1 }

/** One step as a chip: pins, a body in its status colour, its number, a row of LEDs, and what sits on it. */
function chip(big: Big, at: { x: number; y: number }, o: ChipOptions): string {
  const { u, CW, CH, still } = o
  const L = at.x - CW / 2
  const T = at.y - CH / 2
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
  for (let k = 1; k <= 7; k++) {
    const px = L + (CW * k) / 8 - pw / 2
    pins += `<rect x="${n1(px)}" y="${n1(T - 6 * u)}" width="${n1(pw)}" height="${n1(7 * u)}" rx="${n1(1 * u)}"/><rect x="${n1(px)}" y="${n1(T + CH - 1 * u)}" width="${n1(pw)}" height="${n1(7 * u)}" rx="${n1(1 * u)}"/>`
  }
  s += `<g fill="url(#bd-pin)">${pins}</g>`

  // The package: its edge in the status colour, glowing and breathing while in work.
  const breathe = liveNow ? `<animate attributeName="stroke-opacity" values="1;0.4;1" dur="${big.status === 'waiting' ? '0.9s' : '1.6s'}" repeatCount="indefinite"/>` : ''
  s += `<rect x="${n1(L)}" y="${n1(T)}" width="${n1(CW)}" height="${n1(CH)}" rx="${n1(7 * u)}" fill="url(#bd-chip)" stroke="${col}" stroke-width="${big.isLive ? n1(1.9 * u) : n1(1.2 * u)}"${ghost ? ' stroke-dasharray="3 3"' : ''}${big.isLive ? ' filter="url(#bd-glow)"' : ''}>${breathe}</rect>`
  if (o.detail > 0) {
    s += `<rect x="${n1(L)}" y="${n1(T)}" width="${n1(CW)}" height="${n1(CH)}" rx="${n1(7 * u)}" fill="url(#bd-gloss)"/>`
    s += `<path d="M${n1(L)} ${n1(at.y - 5 * u)}a${n1(5 * u)} ${n1(5 * u)} 0 0 1 0 ${n1(10 * u)}" fill="#04080f" stroke="${col}" stroke-opacity="0.5" stroke-width="0.8"/>`
    s += `<circle cx="${n1(L + 11 * u)}" cy="${n1(T + 10 * u)}" r="${n1(2 * u)}" fill="none" stroke="#64748b" stroke-width="0.8"/>`
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
  s += `<text x="${n1(at.x)}" y="${n1(T + CH * 0.5)}" font-family="${MONO}" font-size="${n1(fs)}" font-weight="700" text-anchor="middle" fill="${ghost ? '#94a3b8' : '#f1f5f9'}"><tspan font-size="${n1(fs * 0.68)}" fill="${col}">${STATUS_GLYPH[big.status]}</tspan> ${esc(big.label)}</text>`

  // The LEDs: one per slice of the step's calls, coloured by the kind of work.
  const lit = big.kind === 'solid' ? SEG : big.fill > 0 ? Math.max(1, Math.round((Math.min(big.fill, SLOTS) / SLOTS) * SEG)) : 0
  const bw = (CW - 20 * u) / SEG
  const by = T + CH - 18 * u
  for (let k = 0; k < SEG; k++) {
    const x = L + 10 * u + k * bw
    const base = `x="${n1(x)}" y="${n1(by)}" width="${n1(bw - 1.6 * u)}" height="${n1(8.5 * u)}" rx="${n1(1.2 * u)}"`
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

  // Failed calls as a red count, a warning sign for a stuck step, the last test run as a tag.
  let mx = L + 2 * u
  if (big.errors > 0) {
    const er = 7.5 * u
    s += `<g><title>${big.errors} ${tr('fehlgeschlagene Tool-Aufrufe', 'failed tool calls')}</title><circle cx="${n1(mx)}" cy="${n1(T + 1 * u)}" r="${n1(er)}" fill="#ef4444" stroke="#ffffff" stroke-width="1"/><text x="${n1(mx)}" y="${n1(T + 1 * u + er * 0.4)}" font-family="${SANS}" font-size="${n1(er * 1.15)}" font-weight="700" text-anchor="middle" fill="#ffffff">${big.errors > 9 ? '9+' : big.errors}</text></g>`
    mx += 17 * u
  }
  if (big.stuck) {
    const t = 8 * u
    s += `<g><title>${tr('Hängt', 'Stuck')}: ${esc(big.stuck)}</title><path d="M${n1(mx)} ${n1(T - 7 * u)}l${n1(t)} ${n1(t * 1.7)}h${n1(-2 * t)}z" fill="${ST.waiting}" stroke="#0f172a" stroke-opacity="0.6" stroke-width="0.8" stroke-linejoin="round"/><text x="${n1(mx)}" y="${n1(T + 4.5 * u)}" font-family="${SANS}" font-size="${n1(10 * u)}" font-weight="800" text-anchor="middle" fill="#0f172a">!</text></g>`
  }
  if (big.test) {
    const ok = big.test === 'pass'
    s += `<g><title>${ok ? tr('Letzter Testlauf bestanden', 'Last test run passed') : tr('Letzter Testlauf fehlgeschlagen', 'Last test run failed')}</title><rect x="${n1(L + CW - 20 * u)}" y="${n1(T + CH - 5 * u)}" width="${n1(24 * u)}" height="${n1(12 * u)}" rx="${n1(3 * u)}" fill="${ok ? '#16a34a' : '#e11d48'}" stroke="#04080f" stroke-width="1"/><text x="${n1(L + CW - 8 * u)}" y="${n1(T + CH + 4.4 * u)}" font-family="${SANS}" font-size="${n1(9 * u)}" font-weight="700" text-anchor="middle" fill="#ffffff">T${ok ? '✓' : '✕'}</text></g>`
  }
  s += `</g>`

  // Under the chip: its time or share, and the lines it changed.
  const cy = T + CH + 20 * u
  s += `<text x="${n1(at.x)}" y="${n1(cy)}" font-family="${MONO}" font-size="${n1(Math.max(10, 11.5 * u))}" font-weight="600" text-anchor="middle" fill="#d1fae5" fill-opacity="${ghost ? 0.45 : 0.9}">${esc(big.caption)}</text>`
  if (big.added > 0 || big.removed > 0) {
    const k = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))
    const plus = big.added > 0 ? `<tspan fill="#4ade80">+${k(big.added)}</tspan>` : ''
    const minus = big.removed > 0 ? `<tspan fill="#fb7185">−${k(big.removed)}</tspan>` : ''
    s += `<text x="${n1(at.x)}" y="${n1(cy + 13 * u)}" font-family="${MONO}" font-size="${n1(Math.max(10, 10.5 * u))}" font-weight="600" text-anchor="middle"><title>${tr(`${big.added} Zeilen hinzugefügt, ${big.removed} entfernt`, `${big.added} lines added, ${big.removed} removed`)}</title>${plus}${plus && minus ? ' ' : ''}${minus}</text>`
  }

  // Agents as probes on the chip's top edge.
  const shown = big.badges.slice(0, 3)
  shown.forEach((bd, j) => {
    const bx = L + CW - 26 * u - j * 16 * u
    const byy = T - 7 * u
    const r = 7.6 * u
    const bob = bd.isLive && !still ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.6;0 0" dur="1.8s" begin="${n1(j * 0.3)}s" repeatCount="indefinite"/>` : ''
    const more = j === 2 && big.badges.length > 3
    s +=
      `<g><title>${esc(more ? `+${big.badges.length - 2}` : bd.title)}</title>${bob}` +
      `<circle cx="${n1(bx)}" cy="${n1(byy)}" r="${n1(r + 2 * u)}" fill="none" stroke="${bd.color}" stroke-opacity="0.5" stroke-width="1.2"/>` +
      `<circle cx="${n1(bx)}" cy="${n1(byy)}" r="${n1(r)}" fill="${bd.color}" stroke="#04140f" stroke-width="1.4"/>` +
      `<text x="${n1(bx)}" y="${n1(byy + r * 0.4)}" font-family="${SANS}" font-size="${n1(r * 1.1)}" font-weight="700" text-anchor="middle" fill="#0f172a">${more ? '+' : esc(bd.letter)}</text></g>`
  })
  return s
}
