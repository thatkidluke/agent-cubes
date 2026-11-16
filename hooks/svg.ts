/** Small helpers for writing SVG markup as strings. Shared by the renderer and the skins. */

export type Pt = [number, number]
export type Quad = [Pt, Pt, Pt, Pt]
export type Box = Record<'front' | 'top' | 'right' | 'back' | 'left' | 'bottom', Quad>
export type Project = (u: number, v: number, w: number) => Pt

/** One decimal, as short as possible: keeps the markup small. */
export const n1 = (v: number) => (Math.round(v * 10) / 10).toString()
export const fmt = (p: Pt) => `${n1(p[0])},${n1(p[1])}`
export const pts = (ps: Pt[]) => ps.map(fmt).join(' ')
export const poly = (ps: Pt[], attrs: string) => `<polygon points="${pts(ps)}" ${attrs}/>`
export const line = (a: Pt, b: Pt, attrs: string) => `<line x1="${n1(a[0])}" y1="${n1(a[1])}" x2="${n1(b[0])}" y2="${n1(b[1])}" ${attrs}/>`
export const pline = (ps: Pt[], attrs: string, inner = '') => `<polyline points="${pts(ps)}" ${attrs}>${inner}</polyline>`
export const circle = (c: Pt, r: number, attrs: string, inner = '') =>
  `<circle cx="${n1(c[0])}" cy="${n1(c[1])}" r="${n1(r)}" ${attrs}>${inner}</circle>`

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The six faces of a box in world units: u along the timeline, v into depth, w up. */
export function box(P: Project, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number): Box {
  return {
    front: [P(u0, v0, w0), P(u1, v0, w0), P(u1, v0, w1), P(u0, v0, w1)],
    top: [P(u0, v0, w1), P(u1, v0, w1), P(u1, v1, w1), P(u0, v1, w1)],
    right: [P(u1, v0, w0), P(u1, v1, w0), P(u1, v1, w1), P(u1, v0, w1)],
    back: [P(u0, v1, w0), P(u1, v1, w0), P(u1, v1, w1), P(u0, v1, w1)],
    left: [P(u0, v0, w0), P(u0, v1, w0), P(u0, v1, w1), P(u0, v0, w1)],
    bottom: [P(u0, v0, w0), P(u1, v0, w0), P(u1, v1, w0), P(u0, v1, w0)],
  }
}

/** Mixes two #rrggbb colors; t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => Math.round(v + ((pb[i] ?? v) - v) * t).toString(16).padStart(2, '0')).join('')
}

/** A linear gradient over the shape's own box, from (0,0) to (x2,y2). Stops: [offset, color, opacity?]. */
export const lin = (id: string, x2: number, y2: number, stops: [number, string, number?][], extra = '') =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
  stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('') +
  extra +
  `</linearGradient>`

/** A radial gradient over the shape's own box. Stops: [offset, color, opacity?]. */
export const rad = (id: string, stops: [number, string, number?][], extra = '') =>
  `<radialGradient id="${id}">` +
  stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('') +
  extra +
  `</radialGradient>`

/** A deterministic random generator, so a drawing is the same each time it is made. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
