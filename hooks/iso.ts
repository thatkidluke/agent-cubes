/**
 * The cubes: the scene drawn as glass cubes on a pedestal, in a skin. One row,
 * or two for a long plan; a cache hands back the same drawing while nothing
 * that shows has changed.
 */
import type { CubeRun } from '../types'
import { classic, CLASSIC_CAPTION_DARK } from './skins/classic'
import type { CubeCtx, MiniKind, SceneCtx, Skin } from './skins/types'
import { box, type Box, esc, fmt, lin, line, mix, n1, phaseLock, pline, poly, rad } from './svg'
import type { Pt } from './svg'
import { pipeBandPx, pipeDefs, progressPipe, type PipeGeometry } from './pipe'
import { tr } from './i18n'
import { contextTank, cracks, dependencies, smoke, testSeal } from './overlays'
import type { Detail } from './overlays'
import { fold, layout, MAX_POS, MAX_POS_TWO_ROWS, N, SLOTS, STATUS_GLYPH, TWO_ROWS_FROM, WORK_COLOR, type Big } from './scene'

// The scene's colours and words, for those who have always found them here.
export { agentColor, agentInitial, KIND_COLOR, WORK_COLOR, MAIN_COLOR, PALETTE, STATUS_GLYPH, STATUS_LABEL } from './scene'

/** The Svg element's limit on its markup. */
const MAX_SOURCE = 131072
/** In compact mode (many cubes) the drawing drops ornament past this size. */
const COMPACT_BUDGET = 100_000

// Side view: an oblique projection. u runs along the timeline (right), w is
// up, v is depth, drawn up and to the right.
const DX = 0.42
const DY = 0.3
/** Distance from one cube's left edge to the next one's. */
const PITCH = 1.3
/** Pedestal: how far it reaches in front of and behind the cubes, and its height. */
const PED_FRONT = -0.4
const PED_BACK = 1.18
const PED_H = 0.95
const FOOT = 0.14
/** Caption sizes under the plaques: readable at a glance, never under 10 px. */
const capSize = (S: number) => Math.max(10, S * 0.26)
const diffSize = (S: number) => Math.max(10, S * 0.24)
/**
 * Drops every SMIL animation from markup: elements moved along a path by
 * <animateMotion> (they have no sensible resting place) go entirely, the
 * animation elements themselves are cut out of the rest.
 */
export function stripSmil(s: string): string {
  if (!/<(animate|set)/.test(s)) return s
  return s
    .replace(/<(g|circle|ellipse|rect|path|polygon|polyline|use|text|image)\b[^>]*>(?:(?!<\1[\s>/])(?!<\/\1>)[\s\S])*?<animateMotion\b(?:(?!<\1[\s>/])(?!<\/\1>)[\s\S])*?<\/\1>/g, '')
    .replace(/<(animate|animateTransform|animateMotion|animateColor|set)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/g, '')
}

/** Polylines as one path's data: "M x y L x y …" per run of points. */
const pathD = (runs: Pt[][]) => runs.map(ps => ps.map(([x, y], k) => `${k ? 'L' : 'M'}${n1(x)} ${n1(y)}`).join('')).join('')

/** Fill order: layer by layer from the bottom, back row first, left to right, so the level visibly rises. */
const FILL_ORDER: [number, number, number][] = (() => {
  const out: [number, number, number][] = []
  for (let k = 0; k < N; k++) for (let j = N - 1; j >= 0; j--) for (let i = 0; i < N; i++) out.push([i, j, k])
  return out
})()

/** A skin hook's markup; a hook that throws costs its decoration, never the drawing. */
function safe(fn: (() => string) | undefined): string {
  if (!fn) return ''
  try {
    return fn()
  } catch {
    return ''
  }
}

/** Extra facts the drawing shows that are not part of the run. */
export type DrawOptions = {
  /** The session's context-window fill, 0..1. */
  context?: number | null
  /** false draws a still picture: no SMIL animation at all (reduced motion, battery). Default true. */
  motion?: boolean
}

/** What one drawing is made from: the cubes after folding and the facts around them. */
type Scene = {
  /** The cubes to draw, one per position. */
  bigs: Big[]
  /** Each step's position. */
  posOf: number[]
  /** Overall progress 0..1 over every step. */
  overall: number
  targetWidth: number
  /** The selected cube's position, or -1. */
  selPos: number
  /** The context window's fill, rounded to whole percent; null when unknown. */
  ctxFill: number | null
  /** Draw a still picture, no SMIL. */
  still: boolean
  /** Every step is done and the last one just now: the finale plays once. */
  finale: boolean
}

/**
 * How a row is drawn when the cubes stand in two: the back row `bare` (no
 * tank, pipe or skin overlay, the front row has those), the front row
 * with `extraTop` px of room above it, where the back row goes.
 */
type RowOptions = { bare?: boolean; extraTop?: number; /** Cubes in both rows together: the pipe gets a coupling per cube of the whole task. */ totalCubes?: number }

function render(sc: Scene, detail: Detail, skin: Skin, row: RowOptions = {}) {
  const { bigs, posOf, overall, targetWidth, selPos, ctxFill, still } = sc
  const n = bigs.length
  const pad = 10
  const uStart = -0.32
  const uEnd = (n - 1) * PITCH + 1 + 0.32
  const fit = (span: number) => Math.max(14, Math.min(64, (targetWidth - 2 * pad) / span))
  // Skin hook markup loses its animation in a still picture.
  const hook = (fn: (() => string) | undefined) => (still ? stripSmil(safe(fn)) : safe(fn))
  const spanU0 = uEnd - uStart + 0.2 + (PED_BACK - PED_FRONT) * DX
  // The context tank's label sits right of the pedestal: make room for "100 %".
  const S0 = fit(spanU0)
  const spanU = spanU0 + (ctxFill === null ? 0 : 0.12 + (capSize(S0) * 0.62 * 5 * 1.2) / S0)
  const S = fit(spanU)
  const cs = capSize(S)
  const ds = diffSize(S)
  // The captions, and a diff line under them, need room: the pedestal grows to fit them.
  const anyDiff = bigs.some(b => b.added > 0 || b.removed > 0)
  // The progress pipe gets its own band at the pedestal's foot, under the plaques and captions.
  const pipeR = Math.max(3.5, S * 0.085)
  const pipeBand = row.bare ? 0 : pipeBandPx(pipeR) / S
  const pedH = Math.max(PED_H, 0.8 + (0.4 * cs + (anyDiff ? 1.35 * ds : 0)) / S + 0.06) + pipeBand
  const badgeR = Math.max(7, S * 0.2)
  const drop = S * 0.9
  const above = Math.max(drop, S * 0.42 + badgeR * 2 + 6)
  const width = Math.ceil(spanU * S + 2 * pad)
  const ox = pad - (uStart - 0.1 + PED_FRONT * DX) * S
  const oy = pad + above + (1 + DY) * S + (row.extraTop ?? 0)
  const height = Math.ceil(oy + (pedH + FOOT - (PED_FRONT - 0.08) * DY) * S + pad)
  const P = (u: number, v: number, w: number): Pt => [ox + (u + v * DX) * S, oy - (w + v * DY) * S]
  const Pr = (u: number, v: number, w: number): Pt => [(u + v * DX) * S, -(w + v * DY) * S]
  const cubeU = (i: number) => i * PITCH

  const statuses = [...new Set(bigs.map(b => b.status))]
  const hasLive = bigs.some(b => b.isLive)
  // In a still picture nothing moves: no sweep, glint, sparks or pulses.
  const moving = hasLive && !still
  const ped = box(P, uStart, uEnd, PED_FRONT, PED_BACK, -pedH, 0)
  const ctx: SceneCtx = { width, height, S, detail, hasLive, n, P, pedestal: ped, cubeU, overall, context: ctxFill }
  const pipe: PipeGeometry = {
    x0: P(uStart, PED_FRONT, 0)[0] + pipeR * 3.4,
    x1: P(uEnd, PED_FRONT, 0)[0] - pipeR * 3.4,
    y: P(0, PED_FRONT, -pedH)[1] - (pipeBand * S) / 2 - 1,
    r: pipeR,
    joints: Array.from({ length: Math.max(0, n - 1) }, (_, k) => P(cubeU(k + 1) - (PITCH - 1) / 2, PED_FRONT, 0)[0]),
  }
  // In two rows the pipe stands for every cube of the task: its couplings spread evenly over its length.
  if (row.totalCubes && row.totalCubes > 1) {
    const total = row.totalCubes
    pipe.joints = Array.from({ length: total - 1 }, (_, k) => pipe.x0 + ((pipe.x1 - pipe.x0) * (k + 1)) / total)
  }

  // ── Definitions ──
  const defs: string[] = []
  for (const s of statuses) {
    const [t, f, sd] = skin.status[s]
    defs.push(lin(`${s}T`, 1, 1, [[0, mix(t, '#ffffff', 0.5)], [1, t]]))
    defs.push(lin(`${s}F`, 0, 1, [[0, mix(f, '#ffffff', 0.18)], [1, mix(f, '#000000', 0.22)]]))
    defs.push(lin(`${s}S`, 0, 1, [[0, sd], [1, mix(sd, '#000000', 0.35)]]))
    defs.push(lin(`${s}G`, 0, 1, [[0, t, skin.glass.top], [1, f, skin.glass.bottom]]))
  }
  const pd = skin.pedestal
  defs.push(lin('pF', 0, 1, [[0, pd.front[0]], [0.5, pd.front[1]], [1, pd.front[2]]]))
  defs.push(lin('pT', 0, 1, [[0, pd.top[0]], [1, pd.top[1]]]))
  defs.push(lin('pS', 0, 1, [[0, pd.side[0]], [1, pd.side[1]]]))
  defs.push(lin('plq', 0, 1, [[0, skin.plaque.frame[0]], [1, skin.plaque.frame[1]]]))
  defs.push(lin('plqIn', 0, 1, [[0, skin.plaque.inner[0]], [1, skin.plaque.inner[1]]]))
  defs.push(pipeDefs(pipe, skin, moving))
  // Mood lights: a warm spot for a step that waits for you, a red glow for one that is stuck.
  defs.push(
    lin('mood-cone', 0, 1, [[0, '#fde68a', 0], [0.55, '#fbbf24', 0.16], [1, '#f59e0b', 0.32]]) +
      rad('mood-amber', [[0, '#fbbf24', 0.45], [1, '#fbbf24', 0]]) +
      rad('mood-red', [[0, '#ef4444', 0.42], [0.6, '#ef4444', 0.14], [1, '#ef4444', 0]]),
  )
  // Reflections on the polished pedestal top: the cube's colour fading towards the front edge.
  for (const st of statuses) defs.push(lin(`rf-${st}`, 0, 1, [[0, skin.status[st][1], 0.38], [1, skin.status[st][1], 0]]))
  if (moving && detail > 0) {
    defs.push(
      lin('sh', 1, 0.5, [[0, '#ffffff', 0], [0.42, '#ffffff', 0], [0.5, '#ffffff', 0.5], [0.58, '#ffffff', 0]],
        '<animateTransform attributeName="gradientTransform" type="translate" values="-1 0;1 0;1 0" keyTimes="0;0.6;1" dur="3s" repeatCount="indefinite"/>'),
    )
  }
  defs.push(`<filter id="sd" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n1(Math.max(1.2, S * 0.06))}"/></filter>`)
  defs.push(`<filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${n1(Math.max(1.5, S * 0.05))}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`)

  // One mini cube per kind of work, tinted, drawn once and placed with <use>.
  const pIn = 0.05
  const cell = (1 - 2 * pIn) / N
  const q = 0.09
  const ms = cell * (1 - 2 * q)
  const mb = box(Pr, 0, ms, 0, ms, 0, ms)
  const mi = skin.mini
  const usedKinds = new Set<MiniKind>(['other', ...bigs.flatMap(b => b.kinds)])
  for (const k of usedKinds) {
    // A skin that names no tint for a finer kind of work gets the panel's colour, as strong as its own.
    const [tint, amount] = skin.tint[k] ?? [k === 'err' ? '#ef4444' : WORK_COLOR[k], skin.tint.read[1]]
    const tc = (c: string) => (amount ? mix(c, tint, amount) : c)
    defs.push(lin(`mT-${k}`, 1, 1, [[0, tc(mi.top[0])], [1, tc(mi.top[1])]]))
    defs.push(lin(`mF-${k}`, 0, 1, [[0, tc(mi.front[0])], [1, tc(mi.front[1])]]))
    defs.push(lin(`mS-${k}`, 0, 1, [[0, tc(mi.side[0])], [1, tc(mi.side[1])]]))
    defs.push(
      `<g id="m-${k}">` +
        poly(mb.front, `fill="url(#mF-${k})" class="e"`) +
        poly(mb.right, `fill="url(#mS-${k})" class="e"`) +
        poly(mb.top, `fill="url(#mT-${k})" class="e"`) +
        (detail > 0 ? pline([mb.front[3], mb.front[2], mb.right[2]], `fill="none" stroke="${mi.highlight}" stroke-opacity="0.75" stroke-width="0.6"`) : '') +
        `</g>`,
    )
  }
  if (moving && detail > 1) {
    // A glint laid over a mini cube, in three phases so it runs through the pile like a wave.
    for (let k = 0; k < 3; k++) {
      defs.push(
        `<polygon id="g${k}" points="${mb.front.map(fmt).join(' ')}" fill="${mi.glint}" opacity="0">` +
          `<animate attributeName="opacity" values="0;0.6;0" dur="2.4s" begin="${k * 0.8}s" repeatCount="indefinite"/></polygon>`,
      )
    }
  }
  defs.push(hook(skin.defs && (() => skin.defs!(ctx))))

  const css =
    `<style>.e{stroke:${skin.edge.color};stroke-opacity:${skin.edge.opacity};stroke-width:.7;stroke-linejoin:round}` +
    `.t{font-family:${skin.font};font-weight:700}` +
    // Classic's dark captions turn light, with a dark halo, when the pane is dark.
    (skin.id === 'classic' ? `@media (prefers-color-scheme:dark){.cap{fill:${CLASSIC_CAPTION_DARK};paint-order:stroke;stroke:#0f172a;stroke-opacity:.5;stroke-width:2px}}` : '') +
    // Skins on dark, busy grounds (brick, wood, stars) get a dark halo so small captions stay legible.
    (skin.id !== 'classic' && skin.id !== 'minimal' ? `.cap{paint-order:stroke;stroke:#000;stroke-opacity:.6;stroke-width:2.2px;stroke-linejoin:round}` : '') +
    // No backdrop: the scene stands free on the pane. What is written beside the pedestal turns dark on a light pane.
    `@media (prefers-color-scheme:light){.acd-bgtxt{fill:#334155;stroke:none}.acd-bgval{filter:brightness(.62) saturate(1.25)}}` +
    `</style>`
  const parts: string[] = []
  const overlay: string[] = []


  // ── Pedestal: a foot, the block, a bevel ──
  {
    const foot = box(P, uStart - 0.08, uEnd + 0.08, PED_FRONT - 0.08, PED_BACK + 0.08, -pedH - FOOT, -pedH)
    parts.push(poly(foot.bottom.map(p => [p[0] + S * 0.1, p[1] + S * 0.06] as Pt), `fill="${pd.shadow}" opacity="0.25" filter="url(#sd)"`))
    parts.push(poly(foot.front, 'fill="url(#pS)" class="e"'), poly(foot.right, `fill="${pd.footSide}" class="e"`), poly(foot.top, `fill="${pd.footTop}" class="e"`))
    parts.push(poly(ped.front, 'fill="url(#pF)" class="e"'), poly(ped.right, 'fill="url(#pS)" class="e"'), poly(ped.top, 'fill="url(#pT)" class="e"'))
    parts.push(line(ped.front[3], ped.front[2], `stroke="${pd.light}" stroke-opacity="0.8" stroke-width="1.2"`))
    parts.push(line(ped.front[0], ped.front[1], `stroke="${pd.shadow}" stroke-opacity="0.35" stroke-width="1"`))
    parts.push(line(ped.front[2], ped.top[2], `stroke="${pd.light}" stroke-opacity="0.45" stroke-width="0.9"`))
  }
  if (row.extraTop) parts.push('<!--back-row-->')
  parts.push(hook(skin.pedestalDecor && (() => skin.pedestalDecor!(ctx))))
  if (ctxFill !== null && !row.bare) parts.push(safe(() => contextTank(ctxFill, P, S, uEnd, pedH, PED_BACK, cs, detail, skin, still)))

  // ── The progress pipe, in its own band at the pedestal's foot ──
  if (!row.bare) parts.push(progressPipe(pipe, overall, skin, moving, detail, skin.track.groove, pd.light))

  // ── Plaques: an embossed number per step on the pedestal's front, its time below ──
  for (const big of bigs) {
    const cu = cubeU(big.pos) + 0.5
    const pw = 0.74
    const top = -0.14
    const ph = 0.46
    const [lx, ly] = P(cu - pw / 2, PED_FRONT, top)
    const [rx, ry] = P(cu + pw / 2, PED_FRONT, top - ph)
    const w = rx - lx
    const h = ry - ly
    const inset = Math.max(1.5, S * 0.05)
    const led = big.isGhost ? '#475569' : skin.status[big.status][1]
    const lit = skin.plaque.text[big.status]
    // The number (or a stack's range) with its status glyph in front, shrunk to fit the plaque.
    const num = big.label
    const glyph = STATUS_GLYPH[big.status]
    const fs = Math.min(Math.max(8, h * 0.55), (w - 2 * inset) / (num.length * 0.62 + 0.95))
    const gs = n1(fs * 0.7)
    const lab = `<tspan font-size="${gs}">${glyph}</tspan> ${num}`
    // A step finished just now: its plaque flips over like a split-flap sign.
    const flip = big.justDone && !still
    const fcx = n1(lx + w / 2)
    const fcy = n1(ly + h / 2)
    parts.push(
      (flip ? `<g transform="translate(${fcx} ${fcy})"><g><animateTransform attributeName="transform" type="scale" values="1 1;1 0.04;1 1" keyTimes="0;0.45;1" dur="0.7s" fill="freeze"/><g transform="translate(-${fcx} -${fcy})">` : '') +
      `<g><title>${esc(big.title)}</title>` +
        (skin.effects?.plaqueShadow === false ? '' : `<rect x="${n1(lx + 0.8)}" y="${n1(ly + 1.2)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(S * 0.06)}" fill="#0f172a" opacity="0.3" filter="url(#sd)"/>`) +
        `<rect x="${n1(lx)}" y="${n1(ly)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(S * 0.06)}" fill="url(#plq)" stroke="#475569" stroke-opacity="0.6" stroke-width="0.8"/>` +
        `<rect x="${n1(lx + inset)}" y="${n1(ly + inset)}" width="${n1(w - 2 * inset)}" height="${n1(h - 2 * inset)}" rx="${n1(S * 0.04)}" fill="url(#plqIn)"/>` +
        line([lx + inset, ly + inset + 0.5], [lx + w - inset, ly + inset + 0.5], 'stroke="#000000" stroke-opacity="0.45" stroke-width="1"') +
        `<circle cx="${n1(lx + w - inset * 2.1)}" cy="${n1(ly + inset * 2.1)}" r="${n1(Math.max(1.4, S * 0.035))}" fill="${led}"${big.isLive ? ' filter="url(#gl)"' : ''}>` +
        (big.isLive && !still ? '<animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/>' : '') +
        `</circle>` +
        `<text class="t" x="${n1(lx + w / 2)}" y="${n1(ly + h / 2 + fs * 0.36 + 0.9)}" font-size="${n1(fs)}" fill="#000000" opacity="0.6" text-anchor="middle">${lab}</text>` +
        `<text class="t" x="${n1(lx + w / 2)}" y="${n1(ly + h / 2 + fs * 0.36)}" font-size="${n1(fs)}" fill="${lit}" text-anchor="middle"${big.isLive ? ' filter="url(#gl)"' : ''}>${lab}</text>` +
        `</g>` +
        (flip ? '</g></g></g>' : ''),
    )
    if (big.pos === selPos) {
      parts.push(
        `<rect x="${n1(lx - 2.5)}" y="${n1(ly - 2.5)}" width="${n1(w + 5)}" height="${n1(h + 5)}" rx="${n1(S * 0.08)}" fill="none" stroke="#fbbf24" stroke-width="2" filter="url(#gl)"/>`,
      )
    }
    if (big.errors > 0) {
      const er = Math.max(5, S * 0.12)
      parts.push(
        `<g><title>${big.errors} ${tr('fehlgeschlagene Tool-Aufrufe', 'failed tool calls')}</title>` +
          `<circle cx="${n1(lx + 1)}" cy="${n1(ly + 1)}" r="${n1(er)}" fill="#ef4444" stroke="#ffffff" stroke-width="1"/>` +
          `<text class="t" x="${n1(lx + 1)}" y="${n1(ly + 1 + er * 0.4)}" font-size="${n1(er * 1.1)}" fill="#ffffff" text-anchor="middle">${big.errors > 9 ? '9+' : big.errors}</text></g>`,
      )
    }
    const [cx, cy] = P(cu, PED_FRONT, top - ph - 0.2)
    parts.push(`<text class="t cap" x="${n1(cx)}" y="${n1(cy + cs * 0.35)}" font-size="${n1(cs)}" fill="${skin.plaque.caption}" fill-opacity="0.8" text-anchor="middle">${esc(big.caption)}</text>`)
    if (big.added > 0 || big.removed > 0) {
      // The step's diff as a second caption line: +added −removed.
      const k = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))
      const plus = big.added > 0 ? `<tspan fill="${skin.status.done[1]}">+${k(big.added)}</tspan>` : ''
      const minus = big.removed > 0 ? `<tspan fill="${skin.status.error[1]}">−${k(big.removed)}</tspan>` : ''
      parts.push(
        `<text class="t cap" x="${n1(cx)}" y="${n1(cy + cs * 0.35 + ds * 1.15)}" font-size="${n1(ds)}" text-anchor="middle">` +
          `<title>${tr(`${big.added} Zeilen hinzugefügt, ${big.removed} entfernt`, `${big.added} lines added, ${big.removed} removed`)}</title>${plus}${plus && minus ? ' ' : ''}${minus}</text>`,
      )
    }
    if (big.stuck) {
      // A warning triangle right of the plaque.
      const triR = Math.max(5, S * 0.14)
      const tx = lx + w + triR * 0.35 + 2
      const ty = ly + 1
      parts.push(
        `<g><title>${tr('Hängt', 'Stuck')}: ${esc(big.stuck)}</title>` +
          poly([[tx + triR, ty], [tx + triR * 2, ty + triR * 1.75], [tx, ty + triR * 1.75]], `fill="${skin.status.waiting[1]}" stroke="#0f172a" stroke-opacity="0.6" stroke-width="0.8" stroke-linejoin="round"`) +
          `<text class="t" x="${n1(tx + triR)}" y="${n1(ty + triR * 1.55)}" font-size="${n1(triR * 1.25)}" fill="#0f172a" text-anchor="middle">!</text></g>`,
      )
    }
  }

  // ── Cubes, left to right ──
  for (const big of bigs) {
    const u0 = cubeU(big.pos)
    const u1 = u0 + 1
    const v0 = 0
    const v1 = 1
    const w0 = 0
    const w1 = 1
    const b = box(P, u0, u1, v0, v1, w0, w1)
    const s = big.status
    const [cTop, cFront, cSide] = skin.status[s]
    const onFront = (a: number, c: number): Pt => P(u0 + a, v0, w0 + c)
    const cube: CubeCtx = {
      // Skins place things with cubeU(index): the position, not the step.
      index: big.pos,
      status: s,
      kind: big.kind,
      isLive: big.isLive,
      isGhost: big.isGhost,
      // A still picture plays no one-shot effects.
      justDone: big.justDone && !still,
      stuck: big.stuck,
      blockedBy: [...new Set(big.blockedBy.map(j => posOf[j] ?? -1).filter(p => p >= 0 && p !== big.pos))],
      added: big.added,
      removed: big.removed,
      test: big.test,
      fill: big.fill,
      slots: SLOTS,
      box: b,
      u0,
      u1,
      front: P(u0 + 0.5, v0, 0.5),
      top: P(u0 + 0.5, 0.5, w1),
    }

    // A reflection on the polished top in front of the cube, fading to the front edge.
    if (!big.isGhost && detail > 0 && skin.effects?.reflection !== false) {
      const k = big.kind === 'solid' ? 1 : 0.55
      const ry = 0.85 * PED_FRONT
      parts.push(`<g opacity="${k}">` + poly([P(u0 + 0.04, 0, 0), P(u1 - 0.04, 0, 0), P(u1 - 0.1, ry, 0), P(u0 + 0.1, ry, 0)], `fill="url(#rf-${s})"`) + '</g>')
    }
    // Soft contact shadow cast back and to the right.
    parts.push(poly(box(P, u0 + 0.06, u1 + 0.16, v0 + 0.05, v1 + 0.12, 0, 0).top, `fill="${pd.shadow}" opacity="${big.isGhost ? 0.08 : 0.3}" filter="url(#sd)"`))

    // A stack of folded steps: two more cubes peek out behind and above the front one.
    if (big.count > 1) {
      const fills = big.kind === 'solid' ? [`url(#${s}F)`, `url(#${s}S)`, `url(#${s}T)`] : [`url(#${s}G)`, `url(#${s}G)`, `url(#${s}G)`]
      const op = big.isGhost ? ` opacity="${skin.glass.ghost}"` : ''
      for (const k of [2, 1]) {
        const sb = box(P, u0 - 0.07 * k, u1 - 0.07 * k, v0 + 0.1 * k, v1 + 0.1 * k, w0, w1 + 0.06 * k)
        parts.push(
          `<g${op}>` + poly(sb.front, `fill="${fills[0]}" class="e"`) + poly(sb.right, `fill="${fills[1]}" class="e"`) + poly(sb.top, `fill="${fills[2]}" class="e"`) + `</g>`,
        )
      }
    }
    const out: string[] = [`<g><title>${esc(big.title)}</title>`]
    if (big.kind === 'solid') {
      out.push(poly(b.front, `fill="url(#${s}F)" class="e"`), poly(b.right, `fill="url(#${s}S)" class="e"`), poly(b.top, `fill="url(#${s}T)" class="e"`))
      if (detail > 0) {
        const seams: Pt[][] = []
        for (let k = 1; k < N; k++) {
          const t = k / N
          seams.push([P(u0 + t, v0, w0), P(u0 + t, v0, w1)], [P(u0, v0, t), P(u1, v0, t)])
          seams.push([P(u0 + t, v0, w1), P(u0 + t, v1, w1)], [P(u0, t, w1), P(u1, t, w1)])
          seams.push([P(u1, t, w0), P(u1, t, w1)], [P(u1, v0, t), P(u1, v1, t)])
        }
        out.push(`<path d="${pathD(seams)}" fill="none" stroke="${skin.edge.color}" stroke-opacity="0.13" stroke-width="0.6"/>`)
      }
      out.push(pline([b.front[0], b.front[3], b.front[2]], 'fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"'))
      out.push(line(b.front[2], b.right[2], 'stroke="#ffffff" stroke-opacity="0.6" stroke-width="1"'))
      const mk = `fill="none" stroke="#ffffff" stroke-opacity="0.95" stroke-width="${n1(Math.max(1.6, S * 0.08))}" stroke-linecap="round" stroke-linejoin="round"`
      if (s === 'done') out.push(pline([onFront(0.26, 0.5), onFront(0.43, 0.32), onFront(0.75, 0.7)], mk))
      if (s === 'error') out.push(line(onFront(0.3, 0.3), onFront(0.7, 0.7), mk), line(onFront(0.7, 0.3), onFront(0.3, 0.7), mk))
      if (big.justDone && !still && s === 'done' && detail > 0) {
        // The mini cubes fuse into the block: they fade out over it, then a light edge runs round.
        const at0 = ([i, j, k]: [number, number, number]): Pt => P(u0 + pIn + i * cell + cell * q, v0 + pIn + j * cell + cell * q, w0 + pIn + k * cell + cell * q)
        const minis = [...FILL_ORDER].sort((p, c) => c[1] - p[1] || p[2] - c[2] || p[0] - c[0]).map(sl => `<use href="#m-other" x="${n1(at0(sl)[0])}" y="${n1(at0(sl)[1])}"/>`).join('')
        out.push(`<g opacity="0" pointer-events="none"><animate attributeName="opacity" values="0.95;0" dur="0.8s" fill="freeze"/>${minis}</g>`)
        const rim = pathD([[b.front[0], b.front[1], b.right[1], b.right[2], b.top[3], b.front[3], b.front[0]], [b.front[3], b.front[2], b.front[1]], [b.front[2], b.right[2]]])
        out.push(`<path d="${rim}" fill="none" stroke="#ffffff" stroke-width="${n1(Math.max(1.5, S * 0.05))}" stroke-linejoin="round" filter="url(#gl)" opacity="0"><animate attributeName="opacity" values="0;0.9;0" dur="1s" begin="0.6s" fill="freeze"/></path>`)
      }
      out.push('</g>')
      parts.push(out.join(''))
    } else {
      const gOp = big.isGhost ? skin.glass.ghost : 1
      const stroke = `stroke="${cFront}" stroke-opacity="${big.isGhost ? 0.45 : 0.55}" stroke-width="${big.isGhost ? 0.8 : 1}" stroke-linejoin="round"${big.isGhost ? ' stroke-dasharray="2 2"' : ''}`
      out.push(`<g opacity="${gOp}" fill="url(#${s}G)" ${stroke}>`, poly(b.back, ''), poly(b.left, ''), poly(b.bottom, ''), '</g>')
      if (detail > 0 && !big.isGhost) {
        const grid: Pt[][] = []
        for (let k = 1; k < N; k++) {
          const t = k / N
          grid.push([P(u0 + t, v0, w0), P(u0 + t, v1, w0)], [P(u0, t, w0), P(u1, t, w0)])
        }
        out.push(`<path d="${pathD(grid)}" stroke="${cTop}" stroke-opacity="0.35" stroke-width="0.6"/>`)
      }

      // Mini cubes: fill in fill order, draw back to front, bottom to top, left to right.
      const at = ([i, j, k]: [number, number, number]): Pt => P(u0 + pIn + i * cell + cell * q, v0 + pIn + j * cell + cell * q, w0 + pIn + k * cell + cell * q)
      const filled = FILL_ORDER.slice(0, Math.min(big.fill, SLOTS))
      const newest = filled[filled.length - 1]
      const drawOrder = [...filled].sort((p, c) => c[1] - p[1] || p[2] - c[2] || p[0] - c[0])
      const shimmer = big.isLive && !still && detail > 1 && skin.effects?.glint !== false
      const use = (id: string, p: Pt) => `<use href="#${id}" x="${n1(p[0])}" y="${n1(p[1])}"/>`
      for (const slot of drawOrder) {
        const p = at(slot)
        const kind = big.kinds[FILL_ORDER.indexOf(slot)] ?? 'other'
        const body = use(`m-${kind}`, p) + (shimmer ? use(`g${(slot[0] + slot[2]) % 3}`, p) : '')
        // The newest mini cube drops in; in a still picture it simply sits there.
        if (big.landing && !still && slot === newest) {
          out.push(
            `<g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.35s" fill="freeze"/>` +
              `<animateTransform attributeName="transform" type="translate" values="0 ${n1(-drop)};0 0;0 -1.5;0 0" keyTimes="0;0.7;0.85;1" dur="0.55s" fill="freeze"/>` +
              body + `</g>`,
          )
        } else out.push(body)
      }
      const next = FILL_ORDER[Math.min(big.fill, SLOTS)]
      // The next mini cube falling in over and over: only while things move.
      if (big.isLive && !still && next) {
        out.push(
          `<g opacity="0"><animate attributeName="opacity" values="0;0.8;0.8;0" keyTimes="0;0.25;0.8;1" dur="1.4s" repeatCount="indefinite"/>` +
            `<animateTransform attributeName="transform" type="translate" values="0 ${n1(-drop)};0 0;0 0" keyTimes="0;0.6;1" dur="1.4s" repeatCount="indefinite"/>` +
            use('m-other', at(next)) + `</g>`,
        )
      }
      out.push(hook(skin.cubeInner && (() => skin.cubeInner!(ctx, cube))))

      out.push(`<g opacity="${gOp}"><g fill="url(#${s}G)">`, poly(b.front, ''), poly(b.right, ''), poly(b.top, ''), '</g>')
      if (big.isLive && !still && detail > 0 && skin.effects?.sweep !== false) out.push(poly(b.front, 'fill="url(#sh)"'), poly(b.top, 'fill="url(#sh)"'))
      const pulse = big.isLive && !still && skin.effects?.pulse !== false
        ? `<animate attributeName="stroke-opacity" values="1;0.4;1" dur="${s === 'waiting' ? '0.9s' : '1.6s'}" repeatCount="indefinite"/>`
        : ''
      const edge = `fill="none" stroke="${big.isGhost ? cFront : cSide}" stroke-opacity="${big.isGhost ? 0.55 : 1}" stroke-width="${big.isGhost ? 0.9 : 1.4}" stroke-linejoin="round"${big.isGhost ? ' stroke-dasharray="2 2"' : ''}${big.isLive && skin.effects?.glow !== false ? ' filter="url(#gl)"' : ''}`
      const edges = pathD([[b.front[0], b.front[1], b.right[1], b.right[2], b.top[3], b.front[3], b.front[0]], [b.front[3], b.front[2], b.front[1]], [b.front[2], b.right[2]]])
      out.push(`<path d="${edges}" ${edge}>${pulse}</path>`)
      if (!big.isGhost) out.push(pline([b.front[3], b.front[2]], 'fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="0.7"'))
      out.push('</g></g>')
      parts.push(out.join(''))

      if (big.isLive && !still && detail > 1 && skin.effects?.sparks !== false) {
        const spots: [number, number][] = [[0.25, 0.4], [0.6, 0.7], [0.45, 0.2], [0.8, 0.45]]
        spots.forEach(([a, c], k) => {
          const [sx, sy] = P(u0 + a, v0 + c, w1)
          const rise = S * (0.4 + k * 0.07)
          overlay.push(
            `<circle cx="${n1(sx)}" cy="${n1(sy)}" r="${n1(Math.max(0.9, S * 0.03))}" fill="${cTop}" opacity="0">` +
              `<animate attributeName="opacity" values="0;1;0" dur="2.2s" begin="${n1(k * 0.55)}s" repeatCount="indefinite"/>` +
              `<animate attributeName="cy" values="${n1(sy)};${n1(sy - rise)}" dur="2.2s" begin="${n1(k * 0.55)}s" repeatCount="indefinite"/>` +
              `</circle>`,
          )
        })
      }
    }
    if (big.stuck) {
      parts.push(safe(() => cracks(cube, P, S, big.stuck)))
      // Smoke only shows while it moves.
      if (detail > 0 && !still) overlay.push(safe(() => smoke(cube, P, S, detail)))
    }
    parts.push(hook(skin.cubeOverlay && (() => skin.cubeOverlay!(ctx, cube))))
    if (big.test) overlay.push(safe(() => testSeal(big.test, b.front[2], S, skin)))
    // A step freed just now: its padlock springs open, rises and fades.
    // The finale: a wave of light runs over the cubes, one after the other, and sparks rise from each.
    if (sc.finale) overlay.push(finaleMark(b, P(u0 + 0.5, (v0 + v1) / 2, w1), S, big.pos, skin.status.done[1]))
    if (big.unlocked && !still) overlay.push(unlockMark(P(u0 + 0.18, v0, w1 + 0.12), S, skin.status.done[1]))

    // Agent badges above the cube.
    const [tx, ty] = P(u0 + 0.5, 0.5, w1)
    const count = big.badges.length
    big.badges.forEach((bd, k) => {
      const bx = tx + (k - (count - 1) / 2) * badgeR * 2.4
      const by = ty - S * 0.42 - badgeR
      // Flying over from another step just now: start there, arc across, settle here.
      const fromPos = bd.from >= 0 ? (posOf[bd.from] ?? -1) : -1
      let fly = ''
      if (fromPos >= 0 && fromPos !== big.pos && !still) {
        const [fx, fy] = P(cubeU(fromPos) + 0.5, 0.5, 1)
        const mx = (fx - tx) / 2
        const my = (fy - ty) / 2 - S * 0.5
        fly = `<animateTransform attributeName="transform" type="translate" values="${n1(fx - tx)} ${n1(fy - ty)};${n1(mx)} ${n1(my)};0 0" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.2 1" dur="0.9s" fill="freeze"/>`
      }
      const bob = bd.isLive && !still
        ?`<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="1.8s" begin="${n1(k * 0.3)}s" repeatCount="indefinite"/>`
        : ''
      overlay.push(
        `<g>${fly}<g><title>${esc(bd.title)}</title>${bob}` +
          line([tx, ty], [bx, by + badgeR], `stroke="${bd.color}" stroke-width="1.3" stroke-opacity="0.85"`) +
          `<circle cx="${n1(tx)}" cy="${n1(ty)}" r="1.8" fill="${bd.color}"/>` +
          `<circle cx="${n1(bx + 1)}" cy="${n1(by + 1.5)}" r="${n1(badgeR)}" fill="#0f172a" opacity="0.3" filter="url(#sd)"/>` +
          `<circle cx="${n1(bx)}" cy="${n1(by)}" r="${n1(badgeR)}" fill="${bd.color}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="1.2"/>` +
          `<circle cx="${n1(bx - badgeR * 0.3)}" cy="${n1(by - badgeR * 0.35)}" r="${n1(badgeR * 0.35)}" fill="#ffffff" opacity="0.35"/>` +
          `<text class="t" x="${n1(bx)}" y="${n1(by + badgeR * 0.38)}" font-size="${n1(badgeR * 1.1)}" fill="#0f172a" text-anchor="middle">${esc(bd.letter)}</text>` +
          `</g></g>`,
      )
    })
  }
  overlay.push(safe(() => dependencies(bigs, posOf, P, S, cubeU, detail, skin, still)))
  if (detail > 0) overlay.push(safe(() => moodLights(bigs, P, S, cubeU, width, height, still, skin)))
  if (!row.bare) overlay.push(hook(skin.overlay && (() => skin.overlay!(ctx))))

  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${css}<defs>${defs.join('')}</defs>${parts.join('')}${overlay.join('')}</svg>`
  return { source, width, height }
}

/** The task's last moment on one cube: its faces flash white in turn along the row, then sparks rise from its top. */
function finaleMark(b: Box, [tx, ty]: Pt, S: number, pos: number, okc: string): string {
  const at = pos * 0.13
  const hull = [b.front[0], b.front[1], b.right[1], b.right[2], b.top[3], b.front[3]]
  let s = `<g pointer-events="none">${poly(hull, 'fill="#ffffff" opacity="0"').replace('/>', `><animate attributeName="opacity" values="0;0.8;0" keyTimes="0;0.3;1" dur="0.7s" begin="${n1(at)}s" fill="freeze"/></polygon>`)}`
  for (let j = 0; j < 3; j++) {
    const sx = tx + (j - 1) * S * 0.24
    const begin = n1(at + 0.3 + j * 0.14)
    s +=
      `<circle cx="${n1(sx)}" cy="${n1(ty)}" r="${n1(Math.max(1.2, S * 0.045))}" fill="${j === 1 ? '#ffffff' : okc}" opacity="0">` +
      `<animate attributeName="opacity" values="0;1;0" dur="1.1s" begin="${begin}s" fill="freeze"/>` +
      `<animate attributeName="cy" values="${n1(ty)};${n1(ty - S * (0.7 + j * 0.12))}" dur="1.1s" begin="${begin}s" fill="freeze"/></circle>`
  }
  return s + '</g>'
}

/** An open padlock rising and fading over a step that was freed just now, with a ring spreading out. */
function unlockMark([lx, ly]: Pt, S: number, okc: string): string {
  const lk = Math.max(5, S * 0.13)
  const hx = lx + lk * 0.42
  const hy = ly - lk * 0.2
  return (
    '<g opacity="0" pointer-events="none"><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.6;1" dur="2.2s" fill="freeze"/>' +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${n1(-S * 0.35)}" dur="2.2s" fill="freeze"/>` +
    `<circle cx="${n1(lx)}" cy="${n1(ly)}" r="${n1(lk)}" fill="none" stroke="${okc}" stroke-width="1.5"><animate attributeName="r" values="${n1(lk)};${n1(lk * 3)}" dur="0.8s" fill="freeze"/><animate attributeName="stroke-opacity" values="0.9;0" dur="0.8s" fill="freeze"/></circle>` +
    `<rect x="${n1(lx - lk * 0.7)}" y="${n1(ly - lk * 0.2)}" width="${n1(lk * 1.4)}" height="${n1(lk * 1.1)}" rx="${n1(lk * 0.2)}" fill="${okc}" stroke="#0f172a" stroke-opacity="0.5" stroke-width="0.8"/>` +
    `<path d="M${n1(lx - lk * 0.42)} ${n1(hy)}V${n1(ly - lk * 0.6)}A${n1(lk * 0.42)} ${n1(lk * 0.42)} 0 0 1 ${n1(hx)} ${n1(ly - lk * 0.6)}" fill="none" stroke="${okc}" stroke-width="${n1(Math.max(1.3, lk * 0.22))}" stroke-linecap="round">` +
    `<animateTransform attributeName="transform" type="rotate" values="0 ${n1(hx)} ${n1(hy)};-35 ${n1(hx)} ${n1(hy)}" dur="0.5s" fill="freeze"/></path></g>`
  )
}

/**
 * Light that tells the state at a glance: a warm spot falling on a step that
 * waits for you, a red glow around one that is stuck.
 */
function moodLights(bigs: Big[], P: (u: number, v: number, w: number) => Pt, S: number, cubeU: (i: number) => number, W: number, H: number, still: boolean, skin: Skin): string {
  if (skin.effects?.mood === false) return ''
  let s = ''
  for (const big of bigs) {
    const u0 = cubeU(big.pos)
    if (big.status === 'waiting') {
      const [ax, ay] = P(u0 + 0.5, 0.5, 2.6)
      const l = P(u0 - 0.05, 0, 1)
      const r = P(u0 + 1.05, 1, 1)
      const top = Math.max(0, ay)
      const breathe = still ? '' : '<animate attributeName="opacity" values="0.75;1;0.75" dur="3s" repeatCount="indefinite"/>'
      s += `<g pointer-events="none">${breathe}<polygon points="${n1(ax - S * 0.08)},${n1(top)} ${n1(ax + S * 0.08)},${n1(top)} ${n1(r[0])},${n1(r[1])} ${n1(l[0])},${n1(l[1])}" fill="url(#mood-cone)"/>`
      const [gx, gy] = P(u0 + 0.5, 0.5, 0)
      s += `<ellipse cx="${n1(gx)}" cy="${n1(gy)}" rx="${n1(S * 0.95)}" ry="${n1(S * 0.32)}" fill="url(#mood-amber)"/></g>`
    }
    if (big.stuck) {
      const [cx, cy] = P(u0 + 0.5, 0.5, 0.5)
      const pulse = still ? '' : '<animate attributeName="opacity" values="0.55;1;0.55" dur="1.6s" repeatCount="indefinite"/>'
      s += `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(S * 1.05)}" ry="${n1(S * 0.95)}" fill="url(#mood-red)" pointer-events="none">${pulse}</ellipse>`
    }
  }
  return s
}

/**
 * Two rows for a long plan: the earlier half of the cubes stands in a back row,
 * a little smaller and raised, behind the later half in front. The front row
 * carries the tank and the progress pipe for the whole task.
 */
function renderRows(sc: Scene, detail: Detail, skin: Skin): { source: string; width: number; height: number } {
  const k = Math.ceil(sc.bigs.length / 2)
  const split = (bigs: Big[], from: number) => {
    const row = bigs.map(b => ({ ...b, pos: b.pos - from }))
    const posOf: number[] = []
    for (const b of row) for (let j = 0; j < b.count; j++) posOf[b.index + j] = b.pos
    return { row, posOf }
  }
  const back = split(sc.bigs.slice(0, k), 0)
  const front = split(sc.bigs.slice(k), k)
  const selIn = (p: number, from: number, len: number) => (p >= from && p < from + len ? p - from : -1)
  const backOut = render({ ...sc, bigs: back.row, posOf: back.posOf, selPos: selIn(sc.selPos, 0, k), ctxFill: null }, detail > 1 ? 1 : 0, skin, { bare: true })
  const scale = 0.84
  const lift = backOut.height * scale * 0.62
  const frontOut = render({ ...sc, bigs: front.row, posOf: front.posOf, selPos: selIn(sc.selPos, k, sc.bigs.length - k) }, detail, skin, { extraTop: lift, totalCubes: sc.bigs.length })
  // The back row's ids get a prefix of their own, so they never meet the front row's.
  const inner = backOut.source
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .replace(/id="([^"]+)"/g, 'id="r2-$1"')
    .replace(/url\(#([^)]+)\)/g, 'url(#r2-$1)')
    .replace(/href="#([^"]+)"/g, 'href="#r2-$1"')
  const x = Math.max(0, (frontOut.width - backOut.width * scale) / 2)
  const placed = `<g transform="translate(${n1(x)} 4) scale(${scale})">${inner}</g>`
  return { ...frontOut, source: frontOut.source.replace('<!--back-row-->', placed) }
}

type Drawing = { source: string; width: number; height: number; alt: string }

/**
 * The last few drawings by everything that shows in them. The panel redraws
 * every second; while nothing visible changed, buildSvg hands back the very
 * same result, so the host keeps the frame and its animations keep running.
 */
const CACHE_SIZE = 6
const cache: { key: string; skin: Skin; raw: string; out: Drawing }[] = []

/** Forgets every cached drawing (tests). */
export function clearSvgCache(): void {
  cache.length = 0
}

export function buildSvg(
  r: CubeRun,
  targetWidth: number,
  now = 0,
  selected = -1,
  skin: Skin = classic,
  opts: DrawOptions = {},
): { source: string; width: number; height: number; alt: string } {
  const steps = layout(r, now)
  const done = steps.filter(b => b.status === 'done').length
  const working = steps.filter(b => b.badges.length > 0).map(b => b.index + 1)
  const alt = tr(
    `Würfel-Zeitleiste: ${done} von ${steps.length} Würfeln erledigt${working.length ? `, gearbeitet wird an Würfel ${working.join(', ')}` : ''}`,
    `Cube timeline: ${done} of ${steps.length} cubes done${working.length ? `, working on cube ${working.join(', ')}` : ''}`,
  )

  const bigs = fold(steps, steps.length >= TWO_ROWS_FROM ? MAX_POS_TWO_ROWS : MAX_POS)
  const posOf: number[] = []
  for (const b of bigs) for (let k = 0; k < b.count; k++) posOf[b.index + k] = b.pos
  const ctxRaw = opts.context
  const sc: Scene = {
    bigs,
    posOf,
    overall: steps.reduce((s, b) => s + (b.status === 'done' ? SLOTS : b.fill), 0) / (SLOTS * steps.length),
    targetWidth,
    selPos: selected >= 0 && selected < posOf.length ? posOf[selected]! : -1,
    // Whole percent: the tank moves, and the drawing changes, once per percent.
    ctxFill: typeof ctxRaw === 'number' && Number.isFinite(ctxRaw) ? Math.round(Math.max(0, Math.min(1, ctxRaw)) * 100) / 100 : null,
    still: opts.motion === false,
    finale: opts.motion !== false && bigs.length > 0 && bigs.every(b => b.status === 'done') && bigs.some(b => b.justDone),
  }

  // Everything that shows: the cubes (status, fill, kinds, badges, caption,
  // titles, justDone, stuck, blockers, diff, test, errors), the selection,
  // skin, width, context, motion and progress. Nothing that only moves with
  // `now` without changing the picture is in it.
  const key = JSON.stringify([skin.id, sc.targetWidth, sc.selPos, sc.ctxFill, sc.still, sc.overall, alt, bigs])
  const hit = cache.findIndex(e => e.key === key && e.skin === skin)
  if (hit >= 0) {
    const [e] = cache.splice(hit, 1)
    // The drawing shown last stays as it is. One coming back after another (A, B, A)
    // is locked to the clock afresh: the old picture's animations started long ago.
    if (hit > 0) e!.out = { ...e!.out, source: phaseLock(e!.raw, now) }
    cache.unshift(e!)
    return e!.out
  }

  // Compact mode: past ten cubes they are small, the finest ornament would not
  // show anyway, and the markup keeps well clear of the limit.
  const twoRows = bigs.length >= TWO_ROWS_FROM
  const draw = (d: Detail) => (twoRows ? renderRows(sc, d, skin) : render(sc, d, skin))
  const compact = (twoRows ? Math.ceil(bigs.length / 2) : bigs.length) > 10
  const budget = compact || twoRows ? COMPACT_BUDGET : MAX_SOURCE
  let out = draw(compact ? 1 : 2)
  if (out.source.length > budget && !compact) out = draw(1)
  if (out.source.length > budget) {
    const bare = draw(0)
    if (bare.source.length < out.source.length) out = bare
  }
  // Two rows that still do not fit fall back to one row of folded cubes.
  if (twoRows && out.source.length > budget) {
    const one = fold(steps)
    const posOne: number[] = []
    for (const b of one) for (let j = 0; j < b.count; j++) posOne[b.index + j] = b.pos
    const sc1 = { ...sc, bigs: one, posOf: posOne, selPos: selected >= 0 && selected < posOne.length ? posOne[selected]! : -1 }
    out = render(sc1, 1, skin)
    if (out.source.length > COMPACT_BUDGET) out = render(sc1, 0, skin)
  }
  // Endless animations start where the clock says, so this drawing carries on from the one it replaces.
  const drawing: Drawing = { source: phaseLock(out.source, now), width: out.width, height: out.height, alt }
  cache.unshift({ key, skin, raw: out.source, out: drawing })
  if (cache.length > CACHE_SIZE) cache.length = CACHE_SIZE
  return drawing
}
// The steps as the drawing sees them, and their folding: for the circuit-board view, which draws the same task.
export { layout as sceneSteps, fold as foldSteps, SLOTS }
export type { Big }
