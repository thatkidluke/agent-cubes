import { completionBurst } from './classic'
import { circle, lin, line, n1, pline, poly, rad, seeded } from '../svg'
import type { Pt } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/**
 * Cyberpunk: a rainy neon city at night. A skyline with lit windows, slanted
 * rain, flickering neon signs in pink, violet and yellow, a wet street of a
 * pedestal that mirrors the lights, and cubes as glowing holo boxes.
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

/** A row of buildings: dark blocks with lit windows, some flickering. */
function skyline(ctx: SceneCtx, seed: number, base: number, maxH: number, shade: string, windows: number): string {
  const rnd = seeded(seed)
  const { width: W, S } = ctx
  let s = ''
  let x = -S * 0.2
  while (x < W) {
    const w = S * (0.5 + rnd() * 0.8)
    const h = maxH * (0.45 + rnd() * 0.55)
    s += `<rect x="${n1(x)}" y="${n1(base - h)}" width="${n1(w)}" height="${n1(h)}" fill="${shade}"/>`
    // An antenna now and then, with a blinking red light.
    if (rnd() < 0.3) {
      const ax = x + w * 0.5
      s += line([ax, base - h], [ax, base - h - S * 0.25], `stroke="${shade}" stroke-width="1.2"`)
      const blink = ctx.hasLive && ctx.detail > 1 ? `<animate attributeName="opacity" values="1;0.1;1" dur="${n1(1.2 + rnd())}s" repeatCount="indefinite"/>` : ''
      s += circle([ax, base - h - S * 0.25], 1.3, `fill="#f43f5e"`, blink)
    }
    // Lit windows: a sparse grid in warm and cold light.
    if (ctx.detail > 1) {
      const cell = Math.max(3, S * 0.09)
      for (let wy = base - h + cell; wy < base - cell; wy += cell * 1.6) {
        for (let wx = x + cell * 0.6; wx < x + w - cell; wx += cell * 1.5) {
          if (rnd() < windows) s += `<rect x="${n1(wx)}" y="${n1(wy)}" width="${n1(cell * 0.7)}" height="${n1(cell * 0.6)}" fill="${rnd() < 0.7 ? '#fde68a' : '#67e8f9'}" opacity="${n1(0.35 + rnd() * 0.5)}"/>`
        }
      }
    }
    x += w + S * (0.05 + rnd() * 0.15)
  }
  return s
}

/** A neon sign: a rounded frame with a glowing bar inside, flickering now and then. */
function neonSign(x: number, y: number, w: number, h: number, col: string, flicker: boolean, begin: number): string {
  const anim = flicker ? `<animate attributeName="opacity" values="1;1;0.3;1;0.6;1" keyTimes="0;0.8;0.83;0.86;0.9;1" dur="4s" begin="${begin}s" repeatCount="indefinite"/>` : ''
  return (
    `<g filter="url(#gl)">${anim}` +
    `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(Math.min(3, h * 0.15))}" fill="#05030a" fill-opacity="0.55" stroke="${col}" stroke-width="1"/>` +
    // Lettering suggested by a few strokes of different length, never a readable word.
    [0.62, 0.34, 0.5].map((l, k) => `<rect x="${n1(x + w * 0.14 + (k % 2) * w * 0.08)}" y="${n1(y + h * (0.28 + k * 0.2))}" width="${n1(w * l)}" height="${n1(Math.max(0.9, h * 0.07))}" rx="0.5" fill="${col}"/>`).join('') +
    `</g>`
  )
}

function backdrop(ctx: SceneCtx): string {
  const { width: W, height: H, S } = ctx
  let s = `<rect width="${W}" height="${H}" rx="${n1(Math.min(14, S * 0.3))}" fill="url(#cyberpunk-sky)"/>`
  if (ctx.detail === 0) return s
  // A hazy neon glow over the city.
  s += `<ellipse cx="${n1(W * 0.3)}" cy="${n1(H * 0.55)}" rx="${n1(W * 0.4)}" ry="${n1(H * 0.35)}" fill="url(#cyberpunk-haze-p)"/>`
  s += `<ellipse cx="${n1(W * 0.8)}" cy="${n1(H * 0.5)}" rx="${n1(W * 0.3)}" ry="${n1(H * 0.3)}" fill="url(#cyberpunk-haze-c)"/>`
  // Far and near skylines.
  const base = ctx.pedestal.top[3][1] + S * 0.1
  s += skyline(ctx, 31, base, H * 0.55, '#1a1330', 0.12)
  s += skyline(ctx, 57, base, H * 0.4, '#0d0a1a', 0.22)
  // Neon signs on the buildings.
  const live = ctx.hasLive && ctx.detail > 1
  s += neonSign(W * 0.06, H * 0.2, S * 0.7, S * 0.28, PINK, live, 0.3)
  s += neonSign(W * 0.78, H * 0.14, S * 0.9, S * 0.3, CYAN, live, 1.7)
  s += neonSign(W * 0.88, H * 0.42, S * 0.45, S * 0.6, YELLOW, live, 2.6)
  // Rain: slanted streaks, falling while work goes on.
  if (ctx.detail > 1) {
    const rnd = seeded(83)
    const fall = live ? `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(-S * 0.4)} ${n1(H * 0.5)}" dur="1.1s" repeatCount="indefinite"/>` : ''
    let rain = ''
    for (let k = 0; k < 46; k++) {
      const x = rnd() * (W + S)
      const y = rnd() * H - H * 0.5
      rain += line([x, y], [x - S * 0.08, y + S * 0.3], `stroke="#c4b5fd" stroke-opacity="${n1(0.1 + rnd() * 0.16)}" stroke-width="0.7"`)
    }
    s += `<g>${fall}${rain}</g>`
  }
  return s
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
  description: 'A city at night: rain, thin neon lettering and the lights mirrored in a wet street',
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
  track: { groove: '#05030a', from: PINK, to: CYAN, head: YELLOW },
  pipe: { fill: 'energy', colors: [VIOLET, PINK, CYAN], metal: '#3b2a5e' },
  day: { sky: ['#fde7f3', '#e7dcfb'], ink: '#7c3aed', pattern: 'skyline' },
  font: 'ui-monospace,Consolas,monospace',
  defs: () =>
    lin('cyberpunk-sky', 0, 1, [[0, '#07060f'], [0.55, '#120b22'], [1, '#1a0c29']]) +
    rad('cyberpunk-haze-p', [[0, PINK, 0.13], [1, PINK, 0]]) +
    rad('cyberpunk-haze-c', [[0, CYAN, 0.1], [1, CYAN, 0]]) +
    rad('cyberpunk-glow', [[0, '#ffffff', 0.9], [0.35, PINK, 0.7], [1, PINK, 0]]) +
    lin('cyberpunk-wet', 0, 1, [[0, '#ffffff', 0.06], [0.4, '#ffffff', 0], [1, '#000000', 0.25]]) +
    lin('cyberpunk-curb', 1, 0, [[0, PINK], [0.5, VIOLET], [1, CYAN]]) +
    `<pattern id="cyberpunk-scan" width="6" height="3" patternUnits="userSpaceOnUse"><rect width="6" height="1" fill="#ffffff" fill-opacity="0.12"/></pattern>`,
  backdrop,
  pedestalDecor,
  cubeOverlay,
}
