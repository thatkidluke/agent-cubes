import { completionBurst } from './classic'
import { circle, lin, line, n1, pline, poly, rad, seeded } from '../svg'
import type { Pt } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/**
 * Alien cave: a dark cavern on a far planet. Jagged rock above and below,
 * glowing spores drifting, a rock pedestal with luminous veins, energy cubes in
 * green and teal, finished cubes as crystals.
 */
const GLOW = '#5eead4'
const SPORE = '#a3e635'
const ROCK = '#1b2330'

const STATUS: Skin['status'] = {
  pending: ['#5b6b80', '#3f4c5e', '#2b3544'],
  running: ['#a7f3d0', '#34d399', '#059669'],
  done: ['#99f6e4', '#2dd4bf', '#0f766e'],
  error: ['#fda4af', '#f43f5e', '#9f1239'],
  waiting: ['#fde68a', '#f59e0b', '#b45309'],
}

/** A jagged band of rock along the top (down = 1) or bottom (down = -1) edge. */
function rockBand(ctx: SceneCtx, seed: number, edgeY: number, depth: number, down: 1 | -1): string {
  const rnd = seeded(seed)
  const step = Math.max(10, ctx.S * 0.35)
  const pts: Pt[] = [[0, edgeY]]
  for (let x = 0; x <= ctx.width + step; x += step) pts.push([x, edgeY + down * depth * (0.3 + rnd() * 0.7)])
  pts.push([ctx.width, edgeY])
  return poly(pts, `fill="${ROCK}"`)
}

function backdrop(ctx: SceneCtx): string {
  const { width: W, height: H, S } = ctx
  let s = `<rect width="${W}" height="${H}" rx="${n1(Math.min(14, S * 0.3))}" fill="url(#cave-bg)"/>`
  if (ctx.detail === 0) return s
  s += `<ellipse cx="${n1(W * 0.5)}" cy="${n1(H * 0.55)}" rx="${n1(W * 0.45)}" ry="${n1(H * 0.45)}" fill="url(#cave-glow)"/>`
  s += rockBand(ctx, 7, 0, S * 0.5, 1) + rockBand(ctx, 11, H, S * 0.35, -1)
  // Stalactites hanging from the ceiling.
  const rnd = seeded(23)
  for (let k = 0; k < Math.max(4, Math.round(W / (S * 1.6))); k++) {
    const x = rnd() * W
    const w = S * (0.12 + rnd() * 0.12)
    const h = S * (0.5 + rnd() * 0.6)
    s += poly([[x - w, 0], [x + w, 0], [x, h]], `fill="${ROCK}"`)
    s += circle([x, h], 1.2, `fill="${GLOW}" opacity="0.7"`)
  }
  // Spores drifting upwards, twinkling, while work goes on.
  const live = ctx.hasLive && ctx.detail > 1
  for (let k = 0; k < 14; k++) {
    const x = rnd() * W
    const y = H * (0.25 + rnd() * 0.65)
    const r = 0.8 + rnd() * 1.4
    const anim = live
      ? `<animate attributeName="cy" values="${n1(y)};${n1(y - S * 0.8)}" dur="${n1(5 + rnd() * 4)}s" begin="${n1(rnd() * 4)}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0.9;0" dur="${n1(5 + rnd() * 4)}s" begin="${n1(rnd() * 4)}s" repeatCount="indefinite"/>`
      : ''
    s += circle([x, y], r, `fill="${k % 3 ? SPORE : GLOW}" opacity="0.6"`, anim)
  }
  return s
}

/** Luminous veins across the rock pedestal, and glowing pods along its top edge. */
function pedestalDecor(ctx: SceneCtx): string {
  if (ctx.detail === 0) return ''
  const f = ctx.pedestal.front
  const x0 = f[0][0]
  const x1 = f[1][0]
  const yT = f[3][1]
  const yB = f[0][1]
  const rnd = seeded(41 + ctx.n)
  let s = ''
  for (let k = 0; k < 3; k++) {
    const pts: Pt[] = []
    let y = yT + (yB - yT) * (0.3 + k * 0.22)
    for (let x = x0 + 4; x <= x1 - 4; x += ctx.S * 0.4) {
      y += (rnd() - 0.5) * ctx.S * 0.12
      pts.push([x, Math.min(yB - 3, Math.max(yT + 3, y))])
    }
    const pulse = ctx.hasLive && ctx.detail > 1 ? `<animate attributeName="stroke-opacity" values="0.15;0.6;0.15" dur="${3 + k}s" repeatCount="indefinite"/>` : ''
    s += pline(pts, `fill="none" stroke="${GLOW}" stroke-opacity="0.3" stroke-width="1.1" stroke-linejoin="round"`, pulse)
  }
  for (let x = x0 + ctx.S * 0.3; x < x1; x += ctx.S * 0.9) s += circle([x, yT + 1], 1.6, `fill="${SPORE}" opacity="0.8"`)
  return s
}

function cubeOverlay(ctx: SceneCtx, c: CubeCtx): string {
  if (ctx.detail === 0) return ''
  const b = c.box
  let s = ''
  // Finished: a crystal, facets drawn as light lines over the solid cube.
  if (c.kind === 'solid' && c.status === 'done') {
    const mid: Pt = [(b.front[0][0] + b.front[2][0]) / 2, (b.front[0][1] + b.front[2][1]) / 2]
    const facet = `stroke="#ecfeff" stroke-opacity="0.45" stroke-width="0.8"`
    s += line(b.front[3], mid, facet) + line(b.front[1], mid, facet) + line(b.top[2], b.top[0], facet)
    s += poly(b.top, `fill="url(#cave-shine)" opacity="0.6"`)
  }
  // Not started: a faint glowing outline in the dark.
  if (c.isGhost) {
    s += pline([b.front[0], b.front[1], b.right[1], b.right[2], b.top[3], b.front[3], b.front[0]], `fill="none" stroke="${GLOW}" stroke-opacity="0.35" stroke-width="0.9" stroke-dasharray="3 2"`)
  }
  // Worked on: an energy core glowing inside.
  if (c.isLive) {
    const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.55)
    const pulse = ctx.detail > 1 ? `<animate attributeName="r" values="${n1(ctx.S * 0.2)};${n1(ctx.S * 0.3)};${n1(ctx.S * 0.2)}" dur="1.6s" repeatCount="indefinite"/>` : ''
    s += circle([cx, cy], ctx.S * 0.24, `fill="url(#cave-core)"`, pulse)
  }
  return s + completionBurst(ctx, c, GLOW, SPORE)
}

export const cave: Skin = {
  id: 'cave',
  name: 'Alien-Höhle',
  description: 'Dunkle Kaverne mit leuchtenden Sporen und Kristallen',
  status: STATUS,
  glass: { top: 0.28, bottom: 0.05, ghost: 0.55 },
  edge: { color: '#020617', opacity: 0.5 },
  mini: { top: ['#d1fae5', '#86efac'], front: ['#6ee7b7', '#10b981'], side: ['#34d399', '#047857'], highlight: '#ecfeff', glint: '#ccfbf1' },
  tint: {
    read: ['#38bdf8', 0.45],
    write: ['#facc15', 0.5],
    run: ['#c084fc', 0.5],
    agent: ['#2dd4bf', 0.45],
    other: ['#94a3b8', 0],
    err: ['#f43f5e', 0.8],
  },
  pedestal: { front: ['#2a3442', '#1d2531', '#121821'], top: ['#3a4656', '#28323f'], side: ['#18202b', '#0c1118'], footTop: '#26303d', footSide: '#0a0e14', light: GLOW, shadow: '#000000' },
  plaque: {
    frame: ['#334155', '#111827'],
    inner: ['#05131a', '#0b1f26'],
    text: { pending: '#64748b', running: '#6ee7b7', done: '#5eead4', error: '#fb7185', waiting: '#fcd34d' },
    caption: '#99f6e4',
  },
  track: { groove: '#020617', from: '#34d399', to: '#5eead4', head: GLOW },
  font: 'ui-monospace,Consolas,monospace',
  defs: () =>
    lin('cave-bg', 0, 1, [[0, '#0b1220'], [0.6, '#0a1a1f'], [1, '#05080d']]) +
    rad('cave-glow', [[0, '#14b8a6', 0.22], [1, '#14b8a6', 0]]) +
    rad('cave-core', [[0, '#f0fdfa'], [0.4, '#5eead4', 0.8], [1, '#10b981', 0]]) +
    lin('cave-shine', 1, 1, [[0, '#ffffff', 0.7], [0.5, '#ffffff', 0], [1, '#ffffff', 0]]),
  backdrop,
  pedestalDecor,
  cubeOverlay,
}
