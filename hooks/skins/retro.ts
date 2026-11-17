import { box, n1, poly, pts, seeded } from '../svg'
import type { Box, Pt } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/**
 * Retro: an arcade cabinet at night. A dark screen with a faint pixel horizon,
 * scanlines and a soft CRT vignette; a cabinet panel of a pedestal with a thin
 * amber trim; cubes in phosphor colours with crisp pixel edges. Things move in
 * discrete steps, like a game running at a few frames a second, but quietly.
 */

const K = '#000000'
const INK = '#0b0d18'
const PANEL = '#161a2b'
const LINE = '#2c3150'
const SOFT = '#c9cbe0'
const AMBER = '#ffb000'
const PHOS = '#3ef08e'
const TEAL = '#2bd4c5'
const ROSE = '#ff5c8a'
const SKY = '#59c3ff'

const CRISP = 'shape-rendering="crispEdges"'
const NOPE = 'pointer-events="none"'

/** A rectangle as a path segment. */
const R = (x: number, y: number, w: number, h: number) => `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z`

/** A bitmap drawn as one path per colour, rows merged into runs; '.' or unmapped chars stay empty. */
function sprite(rows: string[], x: number, y: number, q: number, pal: Record<string, string>): string {
  const d: Record<string, string> = {}
  rows.forEach((row, j) => {
    let i = 0
    while (i < row.length) {
      const ch = row[i] ?? '.'
      let k = i + 1
      while (k < row.length && row[k] === ch) k++
      if (pal[ch]) d[ch] = (d[ch] ?? '') + R(x + i * q, y + j * q, (k - i) * q, q)
      i = k
    }
  })
  return Object.keys(d).map(ch => `<path fill="${pal[ch]}" d="${d[ch]}"/>`).join('')
}

const CHECK = ['.......##', '......###', '##...###.', '###.###..', '.#####...', '..###....', '...#.....']
const CROSS = ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##']
const SPARK = ['.#.', '###', '.#.']
const BANG = ['kkk', 'kak', 'kak', 'kak', 'kkk', 'kak', 'kkk']

/** The pixel unit for outlines. */
const px = (S: number) => Math.max(1, S / 28)

/** The cube's outline on screen, front bottom-left round to the back top-left. */
const silhouette = (b: Box): Pt[] => [b.front[0], b.front[1], b.right[1], b.right[2], b.top[3], b.front[3]]
const edges = (b: Box) =>
  poly(silhouette(b), '') + `<polyline points="${pts([b.front[3], b.front[2], b.front[1]])}"/><polyline points="${pts([b.front[2], b.right[2]])}"/>`

/** Discrete, endlessly repeating animation. */
const step = (attr: string, values: string, dur: number, begin = 0) =>
  `<animate attributeName="${attr}" values="${values}" dur="${n1(dur)}s"${begin ? ` begin="${n1(begin)}s"` : ''} calcMode="discrete" repeatCount="indefinite"/>`
/** Discrete one-shot animation that ends frozen. */
const once = (attr: string, values: string, dur: number, begin = 0) =>
  `<animate attributeName="${attr}" values="${values}" dur="${n1(dur)}s" begin="${n1(begin)}s" calcMode="discrete" fill="freeze"/>`
const moveOnce = (values: string, dur: number, begin = 0) =>
  `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${n1(dur)}s" begin="${n1(begin)}s" calcMode="discrete" fill="freeze"/>`

/** Where the pedestal's front face lies in depth, to place things on it. */
function front(ctx: SceneCtx) {
  const yT = ctx.pedestal.front[3][1]
  const o = ctx.P(0, 0, 0)
  const v = ctx.P(0, 1, 0)
  const dvy = v[1] - o[1] || -1
  const pf = (yT - o[1]) / dvy
  return (u: number, w: number) => ctx.P(u, pf, w)
}

/** A finished (phosphor green, pixel check) or failed (rose, pixel cross) block for a cube at u = 0. */
function solidBlock(ctx: SceneCtx, ok: boolean): string {
  const S = ctx.S
  const b = box(ctx.P, 0, 1, 0, 1, 0, 1)
  const [top, fr, side, hi, lo, mark] = ok
    ? ['#5cf5a2', '#1f9d5c', '#126039', '#7dffb5', '#0d4a2b', '#d9ffe9']
    : ['#ff8fab', '#c23a5e', '#6d1a33', '#ffa3ba', '#4d1024', '#ffe3ea']
  const x0 = b.front[0][0]
  const x1 = b.front[1][0]
  const yT = b.front[3][1]
  const yB = b.front[0][1]
  const w = x1 - x0
  const h = yB - yT
  const e = w / 14
  let s = poly(b.front, `fill="${fr}"`) + poly(b.right, `fill="${side}"`) + poly(b.top, `fill="${top}"`)
  // A one-pixel bevel: light along the top and left, dark along the bottom and right.
  s += `<path fill="${hi}" fill-opacity="0.7" d="${R(x0, yT, w, e * 0.6)}${R(x0, yT, e * 0.6, h)}"/>`
  s += `<path fill="${lo}" d="${R(x0, yB - e * 0.6, w, e * 0.6)}${R(x1 - e * 0.6, yT, e * 0.6, h)}"/>`
  // Scanlines across the front face, as on a screen.
  for (let y = yT + e * 1.5; y < yB - e; y += e * 1.5) s += `<path fill="${K}" fill-opacity="0.12" d="${R(x0, y, w, e * 0.5)}"/>`
  const bm = ok ? CHECK : CROSS
  const mw = (bm[0]?.length ?? 0) * e
  const mx = x0 + (w - mw) / 2
  const my = yT + (h - bm.length * e) / 2
  s += sprite(bm, mx + e * 0.5, my + e * 0.5, e, { '#': lo }) + sprite(bm, mx, my, e, { '#': mark })
  s += `<g fill="none" stroke="${K}" stroke-opacity="0.8" stroke-width="${n1(Math.max(1, S * 0.035))}">${edges(b)}</g>`
  return `<g id="retro-${ok ? 'dn' : 'er'}" ${CRISP}>${s}</g>`
}

/** A step not started yet: a dotted pixel outline with small corner pixels, for a cube at u = 0. */
function ghost(ctx: SceneCtx): string {
  const S = ctx.S
  const b = box(ctx.P, 0, 1, 0, 1, 0, 1)
  const lw = Math.max(1, S * 0.03)
  const d = n1(Math.max(2, S * 0.06))
  let s = `<g fill="none" stroke="${SOFT}" stroke-opacity="0.35" stroke-width="${n1(lw)}" stroke-dasharray="${d} ${d}">${edges(b)}</g>`
  const c = lw * 1.8
  const corners = [...silhouette(b), b.front[2]]
  s += `<path fill="${SOFT}" fill-opacity="0.55" d="${corners.map(p => R(p[0] - c / 2, p[1] - c / 2, c, c)).join('')}"/>`
  return `<g id="retro-gh" ${CRISP}>${s}</g>`
}

/** A cube in work, at u = 0: a frame blinking between its colour and white, three loader pixels above it. */
function live(ctx: SceneCtx, waiting: boolean): string {
  const S = ctx.S
  const b = box(ctx.P, 0, 1, 0, 1, 0, 1)
  const col = waiting ? SKY : AMBER
  const q = Math.max(1.2, S * 0.04)
  let s = `<g fill="none" stroke="${col}" stroke-width="${n1(Math.max(1.3, S * 0.04))}">${step('stroke-opacity', '1;0.45', waiting ? 1.4 : 0.9)}${edges(b)}</g>`
  if (ctx.detail > 1) {
    // A loader over the back right corner: three pixels lighting up in turn.
    const [bx, by] = b.right[2]
    for (let k = 0; k < 3; k++) {
      s += `<rect x="${n1(bx - 5 * q + k * 2 * q)}" y="${n1(by - S * 0.22)}" width="${n1(q)}" height="${n1(q)}" fill="${col}" opacity="0.25">${step('opacity', k === 0 ? '1;0.25;0.25' : k === 1 ? '0.25;1;0.25' : '0.25;0.25;1', waiting ? 1.5 : 0.9)}</rect>`
    }
  }
  return `<g id="retro-${waiting ? 'lw' : 'lv'}" ${CRISP}>${s}</g>`
}

/** The one-shot completion: a face flash and a ring of phosphor sparks flying out. */
function burst(ctx: SceneCtx, c: CubeCtx): string {
  const S = ctx.S
  const q = Math.max(1, S * 0.035)
  const b = c.box
  let s = `<g fill="${PHOS}" opacity="0">${once('opacity', '0.6;0;0.4;0;0', 0.5)}${poly(b.front, '')}${poly(b.right, '')}${poly(b.top, '')}</g>`
  const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.5)
  const count = ctx.detail > 1 ? 8 : 4
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + 0.4
    const dx = Math.cos(a) * S * 0.9
    const dy = Math.sin(a) * S * 0.65
    const path = [0, 0.35, 0.65, 0.9, 1].map(t => `${n1(dx * t)} ${n1(dy * t)}`).join(';')
    s +=
      `<g opacity="0">${moveOnce(path, 0.7, 0.1)}${once('opacity', '1;1;1;1;0', 0.7, 0.1)}` +
      sprite(SPARK, cx - 1.5 * q, cy - 1.5 * q, q, { '#': k % 2 ? PHOS : '#d9ffe9' }) + `</g>`
  }
  return `<g ${CRISP} ${NOPE}>${s}</g>`
}

/** A blinking amber "!" over a cube that looks stuck. */
function alarm(ctx: SceneCtx, c: CubeCtx): string {
  const q = Math.max(1, ctx.S * 0.04)
  const x = c.box.front[3][0] - 1.5 * q
  const y = c.box.top[3][1] - 7 * q - ctx.S * 0.12
  return `<g ${CRISP} ${NOPE}>${step('opacity', '1;1;0', 0.9)}${sprite(BANG, x, y, q, { k: K, a: AMBER })}</g>`
}

/** A stepped skyline: the highest of a few mounds [centre x, radius x, height], quantised to the pixel grid. */
function ridge(W: number, H: number, g: number, mounds: [number, number, number][]): string {
  let d = `M0 ${n1(H)}`
  let last = NaN
  for (let x = 0; x < W; x += g) {
    let y = H
    for (const [cx, rx, ry] of mounds) {
      const t = (x + g / 2 - cx) / rx
      if (t > -1 && t < 1) y = Math.min(y, H - ry * (1 - Math.abs(t)))
    }
    y = Math.round(y / g) * g
    if (y !== last) d += `V${n1(y)}`
    d += `H${n1(Math.min(W, x + g))}`
    last = y
  }
  return d + `V${n1(H)}Z`
}

export const retro: Skin = {
  id: 'retro',
  name: 'Retro',
  description: 'An arcade cabinet at night: pixel art in phosphor colours with a soft CRT glow',
  status: {
    pending: ['#4a4f6a', '#373b52', '#24273a'],
    running: ['#ffc94d', '#e09a00', '#7a5200'],
    done: ['#7dffb5', '#2fc77a', '#16603c'],
    error: ['#ff8fab', '#e0446a', '#6d1a33'],
    waiting: ['#9fe7ff', '#3fb8e6', '#1d4f66'],
  },
  glass: { top: 0.3, bottom: 0.1, ghost: 0.5 },
  edge: { color: K, opacity: 0.65 },
  mini: {
    top: ['#e6e4f2', '#d8d6e6'],
    front: ['#aeb0c6', '#9a9db5'],
    side: ['#6f7290', '#5c5f7b'],
    highlight: '#ffffff',
    glint: '#ffffff',
  },
  tint: {
    read: [SKY, 0.55],
    write: [AMBER, 0.55],
    run: [ROSE, 0.5],
    agent: [PHOS, 0.5],
    other: [SOFT, 0],
    err: [ROSE, 0.85],
  },
  pedestal: {
    front: ['#1d2136', PANEL, '#10131f'],
    top: ['#2a2e46', '#1e2236'],
    side: ['#121522', '#0a0c15'],
    footTop: '#1a1d2e',
    footSide: '#07080f',
    light: '#4a5078',
    shadow: K,
  },
  plaque: {
    frame: ['#2a2e45', '#22263a'],
    inner: [K, '#0e1120'],
    text: { pending: '#6b7089', running: AMBER, done: PHOS, error: ROSE, waiting: SKY },
    caption: SOFT,
  },
  track: { groove: '#05060c', from: AMBER, to: PHOS, head: '#ffffff' },
  pipe: { fill: 'pixel', colors: [AMBER, PHOS, '#d9ffe9'], metal: '#4b5070' },
  font: '"Courier New",Consolas,ui-monospace,monospace',
  effects: { glint: false, sparks: false, sweep: false, plaqueShadow: false },

  defs(ctx) {
    if (ctx.detail === 0) return ''
    let s =
      `<pattern id="retro-scan" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="${K}" fill-opacity="0.22"/></pattern>` +
      `<radialGradient id="retro-vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="${K}" stop-opacity="0"/><stop offset="1" stop-color="${K}" stop-opacity="0.55"/></radialGradient>` +
      `<linearGradient id="retro-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${INK}"/><stop offset="0.7" stop-color="#151a33"/><stop offset="1" stop-color="#231a3d"/></linearGradient>`
    s += solidBlock(ctx, true) + solidBlock(ctx, false) + ghost(ctx)
    if (ctx.hasLive) s += live(ctx, false) + live(ctx, true)
    return s
  },

  backdrop(ctx) {
    const { width: W, height: H, S } = ctx
    const rr = Math.min(12, S * 0.25)
    let s = `<rect width="${W}" height="${H}" rx="${n1(rr)}" fill="url(#retro-sky)"/>`
    if (ctx.detail === 0) return s
    const rnd = seeded(5 + ctx.n * 3)
    const g = Math.max(2, S / 12)
    // A few stars, pixel sized.
    for (let k = 0; k < Math.round(W / 18); k++) {
      const x = Math.round((rnd() * W) / g) * g
      const y = Math.round((rnd() * H * 0.45) / g) * g
      s += `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(g * 0.5)}" height="${n1(g * 0.5)}" fill="${SOFT}" opacity="${n1(0.2 + rnd() * 0.45)}"/>`
    }
    // A stepped mountain ridge on the horizon, a thin teal rim on its crest.
    const yPed = ctx.pedestal.top[2][1]
    const mounds: [number, number, number][] = []
    const count = Math.max(3, Math.ceil(W / (S * 2.2)))
    for (let i = 0; i < count; i++) mounds.push([((i + rnd()) / count) * W, S * (1 + rnd() * 1.2), H - yPed + S * (0.25 + rnd() * 0.7)])
    const d = ridge(W, H, g, mounds)
    s += `<path d="${d}" fill="#141833" ${CRISP}/>`
    s += `<path d="${d}" fill="none" stroke="${TEAL}" stroke-opacity="0.35" stroke-width="1" ${CRISP}/>`
    // A perspective grid fading into the horizon.
    if (ctx.detail > 1) {
      const hz = yPed - S * 0.1
      let grid = ''
      for (let k = 1; k <= 6; k++) {
        const y = hz + ((H - hz) * (k * k)) / 36
        grid += `<line x1="0" y1="${n1(y)}" x2="${W}" y2="${n1(y)}"/>`
      }
      for (let k = -8; k <= 8; k++) grid += `<line x1="${n1(W / 2 + k * S * 0.35)}" y1="${n1(hz)}" x2="${n1(W / 2 + k * S * 2.2)}" y2="${H}"/>`
      s += `<g stroke="#8b6cff" stroke-opacity="0.16" stroke-width="1">${grid}</g>`
      // A quiet high score in amber.
      if (W >= 260) {
        const fs = Math.max(7, S * 0.16)
        const pct = Number.isFinite(ctx.overall) ? Math.round(Math.max(0, Math.min(1, ctx.overall)) * 100) : 0
        s += `<text class="t" x="${n1(rr + 4)}" y="${n1(rr + fs)}" font-size="${n1(fs)}" fill="${AMBER}" fill-opacity="0.75" letter-spacing="1">HI ${String(pct * 100).padStart(6, '0')}</text>`
      }
    }
    return s
  },

  pedestalDecor(ctx) {
    if (ctx.detail === 0) return ''
    const ped = ctx.pedestal
    const p = px(ctx.S)
    const f = ped.front
    // Fine panel seams across the cabinet front, and an amber pixel trim along its top edge.
    let seams = ''
    const rows = 4
    for (let k = 1; k < rows; k++) {
      const y = f[3][1] + ((f[0][1] - f[3][1]) * k) / rows
      seams += R(f[0][0] + p * 2, y, f[1][0] - f[0][0] - p * 4, p * 0.6)
    }
    return (
      `<g ${CRISP}>` +
      `<path d="${seams}" fill="${K}" fill-opacity="0.35"/>` +
      `<path d="${R(f[3][0], f[3][1], f[2][0] - f[3][0], p)}" fill="${AMBER}" fill-opacity="0.7"/>` +
      `<g fill="none" stroke="${K}" stroke-width="${n1(p)}">${poly(ped.front, '')}${poly(ped.right, '')}${poly(ped.top, '')}</g></g>`
    )
  },

  cubeOverlay(ctx, c) {
    if (ctx.detail === 0) return ''
    const dx = ctx.P(c.u0, 0, 0)[0] - ctx.P(0, 0, 0)[0]
    const use = (id: string) => `<use href="#retro-${id}" x="${n1(dx)}" ${NOPE}/>`
    let s = ''
    if (c.kind === 'solid') {
      s += use(c.status === 'error' ? 'er' : 'dn')
      if (c.justDone && c.status === 'done') s += burst(ctx, c)
    } else if (c.isGhost) s += use('gh')
    else if (c.isLive && ctx.hasLive) s += use(c.status === 'waiting' ? 'lw' : 'lv')
    if (c.stuck) s += alarm(ctx, c)
    return s
  },

  overlay(ctx) {
    const { width: W, height: H, S } = ctx
    if (ctx.detail === 0) return ''
    // Score-box frames on the plaques: a black rim and a fine inner line.
    const at = front(ctx)
    const p = px(S)
    let rim = ''
    let inner = ''
    for (let i = 0; i < ctx.n; i++) {
      const cu = ctx.cubeU(i) + 0.5
      const [lx, ly] = at(cu - 0.37, -0.14)
      const [rx, ry] = at(cu + 0.37, -0.6)
      rim += R(lx, ly, rx - lx, ry - ly)
      inner += R(lx + 2 * p, ly + 2 * p, rx - lx - 4 * p, ry - ly - 4 * p)
    }
    const rr = Math.min(12, S * 0.25)
    return (
      `<g ${CRISP} ${NOPE}><path d="${rim}" fill="none" stroke="${K}" stroke-width="${n1(2 * p)}"/><path d="${inner}" fill="none" stroke="${LINE}" stroke-width="${n1(p)}"/></g>` +
      // The screen: scanlines and a vignette over everything.
      `<g ${NOPE}><rect width="${W}" height="${H}" rx="${n1(rr)}" fill="url(#retro-scan)"/><rect width="${W}" height="${H}" rx="${n1(rr)}" fill="url(#retro-vig)"/></g>`
    )
  },
}
