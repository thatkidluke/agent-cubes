import { completionBurst } from './classic'
import { circle, lin, line, n1, poly } from '../svg'
import type { Pt } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/**
 * Robot factory: an 8-bit production hall. Pipes and a rivet grid on the wall,
 * hazard stripes on a machine base, a conveyor belt running along its top,
 * warning lamps on cubes in work, finished cubes as steel crates with a green lamp.
 */
const STEEL = '#64748b'
const HAZARD = '#facc15'
const LAMP = '#fb923c'

const STATUS: Skin['status'] = {
  pending: ['#94a3b8', '#64748b', '#475569'],
  running: ['#7dd3fc', '#0ea5e9', '#0369a1'],
  done: ['#bef264', '#65a30d', '#3f6212'],
  error: ['#fca5a5', '#dc2626', '#7f1d1d'],
  waiting: ['#fde047', '#eab308', '#a16207'],
}

const crisp = 'shape-rendering="crispEdges"'

function backdrop(ctx: SceneCtx): string {
  const { width: W, height: H, S } = ctx
  let s = `<rect width="${W}" height="${H}" fill="url(#factory-wall)" ${crisp}/>`
  if (ctx.detail === 0) return s
  s += `<rect width="${W}" height="${H}" fill="url(#factory-rivets)" ${crisp}/>`
  // Two pipes along the top, with joints.
  for (const [y, h, col] of [[S * 0.18, S * 0.14, '#475569'], [S * 0.42, S * 0.08, '#334155']] as const) {
    s += `<rect x="0" y="${n1(y)}" width="${W}" height="${n1(h)}" fill="${col}" ${crisp}/>`
    s += `<rect x="0" y="${n1(y)}" width="${W}" height="${n1(Math.max(1, h * 0.25))}" fill="#94a3b8" opacity="0.5" ${crisp}/>`
    for (let x = S * 0.6; x < W; x += S * 1.8) s += `<rect x="${n1(x)}" y="${n1(y - 2)}" width="${n1(S * 0.14)}" height="${n1(h + 4)}" fill="#1e293b" ${crisp}/>`
  }
  // Warning lamps on the wall, blinking while work goes on.
  const blink = ctx.hasLive && ctx.detail > 1 ? '<animate attributeName="opacity" values="1;0.2" dur="0.8s" calcMode="discrete" repeatCount="indefinite"/>' : ''
  for (const x of [W * 0.06, W * 0.94]) s += circle([x, S * 0.78], Math.max(3, S * 0.09), `fill="${LAMP}"`, blink)
  return s
}

/** Hazard stripes on the base, a conveyor belt along its top that runs while work goes on. */
function pedestalDecor(ctx: SceneCtx): string {
  if (ctx.detail === 0) return ''
  const f = ctx.pedestal.front
  const x0 = f[0][0]
  const x1 = f[1][0]
  const yT = f[3][1]
  const yB = f[0][1]
  // Hazard stripes just under the top edge, clear of the plaques and the captions below them.
  const band = Math.max(3, Math.min((yB - yT) * 0.07, ctx.S * 0.08))
  let s = `<rect x="${n1(x0)}" y="${n1(yT + 1)}" width="${n1(x1 - x0)}" height="${n1(band)}" fill="url(#factory-hazard)" ${crisp}/>`
  // The belt: dark rubber with moving ribs.
  const top = ctx.pedestal.top
  s += poly(top, `fill="#1f2937"`)
  const run = ctx.hasLive && ctx.detail > 1 ? '<animate attributeName="stroke-dashoffset" values="0;-12" dur="0.8s" repeatCount="indefinite"/>' : ''
  const mid = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  for (const t of [0.25, 0.5, 0.75]) {
    s += `<line x1="${n1(mid(top[0], top[3], t)[0])}" y1="${n1(mid(top[0], top[3], t)[1])}" x2="${n1(mid(top[1], top[2], t)[0])}" y2="${n1(mid(top[1], top[2], t)[1])}" stroke="#4b5563" stroke-width="2" stroke-dasharray="4 8">${run}</line>`
  }
  // Rollers at both ends.
  s += circle([x0 + 3, yT + 2], Math.max(2.5, ctx.S * 0.07), `fill="${STEEL}" stroke="#0f172a" stroke-width="0.8"`)
  s += circle([x1 - 3, yT + 2], Math.max(2.5, ctx.S * 0.07), `fill="${STEEL}" stroke="#0f172a" stroke-width="0.8"`)
  return s
}

function cubeOverlay(ctx: SceneCtx, c: CubeCtx): string {
  if (ctx.detail === 0) return ''
  const b = c.box
  const S = ctx.S
  let s = ''
  // Finished: a steel crate, corner plates and a green lamp on top.
  if (c.kind === 'solid') {
    const plate = (p: Pt) => `<rect x="${n1(p[0] - S * 0.06)}" y="${n1(p[1] - S * 0.06)}" width="${n1(S * 0.12)}" height="${n1(S * 0.12)}" fill="#cbd5e1" stroke="#1e293b" stroke-width="0.6" ${crisp}/>`
    s += [b.front[0], b.front[1], b.front[2], b.front[3]].map(plate).join('')
    s += line(b.front[0], b.front[2], `stroke="#1e293b" stroke-opacity="0.35" stroke-width="1.2"`) + line(b.front[1], b.front[3], `stroke="#1e293b" stroke-opacity="0.35" stroke-width="1.2"`)
    const [lx, ly] = ctx.P(c.u0 + 0.5, 0.5, 1)
    s += `<rect x="${n1(lx - S * 0.08)}" y="${n1(ly - S * 0.14)}" width="${n1(S * 0.16)}" height="${n1(S * 0.12)}" fill="${c.status === 'done' ? '#84cc16' : '#dc2626'}" stroke="#0f172a" stroke-width="0.8" ${crisp}/>`
  }
  // Not started: a plain steel frame.
  if (c.isGhost) {
    s += poly([b.front[0], b.front[1], b.front[2], b.front[3]], `fill="none" stroke="${STEEL}" stroke-width="1.2" stroke-dasharray="4 3" ${crisp}`)
  }
  // Worked on: a rotating warning lamp on top.
  if (c.isLive) {
    const [lx, ly] = ctx.P(c.u0 + 0.5, 0.5, 1)
    const blink = ctx.detail > 1 ? `<animate attributeName="fill" values="${LAMP};#7c2d12" dur="0.6s" calcMode="discrete" repeatCount="indefinite"/>` : ''
    s += `<rect x="${n1(lx - S * 0.09)}" y="${n1(ly - S * 0.2)}" width="${n1(S * 0.18)}" height="${n1(S * 0.16)}" fill="${c.status === 'waiting' ? HAZARD : LAMP}" stroke="#0f172a" stroke-width="0.8" ${crisp}>${c.status === 'waiting' ? '' : blink}</rect>`
  }
  return s + completionBurst(ctx, c, HAZARD, '#ffffff')
}

export const factory: Skin = {
  id: 'factory',
  name: 'Roboterfabrik',
  description: 'Fabrikhalle mit Fließband, Warnleuchten und Stahlkisten',
  status: STATUS,
  glass: { top: 0.3, bottom: 0.06, ghost: 0.5 },
  edge: { color: '#0f172a', opacity: 0.55 },
  mini: { top: ['#e2e8f0', '#94a3b8'], front: ['#cbd5e1', '#64748b'], side: ['#94a3b8', '#334155'], highlight: '#f8fafc', glint: '#e0f2fe' },
  tint: {
    read: ['#0ea5e9', 0.5],
    write: ['#facc15', 0.55],
    run: ['#f97316', 0.5],
    agent: ['#22c55e', 0.45],
    other: ['#94a3b8', 0],
    err: ['#dc2626', 0.85],
  },
  pedestal: { front: ['#475569', '#334155', '#1e293b'], top: ['#334155', '#1f2937'], side: ['#1e293b', '#0f172a'], footTop: '#334155', footSide: '#0f172a', light: '#cbd5e1', shadow: '#000000' },
  plaque: {
    frame: ['#94a3b8', '#334155'],
    inner: ['#0b1220', '#111827'],
    text: { pending: '#64748b', running: '#38bdf8', done: '#a3e635', error: '#f87171', waiting: '#facc15' },
    caption: '#e2e8f0',
  },
  track: { groove: '#0f172a', from: '#0ea5e9', to: '#84cc16', head: HAZARD },
  font: 'ui-monospace,Consolas,monospace',
  effects: { glint: false },
  defs: () =>
    lin('factory-wall', 0, 1, [[0, '#1e293b'], [1, '#0f172a']]) +
    `<pattern id="factory-rivets" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="none" stroke="#334155" stroke-width="1"/><rect x="2" y="2" width="2" height="2" fill="#475569"/><rect x="20" y="20" width="2" height="2" fill="#475569"/></pattern>` +
    `<pattern id="factory-hazard" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="12" fill="${HAZARD}"/><rect x="6" width="6" height="12" fill="#111827"/></pattern>`,
  backdrop,
  pedestalDecor,
  cubeOverlay,
}
