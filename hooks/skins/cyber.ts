import type { CubeStatus } from '../../types'
import { box, circle, fmt, lin, line, n1, poly, pts, rad, seeded, lerp } from '../svg'
import type { Pt } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/** Neon accent per status, for traces, outlines and the scanning laser. */
const NEON: Record<CubeStatus, string> = {
  pending: '#64748b',
  running: '#22d3ee',
  done: '#34d399',
  error: '#f43f5e',
  waiting: '#fbbf24',
}
const CYAN = '#22d3ee'
const MAGENTA = '#e879f9'


/** Screen helpers for the pedestal's front face (a screen-aligned rectangle). */
function front(ctx: SceneCtx) {
  const f = ctx.pedestal.front
  const x0 = f[0][0]
  const x1 = f[1][0]
  const yT = f[3][1]
  const yB = f[0][1]
  const o = ctx.P(0, 0, 0)
  const v = ctx.P(0, 1, 0)
  const dvx = v[0] - o[0]
  const dvy = v[1] - o[1] || -1
  // The pedestal front sits at some v < 0; find it from its top edge's height.
  const pf = (yT - o[1]) / dvy
  const xAt = (u: number) => ctx.P(u, 0, 0)[0] + pf * dvx
  const yAt = (w: number) => yT - w * ctx.S
  return { x0, x1, yT, yB, xAt, yAt }
}

/** The cube's outline on screen: front bottom-left round to the back top-left. */
const silhouette = (c: CubeCtx): Pt[] => [c.box.front[0], c.box.front[1], c.box.right[1], c.box.right[2], c.box.top[3], c.box.front[3]]

/** A small PCB tile for the faces of finished blocks. */
function pcb(id: string, S: number, color: string): string {
  const t = Math.max(6, S / 3)
  const f = (k: number) => n1(t * k)
  const r = n1(Math.max(0.6, t * 0.06))
  return (
    `<pattern id="${id}" width="${n1(t)}" height="${n1(t)}" patternUnits="userSpaceOnUse">` +
    `<path d="M0 ${f(0.3)}H${f(0.35)}L${f(0.55)} ${f(0.5)}H${n1(t)}M${f(0.7)} 0V${f(0.25)}L${f(0.85)} ${f(0.4)}M${f(0.2)} ${n1(t)}V${f(0.75)}" fill="none" stroke="${color}" stroke-opacity="0.35" stroke-width="0.6"/>` +
    `<circle cx="${f(0.35)}" cy="${f(0.3)}" r="${r}" fill="${color}" fill-opacity="0.6"/>` +
    `<circle cx="${f(0.85)}" cy="${f(0.4)}" r="${r}" fill="${color}" fill-opacity="0.6"/>` +
    `</pattern>`
  )
}

/** One-shot SMIL animation: plays from 0 s, never repeats, ends frozen. */
const once = (attr: string, values: string, dur: number, extra = '') =>
  `<animate attributeName="${attr}" values="${values}" dur="${n1(dur)}s" fill="freeze"${extra}/>`

/** The visible edges of a cube: its outline plus the three inner edges. */
const edges = (c: CubeCtx) =>
  poly(silhouette(c), '') + `<polyline points="${pts([c.box.front[3], c.box.front[2], c.box.front[1]])}"/>` + line(c.box.front[2], c.box.right[2], '')

/** A finished or failed step: a dark armoured block with a PCB face, neon rim and a glowing mark. */
function armoured(ctx: SceneCtx, c: CubeCtx): string {
  const S = ctx.S
  const b = c.box
  const col = NEON[c.status]
  const onF = (a: number, w: number) => ctx.P(c.u0 + a, 0, w)
  let s = poly(b.front, 'fill="url(#cyber-dF)"') + poly(b.right, 'fill="url(#cyber-dS)"') + poly(b.top, 'fill="url(#cyber-dT)"')
  s += poly(b.top, `fill="${col}" fill-opacity="0.1"`)
  if (ctx.detail > 1) {
    s += poly(b.front, `fill="url(#cyber-pcb-${c.status === 'error' ? 'r' : 'g'})"`)
    let seams = ''
    for (const t of [1 / 3, 2 / 3]) {
      seams += line(ctx.P(c.u0 + t, 0, 1), ctx.P(c.u0 + t, 1, 1), '') + line(ctx.P(c.u0, t, 1), ctx.P(c.u1, t, 1), '')
      seams += line(ctx.P(c.u1, t, 0), ctx.P(c.u1, t, 1), '') + line(ctx.P(c.u1, 0, t), ctx.P(c.u1, 1, t), '')
    }
    s += `<g stroke="${col}" stroke-opacity="0.22" stroke-width="0.6">${seams}</g>`
  }
  s += `<g fill="none" stroke="${col}" stroke-width="1.3" stroke-linejoin="round" filter="url(#gl)">${edges(c)}</g>`
  const mk =
    c.status === 'error'
      ? `M${fmt(onF(0.3, 0.3))}L${fmt(onF(0.7, 0.7))}M${fmt(onF(0.7, 0.3))}L${fmt(onF(0.3, 0.7))}`
      : `M${fmt(onF(0.26, 0.5))}L${fmt(onF(0.43, 0.32))}L${fmt(onF(0.75, 0.7))}`
  const cap = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
  s += `<path d="${mk}" ${cap} stroke="${col}" stroke-width="${n1(Math.max(2, S * 0.1))}" filter="url(#gl)"/>`
  s += `<path d="${mk}" ${cap} stroke="#f0fdfa" stroke-width="${n1(Math.max(0.8, S * 0.03))}"/>`
  return s
}

/** A step not started yet: a quiet dashed wireframe. */
function wireframe(ctx: SceneCtx, c: CubeCtx): string {
  const b = c.box
  const col = '#7dd3fc'
  const k = ctx.P(c.u0, 1, 0)
  let s =
    `<g fill="none" stroke="${col}" stroke-opacity="0.28" stroke-width="0.8" stroke-dasharray="1 2.5">` +
    line(k, ctx.P(c.u1, 1, 0), '') + line(k, ctx.P(c.u0, 0, 0), '') + line(k, ctx.P(c.u0, 1, 1), '') + '</g>'
  s += `<g fill="none" stroke="${col}" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="3 2.5" stroke-linejoin="round">${edges(c)}</g>`
  if (ctx.detail > 1) {
    s += `<g fill="${col}" fill-opacity="0.7">` + [...b.front, b.right[1], b.right[2], b.top[3]].map(p => circle(p, 1.3, '')).join('') + '</g>'
  }
  return s
}

/** A step being worked on: halo, hologram flicker, data bits, a beam into its plaque and HUD brackets. */
// Drawn once in <defs> for a cube at u = 0 in `currentColor`, then placed per live cube with <use>.
function live(ctx: SceneCtx, c: CubeCtx): string {
  const S = ctx.S
  const sil = silhouette(c)
  const col = 'currentColor'
  // A soft neon halo around the cube.
  let s =
    `<polygon points="${pts(sil)}" fill="none" stroke="${col}" stroke-width="${n1(Math.max(3, S * 0.1))}" stroke-linejoin="round" filter="url(#sd)" opacity="0.5">` +
    `<animate attributeName="opacity" values="0.35;0.75;0.35" dur="2s" repeatCount="indefinite"/></polygon>`
  // Holographic scanlines that flicker.
  s +=
    `<g opacity="0.7"><animate attributeName="opacity" values="0.7;0.35;0.8;0.2;0.75;0.7" keyTimes="0;0.08;0.12;0.55;0.6;1" dur="3.3s" repeatCount="indefinite"/>` +
    poly(c.box.front, 'fill="url(#cyber-scan)"') + poly(c.box.right, 'fill="url(#cyber-scan)"') + poly(c.box.top, 'fill="url(#cyber-scan)"') + `</g>`
  // An energy beam from the cube's foot down into its plaque.
  const { xAt, yAt } = front(ctx)
  const foot = ctx.P(c.u0 + 0.5, 0, 0)
  const plq: Pt = [xAt(c.u0 + 0.5), yAt(-0.14)]
  const flow = `<animate attributeName="stroke-dashoffset" values="0;-16" dur="0.8s" repeatCount="indefinite"/>`
  s +=
    `<g filter="url(#gl)">` +
    line(foot, plq, `stroke="${col}" stroke-opacity="0.35" stroke-width="1.2"`) +
    `<path d="M${fmt(foot)}L${fmt(plq)}" stroke="${col}" stroke-width="1.6" stroke-dasharray="3 5" stroke-linecap="round">${flow}</path>` +
    circle(plq, 1.8, `fill="${col}"`, `<animate attributeName="r" values="1.2;2.6;1.2" dur="0.8s" repeatCount="indefinite"/>`) +
    `</g>`
  // Data bits rising off the top and fading.
  const rnd = seeded(101 + c.index * 17)
  const count = ctx.detail > 1 ? 5 : 2
  const fs = Math.max(6, S * 0.16)
  for (let k = 0; k < count; k++) {
    const p = ctx.P(c.u0 + 0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7, 1)
    const rise = S * (0.35 + rnd() * 0.2)
    const dur = n1(2.6 + rnd() * 0.8)
    const begin = n1(k * 0.6 + rnd() * 0.3)
    const anim =
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${n1(-rise)}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;0.9;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>`
    s +=
      k % 3 === 2
        ? `<rect x="${n1(p[0] - 1)}" y="${n1(p[1] - 1)}" width="2" height="2" fill="${col}" opacity="0">${anim}</rect>`
        : `<text class="t" x="${n1(p[0])}" y="${n1(p[1])}" font-size="${n1(fs)}" fill="${col}" text-anchor="middle" opacity="0">${rnd() < 0.5 ? 0 : 1}${anim}</text>`
  }
  if (ctx.detail > 1) {
    // A short chromatic glitch now and then.
    const glitch = (dx: number, color: string) =>
      `<polygon points="${pts(sil.map(p => [p[0] + dx, p[1]] as Pt))}" fill="none" stroke="${color}" stroke-width="1" opacity="0">` +
      `<animate attributeName="opacity" values="0;0;0.8;0;0.6;0" keyTimes="0;0.86;0.88;0.9;0.93;1" dur="4.7s" begin="${n1(c.index * 0.7)}s" repeatCount="indefinite"/></polygon>`
    s += glitch(2, MAGENTA) + glitch(-2, CYAN)
    // HUD brackets around the cube.
    const pad = 4
    const xl = c.box.front[0][0] - pad
    const xr = c.box.right[1][0] + pad
    const yt = c.box.top[3][1] - pad
    const yb = c.box.front[0][1] + pad
    const a = Math.max(5, S * 0.16)
    const br = (x: number, y: number, dx: number, dy: number) => `M${n1(x + dx * a)} ${n1(y)}H${n1(x)}V${n1(y + dy * a)}`
    s +=
      `<path d="${br(xl, yt, 1, 1)}${br(xr, yt, -1, 1)}${br(xl, yb, 1, -1)}${br(xr, yb, -1, -1)}" fill="none" stroke="${col}" stroke-width="1.2" stroke-opacity="0.9">` +
      `<animate attributeName="stroke-opacity" values="0.9;0.35;0.9" dur="1.6s" repeatCount="indefinite"/></path>`
  }
  return s
}

/** A live cube standing at u = 0, the template the live effects are drawn for. */
function unitCube(ctx: SceneCtx): CubeCtx {
  return {
    index: 0, status: 'running', kind: 'glass', isLive: true, isGhost: false, justDone: false, fill: 0, slots: 27,
    stuck: '', blockedBy: [], added: 0, removed: 0, test: '',
    box: box(ctx.P, 0, 1, 0, 1, 0, 1), u0: 0, u1: 1, front: ctx.P(0.5, 0, 0.5), top: ctx.P(0.5, 0.5, 1),
  }
}

/** The one-shot burst when a step is checked off: glitch flash, scan sweep, hex rings and shards. */
function burst(ctx: SceneCtx, c: CubeCtx): string {
  const S = ctx.S
  const b = c.box
  const col = NEON.done
  // Glitch flash on the faces, in hard steps.
  let s = `<g fill="${col}" opacity="0">${once('opacity', '0.75;0;0.55;0.15;0', 0.6, ' calcMode="discrete"')}${poly(b.front, '')}${poly(b.right, '')}${poly(b.top, '')}</g>`
  // A neon scan line sweeping down the front and side.
  const scan = [ctx.P(c.u0, 0, 1), ctx.P(c.u1, 0, 1), ctx.P(c.u1, 1, 1)]
  s +=
    `<polyline points="${pts(scan)}" fill="none" stroke="#ecfeff" stroke-width="1.6" filter="url(#gl)" opacity="0">` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${n1(S)}" dur="0.8s" begin="0.15s" fill="freeze"/>` +
    once('opacity', '0;1;1;0', 0.8, ' begin="0.15s"') + `</polyline>`
  // Hexagon rings (the cube's own outline) spreading out.
  const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.5)
  const hex = pts(silhouette(c).map(p => [p[0] - cx, p[1] - cy] as Pt))
  for (const [delay, w] of [[0.1, 2], [0.35, 1.2]] as const) {
    s +=
      `<g transform="translate(${n1(cx)} ${n1(cy)})"><polygon points="${hex}" fill="none" stroke="${col}" stroke-width="${w}" vector-effect="non-scaling-stroke" opacity="0">` +
      `<animateTransform attributeName="transform" type="scale" values="1;1.9" dur="1.1s" begin="${delay}s" fill="freeze"/>` +
      once('opacity', '0;0.9;0', 1.1, ` begin="${delay}s"`) + `</polygon></g>`
  }
  // Digital shards flying off.
  if (ctx.detail > 1) {
    const rnd = seeded(53 + c.index * 7)
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rnd() * 0.4
      const d = S * (0.8 + rnd() * 0.5)
      const z = 1.2 + rnd() * 1.8
      const color = k % 3 === 0 ? MAGENTA : k % 3 === 1 ? col : '#ecfeff'
      s +=
        `<rect x="${n1(cx - z)}" y="${n1(cy - z / 2)}" width="${n1(z * 2)}" height="${n1(z)}" fill="${color}" opacity="0">` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(Math.cos(a) * d)} ${n1(Math.sin(a) * d * 0.75)}" dur="1s" begin="0.1s" fill="freeze"/>` +
        once('opacity', '0;1;0', 1, ' begin="0.1s"') + `</rect>`
    }
  }
  return s
}

/** Dark tech console, holographic glass, neon edges and data-chip mini cubes. */
export const cyber: Skin = {
  id: 'cyber',
  name: 'Cyber',
  description: 'Neon console with circuit traces, holographic cubes and data chips',
  status: {
    pending: ['#94a3b8', '#7c93ad', '#475569'],
    running: ['#67e8f9', '#06b6d4', '#22d3ee'],
    done: ['#6ee7b7', '#10b981', '#047857'],
    error: ['#fb7185', '#e11d48', '#9f1239'],
    waiting: ['#fde68a', '#f59e0b', '#fbbf24'],
  },
  glass: { top: 0.22, bottom: 0.04, ghost: 0.6 },
  edge: { color: '#67e8f9', opacity: 0.3 },
  mini: {
    top: ['#5b6577', '#3a4252'],
    front: ['#323a48', '#1c212b'],
    side: ['#232934', '#14181f'],
    highlight: '#a5f3fc',
    glint: '#67e8f9',
  },
  tint: {
    read: ['#60a5fa', 0.55],
    write: ['#fbbf24', 0.55],
    run: ['#a78bfa', 0.55],
    agent: ['#2dd4bf', 0.55],
    other: ['#94a3b8', 0],
    err: ['#f43f5e', 0.82],
  },
  pedestal: {
    front: ['#1b202a', '#141820', '#0c0f15'],
    top: ['#252b37', '#171b23'],
    side: ['#11141b', '#080a0e'],
    footTop: '#1a1e27',
    footSide: '#06070a',
    light: CYAN,
    shadow: '#000000',
  },
  plaque: {
    frame: ['#3a4352', '#151a23'],
    inner: ['#020408', '#0a0f17'],
    text: { pending: '#64748b', running: '#67e8f9', done: '#6ee7b7', error: '#fb7185', waiting: '#fcd34d' },
    caption: '#7dd3fc',
  },
  track: { groove: '#020409', from: CYAN, to: '#34d399', head: CYAN },
  pipe: { fill: 'energy', colors: ['#0891b2', CYAN, '#a7f3d0'], metal: '#1e3a4a' },
  day: { sky: ['#f0fdff', '#cff6fb'], ink: '#0891b2', pattern: 'grid' },
  font: 'ui-monospace,SFMono-Regular,Consolas,monospace',

  defs(ctx) {
    const o = ctx.P(0, 0, 0)
    const v = ctx.P(0, 1, 0)
    const dvy = v[1] - o[1] || -1
    // Shear the top-face grid so its lines run along the depth axis.
    const shear = (v[0] - o[0]) / dvy
    const tw = ctx.S / 4
    const th = Math.abs(dvy) / 4
    return (
      lin('cyber-bg', 0, 1, [[0, '#0e121b'], [1, '#05070b']]) +
      rad('cyber-glow', [[0, CYAN, 0.16], [0.6, '#6366f1', 0.05], [1, '#6366f1', 0]]) +
      lin('cyber-strip', 1, 0, [[0, MAGENTA, 0.9], [0.5, CYAN], [1, MAGENTA, 0.9]]) +
      `<pattern id="cyber-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#38bdf8" stroke-opacity="0.07" stroke-width="0.6"/></pattern>` +
      `<pattern id="cyber-tg" width="${n1(tw)}" height="${n1(th)}" patternUnits="userSpaceOnUse" patternTransform="matrix(1 0 ${n1(shear)} 1 ${fmt(o).replace(',', ' ')})">` +
      `<path d="M0 0H${n1(tw)}M0 0V${n1(th)}" fill="none" stroke="${CYAN}" stroke-opacity="0.16" stroke-width="0.6"/></pattern>` +
      `<pattern id="cyber-scan" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#a5f3fc" fill-opacity="0.22"/></pattern>` +
      `<pattern id="cyber-scd" width="4" height="2" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000000" fill-opacity="0.35"/></pattern>` +
      // Armoured data blocks for finished and failed steps.
      lin('cyber-dF', 0, 1, [[0, '#1d232d'], [1, '#0a0d12']]) +
      lin('cyber-dS', 0, 1, [[0, '#131820'], [1, '#05070a']]) +
      lin('cyber-dT', 1, 1, [[0, '#323a47'], [1, '#1a1f28']]) +
      pcb('cyber-pcb-g', ctx.S, NEON.done) +
      pcb('cyber-pcb-r', ctx.S, NEON.error) +
      (ctx.hasLive && ctx.detail > 0 ? `<g id="cyber-lv">${live(ctx, unitCube(ctx))}</g>` : '')
    )
  },

  backdrop(ctx) {
    const { width: W, height: H } = ctx
    let s = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="url(#cyber-bg)" stroke="${CYAN}" stroke-opacity="0.25"/>`
    if (ctx.detail === 0) return s
    const t = ctx.pedestal.top
    const c = lerp(t[0], t[2], 0.5)
    s += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="9.5" fill="url(#cyber-grid)"/>`
    s += `<ellipse cx="${n1(c[0])}" cy="${n1(c[1] - ctx.S * 0.3)}" rx="${n1(W * 0.5)}" ry="${n1(H * 0.55)}" fill="url(#cyber-glow)"/>`
    // HUD corner brackets.
    const a = 12
    const i = 5
    const br = (x: number, y: number, dx: number, dy: number) => `M${n1(x + dx * a)} ${n1(y)}H${n1(x)}V${n1(y + dy * a)}`
    s += `<path d="${br(i, i, 1, 1)}${br(W - i, i, -1, 1)}${br(i, H - i, 1, -1)}${br(W - i, H - i, -1, -1)}" fill="none" stroke="${CYAN}" stroke-opacity="0.65" stroke-width="1.2"/>`
    return s
  },

  pedestalDecor(ctx) {
    if (ctx.detail === 0) return ''
    const S = ctx.S
    const ped = ctx.pedestal
    const { x0, x1, yT, yB, xAt, yAt } = front(ctx)
    const out: string[] = []
    // Grid on the console's top.
    out.push(poly(ped.top, 'fill="url(#cyber-tg)"'))
    // Vent slits on the right side.
    const r = ped.right
    for (const w of [0.3, 0.42, 0.54, 0.66]) {
      const a = lerp(r[3], r[0], w)
      const b = lerp(r[2], r[1], w)
      out.push(line(lerp(a, b, 0.15), lerp(a, b, 0.85), `stroke="${CYAN}" stroke-opacity="0.18" stroke-width="1"`))
    }

    // Circuit traces on the front: a bus at top and bottom, a trace down each gap between plaques.
    const yBus = yAt(-0.07)
    const yLow = yAt(-0.91)
    const xa = x0 + S * 0.08
    const xb = x1 - S * 0.08
    const traces: string[] = []
    const nodes: Pt[] = []
    const rnd = seeded(7 + ctx.n * 31)
    const pr = Math.max(1.1, S * 0.035)
    for (let i = 0; i <= ctx.n; i++) {
      const xg = xAt(ctx.cubeU(i) - 0.15)
      const dir = rnd() < 0.5 ? -1 : 1
      const off = S * 0.08 * dir
      const bend = 0.3 + rnd() * 0.12
      const ya = yAt(-bend)
      const yb = yAt(-bend - 0.16)
      traces.push(`M${n1(xg - off)} ${n1(yBus)}V${n1(ya)}L${n1(xg + off)} ${n1(yb)}V${n1(yLow)}`)
      nodes.push([xg + off, yLow], [xg - off, yBus])
      if (ctx.detail > 1) {
        // A stub out to a neighbouring plaque's edge.
        const ys = yAt(-0.22 - rnd() * 0.08)
        const xs = xg - off
        let xe = NaN
        if (i > 0 && (dir > 0 || i === ctx.n)) xe = xAt(ctx.cubeU(i - 1) + 0.87) + 1.5
        else if (i < ctx.n) xe = xAt(ctx.cubeU(i) + 0.13) - 1.5
        if (Number.isFinite(xe)) {
          traces.push(`M${n1(xs)} ${n1(ys)}H${n1(xe)}`)
          nodes.push([xs, ys])
        }
      }
    }
    const busD = `M${n1(xa)} ${n1(yBus)}H${n1(xb)}`
    const lowD = `M${n1(xb)} ${n1(yLow)}H${n1(xa)}`
    out.push(
      `<path d="${busD}${lowD}${traces.join('')}" fill="none" stroke="#2dd4bf" stroke-opacity="0.32" stroke-width="${n1(Math.max(0.8, S * 0.025))}" stroke-linejoin="round"/>`,
    )
    out.push(`<g fill="#0a0e15" stroke="${CYAN}" stroke-width="0.8">` + nodes.map(p => circle(p, pr, '')).join('') + '</g>')
    out.push(`<g fill="${CYAN}">` + nodes.filter((_, k) => k % 3 === 0).map(p => circle(p, pr * 0.45, '')).join('') + '</g>')

    // Neon strip along the top edge, a faint magenta one along the bottom.
    const sh = Math.max(1.4, S * 0.03)
    out.push(`<rect x="${n1(x0)}" y="${n1(yT - sh / 2)}" width="${n1(x1 - x0)}" height="${n1(sh)}" fill="url(#cyber-strip)" filter="url(#gl)"/>`)
    out.push(line([x0 + 1, yB - 1.5], [x1 - 1, yB - 1.5], `stroke="${MAGENTA}" stroke-opacity="0.45" stroke-width="1"`))

    // Data pulses while something is being worked on.
    if (ctx.hasLive) {
      const pw = Math.max(1.4, S * 0.04)
      const pulse = (d: string, color: string, dash: string, dur: number, begin: number) =>
        `<path d="${d}" pathLength="100" fill="none" stroke="${color}" stroke-width="${n1(pw)}" stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="100">` +
        `<animate attributeName="stroke-dashoffset" values="100;0" dur="${n1(dur)}s" begin="${n1(begin)}s" repeatCount="indefinite"/></path>`
      let p = pulse(busD, CYAN, '4 96', 3.2, 0) + pulse(lowD, MAGENTA, '4 96', 4.1, 1.3)
      if (ctx.detail > 1) {
        traces.forEach((d, k) => {
          if (d.includes('V')) p += pulse(d, k % 2 ? MAGENTA : CYAN, '12 88', 1.6 + rnd() * 1.2, rnd() * 2)
        })
        // A bright spark running along the top strip.
        const sw = S * 0.6
        p +=
          `<rect y="${n1(yT - sh)}" width="${n1(sw)}" height="${n1(sh * 2)}" rx="${n1(sh)}" fill="#ecfeff" opacity="0.85">` +
          `<animate attributeName="x" values="${n1(x0)};${n1(x1 - sw)}" dur="3s" repeatCount="indefinite"/></rect>`
      }
      out.push(`<g filter="url(#gl)">${p}</g>`)
    }
    return out.join('')
  },

  cubeInner(ctx, c) {
    if (!c.isLive || ctx.detail === 0) return ''
    // A scanning laser plane sweeping up and down through the pile.
    const col = NEON[c.status]
    const rise = ctx.S * 0.96
    return (
      `<polygon points="${pts(c.box.bottom)}" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="1.1">` +
      `<animateTransform attributeName="transform" type="translate" values="0 -1;0 ${n1(-rise)};0 -1" dur="2.8s" repeatCount="indefinite"/></polygon>`
    )
  },

  cubeOverlay(ctx, c) {
    if (ctx.detail === 0) return ''
    if (c.kind === 'solid') return armoured(ctx, c) + (c.justDone ? burst(ctx, c) : '')
    if (c.isGhost) return wireframe(ctx, c)
    if (!c.isLive) return ''
    const dx = ctx.P(c.u0, 0, 0)[0] - ctx.P(0, 0, 0)[0]
    return `<use href="#cyber-lv" x="${n1(dx)}" color="${NEON[c.status]}"/>`
  },

  overlay(ctx) {
    if (ctx.detail === 0) return ''
    // OLED scanlines over the plaques.
    const { xAt, yAt } = front(ctx)
    const y0 = yAt(-0.14)
    const h = ctx.S * 0.46
    let s = ''
    for (let i = 0; i < ctx.n; i++) {
      const cu = ctx.cubeU(i) + 0.5
      const xl = xAt(cu - 0.37)
      s += `<rect x="${n1(xl)}" y="${n1(y0)}" width="${n1(xAt(cu + 0.37) - xl)}" height="${n1(h)}" rx="${n1(ctx.S * 0.06)}"/>`
    }
    return `<g fill="url(#cyber-scd)" opacity="0.6">${s}</g>`
  },
}
