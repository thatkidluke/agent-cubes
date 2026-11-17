import type { CubeCtx, SceneCtx, Skin } from './types'
import { circle, lin, line, n1, pline, poly, rad, seeded } from '../svg'
import type { Pt } from '../svg'

/**
 * Stellar: energy cubes floating in deep space. A dark starfield panel with
 * nebula glows, an obsidian pedestal with constellations and an aurora edge,
 * glass cubes holding a plasma core, done cubes as crystallised star-matter.
 */

const STAR_COLORS = ['#ffffff', '#e0e7ff', '#fbcfe8', '#a5f3fc', '#ffffff', '#ddd6fe']

type Trio = [string, string, string]
const CORE_RUN: Trio = ['#e0f7ff', '#38bdf8', '#6366f1']
const CORE_WAIT: Trio = ['#fff7d6', '#fbbf24', '#f97316']
/** Core colours of a glass cube: centre, body, rim. */
const coreOf = (status: string): Trio => (status === 'waiting' ? CORE_WAIT : CORE_RUN)

/** A four-pointed sparkle, unit size, placed with <use> and scaled. */
const SPARK = 'M0-1Q.13-.13 1 0Q.13 .13 0 1Q-.13 .13-1 0Q-.13-.13 0-1Z'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** A tile of scattered stars, repeated as a pattern. */
function starTile(id: string, w: number, h: number, count: number, seed: number, rMin: number, rMax: number, oMin: number): string {
  const r = seeded(seed)
  let s = `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">`
  for (let i = 0; i < count; i++) {
    const x = r() * w
    const y = r() * h
    const rr = rMin + r() * (rMax - rMin)
    const o = oMin + r() * (1 - oMin)
    const c = STAR_COLORS[Math.floor(r() * STAR_COLORS.length)] ?? '#ffffff'
    s += circle([x, y], rr, `fill="${c}" opacity="${n1(o)}"`)
  }
  return s + '</pattern>'
}

/** A sparkle centred on p with radius s. */
const sparkle = (p: Pt, s: number, attrs: string, inner = '') =>
  `<use href="#stellar-spark" transform="translate(${n1(p[0])} ${n1(p[1])}) scale(${Math.round(Math.max(0.5, s) * 100) / 100})" ${attrs}>${inner}</use>`

/** The pedestal's front plane: (u, w) → screen. */
function frontPlane(ctx: SceneCtx): (u: number, w: number) => Pt {
  const o = ctx.P(0, 0, 0)
  const pv = ctx.P(0, 1, 0)
  const tl = ctx.pedestal.front[3]
  const dvy = pv[1] - o[1]
  const vF = dvy ? (tl[1] - o[1]) / dvy : 0
  return (u, w) => ctx.P(u, vF, w)
}

/** Where a glass cube's energy core floats: just above its pile of mini cubes. */
function corePos(ctx: SceneCtx, c: CubeCtx): { p: Pt; f: number } {
  const slots = Math.max(1, c.slots)
  const f = clamp(c.fill / slots, 0, 1)
  const per = Math.max(1, Math.round(Math.cbrt(slots)))
  const layers = Math.ceil(clamp(c.fill, 0, slots) / (per * per))
  const level = 0.05 + layers * (0.9 / per)
  const w = clamp(level + 0.14, 0.4, 0.8)
  return { p: ctx.P(c.u0 + 0.5, 0.5, w), f }
}

/** The orbit around a live cube: centre, radii, tilt. */
function orbit(ctx: SceneCtx, c: CubeCtx) {
  const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.5)
  return { cx, cy, rx: ctx.S * 0.78, ry: ctx.S * 0.2, rot: `rotate(-12 ${n1(cx)} ${n1(cy)})` }
}

export const stellar: Skin = {
  id: 'stellar',
  name: 'Stellar',
  description: 'Energy cubes in a star field: plasma cores, star matter and an obsidian pedestal',
  status: {
    pending: ['#a5b4fc', '#6366f1', '#3730a3'],
    running: ['#bae6fd', '#38bdf8', '#0369a1'],
    done: ['#a7f3d0', '#34d399', '#047857'],
    error: ['#f87171', '#b91c1c', '#7f1d1d'],
    waiting: ['#fde68a', '#f59e0b', '#b45309'],
  },
  glass: { top: 0.3, bottom: 0.07, ghost: 0.6 },
  edge: { color: '#1e1b4b', opacity: 0.5 },
  mini: {
    top: ['#ffffff', '#eef0ff'],
    front: ['#e4e7ff', '#b3b8e6'],
    side: ['#b0b5e0', '#7378b0'],
    highlight: '#ffffff',
    glint: '#e0f2fe',
  },
  tint: {
    read: ['#3b82f6', 0.5],
    write: ['#f59e0b', 0.55],
    run: ['#8b5cf6', 0.5],
    agent: ['#14b8a6', 0.5],
    other: ['#a78bfa', 0.08],
    err: ['#ef4444', 0.82],
  },
  pedestal: {
    front: ['#302a5c', '#211d45', '#15122f'],
    top: ['#4a4190', '#2c2662'],
    side: ['#1d1940', '#0d0b20'],
    footTop: '#2a2556',
    footSide: '#0b0a1d',
    light: '#c4b5fd',
    shadow: '#000000',
  },
  plaque: {
    frame: ['#8b7cf6', '#3b2f86'],
    inner: ['#1e1a4a', '#0b0a22'],
    text: { pending: '#a5b4fc', running: '#7dd3fc', done: '#6ee7b7', error: '#fca5a5', waiting: '#fcd34d' },
    caption: '#c7d2fe',
  },
  track: { groove: '#0c0a22' },
  pipe: { fill: 'energy', colors: ['#6366f1', '#a78bfa', '#f0abfc'], metal: '#312e81' },
  day: { sky: ['#f1f3ff', '#dfe4ff'], ink: '#6366f1', pattern: 'stars' },
  font: 'Avenir Next,Futura,Century Gothic,Segoe UI,system-ui,sans-serif',

  defs(ctx) {
    const { width, height, detail, hasLive } = ctx
    const out: string[] = []
    out.push(
      `<linearGradient id="stellar-bg" x1="0" y1="0" x2="0.3" y2="1">` +
        `<stop offset="0" stop-color="#1b1550"/><stop offset="0.55" stop-color="#0e0b2c"/><stop offset="1" stop-color="#06051a"/></linearGradient>`,
    )
    out.push(rad('stellar-n1', [[0, '#ec4899', 0.34], [0.5, '#a855f7', 0.12], [1, '#6d28d9', 0]]))
    out.push(rad('stellar-n2', [[0, '#2dd4bf', 0.26], [0.55, '#0ea5e9', 0.08], [1, '#0ea5e9', 0]]))
    out.push(`<clipPath id="stellar-clip"><rect width="${width}" height="${height}" rx="${n1(Math.min(16, ctx.S * 0.3))}"/></clipPath>`)
    out.push(`<path id="stellar-spark" d="${SPARK}"/>`)
    for (const [id, [a, b, c]] of [['stellar-cr', CORE_RUN], ['stellar-cw', CORE_WAIT]] as const) {
      out.push(rad(id, [[0, '#ffffff', 1], [0.16, a, 0.95], [0.45, b, 0.5], [1, c, 0]]))
      out.push(lin(`${id}b`, 0, 1, [[0, '#ffffff', 0.55], [0.45, b, 0.25], [1, b, 0.05]]))
    }
    // Star-matter: a ring halo around a finished cube, and the light inside it.
    out.push(rad('stellar-hd', [[0, '#34d399', 0], [0.45, '#34d399', 0], [0.58, '#6ee7b7', 0.32], [1, '#14b8a6', 0]]))
    out.push(rad('stellar-he', [[0, '#ef4444', 0], [0.45, '#ef4444', 0], [0.58, '#dc2626', 0.22], [1, '#7f1d1d', 0]]))
    out.push(rad('stellar-kd', [[0, '#ffffff', 0.75], [0.35, '#d1fae5', 0.45], [0.7, '#6ee7b7', 0.15], [1, '#34d399', 0]]))
    out.push(rad('stellar-ke', [[0, '#fecaca', 0.5], [0.4, '#f87171', 0.28], [1, '#991b1b', 0]]))
    out.push(rad('stellar-nv', [[0, '#ffffff', 1], [0.3, '#ecfdf5', 0.9], [0.6, '#6ee7b7', 0.4], [1, '#34d399', 0]]))
    if (detail > 0) {
      out.push(starTile('stellar-sa', 157, 113, 16, 11, 0.35, 0.9, 0.3))
      out.push(starTile('stellar-sb', 233, 171, 9, 29, 0.6, 1.2, 0.5))
      out.push(starTile('stellar-dust', 61, 47, 7, 53, 0.3, 0.7, 0.25))
      const anim =
        hasLive && detail > 1
          ? `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${width} 0" dur="14s" repeatCount="indefinite"/>`
          : ''
      out.push(
        `<linearGradient id="stellar-au" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n1(width / 2)}" y2="0" spreadMethod="reflect">` +
          `<stop offset="0" stop-color="#f472b6"/><stop offset="0.35" stop-color="#a78bfa"/><stop offset="0.7" stop-color="#2dd4bf"/><stop offset="1" stop-color="#38bdf8"/>` +
          anim +
          `</linearGradient>`,
      )
    }
    return out.join('')
  },

  backdrop(ctx) {
    const { width: W, height: H, detail, hasLive } = ctx
    const out: string[] = [`<g clip-path="url(#stellar-clip)">`, `<rect width="${W}" height="${H}" fill="url(#stellar-bg)"/>`]
    out.push(`<ellipse cx="${n1(W * 0.2)}" cy="${n1(H * 0.32)}" rx="${n1(W * 0.3)}" ry="${n1(H * 0.42)}" fill="url(#stellar-n1)"/>`)
    out.push(`<ellipse cx="${n1(W * 0.8)}" cy="${n1(H * 0.22)}" rx="${n1(W * 0.28)}" ry="${n1(H * 0.36)}" fill="url(#stellar-n2)"/>`)
    if (detail > 0) {
      out.push(`<rect width="${W}" height="${H}" fill="url(#stellar-sa)"/>`, `<rect width="${W}" height="${H}" fill="url(#stellar-sb)"/>`)
      const r = seeded(97)
      const yMax = Math.max(12, ctx.pedestal.top[3][1] - 4)
      const count = detail > 1 ? 9 : 4
      for (let i = 0; i < count; i++) {
        const p: Pt = [8 + r() * (W - 16), 6 + r() * (yMax - 6)]
        const s = 2.2 + r() * 2.4
        const c = STAR_COLORS[i % STAR_COLORS.length] ?? '#ffffff'
        const d = n1(2.4 + r() * 2.6)
        const b = n1(r() * 3)
        const tw = hasLive && detail > 1 ? `<animate attributeName="opacity" values="0.25;1;0.25" dur="${d}s" begin="${b}s" repeatCount="indefinite"/>` : ''
        out.push(sparkle(p, s, `fill="${c}" opacity="0.85"`, tw))
      }
      if (hasLive && detail > 1) {
        // A shooting star now and then, high in the sky.
        const x0 = W * 0.15
        const y0 = Math.max(8, H * 0.08)
        const len = Math.max(18, ctx.S * 0.6)
        out.push(
          `<g opacity="0"><animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.7;0.74;0.82;1" dur="9s" repeatCount="indefinite"/>` +
            `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;${n1(W * 0.35)} ${n1(H * 0.12)};${n1(W * 0.35)} ${n1(H * 0.12)}" keyTimes="0;0.7;0.82;1" dur="9s" repeatCount="indefinite"/>` +
            poly([[x0, y0], [x0 - len, y0 - len * 0.34 - 1], [x0 - len, y0 - len * 0.34 + 1]], 'fill="#ffffff" opacity="0.7"') +
            circle([x0, y0], 1.4, 'fill="#ffffff"') +
            `</g>`,
        )
      }
    }
    out.push('</g>')
    return out.join('')
  },

  pedestalDecor(ctx) {
    const { detail, S, n } = ctx
    if (detail === 0) return ''
    const f = ctx.pedestal.front
    const F = frontPlane(ctx)
    const out: string[] = []
    out.push(poly(f, 'fill="url(#stellar-dust)" opacity="0.7"'))

    // Constellations in the gaps between the plaques, and at both ends.
    const o = F(0, 0)
    const uStart = (f[3][0] - o[0]) / S
    const uEnd = (f[2][0] - o[0]) / S
    const wBot = -(f[0][1] - f[3][1]) / S
    const spots: [number, number][] = []
    spots.push([(uStart + 0.13) / 2, Math.max(0.05, (0.13 - uStart) / 2 - 0.06)])
    for (let i = 0; i < n - 1; i++) if (detail > 1 || i % 2 === 0) spots.push([ctx.cubeU(i) + 1.15, 0.19])
    const last = ctx.cubeU(n - 1) + 0.87
    spots.push([(last + uEnd) / 2, Math.max(0.05, (uEnd - last) / 2 - 0.06)])
    const k = detail > 1 ? 4 : 3
    const span = clamp(-wBot - 0.22, 0.2, 0.68)
    spots.forEach(([uc, hw], si) => {
      const r = seeded(31 + si * 7)
      const pts: Pt[] = []
      for (let j = 0; j < k; j++) {
        const w = -0.14 - ((j + 0.2 + r() * 0.6) * span) / k
        pts.push(F(uc + (r() * 2 - 1) * hw, w))
      }
      out.push(pline(pts, 'fill="none" stroke="#c4b5fd" stroke-opacity="0.35" stroke-width="0.7" stroke-linejoin="round"'))
      pts.forEach((p, j) => {
        if (j === 0) out.push(sparkle(p, Math.max(2, S * 0.06), 'fill="#e0e7ff" opacity="0.9"'))
        else out.push(circle(p, Math.max(0.8, S * 0.02), 'fill="#e0e7ff" opacity="0.8"'))
      })
    })

    // Aurora along the top front edge, and fainter along the back of the top.
    const tl = f[3]
    const tr = f[2]
    out.push(`<rect x="${n1(tl[0])}" y="${n1(tl[1])}" width="${n1(tr[0] - tl[0])}" height="${n1(Math.max(2, S * 0.07))}" fill="url(#stellar-au)" opacity="0.4"/>`)
    out.push(line(tl, tr, 'stroke="url(#stellar-au)" stroke-width="1.8"'))
    const t = ctx.pedestal.top
    out.push(line(t[3], t[2], 'stroke="url(#stellar-au)" stroke-width="1" stroke-opacity="0.55"'))
    return out.join('')
  },

  cubeInner(ctx, c) {
    if (c.kind !== 'glass') return ''
    const { S, detail } = ctx
    if (c.isGhost) {
      return detail > 0 ? circle(ctx.P(c.u0 + 0.5, 0.5, 0.45), Math.max(1, S * 0.035), 'fill="#c7d2fe" opacity="0.5"') : ''
    }
    if (c.status !== 'running' && c.status !== 'waiting') return ''
    const core = coreOf(c.status)
    const waiting = c.status === 'waiting'
    const { p, f } = corePos(ctx, c)
    const id = waiting ? 'stellar-cw' : 'stellar-cr'
    const hr = S * (0.2 + 0.16 * f)
    const cr = S * (0.05 + 0.045 * f)
    const anim = c.isLive && detail > 0
    const dur = waiting ? '1s' : '2.2s'
    const rep = 'repeatCount="indefinite"'
    const out: string[] = []

    if (c.isLive && detail > 0) {
      // The back half of the orbit, seen through the glass.
      const o = orbit(ctx, c)
      out.push(
        `<path d="M${n1(o.cx - o.rx)},${n1(o.cy)}a${n1(o.rx)},${n1(o.ry)} 0 0 1 ${n1(2 * o.rx)},0" transform="${o.rot}" fill="none" stroke="${core[0]}" stroke-opacity="0.3" stroke-width="0.8" stroke-dasharray="1.5 3"/>`,
      )
      // A beam of light from the core down into the cube's plaque.
      const q = frontPlane(ctx)(c.u0 + 0.5, -0.14)
      const a = S * 0.03
      const bw = S * 0.17
      out.push(
        poly([[p[0] - a, p[1]], [p[0] + a, p[1]], [q[0] + bw, q[1]], [q[0] - bw, q[1]]], `fill="url(#${id}b)" opacity="0.8"`).replace(
          '/>',
          `><animate attributeName="opacity" values="0.55;1;0.55" dur="${dur}" ${rep}/></polygon>`,
        ),
      )
      out.push(`<ellipse cx="${n1(q[0])}" cy="${n1(q[1])}" rx="${n1(S * 0.2)}" ry="${n1(S * 0.045)}" fill="${core[1]}" opacity="0.5"/>`)
      // A wide outer glow.
      const gr = hr * 1.9
      out.push(circle(p, gr, `fill="url(#${id})" opacity="0.32"`, `<animate attributeName="r" values="${n1(gr)};${n1(gr * 1.12)};${n1(gr)}" dur="${dur}" ${rep}/>`))
    }
    out.push(
      circle(p, hr, `fill="url(#${id})" opacity="${n1(0.6 + 0.4 * f)}"`,
        anim ? `<animate attributeName="r" values="${n1(hr)};${n1(hr * 1.16)};${n1(hr)}" dur="${dur}" ${rep}/>` : ''),
    )
    out.push(circle(p, cr, 'fill="#ffffff"', anim ? `<animate attributeName="opacity" values="1;0.65;1" dur="${dur}" ${rep}/>` : ''))
    if (c.isLive && detail > 1) {
      const at = `${n1(p[0])} ${n1(p[1])}`
      // A slowly turning corona, and a tilted ring precessing around the core.
      out.push(
        circle(p, cr * 2.2, `fill="none" stroke="${core[1]}" stroke-opacity="0.7" stroke-width="0.9" stroke-dasharray="1.2 2.6"`,
          `<animateTransform attributeName="transform" type="rotate" from="0 ${at}" to="360 ${at}" dur="7s" ${rep}/>`),
      )
      out.push(
        `<ellipse cx="${n1(p[0])}" cy="${n1(p[1])}" rx="${n1(hr * 1.25)}" ry="${n1(hr * 0.42)}" fill="none" stroke="${core[0]}" stroke-opacity="0.55" stroke-width="0.8">` +
          `<animateTransform attributeName="transform" type="rotate" from="0 ${at}" to="360 ${at}" dur="9s" ${rep}/></ellipse>`,
      )
    }
    return out.join('')
  },

  cubeOverlay(ctx, c) {
    if (c.isGhost) return ghostOutline(ctx, c)
    if (ctx.detail === 0) return ''
    if (c.kind === 'solid') return crystal(ctx, c) + (c.justDone && c.status === 'done' ? supernova(ctx, c) : '')
    if (!c.isLive) return ''
    const { S, detail } = ctx
    const out: string[] = []
    const core = coreOf(c.status)
    const o = orbit(ctx, c)
    const rep = 'repeatCount="indefinite"'
    // The front half of the orbit and its sparks, fainter while behind the cube.
    out.push(
      `<path d="M${n1(o.cx + o.rx)},${n1(o.cy)}a${n1(o.rx)},${n1(o.ry)} 0 0 1 ${n1(-2 * o.rx)},0" transform="${o.rot}" fill="none" stroke="${core[0]}" stroke-opacity="0.5" stroke-width="0.9" stroke-dasharray="1.5 3"/>`,
    )
    const path = `M${n1(o.cx - o.rx)},${n1(o.cy)}a${n1(o.rx)},${n1(o.ry)} 0 1 1 ${n1(2 * o.rx)},0a${n1(o.rx)},${n1(o.ry)} 0 1 1 ${n1(-2 * o.rx)},0`
    const sparks = detail > 1 ? 2 : 1
    const sr = Math.max(1.2, S * 0.035)
    let g = `<g transform="${o.rot}">`
    for (let k = 0; k < sparks; k++) {
      const begin = `${n1(-k * 1.7)}s`
      g +=
        `<g opacity="0.6">` +
        `<animateMotion path="${path}" dur="3.4s" begin="${begin}" ${rep}/>` +
        `<animate attributeName="opacity" values="0.6;0.2;0.6;1;0.6" keyTimes="0;0.25;0.5;0.75;1" dur="3.4s" begin="${begin}" ${rep}/>` +
        circle([0, 0], sr * 2.6, `fill="${core[1]}" opacity="0.35"`) +
        circle([0, 0], sr, 'fill="#ffffff"') +
        `</g>`
    }
    out.push(g + '</g>')

    // Energy motes drifting up out of the core, through the lid.
    const { p } = corePos(ctx, c)
    const motes = detail > 1 ? 5 : 2
    const r = seeded(71 + c.index * 13)
    for (let k = 0; k < motes; k++) {
      const dx = (r() * 2 - 1) * S * 0.3
      const rise = S * (0.95 + r() * 0.45)
      const d = n1(2.2 + r() * 1.2)
      const b0 = n1(k * 0.55)
      out.push(
        circle(p, Math.max(0.9, S * (0.022 + r() * 0.014)), `fill="${k % 2 ? '#ffffff' : core[0]}" opacity="0"`,
          `<animate attributeName="opacity" values="0;0.95;0" dur="${d}s" begin="${b0}s" ${rep}/>` +
            `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(dx)} ${n1(-rise)}" dur="${d}s" begin="${b0}s" ${rep}/>`),
      )
    }

    if (c.status === 'waiting') {
      // A pulsar: rings sent out from the core.
      for (let k = 0; k < 2; k++) {
        const b0 = n1(k * 0.9)
        out.push(
          circle(p, S * 0.15, `fill="none" stroke="${core[1]}" stroke-width="1.3" opacity="0"`,
            `<animate attributeName="r" values="${n1(S * 0.15)};${n1(S * 0.8)}" dur="1.8s" begin="${b0}s" ${rep}/>` +
              `<animate attributeName="opacity" values="0.8;0" dur="1.8s" begin="${b0}s" ${rep}/>`),
        )
      }
    }
    return out.join('')
  },
}

const avg = (q: Pt[]): Pt => [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length]
const M = (a: Pt, b: Pt) => `M${n1(a[0])} ${n1(a[1])}L${n1(b[0])} ${n1(b[1])}`

/** A cube not started yet: a quiet constellation of its corners, joined by fine lines. */
function ghostOutline(ctx: SceneCtx, c: CubeCtx): string {
  const b = c.box
  const [f0, f1, f2, f3] = b.front
  const r1 = b.right[1]
  const r2 = b.right[2]
  const t3 = b.top[3]
  const hid = b.left[1]
  const col = '#c7d2fe'
  let s = `<g opacity="0.6">`
  s += `<path d="${M(f0, f1)}${M(f1, f2)}${M(f2, f3)}${M(f3, f0)}${M(f1, r1)}${M(r1, r2)}${M(f2, r2)}${M(r2, t3)}${M(t3, f3)}" fill="none" stroke="${col}" stroke-width="0.7" stroke-opacity="0.8"/>`
  if (ctx.detail > 0) {
    s += `<path d="${M(hid, f0)}${M(hid, r1)}${M(hid, t3)}" fill="none" stroke="${col}" stroke-width="0.6" stroke-opacity="0.35" stroke-dasharray="1 2.5"/>`
  }
  const dr = Math.max(1.2, ctx.S * 0.032)
  for (const p of [f0, f1, f2, f3, r1, r2, t3]) s += circle(p, dr, 'fill="#eef2ff"')
  if (ctx.detail > 0) s += sparkle(f2, Math.max(2.2, ctx.S * 0.07), 'fill="#ffffff"')
  return s + '</g>'
}

/** A finished cube as faceted star-matter; a failed one as a dim red dwarf. */
function crystal(ctx: SceneCtx, c: CubeCtx): string {
  const { S, detail } = ctx
  const b = c.box
  const done = c.status === 'done'
  if (!done && c.status !== 'error') return ''
  const [f0, f1, f2, f3] = b.front
  const [t0, t1, t2, t3] = b.top
  const [r0, r1, r2, r3] = b.right
  const fc = c.front
  const tc = c.top
  const rc = avg(b.right)
  const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.5)
  const out: string[] = []
  // A soft radiant halo, a ring around the crystal.
  out.push(circle([cx, cy], S * (done ? 1.05 : 0.9), `fill="url(#${done ? 'stellar-hd' : 'stellar-he'})"`))
  // Facet planes in light and dark.
  const lite = done ? '#ffffff' : '#fecaca'
  const dark = done ? '#022c22' : '#1c0505'
  out.push(
    `<g>` +
      poly([f3, f2, fc], `fill="${lite}" opacity="${done ? 0.2 : 0.1}"`) +
      poly([f0, f3, fc], `fill="${lite}" opacity="0.07"`) +
      poly([f1, f2, fc], `fill="${dark}" opacity="0.1"`) +
      poly([f0, f1, fc], `fill="${dark}" opacity="${done ? 0.18 : 0.3}"`) +
      poly([t3, t2, tc], `fill="${lite}" opacity="${done ? 0.24 : 0.12}"`) +
      poly([t0, t3, tc], `fill="${lite}" opacity="0.1"`) +
      poly([r0, r1, rc], `fill="${dark}" opacity="0.2"`) +
      poly([r2, r3, rc], `fill="${lite}" opacity="0.08"`) +
      `</g>`,
  )
  // Inner light shining through.
  out.push(circle(fc, S * (done ? 0.34 : 0.26), `fill="url(#${done ? 'stellar-kd' : 'stellar-ke'})"`))
  out.push(circle(tc, S * 0.2, `fill="url(#${done ? 'stellar-kd' : 'stellar-ke'})" opacity="0.6"`))
  // Facet lines.
  out.push(
    `<path d="${M(fc, f0)}${M(fc, f1)}${M(fc, f2)}${M(fc, f3)}${M(tc, t0)}${M(tc, t1)}${M(tc, t2)}${M(tc, t3)}${M(rc, r0)}${M(rc, r1)}${M(rc, r2)}${M(rc, r3)}" fill="none" stroke="${lite}" stroke-opacity="${done ? 0.32 : 0.18}" stroke-width="0.6"/>`,
  )
  out.push(
    pline([f0, f1, r1, r2, t3, f3, f0], `fill="none" stroke="${done ? '#6ee7b7' : '#f87171'}" stroke-opacity="${done ? 0.65 : 0.45}" stroke-width="1.5" stroke-linejoin="round" filter="url(#gl)"`),
  )
  if (done) {
    // Sparkle stars on the edges.
    const tw = detail > 1 && ctx.hasLive
    const spots: [Pt, number][] = [[f2, 0.15], [avg([t2, t3]), 0.08], [f0, 0.07]]
    if (detail > 1) spots.push([avg([r1, r2]), 0.06])
    spots.forEach(([p, k], i) => {
      const anim = tw
        ? `<animate attributeName="opacity" values="0.3;1;0.3" dur="${n1(2.6 + i * 0.5)}s" begin="${n1((c.index + i) * 0.6 % 3)}s" repeatCount="indefinite"/>`
        : ''
      out.push(sparkle(p, Math.max(2, S * k), `fill="${i ? '#d1fae5' : '#ffffff'}" opacity="0.9"`, anim))
    })
  }
  return out.join('')
}

/** A one-shot supernova when a step has just been checked off. */
function supernova(ctx: SceneCtx, c: CubeCtx): string {
  const { S, detail } = ctx
  const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.5)
  const once = (attr: string, values: string, dur: string, begin = 0) =>
    `<animate attributeName="${attr}" values="${values}" dur="${dur}" begin="${begin}s" fill="freeze"/>`
  let s = '<g>'
  // The faces flare white.
  for (const face of [c.box.front, c.box.top, c.box.right]) {
    s += poly(face, 'fill="#ffffff" opacity="0"').replace('/>', `>${once('opacity', '0;0.85;0', '0.8s')}</polygon>`)
  }
  // The core blows out and fades.
  s += circle([cx, cy], S * 0.1, 'fill="url(#stellar-nv)" opacity="0"', once('r', `${n1(S * 0.1)};${n1(S * 1.4)}`, '1.3s') + once('opacity', '0;1;0.6;0', '1.3s'))
  // Two shockwave rings.
  for (const [delay, w, col] of [[0, 2.2, '#a7f3d0'], [0.22, 1.3, '#5eead4']] as const) {
    s +=
      `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(S * 0.3)}" ry="${n1(S * 0.12)}" fill="none" stroke="${col}" stroke-width="${w}" opacity="0">` +
      once('rx', `${n1(S * 0.3)};${n1(S * 1.6)}`, '1.3s', delay) +
      once('ry', `${n1(S * 0.12)};${n1(S * 0.62)}`, '1.3s', delay) +
      once('opacity', '0;0.95;0', '1.3s', delay) +
      `</ellipse>`
  }
  if (detail > 1) {
    // Light rays.
    let rays = ''
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2
      rays += M([cx + Math.cos(a) * S * 0.2, cy + Math.sin(a) * S * 0.14], [cx + Math.cos(a) * S * 1.05, cy + Math.sin(a) * S * 0.7])
    }
    s += `<path d="${rays}" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0">${once('opacity', '0;0.85;0', '0.7s', 0.05)}</path>`
    // Star sparks flying outward.
    const r = seeded(211 + c.index)
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + r() * 0.5
      const d = S * (0.8 + r() * 0.6)
      const tx = cx + Math.cos(a) * d
      const ty = cy + Math.sin(a) * d * 0.7
      const dur = `${n1(0.9 + r() * 0.5)}s`
      s +=
        `<g opacity="0">` +
        `<animateTransform attributeName="transform" type="translate" values="${n1(cx)} ${n1(cy)};${n1(tx)} ${n1(ty)}" dur="${dur}" fill="freeze"/>` +
        once('opacity', '0;1;0', dur) +
        `<use href="#stellar-spark" transform="scale(${Math.round(S * (0.06 + r() * 0.05) * 100) / 100})" fill="${k % 3 ? '#ffffff' : '#6ee7b7'}"/>` +
        `</g>`
    }
  }
  return s + '</g>'
}
