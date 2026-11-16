import { box, n1, poly, pts, seeded } from '../svg'
import type { Box, Pt } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/**
 * Retro: an 8-bit platformer. A blocky day sky with pixel clouds and stepped
 * hills, a brick platform, score-box plaques, "?" item blocks over the cubes
 * being worked on, green blocks with a pixel check once done. Everything
 * moves in discrete steps, like a game running at a few frames a second.
 */

// A PICO-8-like palette.
const K = '#000000'
const WH = '#fff1e8'
const NAVY = '#1d2b53'
const PURP = '#7e2553'
const DKG = '#008751'
const BRN = '#ab5236'
const LGR = '#c2c3c7'
const RED = '#ff004d'
const ORA = '#ffa300'
const YEL = '#ffec27'
const GRN = '#00e436'
const BLU = '#29adff'
const PNK = '#ff77a8'
const TAN = '#fcbc74'

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

const Q_BLOCK = [
  'kkkkkkkkkkkk',
  'kyyyyyyyyyyk',
  'kyboowwwoobk',
  'kyoowooowobk',
  'kyoooooowobk',
  'kyooooowoobk',
  'kyoooowooobk',
  'kyoooooooobk',
  'kyoooowooobk',
  'kyboooooobbk',
  'kbbbbbbbbbbk',
  'kkkkkkkkkkkk',
]
const COIN = ['.kk.', 'kyok', 'kywk', 'kyok', 'kyok', '.kk.']
const CHECK = ['.......##', '......###', '##...###.', '###.###..', '.#####...', '..###....', '...#.....']
const CROSS = ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##']
const STAR = ['..#..', '..#..', '#####', '..#..', '..#..']
const BANG = ['kkkkk', 'krwrk', 'krwrk', 'krwrk', 'krwrk', 'krrrk', 'krwrk', 'krrrk', 'kkkkk']
const CLOUD = ['....kkkk....', '..kkwwwwkk..', '.kwwwwwwwwk.', 'kwwwwwwwwwwk', 'kwwsswwwsswk', '.kkkkkkkkkk.']

/** The pixel unit for outlines and mortar. */
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

/** A spinning pixel coin centred at the origin. */
function coin(q: number): string {
  return (
    `<g>${sprite(COIN, -2 * q, -3 * q, q, { k: K, y: YEL, o: ORA, w: WH })}` +
    `<animateTransform attributeName="transform" type="scale" values="1 1;0.5 1;0.2 1;0.5 1" dur="0.48s" calcMode="discrete" repeatCount="indefinite"/></g>`
  )
}

/** Where the pedestal's front face lies in depth, to place things on it. */
function front(ctx: SceneCtx) {
  const yT = ctx.pedestal.front[3][1]
  const o = ctx.P(0, 0, 0)
  const v = ctx.P(0, 1, 0)
  const dvy = v[1] - o[1] || -1
  const pf = (yT - o[1]) / dvy
  return (u: number, w: number) => ctx.P(u, pf, w)
}

/** A finished (green, pixel check) or failed (red, pixel X) block for a cube at u = 0. */
function solidBlock(ctx: SceneCtx, ok: boolean): string {
  const S = ctx.S
  const b = box(ctx.P, 0, 1, 0, 1, 0, 1)
  const [top, fr, side, hi, lo] = ok ? [GRN, DKG, '#065a3a', GRN, '#004a2a'] : [PNK, RED, PURP, PNK, PURP]
  const x0 = b.front[0][0]
  const x1 = b.front[1][0]
  const yT = b.front[3][1]
  const yB = b.front[0][1]
  const w = x1 - x0
  const h = yB - yT
  const e = w / 14
  let s = poly(b.front, `fill="${fr}"`) + poly(b.right, `fill="${side}"`) + poly(b.top, `fill="${top}"`)
  // Bevel: light top and left, dark bottom and right, four rivets.
  s += `<path fill="${hi}" d="${R(x0, yT, w, e)}${R(x0, yT, e, h)}"/>`
  s += `<path fill="${lo}" d="${R(x0, yB - e, w, e)}${R(x1 - e, yT, e, h)}${R(x0 + 2 * e, yT + 2 * e, e, e)}${R(x1 - 3 * e, yT + 2 * e, e, e)}${R(x0 + 2 * e, yB - 3 * e, e, e)}${R(x1 - 3 * e, yB - 3 * e, e, e)}"/>`
  // A stripe of light along the top face's front edge.
  s += poly([b.top[0], b.top[1], ctx.P(1, 0.12, 1), ctx.P(0, 0.12, 1)], `fill="${WH}" fill-opacity="0.35"`)
  const bm = ok ? CHECK : CROSS
  const mw = (bm[0]?.length ?? 0) * e
  const mx = x0 + (w - mw) / 2
  const my = yT + (h - bm.length * e) / 2
  s += sprite(bm, mx + e * 0.7, my + e * 0.7, e, { '#': K }) + sprite(bm, mx, my, e, { '#': WH })
  s += `<g fill="none" stroke="${K}" stroke-width="${n1(Math.max(1, S * 0.04))}">${edges(b)}</g>`
  return `<g id="retro-${ok ? 'dn' : 'er'}" ${CRISP}>${s}</g>`
}

/** A step not started yet: a dotted pixel outline with corner pixels, for a cube at u = 0. */
function ghost(ctx: SceneCtx): string {
  const S = ctx.S
  const b = box(ctx.P, 0, 1, 0, 1, 0, 1)
  const lw = Math.max(1.2, S * 0.04)
  const d = n1(Math.max(2, S * 0.07))
  const k = ctx.P(0, 1, 0)
  const kk = `M${n1(k[0])} ${n1(k[1])}`
  let s =
    `<path d="${kk}H${n1(ctx.P(1, 1, 0)[0])}${kk}L${n1(b.front[0][0])} ${n1(b.front[0][1])}${kk}V${n1(ctx.P(0, 1, 1)[1])}" ` +
    `fill="none" stroke="${WH}" stroke-opacity="0.45" stroke-width="${n1(lw * 0.7)}" stroke-dasharray="${d} ${d}"/>`
  s += `<g fill="none" stroke="${K}" stroke-opacity="0.35" stroke-width="${n1(lw + 1)}">${edges(b)}</g>`
  s += `<g fill="none" stroke="${WH}" stroke-width="${n1(lw)}" stroke-dasharray="${d} ${d}">${edges(b)}</g>`
  const c = lw * 1.6
  const corners = [...silhouette(b), b.front[2]]
  s += `<path fill="${WH}" stroke="${K}" stroke-width="0.6" d="${corners.map(p => R(p[0] - c / 2, p[1] - c / 2, c, c)).join('')}"/>`
  return `<g id="retro-gh" ${CRISP}>${s}</g>`
}

/** A cube in work, at u = 0: a blinking pixel frame, a bobbing "?" block (coins pop out while running) and sparkles. */
function live(ctx: SceneCtx, waiting: boolean): string {
  const S = ctx.S
  const b = box(ctx.P, 0, 1, 0, 1, 0, 1)
  const col = waiting ? BLU : YEL
  const q = Math.max(1, S * 0.03)
  let s = `<g fill="none" stroke="${col}" stroke-width="${n1(Math.max(1.4, S * 0.045))}">${step('stroke', `${col};${WH}`, waiting ? 1.2 : 0.8)}${edges(b)}</g>`
  // The "?" block hovering over the back right corner.
  const bx = b.right[2][0] - 6 * q
  const by = b.right[2][1] - 12 * q - S * 0.2
  const pal = waiting ? { k: K, y: '#c7ecff', o: BLU, b: NAVY, w: WH } : { k: K, y: TAN, o: ORA, b: BRN, w: WH }
  if (!waiting && ctx.detail > 1) {
    const ys = [0, 4, 7, 9, 10, 9, 7, 0, 0, 0].map(k => `0 ${n1(-k * q)}`).join(';')
    s +=
      `<g transform="translate(${n1(bx + 6 * q)} ${n1(by - 3 * q)})"><g opacity="0">` +
      `<animateTransform attributeName="transform" type="translate" values="${ys}" dur="2s" calcMode="discrete" repeatCount="indefinite"/>` +
      step('opacity', '0;1;1;1;1;1;1;0;0;0', 2) + coin(q) + `</g></g>`
  }
  s +=
    `<g>${sprite(Q_BLOCK, bx, by, q, pal)}` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${n1(-q)};0 0;0 0" dur="${waiting ? 1.6 : 0.8}s" calcMode="discrete" repeatCount="indefinite"/></g>`
  if (ctx.detail > 1) {
    // Two sparkles blinking at the cube's top corners.
    for (const [p, t] of [[b.front[3], 0], [b.right[1], 0.6]] as const) {
      s += `<g opacity="0">${step('opacity', '0;1;0;0', 1.2, t)}${sprite(STAR, p[0] - 2.5 * q, p[1] - 2.5 * q, q, { '#': WH })}</g>`
    }
  }
  return `<g id="retro-${waiting ? 'lw' : 'lv'}" ${CRISP}>${s}</g>`
}

/** The one-shot completion: a face flash, a coin popping up, "+1" rising and a pixel star burst. */
function burst(ctx: SceneCtx, c: CubeCtx): string {
  const S = ctx.S
  const q = Math.max(1, S * 0.035)
  const b = c.box
  let s = `<g fill="${WH}" opacity="0">${once('opacity', '0.9;0;0.7;0;0', 0.5)}${poly(b.front, '')}${poly(b.right, '')}${poly(b.top, '')}</g>`
  const [tx, ty] = c.top
  const rise = (a: number, k: number) => Array.from({ length: k + 1 }, (_, i) => `0 ${n1(-a * i)}`).join(';')
  s += `<g transform="translate(${n1(tx)} ${n1(ty)})"><g opacity="0">${moveOnce(rise(S * 0.12, 7), 0.8)}${once('opacity', '1;1;1;1;1;1;1;0', 0.8)}${coin(q)}</g></g>`
  const fs = Math.max(8, S * 0.26)
  s +=
    `<g transform="translate(${n1(tx)} ${n1(ty - S * 0.3)})"><text class="t" x="0" y="0" font-size="${n1(fs)}" fill="${YEL}" stroke="${K}" stroke-width="${n1(fs * 0.14)}" paint-order="stroke" text-anchor="middle" opacity="0">+1` +
    `${moveOnce(rise(S * 0.1, 8), 1.2, 0.3)}${once('opacity', '1;1;1;1;1;1;1;1;0', 1.2, 0.3)}</text></g>`
  const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.5)
  const count = ctx.detail > 1 ? 8 : 4
  const cols = [YEL, WH, PNK, ORA]
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + 0.4
    const dx = Math.cos(a) * S * 0.95
    const dy = Math.sin(a) * S * 0.7
    const path = [0, 0.35, 0.65, 0.9, 1].map(t => `${n1(dx * t)} ${n1(dy * t)}`).join(';')
    s +=
      `<g opacity="0">${moveOnce(path, 0.75, 0.1)}${once('opacity', '1;1;1;1;0', 0.75, 0.1)}` +
      sprite(STAR, cx - 2.5 * q, cy - 2.5 * q, q, { '#': cols[k % cols.length] ?? WH }) + `</g>`
  }
  return `<g ${CRISP} ${NOPE}>${s}</g>`
}

/** A blinking pixel "!" over a cube that looks stuck. */
function alarm(ctx: SceneCtx, c: CubeCtx): string {
  const q = Math.max(1, ctx.S * 0.035)
  const x = c.box.front[3][0] - 2.5 * q
  const y = c.box.top[3][1] - 9 * q - ctx.S * 0.12
  return `<g ${CRISP} ${NOPE}>${step('opacity', '1;1;0', 0.9)}${sprite(BANG, x, y, q, { k: K, r: RED, w: WH })}</g>`
}

/** A stepped hill line: the highest of a few mounds [centre x, radius x, height], quantised to the pixel grid. */
function hills(W: number, H: number, g: number, mounds: [number, number, number][]): string {
  let d = `M0 ${n1(H)}`
  let last = NaN
  for (let x = 0; x < W; x += g) {
    let y = H
    for (const [cx, rx, ry] of mounds) {
      const t = (x + g / 2 - cx) / rx
      if (t > -1 && t < 1) y = Math.min(y, H - ry * Math.sqrt(1 - t * t))
    }
    y = Math.round(y / g) * g
    if (y !== last) d += `V${n1(y)}`
    d += `H${n1(Math.min(W, x + g))}`
    last = y
  }
  return d + `V${n1(H)}Z`
}

/** 8-bit platformer: pixel sky, brick platform, "?" item blocks and green pixel blocks. */
export const retro: Skin = {
  id: 'retro',
  name: 'Retro',
  description: 'Retro-Pixel im 8-Bit-Spielstil',
  status: {
    pending: [LGR, '#9a9ca3', '#5f574f'],
    running: [YEL, ORA, BRN],
    done: [GRN, DKG, '#065a3a'],
    error: [PNK, RED, PURP],
    waiting: ['#9fdcff', BLU, NAVY],
  },
  glass: { top: 0.38, bottom: 0.14, ghost: 0.55 },
  edge: { color: K, opacity: 0.6 },
  mini: {
    top: [WH, WH],
    front: [LGR, LGR],
    side: ['#7d808a', '#7d808a'],
    highlight: WH,
    glint: WH,
  },
  tint: {
    read: [BLU, 0.6],
    write: [ORA, 0.6],
    run: [PNK, 0.6],
    agent: [GRN, 0.6],
    other: [LGR, 0],
    err: [RED, 0.85],
  },
  pedestal: {
    front: ['#d0581c', '#c84c0c', '#a83c08'],
    top: [TAN, '#e09048'],
    side: ['#8a3408', '#6a2804'],
    footTop: '#5f574f',
    footSide: '#3a3430',
    light: TAN,
    shadow: K,
  },
  plaque: {
    frame: [LGR, LGR],
    inner: [K, NAVY],
    text: { pending: LGR, running: YEL, done: GRN, error: RED, waiting: BLU },
    caption: WH,
  },
  track: { groove: K, from: YEL, to: GRN, head: ORA },
  font: '"Courier New",Consolas,ui-monospace,monospace',

  defs(ctx) {
    if (ctx.detail === 0) return ''
    const S = ctx.S
    const p = px(S)
    const ped = ctx.pedestal
    const o = ctx.P(0, 0, 0)
    const v = ctx.P(0, 1, 0)
    const dvx = v[0] - o[0] || 1
    const dvy = v[1] - o[1] || -1
    const bh = S * 0.22
    // Bricks: two rows per tile, the lower one offset by half a brick.
    const brick = (id: string, bw: number, tr: string) =>
      `<pattern id="${id}" width="${n1(bw)}" height="${n1(2 * bh)}" patternUnits="userSpaceOnUse" patternTransform="${tr}">` +
      `<path fill="${TAN}" fill-opacity="0.5" d="${R(p, p, bw - p, p)}${R(0, bh + p, bw, p)}${R(p, p, p, bh - p)}${R(bw / 2 + p, bh + p, p, bh - p)}"/>` +
      `<path fill="${K}" fill-opacity="0.55" d="${R(0, 0, bw, p)}${R(0, bh, bw, p)}${R(0, 0, p, bh)}${R(bw / 2, bh, p, bh)}"/></pattern>`
    const f = ped.front[3]
    const r = ped.right[3]
    const t = ped.top[0]
    const tw = S * 0.5
    const th = Math.abs(dvy) * 0.4
    let s =
      brick('retro-brk', S * 0.5, `translate(${n1(f[0])} ${n1(f[1])})`) +
      brick('retro-brs', S * 0.3, `matrix(1 ${n1(dvy / dvx)} 0 1 ${n1(r[0])} ${n1(r[1])})`) +
      `<pattern id="retro-tl" width="${n1(tw)}" height="${n1(th)}" patternUnits="userSpaceOnUse" patternTransform="matrix(1 0 ${n1(dvx / dvy)} 1 ${n1(t[0])} ${n1(t[1])})">` +
      `<path fill="${WH}" fill-opacity="0.35" d="${R(p, p * 0.8, tw - p, p * 0.7)}"/>` +
      `<path fill="${BRN}" fill-opacity="0.6" d="${R(0, 0, tw, p * 0.8)}${R(0, 0, p, th)}"/></pattern>`
    s += solidBlock(ctx, true) + solidBlock(ctx, false) + ghost(ctx)
    if (ctx.hasLive) s += live(ctx, false) + live(ctx, true)
    return s
  },

  backdrop(ctx) {
    const { width: W, height: H, S } = ctx
    const border = `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${K}" stroke-width="2"/>`
    if (ctx.detail === 0) return `<g ${CRISP}><rect width="${W}" height="${H}" fill="#5c94fc"/>${border}</g>`
    // The sky in hard bands, lighter towards the horizon.
    const bands = ['#3c74ec', '#4a84f4', '#5c94fc', '#74a8ff']
    let s = bands.map((c, i) => `<rect y="${n1((H * i) / 4)}" width="${W}" height="${n1(H / 4 + 1)}" fill="${c}"/>`).join('')
    // Stepped hills behind the platform.
    const g = Math.max(2, S / 10)
    const yPed = ctx.pedestal.top[2][1]
    const rnd = seeded(11 + ctx.n * 7)
    const far: [number, number, number][] = []
    const near: [number, number, number][] = []
    const count = Math.max(2, Math.ceil(W / (S * 2.6)))
    for (let i = 0; i < count; i++) {
      const cx = ((i + 0.2 + rnd() * 0.6) / count) * W
      far.push([cx, S * (1.1 + rnd() * 0.9), H - yPed + S * (0.3 + rnd() * 0.6)])
      near.push([cx + S * (rnd() - 0.5) * 1.6, S * (0.8 + rnd() * 0.6), H - yPed - S * (0.1 + rnd() * 0.3)])
    }
    s += `<path d="${hills(W, H, g, far)}" fill="${DKG}" stroke="${K}" stroke-opacity="0.5" stroke-width="1"/>`
    s += `<path d="${hills(W, H, g, near)}" fill="#00a84a" stroke="${K}" stroke-opacity="0.5" stroke-width="1"/>`
    if (ctx.detail > 1) {
      // Blocky clouds up in the sky.
      const c = Math.max(1.5, S / 12)
      const clouds = Math.max(2, Math.round(W / 170))
      for (let i = 0; i < clouds; i++) {
        const x = ((i + rnd() * 0.7) / clouds) * W
        const y = H * (0.05 + rnd() * 0.22)
        s += sprite(CLOUD, x, y, c * (0.8 + rnd() * 0.5), { k: NAVY, w: WH, s: LGR })
      }
      // A score readout in the corner.
      if (W >= 260) {
        const fs = Math.max(7, S * 0.17)
        const pct = Number.isFinite(ctx.overall) ? Math.round(Math.max(0, Math.min(1, ctx.overall)) * 100) : 0
        const score = String(pct * 100).padStart(6, '0')
        s += `<text class="t" x="8" y="${n1(6 + fs)}" font-size="${n1(fs)}" fill="${WH}" stroke="${K}" stroke-width="${n1(fs * 0.16)}" paint-order="stroke">SCORE ${score}</text>`
      }
    }
    return `<g ${CRISP}>${s}${border}</g>`
  },

  pedestalDecor(ctx) {
    if (ctx.detail === 0) return ''
    const ped = ctx.pedestal
    return (
      `<g ${CRISP}>` +
      poly(ped.front, 'fill="url(#retro-brk)"') +
      poly(ped.right, 'fill="url(#retro-brs)"') +
      poly(ped.top, 'fill="url(#retro-tl)"') +
      `<g fill="none" stroke="${K}" stroke-width="${n1(px(ctx.S))}">${poly(ped.front, '')}${poly(ped.right, '')}${poly(ped.top, '')}</g></g>`
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
    if (ctx.detail === 0) return ''
    // Score-box frames on the plaques: a black rim, a white inner line and square corners.
    const at = front(ctx)
    const p = px(ctx.S)
    let rim = ''
    let inner = ''
    let notch = ''
    for (let i = 0; i < ctx.n; i++) {
      const cu = ctx.cubeU(i) + 0.5
      const [lx, ly] = at(cu - 0.37, -0.14)
      const [rx, ry] = at(cu + 0.37, -0.6)
      const w = rx - lx
      const h = ry - ly
      rim += R(lx, ly, w, h)
      inner += R(lx + 2 * p, ly + 2 * p, w - 4 * p, h - 4 * p)
      for (const [x, y] of [[lx, ly], [rx - 2 * p, ly], [lx, ry - 2 * p], [rx - 2 * p, ry - 2 * p]] as const) notch += R(x, y, 2 * p, 2 * p)
    }
    return (
      `<g ${CRISP} ${NOPE}>` +
      `<path d="${rim}" fill="none" stroke="${K}" stroke-width="${n1(2 * p)}"/>` +
      `<path d="${inner}" fill="none" stroke="${WH}" stroke-width="${n1(p)}"/>` +
      `<path d="${notch}" fill="${K}"/></g>`
    )
  },
}
