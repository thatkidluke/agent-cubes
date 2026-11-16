import { completionBurst } from './classic'
import { circle, lin, line, n1, poly, seeded } from '../svg'
import type { Pt } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/**
 * Fantasy quest: a pixel-fantasy meadow. Sky and clouds, rolling green hills
 * with trees, a pedestal of stone blocks with moss and two flickering torches,
 * a glowing rune circle on cubes in work, finished cubes as wooden chests.
 */
const GOLD = '#fbbf24'
const WOOD = '#92400e'
const MOSS = '#4d7c0f'

const STATUS: Skin['status'] = {
  pending: ['#a8a29e', '#78716c', '#57534e'],
  running: ['#a5b4fc', '#6366f1', '#4338ca'],
  done: ['#d6a35c', WOOD, '#5b2a07'],
  error: ['#fca5a5', '#b91c1c', '#7f1d1d'],
  waiting: ['#fde68a', '#f59e0b', '#b45309'],
}

function backdrop(ctx: SceneCtx): string {
  const { width: W, height: H, S } = ctx
  let s = `<rect width="${W}" height="${H}" rx="${n1(Math.min(14, S * 0.3))}" fill="url(#quest-sky)"/>`
  if (ctx.detail === 0) return s
  const rnd = seeded(5)
  // Clouds drifting slowly.
  for (let k = 0; k < 3; k++) {
    const x = W * (0.15 + k * 0.33)
    const y = S * (0.3 + rnd() * 0.25)
    const drift = ctx.hasLive && ctx.detail > 1 ? `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(S * 0.6)} 0;0 0" dur="${18 + k * 5}s" repeatCount="indefinite"/>` : ''
    s += `<g fill="#ffffff" opacity="0.85">${drift}${circle([x, y], S * 0.18, '')}${circle([x + S * 0.2, y - S * 0.06], S * 0.22, '')}${circle([x + S * 0.42, y], S * 0.16, '')}</g>`
  }
  // Two rows of hills, the far one paler.
  const hills = (base: number, amp: number, col: string, seed: number) => {
    const r = seeded(seed)
    const pts: Pt[] = [[0, H]]
    for (let x = 0; x <= W + S; x += S * 0.8) pts.push([x, base - amp * (0.4 + r() * 0.6)])
    pts.push([W, H])
    return poly(pts, `fill="${col}"`)
  }
  s += hills(H * 0.62, S * 0.6, '#86c56b', 3) + hills(H * 0.72, S * 0.5, '#5aa43a', 9)
  // A few trees on the near hills.
  for (const x of [W * 0.05, W * 0.93, W * 0.97]) {
    const y = H * 0.6
    s += `<rect x="${n1(x - S * 0.04)}" y="${n1(y)}" width="${n1(S * 0.08)}" height="${n1(S * 0.3)}" fill="#713f12"/>`
    s += circle([x, y], S * 0.22, `fill="#2f7a2a"`) + circle([x - S * 0.06, y - S * 0.08], S * 0.1, `fill="#4ea33d"`)
  }
  return s
}

/** Stone blocks on the pedestal's front, moss along its top, a torch at each end. */
function pedestalDecor(ctx: SceneCtx): string {
  if (ctx.detail === 0) return ''
  const f = ctx.pedestal.front
  const x0 = f[0][0]
  const x1 = f[1][0]
  const yT = f[3][1]
  const yB = f[0][1]
  let s = `<rect x="${n1(x0)}" y="${n1(yT)}" width="${n1(x1 - x0)}" height="${n1(yB - yT)}" fill="url(#quest-stone)" opacity="0.55"/>`
  // Moss hanging over the top edge.
  const rnd = seeded(17 + ctx.n)
  for (let x = x0; x < x1; x += ctx.S * 0.22) {
    const h = ctx.S * (0.04 + rnd() * 0.1)
    s += `<rect x="${n1(x)}" y="${n1(yT - 1)}" width="${n1(ctx.S * 0.18)}" height="${n1(h)}" fill="${MOSS}" opacity="0.85"/>`
  }
  // Torches: a post and a flickering flame.
  const flicker = ctx.hasLive && ctx.detail > 1
    ? `<animateTransform attributeName="transform" type="scale" values="1 1;0.9 1.15;1.05 0.92;1 1" dur="0.7s" repeatCount="indefinite" additive="sum"/>`
    : ''
  for (const x of [x0 + ctx.S * 0.12, x1 - ctx.S * 0.12]) {
    const y = yT - ctx.S * 0.05
    s += `<rect x="${n1(x - 1.5)}" y="${n1(y - ctx.S * 0.3)}" width="3" height="${n1(ctx.S * 0.3)}" fill="#78350f"/>`
    const fy = y - ctx.S * 0.36
    s += `<g transform="translate(${n1(x)} ${n1(fy)})">${flicker}` +
      `<path d="M0 ${n1(-ctx.S * 0.14)}C${n1(ctx.S * 0.08)} ${n1(-ctx.S * 0.04)} ${n1(ctx.S * 0.06)} ${n1(ctx.S * 0.05)} 0 ${n1(ctx.S * 0.06)}C${n1(-ctx.S * 0.06)} ${n1(ctx.S * 0.05)} ${n1(-ctx.S * 0.08)} ${n1(-ctx.S * 0.04)} 0 ${n1(-ctx.S * 0.14)}Z" fill="#f97316"/>` +
      circle([0, ctx.S * 0.01], ctx.S * 0.035, `fill="#fde047"`) +
      `</g>`
  }
  return s
}

function cubeOverlay(ctx: SceneCtx, c: CubeCtx): string {
  if (ctx.detail === 0) return ''
  const b = c.box
  const S = ctx.S
  const on = (a: number, h: number): Pt => ctx.P(c.u0 + a, 0, h)
  let s = ''
  // Finished: a wooden chest, planks, gold bands and a lock.
  if (c.kind === 'solid' && c.status === 'done') {
    const plank = `stroke="#3b1a05" stroke-opacity="0.5" stroke-width="0.8"`
    for (const h of [0.33, 0.66]) s += line(on(0, h), on(1, h), plank)
    for (const a of [0.12, 0.88]) s += line(on(a, 0), on(a, 1), `stroke="${GOLD}" stroke-width="${n1(Math.max(1.5, S * 0.06))}"`)
    const [lx, ly] = on(0.5, 0.62)
    s += `<rect x="${n1(lx - S * 0.07)}" y="${n1(ly - S * 0.06)}" width="${n1(S * 0.14)}" height="${n1(S * 0.14)}" rx="1.5" fill="${GOLD}" stroke="#78350f" stroke-width="0.8"/>`
    s += circle([lx, ly + S * 0.01], Math.max(0.8, S * 0.02), `fill="#3b1a05"`)
  }
  // Not started: weathered stone outline.
  if (c.isGhost) {
    s += poly([b.front[0], b.front[1], b.front[2], b.front[3]], `fill="none" stroke="#a8a29e" stroke-width="1" stroke-dasharray="2 2"`)
  }
  // Worked on: a glowing rune circle on the top face, turning.
  if (c.isLive) {
    const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 1)
    const turn = ctx.detail > 1 ? `<animateTransform attributeName="transform" type="rotate" values="0 ${n1(cx)} ${n1(cy)};360 ${n1(cx)} ${n1(cy)}" dur="6s" repeatCount="indefinite"/>` : ''
    const col = c.status === 'waiting' ? GOLD : '#a5b4fc'
    s += `<g opacity="0.9"><ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(S * 0.34)}" ry="${n1(S * 0.12)}" fill="none" stroke="${col}" stroke-width="1.2"/>` +
      `<g>${turn}${[0, 1, 2, 3, 4, 5].map(k => {
        const a = (k / 6) * Math.PI * 2
        return circle([cx + Math.cos(a) * S * 0.3, cy + Math.sin(a) * S * 0.1], 1.4, `fill="${col}"`)
      }).join('')}</g></g>`
  }
  return s + completionBurst(ctx, c, GOLD, '#fef3c7')
}

export const quest: Skin = {
  id: 'quest',
  name: 'Fantasy-Abenteuer',
  description: 'Wiese, Steinsockel mit Fackeln, Runen und Schatztruhen',
  status: STATUS,
  glass: { top: 0.3, bottom: 0.06, ghost: 0.55 },
  edge: { color: '#1c1917', opacity: 0.45 },
  mini: { top: ['#fef3c7', '#fcd34d'], front: ['#fde68a', '#d97706'], side: ['#f59e0b', '#92400e'], highlight: '#fffbeb', glint: '#fef9c3' },
  tint: {
    read: ['#60a5fa', 0.45],
    write: ['#f97316', 0.45],
    run: ['#a855f7', 0.45],
    agent: ['#22c55e', 0.45],
    other: ['#a8a29e', 0],
    err: ['#dc2626', 0.8],
  },
  pedestal: { front: ['#a8a29e', '#8a817c', '#6b625d'], top: ['#b8b0aa', '#9c938d'], side: ['#6b625d', '#4a433f'], footTop: '#8a817c', footSide: '#44403c', light: '#f5f5f4', shadow: '#1c1917' },
  plaque: {
    frame: ['#fcd34d', '#92400e'],
    inner: ['#3b2412', '#24160b'],
    text: { pending: '#d6d3d1', running: '#c7d2fe', done: '#fde68a', error: '#fca5a5', waiting: '#fde047' },
    // Light text: the renderer gives captions a dark halo, which reads on stone.
    caption: '#fffbeb',
  },
  track: { groove: '#44403c', from: '#6366f1', to: '#fbbf24', head: GOLD },
  font: 'Georgia,"Palatino Linotype",serif',
  defs: () =>
    lin('quest-sky', 0, 1, [[0, '#7dd3fc'], [0.55, '#bae6fd'], [1, '#e0f2fe']]) +
    `<pattern id="quest-stone" width="28" height="14" patternUnits="userSpaceOnUse"><rect width="28" height="14" fill="none" stroke="#57534e" stroke-width="1"/><line x1="14" y1="0" x2="14" y2="7" stroke="#57534e"/><line x1="0" y1="7" x2="28" y2="7" stroke="#57534e"/></pattern>`,
  backdrop,
  pedestalDecor,
  cubeOverlay,
}
