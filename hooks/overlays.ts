/**
 * The renderer's overlays: the context tank on the pedestal, dependency pipes
 * with padlocks, test seals, and the cracks and smoke of a stuck cube. Each
 * returns SVG markup from the scene's projection and the skin's colours.
 */
import type { CubeCtx, Skin } from './skins/types'
import { tr } from './i18n'
import { box, circle, esc, line, mix, n1, pline, poly, seeded } from './svg'
import { pipeStyle } from './pipe'
import type { Pt } from './svg'

/** How much ornament to draw: 2 full, 1 reduced, 0 bare. */
export type Detail = 2 | 1 | 0

/** Context fill from which the tank and the panel's figure turn amber, and red. One pair for both. */
export const CONTEXT_AMBER = 0.7
export const CONTEXT_RED = 0.85
/** What a dependency pipe needs of a cube: the steps it waits for, where it stands, its plaque label. */
export type DependentCube = { blockedBy: number[]; pos: number; label: string }

export type Proj = (u: number, v: number, w: number) => Pt
const HEX = /^#[0-9a-f]{6}$/i
/** `mix`, but leaves a colour it cannot parse unchanged. */
const shade = (c: string, to: string, t: number) => (HEX.test(c) ? mix(c, to, t) : c)

/** A glass tank on the pedestal's right side face, filled to the context window's use. */
export function contextTank(fill: number, P: Proj, S: number, uEnd: number, pedH: number, pedBack: number, fs: number, detail: Detail, skin: Skin, still: boolean): string {
  const u0 = uEnd
  const u1 = uEnd + 0.2
  const v0 = 0.22
  const v1 = 0.62
  // A metal foot stands on the ground; the glass stands on the foot, so nothing of it is drawn over the glass.
  const wF = -pedH + 0.1
  const wB = wF + 0.07
  const wT = -0.08
  const pct = Math.round(fill * 100)
  const ps = pipeStyle(skin)
  const col = fill >= CONTEXT_RED ? skin.status.error[1] : fill >= CONTEXT_AMBER ? skin.status.waiting[1] : ps.colors[1]
  const g = box(P, u0, u1, v0, v1, wB, wT)
  let s = `<g><title>${tr(`Kontextfenster zu ${pct} % gefüllt`, `Context window ${pct} % full`)}</title>`
  const metal = (b: ReturnType<typeof box>) =>
    poly(b.front, `fill="${ps.metal}" class="e"`) + poly(b.right, `fill="${shade(ps.metal, '#000000', 0.35)}" class="e"`) + poly(b.top, `fill="${shade(ps.metal, '#ffffff', 0.3)}" class="e"`)
  // The foot first: wider than the glass, with a soft shadow under it.
  const foot = box(P, u0 - 0.035, u1 + 0.035, v0 - 0.06, v1 + 0.06, wF, wB)
  s += poly(foot.bottom.map(p => [p[0] + S * 0.04, p[1] + S * 0.03] as Pt), `fill="#000000" opacity="0.3"`) + metal(foot)
  s += poly(g.back, `fill="#0f172a" fill-opacity="0.55"`)
  if (fill > 0) {
    const lq = box(P, u0 + 0.025, u1 - 0.025, v0 + 0.04, v1 - 0.04, wB + 0.01, wB + 0.01 + (wT - wB - 0.02) * fill)
    const pulse = fill >= CONTEXT_RED && detail > 0 && !still ?'<animate attributeName="opacity" values="1;0.5;1" dur="1.1s" repeatCount="indefinite"/>' : ''
    s +=
      `<g>${pulse}` +
      poly(lq.front, `fill="${col}" fill-opacity="0.9"`) +
      poly(lq.right, `fill="${shade(col, '#000000', 0.3)}" fill-opacity="0.9"`) +
      poly(lq.top, `fill="${shade(col, '#ffffff', 0.35)}"`) +
      `</g>`
    // Bubbles rising through a liquid, while things move.
    if (ps.fill === 'liquid' && !still && detail > 1) {
      for (let k = 0; k < 2; k++) {
        const [bx, by0] = P(u0 + 0.07 + k * 0.07, v0, wB + 0.06)
        const [, by1] = P(u0, v0, wB + (wT - wB) * fill - 0.04)
        const dur = 1.7 + k * 0.6
        s += `<circle cx="${n1(bx)}" cy="${n1(by0)}" r="${n1(Math.max(0.8, S * 0.018))}" fill="#ffffff" opacity="0"><animate attributeName="cy" values="${n1(by0)};${n1(by1)}" dur="${dur}s" begin="${k * 0.7}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.7;0" dur="${dur}s" begin="${k * 0.7}s" repeatCount="indefinite"/></circle>`
      }
    }
  }
  // Marks at 60 % and 80 %.
  for (const m of [CONTEXT_AMBER, CONTEXT_RED]) {
    const w = wB + (wT - wB) * m
    s += line(P(u0, v0, w), P(u0 + 0.08, v0, w), `stroke="${skin.pedestal.light}" stroke-opacity="0.7" stroke-width="0.8"`)
  }
  s +=
    poly(g.front, `fill="#ffffff" fill-opacity="0.12" class="e"`) +
    poly(g.right, `fill="#ffffff" fill-opacity="0.07" class="e"`) +
    poly(g.top, `fill="${skin.pedestal.footSide}" class="e"`) +
    line(P(u0 + 0.05, v0, wB + 0.06), P(u0 + 0.05, v0, wT - 0.06), `stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"`)
  // A metal cap on top, as on the pipe.
  s += metal(box(P, u0 - 0.02, u1 + 0.02, v0 - 0.03, v1 + 0.03, wT - 0.05, wT + 0.02))
  const [lx] = P(uEnd, pedBack, 0)
  const [, ly] = P(u1, v0, (wB + wT) / 2)
  s +=
    `<text class="t cap acd-bgtxt" x="${n1(lx + 4)}" y="${n1(ly - 1)}" font-size="${n1(fs * 0.8)}" fill="${skin.plaque.caption}" fill-opacity="0.8">CTX</text>` +
    `<text class="t acd-bgval" x="${n1(lx + 4)}" y="${n1(ly + fs)}" font-size="${n1(fs)}" fill="${col}">${pct} %</text>`
  return s + `</g>`
}

/** Thin arched pipes from each unfinished blocker to the step that waits for it, and a lock on the waiting cube. */
export function dependencies(bigs: readonly DependentCube[], posOf: number[], P: Proj, S: number, cubeU: (i: number) => number, detail: Detail, skin: Skin, still: boolean): string {
  const col = skin.status.waiting[1]
  const lk = Math.max(4.5, S * 0.12)
  let s = ''
  for (const big of bigs) {
    // Blockers are step indices; arcs run between the positions those steps are drawn at.
    const steps = [...new Set(big.blockedBy)].filter(j => j >= 0 && j < posOf.length && posOf[j] !== big.pos)
    if (steps.length === 0) continue
    const [ex, top] = P(cubeU(big.pos) + 0.5, 0.5, 1)
    const ey = top - lk * 2.1
    for (const at of [...new Set(steps.map(j => posOf[j]!))]) {
      const nums = steps.filter(j => posOf[j] === at).map(j => j + 1).join(', ')
      const [ax, ay] = P(cubeU(at) + 0.5, 0.5, 1)
      const hi = Math.min(ay, ey)
      const h = Math.max(4, Math.min(hi - 3, S * (0.3 + 0.12 * Math.abs(big.pos - at)), S * 0.85))
      const cx = (ax + ex) / 2
      const cy = 2 * (hi - h) - (ay + ey) / 2
      const d = `M${n1(ax)} ${n1(ay)}Q${n1(cx)} ${n1(cy)} ${n1(ex)} ${n1(ey)}`
      const len = Math.hypot(ex - cx, ey - cy) || 1
      const dx = (ex - cx) / len
      const dy = (ey - cy) / len
      const al = Math.max(4, S * 0.1)
      const flow = detail > 0 && !still ? '<animate attributeName="stroke-dashoffset" values="6;0" dur="0.7s" repeatCount="indefinite"/>' : ''
      s +=
        `<g><title>${tr(`Schritt ${big.label} wartet auf Schritt ${nums}`, `Step ${big.label} waits for step ${nums}`)}</title>` +
        `<path d="${d}" fill="none" stroke="#0f172a" stroke-opacity="0.25" stroke-width="2.6" stroke-linecap="round"/>` +
        `<path d="${d}" fill="none" stroke="${col}" stroke-opacity="0.9" stroke-width="1.2" stroke-dasharray="3 3" stroke-linecap="round">${flow}</path>` +
        circle([ax, ay], 1.8, `fill="${col}"`) +
        poly([[ex, ey], [ex - dx * al - dy * al * 0.5, ey - dy * al + dx * al * 0.5], [ex - dx * al + dy * al * 0.5, ey - dy * al - dx * al * 0.5]], `fill="${col}"`) +
        `</g>`
    }
    // The padlock on the cube's top.
    const bw = lk * 1.3
    const by = top - lk * 1.05
    const sw = n1(Math.max(1.1, lk * 0.24))
    s +=
      `<g><title>${tr('Wartet auf Schritt', 'Waits for step')} ${steps.map(j => j + 1).join(', ')}</title>` +
      `<path d="M${n1(ex - lk * 0.38)} ${n1(by)}v${n1(-lk * 0.32)}a${n1(lk * 0.38)} ${n1(lk * 0.38)} 0 0 1 ${n1(lk * 0.76)} 0v${n1(lk * 0.32)}" fill="none" stroke="${skin.pedestal.footSide}" stroke-width="${sw}"/>` +
      `<rect x="${n1(ex - bw / 2)}" y="${n1(by)}" width="${n1(bw)}" height="${n1(lk)}" rx="${n1(lk * 0.18)}" fill="${col}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="0.8"/>` +
      circle([ex, by + lk * 0.45], Math.max(0.8, lk * 0.15), `fill="#0f172a"`) +
      `</g>`
  }
  return s
}

/** A round seal on the cube's front-top-right corner: the last test run passed or failed. */
export function testSeal(test: 'pass' | 'fail' | '', at: Pt, S: number, skin: Skin): string {
  if (!test) return ''
  const r = Math.max(5, S * 0.13)
  const [x, y] = at
  const ok = test === 'pass'
  const mk = `fill="none" stroke="#ffffff" stroke-width="${n1(Math.max(1.2, r * 0.28))}" stroke-linecap="round" stroke-linejoin="round"`
  return (
    `<g><title>${ok ? tr('Letzter Testlauf bestanden', 'Last test run passed') : tr('Letzter Testlauf fehlgeschlagen', 'Last test run failed')}</title>` +
    circle([x + 0.8, y + 1.2], r, `fill="#0f172a" opacity="0.3"`) +
    circle([x, y], r, `fill="${ok ? skin.status.done[1] : skin.status.error[1]}" stroke="#ffffff" stroke-width="1.2"`) +
    circle([x, y], r * 0.74, `fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.6" stroke-dasharray="1 1.2"`) +
    (ok
      ? pline([[x - r * 0.42, y + r * 0.02], [x - r * 0.1, y + r * 0.34], [x + r * 0.44, y - r * 0.34]], mk)
      : line([x - r * 0.32, y - r * 0.32], [x + r * 0.32, y + r * 0.32], mk) + line([x + r * 0.32, y - r * 0.32], [x - r * 0.32, y + r * 0.32], mk)) +
    `</g>`
  )
}

/** Jagged cracks over a stuck cube's front and top faces, dark with a light edge. */
export function cracks(c: CubeCtx, P: Proj, S: number, why: string): string {
  const rnd = seeded(c.index * 7919 + 17)
  const cl = (v: number) => Math.max(0.06, Math.min(0.94, v))
  const f = (a: number, w: number): Pt => P(c.u0 + cl(a), 0, w)
  const a0 = 0.3 + rnd() * 0.35
  // One crack runs over the top edge and down the front, with a branch; one comes in from the right edge.
  const top: Pt[] = []
  for (let k = 3, a = a0; k >= 0; k--) {
    top.push(P(c.u0 + cl(a), k * (0.13 + rnd() * 0.05), 1))
    a += (rnd() - 0.5) * 0.25
  }
  const down: Pt[] = [f(a0, 1)]
  let branch: Pt[] = []
  for (let k = 0, a = a0, w = 1; k < 4; k++) {
    w -= 0.12 + rnd() * 0.09
    a += (rnd() - 0.5) * 0.24
    down.push(f(a, w))
    if (k === 1) branch = [f(a, w), f(a + 0.14 + rnd() * 0.08, w - 0.06 - rnd() * 0.08), f(a + 0.24, w - 0.18)]
  }
  const side: Pt[] = []
  for (let k = 0, a = 1, w = 0.3 + rnd() * 0.25; k < 3; k++) {
    side.push(f(a, w))
    a -= 0.11 + rnd() * 0.08
    w += (rnd() - 0.4) * 0.14
  }
  const dark = `fill="none" stroke="#0b0f17" stroke-opacity="0.75" stroke-width="${n1(Math.max(0.9, S * 0.025))}" stroke-linejoin="round" stroke-linecap="round"`
  const lit = `fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="0.7" stroke-linejoin="round"`
  const one = (ps: Pt[]) => pline(ps.map(([x, y]): Pt => [x + 0.8, y + 0.7]), lit) + pline(ps, dark)
  return `<g><title>${tr('Hängt', 'Stuck')}: ${esc(why)}</title>${one([...top, ...down.slice(1)])}${one(branch)}${one(side)}</g>`
}

/** Grey wisps rising from a stuck cube's top and fading. */
export function smoke(c: CubeCtx, P: Proj, S: number, detail: Detail): string {
  const count = detail > 1 ? 3 : 2
  let s = `<g fill="#9ca3af">`
  for (let k = 0; k < count; k++) {
    const [x, y] = P(c.u0 + 0.28 + k * 0.22, 0.45 + (k % 2) * 0.15, 1)
    const rise = S * (0.62 + k * 0.08)
    const r0 = Math.max(1.5, S * 0.05)
    const at = ` dur="3s" begin="${k}s" repeatCount="indefinite"`
    s +=
      `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r0)}" opacity="0">` +
      `<animate attributeName="cy" values="${n1(y)};${n1(y - rise)}"${at}/>` +
      `<animate attributeName="cx" values="${n1(x)};${n1(x + S * (k % 2 ? -0.08 : 0.1))}"${at}/>` +
      `<animate attributeName="r" values="${n1(r0)};${n1(r0 * 3)}"${at}/>` +
      `<animate attributeName="opacity" values="0;0.55;0"${at}/>` +
      `</circle>`
  }
  return s + `</g>`
}

