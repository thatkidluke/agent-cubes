import { circle, esc, line, n1, pline, poly } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

const ACCENT = '#6366f1'
const GREEN = '#34c47c'
const HAIR = '#94a3b8'

const STATUS: Skin['status'] = {
  pending: ['#cbd5e1', '#a3afc0', '#8493a8'],
  running: ['#a5b4fc', '#818cf8', '#6366f1'],
  done: ['#7ddfa8', GREEN, '#28a566'],
  error: ['#fca5a5', '#ef4444', '#dc2626'],
  waiting: ['#fcd34d', '#f59e0b', '#d97706'],
}

/** A neutral rounded card behind everything, so the scene reads on light and dark panels alike. */
function backdrop(ctx: SceneCtx): string {
  const r = Math.max(6, ctx.S * 0.18)
  return `<rect x="0.5" y="0.5" width="${n1(ctx.width - 1)}" height="${n1(ctx.height - 1)}" rx="${n1(r)}" fill="${HAIR}" fill-opacity="0.07" stroke="${HAIR}" stroke-opacity="0.3" stroke-width="1"/>`
}

/** A flat top over the pedestal and a hairline along its front edge. */
function pedestalDecor(ctx: SceneCtx): string {
  if (ctx.detail === 0) return ''
  const p = ctx.pedestal
  return poly(p.top, `fill="#cfd5de"`) + line(p.front[3], p.front[2], `stroke="#ffffff" stroke-opacity="0.7" stroke-width="1"`)
}

function cubeOverlay(ctx: SceneCtx, c: CubeCtx): string {
  if (ctx.detail === 0) return ''
  const { S, P } = ctx
  const b = c.box
  const on = (a: number, h: number) => P(c.u0 + a, 0, h)
  const outline = [b.front[0], b.front[1], b.right[1], b.right[2], b.top[3], b.front[3], b.front[0]]
  let s = ''

  // Solid cubes: plain flat faces with a crisp mark, covering the renderer's seams and sheen.
  if (c.kind === 'solid') {
    const [t, f, sd] = STATUS[c.status]
    s += poly(b.front, `fill="${f}"`) + poly(b.right, `fill="${sd}"`) + poly(b.top, `fill="${t}"`)
    s += pline(outline, `fill="none" stroke="${sd}" stroke-width="0.8" stroke-linejoin="round"`)
    s += pline([b.front[3], b.front[2], b.right[2]], `fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="0.8"`)
    const mk = `fill="none" stroke="#ffffff" stroke-width="${n1(Math.max(1.5, S * 0.07))}" stroke-linecap="round" stroke-linejoin="round"`
    if (c.status === 'error') s += line(on(0.33, 0.33), on(0.67, 0.67), mk) + line(on(0.67, 0.33), on(0.33, 0.67), mk)
    else s += pline([on(0.3, 0.5), on(0.44, 0.35), on(0.72, 0.66)], mk)
  }

  // Not started: a clean, thin solid outline over the renderer's dashed ghost.
  if (c.isGhost) {
    const hs = `fill="none" stroke="${HAIR}" stroke-width="0.9" stroke-linejoin="round"`
    s += pline(outline, hs) + pline([b.front[3], b.front[2], b.front[1]], hs) + line(b.front[2], b.right[2], `stroke="${HAIR}" stroke-width="0.9"`)
  }

  // Live: one gentle thing, a slow breathing tint over the cube's visible faces.
  if (c.isLive) {
    const breathe = `<animate attributeName="fill-opacity" values="0.03;0.16;0.03" dur="${c.status === 'waiting' ? '2.4s' : '3.2s'}" repeatCount="indefinite"/>`
    s += `<g fill="${STATUS[c.status][1]}" fill-opacity="0.03">` +
      [b.front, b.right, b.top].map(q => poly(q, '').replace('/>', `>${breathe}</polygon>`)).join('') + `</g>`
  }

  // Stuck: a small amber dot on the top corner, with the reason as a tooltip.
  if (c.stuck && !c.isGhost) {
    s += `<g><title>${esc(c.stuck)}</title>` + circle(b.top[2], Math.max(2.2, S * 0.06), `fill="#f59e0b" stroke="#ffffff" stroke-width="1"`) + `</g>`
  }

  // Just done: a single soft ring settling out from the top face, then gone.
  if (c.justDone) {
    const [cx, cy] = c.top
    const once = (a: string, v: string) => `<animate attributeName="${a}" values="${v}" dur="1.2s" begin="0s" fill="freeze"/>`
    s += `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(S * 0.4)}" ry="${n1(S * 0.16)}" fill="none" stroke="${GREEN}" stroke-width="1.2" opacity="0">` +
      once('rx', `${n1(S * 0.4)};${n1(S * 0.95)}`) + once('ry', `${n1(S * 0.16)};${n1(S * 0.38)}`) + once('opacity', '0;0.8;0') + `</ellipse>`
  }
  return s
}

const safe = <A extends unknown[]>(f: (...a: A) => string) => (...a: A): string => {
  try {
    return f(...a)
  } catch {
    return ''
  }
}

/** Flat, calm and neutral: quiet slab, clean labels, one accent for work in progress. */
export const minimal: Skin = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Flat and calm, for small panels',
  status: STATUS,
  glass: { top: 0.12, bottom: 0.05, ghost: 0.55 },
  edge: { color: '#475569', opacity: 0.16 },
  mini: {
    top: ['#eef1f5', '#e6eaf0'],
    front: ['#d5dbe3', '#cdd4dd'],
    side: ['#b7c0cc', '#adb7c4'],
    highlight: '#eef1f5',
    glint: '#e2e8f0',
  },
  tint: {
    read: [ACCENT, 0.3],
    write: ['#f59e0b', 0.32],
    run: ['#8b5cf6', 0.28],
    agent: ['#14b8a6', 0.3],
    other: [HAIR, 0],
    err: ['#ef4444', 0.6],
  },
  pedestal: {
    front: ['#b4bdc9', '#b0b9c6', '#aab4c1'],
    top: ['#cfd5de', '#cbd2db'],
    side: ['#9aa5b4', '#96a1b0'],
    footTop: '#a6b0bd',
    footSide: '#8e99a8',
    light: '#ffffff',
    shadow: '#334155',
  },
  plaque: {
    frame: ['#f1f4f8', '#e9edf2'],
    inner: ['#f1f4f8', '#e9edf2'],
    text: { pending: '#64748b', running: ACCENT, done: '#16a34a', error: '#dc2626', waiting: '#d97706' },
    caption: '#64748b',
  },
  track: { groove: HAIR, from: ACCENT, to: GREEN, head: ACCENT },
  font: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
  // Calm: the skin's own breathing tint is the one live effect.
  effects: { glint: false, sparks: false, glow: false, pulse: false, sweep: false, flag: false, plaqueShadow: false },
  backdrop: safe(backdrop),
  pedestalDecor: safe(pedestalDecor),
  cubeOverlay: safe(cubeOverlay),
}
