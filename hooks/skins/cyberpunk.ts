import { completionBurst } from './classic'
import { circle, lin, n1, pline, poly, rad, seeded } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/**
 * Cyberpunk: neon in pink, violet and cyan. A wet street of a pedestal that
 * mirrors the lights, and cubes as glowing holo boxes. It stands free on the pane.
 */
const PINK = '#ff2bd6'
const VIOLET = '#8b5cf6'
const YELLOW = '#fde047'
const CYAN = '#22d3ee'

const STATUS: Skin['status'] = {
  pending: ['#6b6487', '#4a4466', '#2f2b45'],
  running: ['#f0abfc', PINK, '#a21caf'],
  done: ['#a5f3fc', CYAN, '#0e7490'],
  error: ['#fda4af', '#f43f5e', '#9f1239'],
  waiting: ['#fef08a', YELLOW, '#a16207'],
}

/** A wet street: neon reflections streaking down the pedestal's front, a glowing curb line. */
function pedestalDecor(ctx: SceneCtx): string {
  if (ctx.detail === 0) return ''
  const f = ctx.pedestal.front
  const x0 = f[0][0]
  const x1 = f[1][0]
  const yT = f[3][1]
  const yB = f[0][1]
  let s = `<rect x="${n1(x0)}" y="${n1(yT)}" width="${n1(x1 - x0)}" height="${n1(yB - yT)}" fill="url(#cyberpunk-wet)"/>`
  const rnd = seeded(13 + ctx.n)
  for (let k = 0; k < 9; k++) {
    const x = x0 + (x1 - x0) * rnd()
    const col = [PINK, CYAN, VIOLET, YELLOW][k % 4]!
    s += `<rect x="${n1(x)}" y="${n1(yT + 2)}" width="${n1(ctx.S * (0.04 + rnd() * 0.06))}" height="${n1((yB - yT) * (0.5 + rnd() * 0.45))}" fill="${col}" opacity="${n1(0.08 + rnd() * 0.12)}"/>`
  }
  // The curb: a neon line along the top edge, pink into cyan.
  s += pline([f[3], f[2]], `fill="none" stroke="url(#cyberpunk-curb)" stroke-width="2" filter="url(#gl)"`)
  return s
}

function cubeOverlay(ctx: SceneCtx, c: CubeCtx): string {
  if (ctx.detail === 0) return ''
  const b = c.box
  const outline = [b.front[0], b.front[1], b.right[1], b.right[2], b.top[3], b.front[3], b.front[0]]
  let s = ''
  // Finished: a holo box, a neon rim and scan lines over its faces.
  if (c.kind === 'solid') {
    const col = c.status === 'done' ? CYAN : '#f43f5e'
    s += poly(b.front, `fill="url(#cyberpunk-scan)"`) + poly(b.right, `fill="url(#cyberpunk-scan)"`)
    s += pline(outline, `fill="none" stroke="${col}" stroke-width="1.4" filter="url(#gl)"`)
  }
  // Not started: a dim neon wireframe.
  if (c.isGhost) {
    s += pline(outline, `fill="none" stroke="${VIOLET}" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="3 2"`)
  }
  // Worked on: a pink glow pulsing inside, a reflection on the street below.
  if (c.isLive) {
    const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.5)
    const col = c.status === 'waiting' ? YELLOW : PINK
    const pulse = ctx.detail > 1 ? `<animate attributeName="opacity" values="0.35;0.8;0.35" dur="1.4s" repeatCount="indefinite"/>` : ''
    s += circle([cx, cy], ctx.S * 0.42, `fill="url(#cyberpunk-glow)" opacity="0.6"`, pulse)
    const [rx, ry] = ctx.P(c.u0 + 0.5, -0.12, 0)
    s += `<ellipse cx="${n1(rx)}" cy="${n1(ry + ctx.S * 0.05)}" rx="${n1(ctx.S * 0.4)}" ry="${n1(ctx.S * 0.06)}" fill="${col}" opacity="0.25"/>`
  }
  return s + completionBurst(ctx, c, CYAN, PINK)
}

export const cyberpunk: Skin = {
  id: 'cyberpunk',
  name: 'Cyberpunk',
  description: 'Neon holo cubes on a dark block, the lights mirrored in a wet street',
  status: STATUS,
  glass: { top: 0.3, bottom: 0.06, ghost: 0.55 },
  edge: { color: '#0b0614', opacity: 0.6 },
  mini: { top: ['#e8e9f3', '#cfd1e3'], front: ['#aeb0cb', '#8d8fae'], side: ['#6d6f92', '#4b4d6e'], highlight: '#ffffff', glint: '#f5e8ff' },
  tint: {
    read: [CYAN, 0.42],
    write: [YELLOW, 0.4],
    run: [PINK, 0.42],
    agent: ['#34d399', 0.38],
    other: ['#a78bfa', 0],
    err: ['#f43f5e', 0.85],
  },
  pedestal: { front: ['#1f1633', '#150f26', '#0b0717'], top: ['#2a1f44', '#1a1330'], side: ['#120c22', '#07040f'], footTop: '#1f1633', footSide: '#05030a', light: PINK, shadow: '#000000' },
  plaque: {
    frame: ['#3b2a5e', '#120c22'],
    inner: ['#0b0614', '#160d29'],
    text: { pending: '#7c6f9f', running: '#f0abfc', done: '#67e8f9', error: '#fb7185', waiting: '#fde047' },
    caption: '#f5d0fe',
  },
  track: { groove: '#05030a' },
  pipe: { fill: 'energy', colors: [VIOLET, PINK, CYAN], metal: '#3b2a5e' },
  font: 'ui-monospace,Consolas,monospace',
  defs: () =>
    rad('cyberpunk-glow', [[0, '#ffffff', 0.9], [0.35, PINK, 0.7], [1, PINK, 0]]) +
    lin('cyberpunk-wet', 0, 1, [[0, '#ffffff', 0.06], [0.4, '#ffffff', 0], [1, '#000000', 0.25]]) +
    lin('cyberpunk-curb', 1, 0, [[0, PINK], [0.5, VIOLET], [1, CYAN]]) +
    `<pattern id="cyberpunk-scan" width="6" height="3" patternUnits="userSpaceOnUse"><rect width="6" height="1" fill="#ffffff" fill-opacity="0.12"/></pattern>`,
  pedestalDecor,
  cubeOverlay,
}
