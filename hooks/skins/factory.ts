import { completionBurst } from './classic'
import { circle, lin, line, n1, poly, rad, seeded } from '../svg'
import type { Pt } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/**
 * Robot factory: a busy 8-bit production hall. Big gears turn on the back wall,
 * ceiling lamps throw light cones, pipes with valve wheels run along the top and
 * a vent puffs steam. The pedestal is a machine base with a running conveyor,
 * rollers, a control desk with blinking lights and a row of bolts. A robot arm
 * works over every cube in progress, welding sparks fly at its foot, and
 * finished cubes become braced steel crates with a green lamp.
 */
const STEEL = '#64748b'
const DARK = '#1e293b'
const HAZARD = '#d4a72c'
const LAMP = '#f59e0b'
const SPARK = '#fde68a'

const STATUS: Skin['status'] = {
  pending: ['#94a3b8', '#64748b', '#475569'],
  running: ['#7dd3fc', '#0ea5e9', '#0369a1'],
  done: ['#a7f3d0', '#10b981', '#065f46'],
  error: ['#fda4af', '#e11d48', '#7f1d1d'],
  waiting: ['#fde047', '#eab308', '#a16207'],
}

const crisp = 'shape-rendering="crispEdges"'

/** A gear as path data: n teeth around a ring of radius r, with a hub hole. */
function gearPath(cx: number, cy: number, r: number, n: number): string {
  const inner = r * 0.8
  let d = ''
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2
    const a1 = a0 + (Math.PI * 2) / n
    const pts: [number, number][] = [
      [inner, a0],
      [r, a0 + (a1 - a0) * 0.15],
      [r, a0 + (a1 - a0) * 0.5],
      [inner, a0 + (a1 - a0) * 0.65],
    ]
    for (const [rr, a] of pts) d += `${d ? 'L' : 'M'}${n1(cx + Math.cos(a) * rr)} ${n1(cy + Math.sin(a) * rr)}`
  }
  const h = r * 0.28
  return `${d}Z M${n1(cx + h)} ${n1(cy)}A${n1(h)} ${n1(h)} 0 1 0 ${n1(cx - h)} ${n1(cy)}A${n1(h)} ${n1(h)} 0 1 0 ${n1(cx + h)} ${n1(cy)}Z`
}

function gear(cx: number, cy: number, r: number, n: number, col: string, spin: number): string {
  const turn = spin ? `<animateTransform attributeName="transform" type="rotate" values="0 ${n1(cx)} ${n1(cy)};${spin > 0 ? 360 : -360} ${n1(cx)} ${n1(cy)}" dur="${n1(Math.abs(spin))}s" repeatCount="indefinite"/>` : ''
  return `<path d="${gearPath(cx, cy, r, n)}" fill="${col}" fill-rule="evenodd" stroke="#0f172a" stroke-opacity="0.5" stroke-width="0.8">${turn}</path>`
}

function backdrop(ctx: SceneCtx): string {
  const { width: W, height: H, S } = ctx
  let s = `<rect width="${W}" height="${H}" fill="url(#factory-wall)" ${crisp}/>`
  if (ctx.detail === 0) return s
  const live = ctx.hasLive && ctx.detail > 1
  s += `<rect width="${W}" height="${H}" fill="url(#factory-rivets)" ${crisp}/>`

  // Big gears on the back wall, meshing pairs turning opposite ways.
  if (ctx.detail > 1) {
    const gy = H * 0.5
    s += gear(W * 0.12, gy, S * 0.9, 12, '#273449', live ? 18 : 0)
    s += gear(W * 0.12 + S * 1.45, gy + S * 0.55, S * 0.55, 8, '#2f3d54', live ? -11 : 0)
    s += gear(W * 0.86, gy - S * 0.2, S * 0.75, 10, '#273449', live ? -15 : 0)
  }

  // Ceiling lamps with light cones.
  for (const fx of [0.3, 0.62]) {
    const x = W * fx
    s += `<path d="M${n1(x - S * 0.12)} ${n1(S * 0.62)}L${n1(x - S * 0.9)} ${n1(H * 0.85)}L${n1(x + S * 0.9)} ${n1(H * 0.85)}L${n1(x + S * 0.12)} ${n1(S * 0.62)}Z" fill="url(#factory-cone)"/>`
    s += line([x, 0], [x, S * 0.5], `stroke="${DARK}" stroke-width="1.5"`)
    s += `<path d="M${n1(x - S * 0.18)} ${n1(S * 0.62)}L${n1(x - S * 0.08)} ${n1(S * 0.48)}L${n1(x + S * 0.08)} ${n1(S * 0.48)}L${n1(x + S * 0.18)} ${n1(S * 0.62)}Z" fill="${STEEL}" stroke="#0f172a" stroke-width="0.8"/>`
    s += `<rect x="${n1(x - S * 0.1)}" y="${n1(S * 0.6)}" width="${n1(S * 0.2)}" height="${n1(S * 0.04)}" fill="#fef9c3" ${crisp}/>`
  }

  // Pipes along the top, with flanges, valve wheels and a steam vent.
  for (const [y, h, col] of [[S * 0.16, S * 0.14, '#475569'], [S * 0.36, S * 0.08, '#334155']] as const) {
    s += `<rect x="0" y="${n1(y)}" width="${W}" height="${n1(h)}" fill="${col}" ${crisp}/>`
    s += `<rect x="0" y="${n1(y)}" width="${W}" height="${n1(Math.max(1, h * 0.25))}" fill="#94a3b8" opacity="0.5" ${crisp}/>`
    for (let x = S * 0.6; x < W; x += S * 1.8) s += `<rect x="${n1(x)}" y="${n1(y - 2)}" width="${n1(S * 0.14)}" height="${n1(h + 4)}" fill="${DARK}" ${crisp}/>`
  }
  for (const fx of [0.2, 0.74]) {
    const [vx, vy] = [W * fx, S * 0.23]
    s += circle([vx, vy], S * 0.12, `fill="none" stroke="#7a8699" stroke-width="${n1(Math.max(1.5, S * 0.04))}"`)
    s += line([vx - S * 0.12, vy], [vx + S * 0.12, vy], `stroke="#7a8699" stroke-width="1.2"`) + line([vx, vy - S * 0.12], [vx, vy + S * 0.12], `stroke="#7a8699" stroke-width="1.2"`)
  }
  if (live) {
    const [sx, sy] = [W * 0.47, S * 0.36]
    for (let k = 0; k < 3; k++) {
      const at = ` dur="2.4s" begin="${n1(k * 0.8)}s" repeatCount="indefinite"`
      s +=
        `<circle cx="${n1(sx)}" cy="${n1(sy)}" r="${n1(S * 0.06)}" fill="#e2e8f0" opacity="0">` +
        `<animate attributeName="cy" values="${n1(sy)};${n1(sy + S * 0.6)}"${at}/>` +
        `<animate attributeName="r" values="${n1(S * 0.05)};${n1(S * 0.22)}"${at}/>` +
        `<animate attributeName="opacity" values="0;0.5;0"${at}/>` +
        `</circle>`
    }
  }

  // A stack of crates at the far right.
  const cw = S * 0.42
  const base = ctx.pedestal.top[2][1]
  for (const [dx, dy] of [[0, 0], [cw + 1, 0], [cw / 2, cw + 1]] as const) {
    const x = W - cw * 2.4 + dx
    const y = base - cw - dy
    s += `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(cw)}" height="${n1(cw)}" fill="#2a3240" stroke="#0f172a" stroke-width="1" ${crisp}/>`
    s += line([x, y], [x + cw, y + cw], `stroke="#475569" stroke-width="1"`)
  }

  // Warning lamps on the wall, blinking while work goes on.
  const blink = live ? '<animate attributeName="opacity" values="1;0.2" dur="0.8s" calcMode="discrete" repeatCount="indefinite"/>' : ''
  for (const x of [W * 0.04, W * 0.96]) s += circle([x, S * 0.78], Math.max(3, S * 0.09), `fill="${LAMP}"`, blink)
  return s
}

/** Machine base: hazard stripes, a running conveyor with rollers, a control desk and a row of bolts. */
function pedestalDecor(ctx: SceneCtx): string {
  if (ctx.detail === 0) return ''
  const f = ctx.pedestal.front
  const x0 = f[0][0]
  const x1 = f[1][0]
  const yT = f[3][1]
  const yB = f[0][1]
  const S = ctx.S
  const live = ctx.hasLive && ctx.detail > 1
  const band = Math.max(3, Math.min((yB - yT) * 0.07, S * 0.08))
  let s = `<rect x="${n1(x0)}" y="${n1(yT + 1)}" width="${n1(x1 - x0)}" height="${n1(band)}" fill="url(#factory-hazard)" ${crisp}/>`

  // The conveyor belt on top, its ribs moving.
  const top = ctx.pedestal.top
  s += poly(top, `fill="#1f2937"`)
  const run = live ? '<animate attributeName="stroke-dashoffset" values="0;-12" dur="0.8s" repeatCount="indefinite"/>' : ''
  const mid = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  for (const t of [0.25, 0.5, 0.75]) {
    const a = mid(top[0], top[3], t)
    const b = mid(top[1], top[2], t)
    s += `<line x1="${n1(a[0])}" y1="${n1(a[1])}" x2="${n1(b[0])}" y2="${n1(b[1])}" stroke="#4b5563" stroke-width="2" stroke-dasharray="4 8">${run}</line>`
  }

  // Rollers under the belt's front edge, their spokes turning.
  if (ctx.detail > 1) {
    const r = Math.max(2.2, S * 0.07)
    for (let x = x0 + r * 2; x < x1 - r; x += r * 3.2) {
      const spin = live ? `<animateTransform attributeName="transform" type="rotate" values="0 ${n1(x)} ${n1(yT)};360 ${n1(x)} ${n1(yT)}" dur="1.2s" repeatCount="indefinite"/>` : ''
      s += circle([x, yT], r, `fill="${STEEL}" stroke="#0f172a" stroke-width="0.6"`)
      s += `<g>${spin}${line([x - r * 0.8, yT], [x + r * 0.8, yT], 'stroke="#0f172a" stroke-width="0.7"')}${line([x, yT - r * 0.8], [x, yT + r * 0.8], 'stroke="#0f172a" stroke-width="0.7"')}</g>`
    }
  }

  // A control desk at the left end: a small screen and a row of blinking lights.
  const dw = S * 0.55
  const dx = x0 - dw * 0.15
  const dy = yB - (yB - yT) * 0.62
  s += `<rect x="${n1(dx)}" y="${n1(dy)}" width="${n1(dw)}" height="${n1((yB - yT) * 0.5)}" fill="#0f172a" stroke="${STEEL}" stroke-width="1" ${crisp}/>`
  s += `<rect x="${n1(dx + 3)}" y="${n1(dy + 3)}" width="${n1(dw - 6)}" height="${n1((yB - yT) * 0.2)}" fill="#052e16" ${crisp}/>`
  s += `<polyline points="${n1(dx + 4)},${n1(dy + 3 + (yB - yT) * 0.12)} ${n1(dx + dw * 0.35)},${n1(dy + 5)} ${n1(dx + dw * 0.6)},${n1(dy + 3 + (yB - yT) * 0.15)} ${n1(dx + dw - 5)},${n1(dy + 6)}" fill="none" stroke="#4ade80" stroke-width="1"/>`
  const leds = ['#ef4444', HAZARD, '#22c55e', '#38bdf8']
  leds.forEach((col, k) => {
    const blink = live ? `<animate attributeName="opacity" values="1;0.15" dur="${n1(0.5 + k * 0.23)}s" calcMode="discrete" repeatCount="indefinite"/>` : ''
    s += circle([dx + 5 + k * ((dw - 10) / 3), dy + (yB - yT) * 0.38], Math.max(1.4, S * 0.035), `fill="${col}"`, blink)
  })

  // Bolts along the bottom edge.
  for (let x = x0 + S * 0.2; x < x1; x += S * 0.5) s += circle([x, yB - 3], 1.3, `fill="#94a3b8" stroke="#0f172a" stroke-width="0.4"`)
  return s
}

/** A robot arm on the ceiling rail, working over a cube: shoulder, two links, a claw. */
function robotArm(ctx: SceneCtx, c: CubeCtx, sway: boolean): string {
  const S = ctx.S
  const [tx, ty] = ctx.P(c.u0 + 0.5, 0.5, 1)
  const railY = S * 0.12
  const elbow: Pt = [tx + S * 0.35, (railY + ty) / 2 - S * 0.1]
  const wrist: Pt = [tx, ty - S * 0.42]
  const swing = sway ? `<animateTransform attributeName="transform" type="rotate" values="-4 ${n1(tx)} ${n1(railY)};4 ${n1(tx)} ${n1(railY)};-4 ${n1(tx)} ${n1(railY)}" dur="2.6s" repeatCount="indefinite"/>` : ''
  const link = (a: Pt, b: Pt, w: number) => line(a, b, `stroke="#3b4556" stroke-width="${n1(w)}" stroke-linecap="round"`) + line(a, b, `stroke="#cbd5e1" stroke-opacity="0.45" stroke-width="${n1(w * 0.3)}" stroke-linecap="round"`)
  return (
    `<g>${swing}` +
    `<rect x="${n1(tx - S * 0.16)}" y="${n1(railY - S * 0.05)}" width="${n1(S * 0.32)}" height="${n1(S * 0.12)}" fill="${STEEL}" stroke="#0f172a" stroke-width="0.8" ${crisp}/>` +
    link([tx, railY + S * 0.06], elbow, Math.max(2.5, S * 0.09)) +
    circle(elbow, Math.max(2, S * 0.06), `fill="${DARK}" stroke="${HAZARD}" stroke-width="1"`) +
    link(elbow, wrist, Math.max(2, S * 0.07)) +
    circle(wrist, Math.max(1.8, S * 0.05), `fill="${DARK}"`) +
    line(wrist, [wrist[0] - S * 0.1, wrist[1] + S * 0.14], `stroke="#cbd5e1" stroke-width="1.6" stroke-linecap="round"`) +
    line(wrist, [wrist[0] + S * 0.1, wrist[1] + S * 0.14], `stroke="#cbd5e1" stroke-width="1.6" stroke-linecap="round"`) +
    `</g>`
  )
}

/** Welding sparks flying from the cube's foot, looping while it is worked on. */
function sparks(ctx: SceneCtx, c: CubeCtx): string {
  const rnd = seeded(c.index * 97 + 5)
  const [x, y] = ctx.P(c.u0 + 0.85, 0, 0.05)
  let s = ''
  for (let k = 0; k < 7; k++) {
    const dx = (rnd() - 0.2) * ctx.S * 0.6
    const dy = -rnd() * ctx.S * 0.35
    const at = ` dur="${n1(0.5 + rnd() * 0.4)}s" begin="${n1(rnd() * 0.6)}s" repeatCount="indefinite"`
    s +=
      `<circle cx="${n1(x)}" cy="${n1(y)}" r="1.1" fill="${k % 2 ? SPARK : '#ffffff'}" opacity="0">` +
      `<animate attributeName="cx" values="${n1(x)};${n1(x + dx)}"${at}/>` +
      `<animate attributeName="cy" values="${n1(y)};${n1(y + dy)};${n1(y + dy + ctx.S * 0.2)}"${at}/>` +
      `<animate attributeName="opacity" values="1;0.8;0"${at}/>` +
      `</circle>`
  }
  return s + circle([x, y], Math.max(1.5, ctx.S * 0.05), `fill="#ffffff" filter="url(#gl)"`)
}

function cubeOverlay(ctx: SceneCtx, c: CubeCtx): string {
  if (ctx.detail === 0) return ''
  const b = c.box
  const S = ctx.S
  let s = ''
  // Finished: a steel crate, diagonal braces, corner plates and a lamp on top.
  if (c.kind === 'solid') {
    const brace = `stroke="#1e293b" stroke-opacity="0.45" stroke-width="${n1(Math.max(1.2, S * 0.04))}"`
    s += line(b.front[0], b.front[2], brace) + line(b.front[1], b.front[3], brace)
    s += line(b.right[0], b.right[2], brace)
    const plate = (p: Pt) => `<rect x="${n1(p[0] - S * 0.06)}" y="${n1(p[1] - S * 0.06)}" width="${n1(S * 0.12)}" height="${n1(S * 0.12)}" fill="#cbd5e1" stroke="#1e293b" stroke-width="0.6" ${crisp}/>`
    s += [b.front[0], b.front[1], b.front[2], b.front[3]].map(plate).join('')
    const [lx, ly] = ctx.P(c.u0 + 0.5, 0.5, 1)
    s += `<rect x="${n1(lx - S * 0.08)}" y="${n1(ly - S * 0.14)}" width="${n1(S * 0.16)}" height="${n1(S * 0.12)}" fill="${c.status === 'done' ? '#10b981' : '#e11d48'}" stroke="#0f172a" stroke-width="0.8" ${crisp}/>`
  }
  // Not started: a plain steel frame.
  if (c.isGhost) {
    s += poly([b.front[0], b.front[1], b.front[2], b.front[3]], `fill="none" stroke="${STEEL}" stroke-width="1.2" stroke-dasharray="4 3" ${crisp}`)
  }
  // Worked on: the robot arm overhead, a warning lamp, welding sparks.
  if (c.isLive) {
    const anim = ctx.detail > 1
    if (anim) s += robotArm(ctx, c, true) + sparks(ctx, c)
    const [lx, ly] = ctx.P(c.u0 + 0.5, 0.5, 1)
    const blink = anim && c.status !== 'waiting' ? `<animate attributeName="fill" values="${LAMP};#7c2d12" dur="0.6s" calcMode="discrete" repeatCount="indefinite"/>` : ''
    s += `<rect x="${n1(lx - S * 0.09)}" y="${n1(ly - S * 0.2)}" width="${n1(S * 0.18)}" height="${n1(S * 0.16)}" fill="${c.status === 'waiting' ? HAZARD : LAMP}" stroke="#0f172a" stroke-width="0.8" ${crisp}>${blink}</rect>`
  }
  return s + completionBurst(ctx, c, HAZARD, '#ffffff')
}

export const factory: Skin = {
  id: 'factory',
  name: 'Robot factory',
  description: 'An automated production hall: graphite steel, robot arms and coolant lines',
  status: STATUS,
  glass: { top: 0.3, bottom: 0.06, ghost: 0.5 },
  edge: { color: '#0f172a', opacity: 0.55 },
  mini: { top: ['#e2e8f0', '#94a3b8'], front: ['#cbd5e1', '#64748b'], side: ['#94a3b8', '#334155'], highlight: '#f8fafc', glint: '#e0f2fe' },
  tint: {
    read: ['#38bdf8', 0.4],
    write: ['#d4a72c', 0.45],
    run: ['#a78bfa', 0.4],
    agent: ['#34d399', 0.4],
    other: ['#94a3b8', 0],
    err: ['#dc2626', 0.85],
  },
  pedestal: { front: ['#475569', '#334155', '#1e293b'], top: ['#334155', '#1f2937'], side: ['#1e293b', '#0f172a'], footTop: '#334155', footSide: '#0f172a', light: '#cbd5e1', shadow: '#000000' },
  plaque: {
    frame: ['#94a3b8', '#334155'],
    inner: ['#0b1220', '#111827'],
    text: { pending: '#64748b', running: '#38bdf8', done: '#34d399', error: '#fb7185', waiting: '#fbbf24' },
    caption: '#e2e8f0',
  },
  track: { groove: '#0f172a', from: '#0ea5e9', to: '#10b981', head: HAZARD },
  pipe: { fill: 'liquid', colors: ['#0e7490', '#06b6d4', '#a5f3fc'], metal: '#94a3b8' },
  day: { sky: ['#f4f7fb', '#dfe6ee'], ink: '#64748b', pattern: 'hall' },
  font: 'ui-monospace,Consolas,monospace',
  effects: { glint: false, sparks: false },
  defs: () =>
    lin('factory-wall', 0, 1, [[0, '#1e293b'], [1, '#0f172a']]) +
    lin('factory-cone', 0, 1, [[0, '#fef9c3', 0.22], [1, '#fef9c3', 0]]) +
    rad('factory-glow', [[0, '#ffffff', 0.8], [1, SPARK, 0]]) +
    `<pattern id="factory-rivets" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="none" stroke="#334155" stroke-width="1"/><rect x="2" y="2" width="2" height="2" fill="#475569"/><rect x="20" y="20" width="2" height="2" fill="#475569"/></pattern>` +
    `<pattern id="factory-hazard" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="12" fill="${HAZARD}"/><rect x="6" width="6" height="12" fill="#111827"/></pattern>`,
  backdrop,
  pedestalDecor,
  cubeOverlay,
}
