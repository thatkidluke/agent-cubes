import { circle, fmt, lin, line, n1, poly, pts, rad, seeded, lerp } from '../svg'
import type { Pt } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

const BRASS = '#d4a646'
const DARK = '#2a1806'
const STEAM = '#f4efe6'
const RIVET = 'fill="url(#steampunk-rv)" stroke="#2a1806" stroke-width="0.4"'


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
  const pf = (yT - o[1]) / dvy
  const xAt = (u: number) => ctx.P(u, 0, 0)[0] + pf * dvx
  const yAt = (w: number) => yT - w * ctx.S
  return { x0, x1, yT, yB, xAt, yAt }
}

/** The visible edges of a cube: its outline plus the three inner edges. */
const edges = (c: CubeCtx) =>
  poly([c.box.front[0], c.box.front[1], c.box.right[1], c.box.right[2], c.box.top[3], c.box.front[3]], '') +
  `<polyline points="${pts([c.box.front[3], c.box.front[2], c.box.front[1]])}"/>` +
  line(c.box.front[2], c.box.right[2], '')

/** A plain dot; styled by its group. */
const dot = (p: Pt, r: number) => `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="${n1(r)}"/>`

/** The seven visible corners of a cube. */
const corners = (c: CubeCtx): Pt[] => [...c.box.front, c.box.right[1], c.box.right[2], c.box.top[3]]

/** One-shot SMIL animation: plays once, ends frozen. */
const once = (attr: string, values: string, dur: number, extra = '') =>
  `<animate attributeName="${attr}" values="${values}" dur="${n1(dur)}s" fill="freeze"${extra}/>`

/** A gear outline with radius 10, a centre hole and four windows (even-odd). */
function gearD(teeth: number): string {
  const step = (Math.PI * 2) / teeth
  const at = (r: number, a: number) => `${n1(Math.cos(a) * r)} ${n1(Math.sin(a) * r)}`
  const p: string[] = []
  for (let i = 0; i < teeth; i++) {
    const c = i * step
    p.push(at(7.8, c - step * 0.3), at(10, c - step * 0.15), at(10, c + step * 0.15), at(7.8, c + step * 0.3))
  }
  const hole = (x: number, y: number, r: number) =>
    `M${n1(x + r)} ${n1(y)}a${n1(r)} ${n1(r)} 0 1 0 ${n1(-2 * r)} 0a${n1(r)} ${n1(r)} 0 1 0 ${n1(2 * r)} 0Z`
  let d = 'M' + p.join('L') + 'Z' + hole(0, 0, 1.8)
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4
    d += hole(Math.cos(a) * 4.7, Math.sin(a) * 4.7, 1.7)
  }
  return d
}

/** A gear placed at (x, y) with radius r; spin is the period in seconds (sign = direction), 0 for still. */
function gear(id: string, x: number, y: number, r: number, spin: number, phase: number, fill = 'url(#steampunk-gr)'): string {
  const rot = spin
    ? `<animateTransform attributeName="transform" type="rotate" values="${phase};${phase + (spin > 0 ? 360 : -360)}" dur="${n1(Math.abs(spin))}s" repeatCount="indefinite"/>`
    : ''
  return `<g transform="translate(${n1(x)} ${n1(y)}) scale(${(r / 10).toFixed(3)})"><use href="#${id}" transform="rotate(${phase})" fill="${fill}">${rot}</use></g>`
}

/** A pressure gauge: brass rim, cream dial, red zone and a needle at `angle` degrees (0 = up). */
function gauge(x: number, y: number, r: number, angle: number, shake: string, alarm: boolean): string {
  const pa = (deg: number, rr: number): Pt => [x + Math.sin((deg * Math.PI) / 180) * rr, y - Math.cos((deg * Math.PI) / 180) * rr]
  let s = circle([x, y], r, `fill="url(#steampunk-rv)" stroke="${DARK}" stroke-width="0.8"`)
  s += circle([x, y], r * 0.78, `fill="${alarm ? '#f7d4c4' : '#f3e6c4'}" stroke="#6b4a1a" stroke-width="0.6"`)
  const ra = r * 0.6
  s += `<path d="M${fmt(pa(70, ra))}A${n1(ra)} ${n1(ra)} 0 0 1 ${fmt(pa(135, ra))}" fill="none" stroke="#c0392b" stroke-width="${n1(r * 0.14)}"/>`
  let ticks = ''
  for (let t = -135; t <= 135; t += 45) ticks += line(pa(t, r * 0.72), pa(t, r * 0.56), '')
  s += `<g stroke="#3a2408" stroke-width="0.6">${ticks}</g>`
  const w = Math.max(0.6, r * 0.09)
  s +=
    `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(angle)})"><path d="M${n1(-w)} 0L0 ${n1(-r * 0.66)}L${n1(w)} 0Z" fill="#7a1a10">${shake}</path></g>` +
    circle([x, y], r * 0.13, `fill="${BRASS}" stroke="${DARK}" stroke-width="0.4"`)
  return s
}

/** A finished (polished brass) or failed (rusted iron) block with an engraved mark. */
function block(ctx: SceneCtx, c: CubeCtx): string {
  const S = ctx.S
  const b = c.box
  const err = c.status === 'error'
  const k = err ? 'r' : 'b'
  const onF = (a: number, w: number) => ctx.P(c.u0 + a, 0, w)
  let s = poly(b.front, `fill="url(#steampunk-${k}F)"`) + poly(b.right, `fill="url(#steampunk-${k}S)"`) + poly(b.top, `fill="url(#steampunk-${k}T)"`)
  if (err && ctx.detail > 1) {
    const rnd = seeded(31 + c.index * 13)
    let spots = ''
    for (let j = 0; j < 9; j++) {
      const p = j < 6 ? onF(0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8) : ctx.P(c.u1, 0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7)
      const rx = S * (0.04 + rnd() * 0.07)
      const col = j % 3 === 0 ? '#1f0703' : j % 3 === 1 ? '#c4672c' : '#8a4a20'
      spots += `<ellipse cx="${n1(p[0])}" cy="${n1(p[1])}" rx="${n1(rx)}" ry="${n1(rx * 0.7)}" fill="${col}"/>`
    }
    s += `<g opacity="0.45">${spots}</g>`
  }
  // A bevelled inner panel on the front.
  const inset: Pt[] = [onF(0.1, 0.1), onF(0.9, 0.1), onF(0.9, 0.9), onF(0.1, 0.9)]
  s += poly(inset.map(p => [p[0] + 0.8, p[1] + 0.8] as Pt), `fill="none" stroke="${err ? '#d07a50' : '#fff3c8'}" stroke-opacity="0.4" stroke-width="0.7"`)
  s += poly(inset, `fill="none" stroke="${err ? '#1f0703' : '#5a3c12'}" stroke-opacity="0.65" stroke-width="0.9"`)
  if (!err) s += poly(b.front, 'fill="url(#steampunk-sh)"') + poly(b.top, 'fill="url(#steampunk-sh)"')
  if (ctx.detail > 1) {
    const rr = Math.max(1, S * 0.028)
    s += `<g ${RIVET}>` + [onF(0.05, 0.05), onF(0.95, 0.05), onF(0.95, 0.95), onF(0.05, 0.95)].map(p => dot(p, rr)).join('') + '</g>'
  }
  s += `<g fill="none" stroke="${err ? '#1f0804' : '#4a3010'}" stroke-width="1" stroke-linejoin="round">${edges(c)}</g>`
  s += `<g stroke="${err ? '#c27050' : '#fff6d0'}" stroke-opacity="0.8" stroke-width="1">${line(b.front[3], b.front[2], '')}${line(b.front[2], b.right[2], '')}</g>`
  const mk = err
    ? `M${fmt(onF(0.3, 0.3))}L${fmt(onF(0.7, 0.7))}M${fmt(onF(0.7, 0.3))}L${fmt(onF(0.3, 0.7))}`
    : `M${fmt(onF(0.26, 0.5))}L${fmt(onF(0.43, 0.32))}L${fmt(onF(0.75, 0.7))}`
  const cap = `fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${n1(Math.max(2, S * 0.09))}"`
  s += `<path d="${mk}" ${cap} stroke="${err ? '#e08a60' : '#fff3c8'}" stroke-opacity="0.65" transform="translate(0.8 0.9)"/>`
  s += `<path d="${mk}" ${cap} stroke="${err ? '#1a0603' : '#4a3010'}"/>`
  return s
}

/** A step not started yet: a thin brass wire frame. */
function wire(ctx: SceneCtx, c: CubeCtx): string {
  const k = ctx.P(c.u0, 1, 0)
  let s =
    `<g stroke="${BRASS}" stroke-opacity="0.35" stroke-width="0.7">` +
    line(k, ctx.P(c.u1, 1, 0), '') + line(k, ctx.P(c.u0, 0, 0), '') + line(k, ctx.P(c.u0, 1, 1), '') + '</g>'
  s += `<g fill="none" stroke="#e0b860" stroke-opacity="0.85" stroke-width="1.1" stroke-linejoin="round">${edges(c)}</g>`
  if (ctx.detail > 1) s += `<g fill="#f0cf7c">` + corners(c).map(p => dot(p, 1.4)).join('') + '</g>'
  return s
}

/** An open glass vitrine: a riveted brass frame along its edges; steam rising while it works. */
function vitrine(ctx: SceneCtx, c: CubeCtx): string {
  const S = ctx.S
  const fw = Math.max(1.6, S * 0.045)
  const e = edges(c)
  let s =
    `<g fill="none" stroke-linejoin="round"><g stroke="${DARK}" stroke-width="${n1(fw + 1.4)}">${e}</g>` +
    `<g stroke="${BRASS}" stroke-width="${n1(fw)}">${e}</g><g stroke="#fff0c0" stroke-opacity="0.7" stroke-width="${n1(fw * 0.3)}">${e}</g></g>`
  s += `<g ${RIVET}>` + corners(c).map(p => dot(p, fw * 0.95)).join('') + '</g>'
  if (!c.isLive) return s
  const rnd = seeded(71 + c.index * 5)
  const count = ctx.detail > 1 ? 4 : 2
  for (let k = 0; k < count; k++) {
    const p = ctx.P(c.u0 + 0.25 + rnd() * 0.5, 0.25 + rnd() * 0.5, 1)
    const dur = n1(2.6 + rnd() * 0.8)
    const begin = n1(k * 0.7)
    const t = `dur="${dur}s" begin="${begin}s" repeatCount="indefinite"`
    s +=
      `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="${n1(S * 0.05)}" fill="${STEAM}" filter="url(#sd)" opacity="0">` +
      `<animate attributeName="opacity" values="0;0.6;0" ${t}/><animate attributeName="r" values="${n1(S * 0.05)};${n1(S * 0.2)}" ${t}/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${n1((rnd() - 0.5) * S * 0.3)} ${n1(-S * (0.6 + rnd() * 0.3))}" ${t}/></circle>`
  }
  return s
}

/** A stuck step: a pressure gauge pegged in the red, twitching, with a warning ring. */
function pressure(ctx: SceneCtx, c: CubeCtx): string {
  const r = Math.max(5, ctx.S * 0.15)
  const [x, y] = c.box.front[2]
  const shake = '<animateTransform attributeName="transform" type="rotate" values="0;-9;5;-6;3;0" dur="0.45s" repeatCount="indefinite"/>'
  return (
    circle([x, y], r * 1.3, 'fill="none" stroke="#e0402a" stroke-width="1.6"', '<animate attributeName="stroke-opacity" values="1;0.15;1" dur="0.9s" repeatCount="indefinite"/>') +
    gauge(x, y, r, 115, shake, true)
  )
}

/** The one-shot completion: a flash, bell rings, a burst of steam and sparks. */
function burst(ctx: SceneCtx, c: CubeCtx): string {
  const S = ctx.S
  const b = c.box
  let s = `<g fill="#fff4cc" opacity="0">${once('opacity', '0;0.85;0', 0.6)}${poly(b.front, '')}${poly(b.right, '')}${poly(b.top, '')}</g>`
  const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.5)
  for (const [d, w] of [[0, 2.2], [0.22, 1.6], [0.44, 1.1]] as const) {
    const bg = ` begin="${d}s"`
    s +=
      `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(S * 0.5)}" ry="${n1(S * 0.25)}" fill="none" stroke="#f3c96a" stroke-width="${w}" opacity="0">` +
      once('rx', `${n1(S * 0.5)};${n1(S * 1.6)}`, 1.2, bg) + once('ry', `${n1(S * 0.25)};${n1(S * 0.8)}`, 1.2, bg) + once('opacity', '0;0.95;0', 1.2, bg) +
      '</ellipse>'
  }
  const rnd = seeded(97 + c.index * 11)
  const puffs = ctx.detail > 1 ? 6 : 4
  for (let k = 0; k < puffs; k++) {
    const p = ctx.P(c.u0 + 0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7, 1)
    const dur = 1.6 + rnd() * 0.6
    const bg = ` begin="${n1(k * 0.06)}s"`
    s +=
      `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="${n1(S * 0.08)}" fill="${STEAM}" filter="url(#sd)" opacity="0">` +
      once('opacity', '0;0.75;0', dur, bg) + once('r', `${n1(S * 0.08)};${n1(S * 0.3)}`, dur, bg) +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${n1((rnd() - 0.5) * S * 0.5)} ${n1(-S * (0.7 + rnd() * 0.6))}" dur="${n1(dur)}s"${bg} fill="freeze"/></circle>`
  }
  if (ctx.detail > 1) {
    const [tx, ty] = c.top
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI * (0.05 + rnd() * 0.9)
      const d = S * (0.5 + rnd() * 0.6)
      const dx = Math.cos(a) * d
      const dy = Math.sin(a) * d * 0.8
      const col = k % 3 === 0 ? '#fff3c0' : k % 3 === 1 ? '#ffcc55' : '#ff8a2a'
      s +=
        `<circle cx="${n1(tx)}" cy="${n1(ty)}" r="${n1(1 + rnd())}" fill="${col}" opacity="0">` + once('opacity', '0;1;1;0', 0.9, ' begin="0.05s"') +
        `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(dx)} ${n1(dy)};${n1(dx * 1.3)} ${n1(dy + S * 0.45)}" keyTimes="0;0.6;1" dur="0.9s" begin="0.05s" fill="freeze"/></circle>`
    }
  }
  return s
}

/** Victorian machinery: walnut and brass, riveted bands, turning gears and steam. */
export const steampunk: Skin = {
  id: 'steampunk',
  name: 'Steampunk',
  description: 'Messing, Kupfer und Zahnräder',
  status: {
    pending: ['#d9bd80', '#a8864a', '#6b5226'],
    running: ['#ffd27a', '#e0a43c', '#b97a22'],
    done: ['#f3d27a', '#c8962e', '#8a611a'],
    error: ['#b5523a', '#7a2a1c', '#4f1a12'],
    waiting: ['#8fd4bc', '#3f8f7a', '#2a6656'],
  },
  glass: { top: 0.2, bottom: 0.05, ghost: 0.7 },
  edge: { color: '#c8962e', opacity: 0.35 },
  mini: {
    top: ['#f6dc94', '#cfa54c'],
    front: ['#c08e36', '#8a5f1d'],
    side: ['#82581a', '#553810'],
    highlight: '#fff1c4',
    glint: '#ffe9a8',
  },
  tint: {
    read: ['#3f86e0', 0.6],
    write: ['#e0462a', 0.58],
    run: ['#1fae8a', 0.62],
    agent: ['#9b5fe0', 0.62],
    other: ['#c8962e', 0],
    err: ['#8a1408', 0.85],
  },
  pedestal: {
    front: ['#5e3c22', '#452b17', '#2c1b0e'],
    top: ['#c09042', '#7a5520'],
    side: ['#3a2414', '#1f130a'],
    footTop: '#9a7030',
    footSide: '#4a3310',
    light: '#ffd98a',
    shadow: '#000000',
  },
  plaque: {
    frame: ['#f4d688', '#94681f'],
    inner: ['#e2bd68', '#a87a2e'],
    text: { pending: '#5a4320', running: '#5a1e02', done: '#2a1a06', error: '#7a1a10', waiting: '#1e4a3e' },
    caption: '#ecc77e',
  },
  track: { groove: '#120a04', from: '#b87333', to: '#f3d27a', head: '#ffb347' },
  font: "Georgia,'Times New Roman',serif",

  defs(ctx) {
    let s = lin('steampunk-bg', 0, 1, [[0, '#3b2414'], [0.6, '#2a180c'], [1, '#170c05']])
    if (ctx.detail === 0) return s
    const { width: W, height: H, S } = ctx
    const pw = Math.max(24, S * 0.9)
    s +=
      `<pattern id="steampunk-wood" width="${n1(pw)}" height="60" patternUnits="userSpaceOnUse">` +
      `<path d="M0.5 0V60" stroke="#000000" stroke-opacity="0.45"/><path d="M1.5 0V60" stroke="#e0a060" stroke-opacity="0.1"/>` +
      `<path d="M${n1(pw * 0.3)} 0q3 15 0 30t0 30M${n1(pw * 0.62)} 0q-2 20 0 30t0 30M${n1(pw * 0.82)} 0q2 10 0 30t0 30" fill="none" stroke="#000000" stroke-opacity="0.14" stroke-width="0.8"/></pattern>` +
      rad('steampunk-lamp', [[0, '#ffb347', 0.34], [0.5, '#d9822b', 0.1], [1, '#d9822b', 0]]) +
      `<radialGradient id="steampunk-rv" cx="0.35" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff2c2"/><stop offset="0.45" stop-color="#c8962e"/><stop offset="1" stop-color="#4a3010"/></radialGradient>` +
      lin('steampunk-band', 0, 1, [[0, '#fff0b0'], [0.35, '#d4a646'], [1, '#6b4a16']]) +
      lin('steampunk-gr', 1, 1, [[0, '#f6d98a'], [0.5, '#b8862f'], [1, '#5e3f12']]) +
      lin('steampunk-gc', 1, 1, [[0, '#f0a978'], [0.5, '#b8643a'], [1, '#5a2a14']]) +
      lin('steampunk-pipe', 0, 1, [[0, '#f2b18a'], [0.4, '#b87333'], [1, '#4a240f']]) +
      lin('steampunk-bF', 0, 1, [[0, '#f6dc8e'], [0.5, '#c8962e'], [1, '#7a5418']]) +
      lin('steampunk-bS', 0, 1, [[0, '#a8782a'], [1, '#553810']]) +
      lin('steampunk-bT', 1, 1, [[0, '#fff2bc'], [1, '#d4a646']]) +
      lin('steampunk-rF', 0, 1, [[0, '#8e3e28'], [1, '#4a1810']]) +
      lin('steampunk-rS', 0, 1, [[0, '#5a2216'], [1, '#2a0c08']]) +
      lin('steampunk-rT', 1, 1, [[0, '#b0603e'], [1, '#6a2a1a']]) +
      lin('steampunk-sh', 1, 1, [[0, '#ffffff', 0], [0.38, '#ffffff', 0], [0.5, '#ffffff', 0.45], [0.62, '#ffffff', 0], [1, '#ffffff', 0]]) +
      `<clipPath id="steampunk-pf"><polygon points="${pts(ctx.pedestal.front)}"/></clipPath>` +
      `<clipPath id="steampunk-clip"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="9.5"/></clipPath>` +
      `<path id="steampunk-g12" fill-rule="evenodd" stroke="${DARK}" stroke-width="0.6" d="${gearD(12)}"/>` +
      `<path id="steampunk-g8" fill-rule="evenodd" stroke="${DARK}" stroke-width="0.6" d="${gearD(8)}"/>`
    return s
  },

  backdrop(ctx) {
    const { width: W, height: H, S } = ctx
    let s = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="url(#steampunk-bg)" stroke="#8a6326" stroke-width="1.2"/>`
    if (ctx.detail === 0) return s
    s += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="9.5" fill="url(#steampunk-wood)"/>`
    s += `<ellipse cx="${n1(W / 2)}" cy="${n1(H * 0.35)}" rx="${n1(W * 0.55)}" ry="${n1(H * 0.65)}" fill="url(#steampunk-lamp)"/>`
    if (ctx.detail < 2) return s
    // Big faint gears in the corners, turning slowly while work runs.
    const spin = ctx.hasLive ? 1 : 0
    const r1 = S * 0.9
    const r2 = S * 0.6
    const d = (r1 + r2) * 0.88
    const a = (150 * Math.PI) / 180
    s +=
      `<g clip-path="url(#steampunk-clip)" opacity="0.28">` +
      gear('steampunk-g12', W - S * 0.15, S * 0.15, r1, spin * 40, 0, '#0d0703') +
      gear('steampunk-g8', W - S * 0.15 + Math.cos(a) * d, S * 0.15 + Math.sin(a) * d, r2, spin * -26.7, 22.5, '#0d0703') +
      gear('steampunk-g8', S * 0.05, S * 0.35, S * 0.7, spin * -30, 10, '#0d0703') +
      '</g>'
    // A copper steam pipe along the top, with flanges.
    const ph = Math.max(3, S * 0.07)
    const py = 5
    s += `<rect x="14" y="${py}" width="${W - 28}" height="${n1(ph)}" fill="url(#steampunk-pipe)"/>`
    let fl = ''
    for (let k = 0; k <= 4; k++) {
      const x = 14 + ((W - 28 - 4) * k) / 4
      fl += `<rect x="${n1(x)}" y="${n1(py - 1.5)}" width="4" height="${n1(ph + 3)}" rx="1"/>`
    }
    s += `<g fill="#7a3f1c" stroke="${DARK}" stroke-width="0.5">${fl}</g>`
    // Rivets down both sides of the panel.
    let rv = ''
    for (let y = py + ph + S * 0.3; y < H - 8; y += S * 0.4) rv += dot([6, y], 1.6) + dot([W - 6, y], 1.6)
    s += `<g ${RIVET}>${rv}</g>`
    return s
  },

  pedestalDecor(ctx) {
    if (ctx.detail === 0) return ''
    const S = ctx.S
    const { x0, x1, yT, yB, xAt, yAt } = front(ctx)
    const out: string[] = []
    // Wood grain across the walnut front.
    if (ctx.detail > 1) {
      const rnd = seeded(11 + ctx.n)
      let g = ''
      const segs = Math.ceil((x1 - x0) / (S * 1.6))
      for (let k = 0; k < 6; k++) {
        const y = yAt(-0.13 - k * 0.13 - rnd() * 0.04)
        const a = S * (0.02 + rnd() * 0.03)
        let d = `M${n1(x0)} ${n1(y)}`
        for (let j = 0; j < segs; j++) d += `q${n1(S * 0.4)} ${n1(-a)} ${n1(S * 0.8)} 0t${n1(S * 0.8)} 0`
        g += `<path d="${d}"/>`
      }
      out.push(`<g clip-path="url(#steampunk-pf)" fill="none" stroke="#120802" stroke-opacity="0.35" stroke-width="0.7">${g}</g>`)
    }
    // Riveted brass bands along the top and bottom of the front.
    const bh = S * 0.07
    out.push(
      `<rect x="${n1(x0)}" y="${n1(yT)}" width="${n1(x1 - x0)}" height="${n1(bh)}" fill="url(#steampunk-band)"/>` +
        `<rect x="${n1(x0)}" y="${n1(yB - bh)}" width="${n1(x1 - x0)}" height="${n1(bh)}" fill="url(#steampunk-band)"/>`,
    )
    const rr = Math.max(1, S * 0.022)
    const cnt = Math.max(2, Math.round((x1 - x0) / (S * 0.42)))
    let rv = ''
    for (let i = 0; i <= cnt; i++) {
      const x = x0 + S * 0.06 + ((x1 - x0 - S * 0.12) * i) / cnt
      rv += dot([x, yT + bh / 2], rr) + dot([x, yB - bh / 2], rr)
    }
    if (ctx.detail > 1) {
      // A row of rivets along the brass top's front edge.
      const t = ctx.pedestal.top
      const a = lerp(t[0], t[3], 0.035)
      const b = lerp(t[1], t[2], 0.035)
      for (let i = 0; i <= cnt; i++) rv += dot(lerp(a, b, 0.01 + (0.98 * i) / cnt), rr * 0.9)
    }
    out.push(`<g ${RIVET}>${rv}</g>`)
    // Interlocking gears in the gaps between the plaques; they turn while work runs.
    const spin = ctx.hasLive ? 1 : 0
    const pair = (gu: number) => {
      const cx = xAt(gu - 0.05)
      const cy = yAt(-0.33)
      const sx = xAt(gu + 0.06)
      const sy = cy + S * 0.193
      return (
        gear('steampunk-g12', cx, cy, S * 0.15, spin * 8, 0) +
        gear('steampunk-g8', sx, sy, S * 0.1, spin * -5.33, 22.5, 'url(#steampunk-gc)') +
        `<g fill="${DARK}">${dot([cx, cy], S * 0.025)}${dot([sx, sy], S * 0.02)}</g>`
      )
    }
    let gears = pair(ctx.cubeU(ctx.n - 1) + 1.095)
    if (ctx.detail > 1) for (let i = 1; i < ctx.n; i++) gears += pair(ctx.cubeU(i) - 0.15)
    out.push(gears)
    // A pressure gauge at the left end showing the overall progress.
    const shake = ctx.hasLive
      ? '<animateTransform attributeName="transform" type="rotate" values="0;4;-2;3;0" dur="1.1s" repeatCount="indefinite"/>'
      : ''
    out.push(gauge(xAt(ctx.cubeU(0) - 0.095), yAt(-0.42), S * 0.17, -135 + 270 * Math.min(1, Math.max(0, ctx.overall)), shake, false))
    return out.join('')
  },

  cubeInner(ctx, c) {
    if (!c.isLive || ctx.detail === 0) return ''
    const S = ctx.S
    const P = ctx.P
    const u = c.u0 + 0.5
    const [gx, gy] = P(u, 0.5, 0.5)
    let s =
      `<ellipse cx="${n1(gx)}" cy="${n1(gy)}" rx="${n1(S * 0.42)}" ry="${n1(S * 0.42)}" fill="url(#steampunk-lamp)">` +
      `<animate attributeName="opacity" values="0.6;1;0.75;0.95;0.6" dur="2.4s" repeatCount="indefinite"/></ellipse>`
    // An Edison filament on two support wires.
    const coil: Pt[] = []
    for (let j = 0; j <= 8; j++) coil.push(P(u - 0.12 + (0.24 * j) / 8, 0.5, j % 2 ? 0.58 : 0.48))
    s += `<g stroke="#6b4a1a" stroke-width="0.8">${line(P(u - 0.1, 0.5, 0.12), coil[0]!, '')}${line(P(u + 0.1, 0.5, 0.12), coil[8]!, '')}</g>`
    s +=
      `<polyline points="${pts(coil)}" fill="none" stroke="#ffd27a" stroke-width="${n1(Math.max(1, S * 0.025))}" stroke-linejoin="round" filter="url(#gl)">` +
      `<animate attributeName="stroke-opacity" values="1;0.6;1;0.85;1" dur="1.3s" repeatCount="indefinite"/></polyline>`
    if (ctx.detail > 1) {
      const [tx, ty] = P(u, 0.5, 0.84)
      s += gear('steampunk-g8', tx, ty, S * 0.1, 3, 0, 'url(#steampunk-gc)')
    }
    return s
  },

  cubeOverlay(ctx, c) {
    if (ctx.detail === 0) return ''
    let s: string
    if (c.kind === 'solid') s = block(ctx, c) + (c.justDone && c.status === 'done' ? burst(ctx, c) : '')
    else if (c.isGhost) s = wire(ctx, c)
    else s = vitrine(ctx, c)
    if (c.stuck) s += pressure(ctx, c)
    return s
  },

  overlay(ctx) {
    if (ctx.detail === 0) return ''
    // Two mounting screws on each brass nameplate.
    const { xAt, yAt } = front(ctx)
    const S = ctx.S
    const inset = Math.max(1.5, S * 0.05)
    const r = Math.max(1.2, S * 0.03)
    const y = yAt(-0.14 - 0.23)
    const rnd = seeded(5 + ctx.n)
    let s = ''
    let slots = ''
    for (let i = 0; i < ctx.n; i++) {
      const cu = ctx.cubeU(i) + 0.5
      for (const x of [xAt(cu - 0.37) + inset + r * 0.2, xAt(cu + 0.37) - inset - r * 0.2]) {
        s += dot([x, y], r)
        const a = rnd() * Math.PI
        const dx = Math.cos(a) * r * 0.75
        const dy = Math.sin(a) * r * 0.75
        slots += line([x - dx, y - dy], [x + dx, y + dy], '')
      }
    }
    return `<g ${RIVET}>${s}</g><g stroke="${DARK}" stroke-width="${n1(Math.max(0.5, r * 0.3))}">${slots}</g>`
  },
}
