/**
 * Pictograms for the overview tiles: one small drawing per figure that shows
 * the figure itself (a clock, an hourglass, a cup, a tank, a warning sign, an
 * activity chart, token bars, coins, diff blocks). All in one style: 1.6 px
 * strokes with round ends, one palette, glass parts through the theme classes
 * of `gauges.ts`. Each fits a 36 × 36 box with its origin at the top left.
 */
import { n1 } from './svg'

export const BLUE = '#3b82f6'
export const VIOLET = '#8b5cf6'
export const AMBER = '#f59e0b'
export const TEAL = '#14b8a6'
export const RED = '#e11d48'
export const GREEN = '#16a34a'
export const GOLD = '#eab308'
const RIM = '#94a3b8'
const SW = 1.6

const stroke = (d: string, col: string, w = SW, extra = '') =>
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
const clamp = (v: number) => Math.max(0, Math.min(1, v))

/** Elapsed: a clock; its ring fills with the share of the estimated total, its hand points where the ring ends. */
export function clock(frac: number | null): string {
  const cx = 18, cy = 18, r = 15
  const f = clamp(frac ?? 0)
  let s = `<circle class="acg-gf" cx="${cx}" cy="${cy}" r="${r}"/>`
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${RIM}" stroke-opacity="0.35" stroke-width="3"/>`
  if (f > 0.999) s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${BLUE}" stroke-width="3"/>`
  else if (f > 0) {
    const a = f * 2 * Math.PI
    s += `<path d="M${cx} ${cy - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${n1(cx + r * Math.sin(a))} ${n1(cy - r * Math.cos(a))}" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round"/>`
  }
  for (let k = 0; k < 4; k++) {
    const t = (k / 4) * 2 * Math.PI
    s += stroke(`M${n1(cx + 9.5 * Math.sin(t))} ${n1(cy - 9.5 * Math.cos(t))}L${n1(cx + 11.5 * Math.sin(t))} ${n1(cy - 11.5 * Math.cos(t))}`, RIM, 1.2)
  }
  // The hand points where the ring ends, and stands still: a hand turning on its own
  // restarted with every new picture and seemed to jump back and forth.
  const ha = (f > 0 ? f : 0) * 2 * Math.PI
  s += `<path class="acg-hand" d="M${cx} ${cy}L${cx + 4} ${cy - 4}" fill="none" stroke-width="2.2" stroke-linecap="round"/>`
  s += stroke(`M${cx} ${cy}L${n1(cx + 9.5 * Math.sin(ha))} ${n1(cy - 9.5 * Math.cos(ha))}`, BLUE, 1.8)
  return s + `<circle cx="${cx}" cy="${cy}" r="1.8" fill="${BLUE}"/>`
}

/** Time left: an hourglass; the sand on top is the time left, a grain falls while work goes on. */
export function hourglass(left: number | null, animate: boolean): string {
  const cx = 18, t = 4, b = 32, m = 18, w = 11
  const outline = `M${cx - w} ${t}L${cx + w} ${t}L${cx + 1.5} ${m}L${cx + w} ${b}L${cx - w} ${b}L${cx - 1.5} ${m}Z`
  let s = stroke(`M${cx - w - 2} ${t}H${cx + w + 2}M${cx - w - 2} ${b}H${cx + w + 2}`, RIM, 2)
  s += `<path class="acg-gf" d="${outline}"/>`
  const l = left === null ? 0 : clamp(left)
  const ht = (m - t - 2) * l
  if (ht > 0.5) {
    const wTop = (w * ht) / (m - t)
    s += `<path d="M${n1(cx - wTop)} ${n1(m - ht)}L${n1(cx + wTop)} ${n1(m - ht)}L${cx} ${m - 1}Z" fill="${VIOLET}"/>`
  }
  const hb = (b - m - 2) * (left === null ? 0 : 1 - l)
  if (hb > 0.5) s += `<path d="M${cx - w + 1} ${b - 1}Q${cx} ${n1(b - 1 - hb * 1.6)} ${cx + w - 1} ${b - 1}Z" fill="${VIOLET}" fill-opacity="0.75"/>`
  if (animate && l > 0) {
    s += `<line x1="${cx}" y1="${m}" x2="${cx}" y2="${b - 2}" stroke="${VIOLET}" stroke-width="1" stroke-dasharray="1.5 2.5"><animate attributeName="stroke-dashoffset" values="8;0" dur="0.6s" repeatCount="indefinite"/></line>`
  }
  return s + `<path d="${outline}" fill="none" stroke="${RIM}" stroke-width="${SW}" stroke-linejoin="round"/>`
}

/** Waiting: a cup that fills with the share of time spent waiting for you; it steams while it waits. */
export function cup(id: string, share: number | null, waiting: boolean, animate: boolean): string {
  const l = 5, r = 27, t = 13, b = 32
  const body = `M${l} ${t}L${r} ${t}L${r - 3} ${b}Q${(l + r) / 2} ${b + 2} ${l + 3} ${b}Z`
  let s = `<path class="acg-gf" d="${body}"/>`
  const lvl = clamp(share ?? 0)
  if (lvl > 0) {
    const yl = b - (b - t - 2) * Math.max(0.12, lvl)
    s += `<clipPath id="${id}"><path d="${body}"/></clipPath><rect x="${l}" y="${n1(yl)}" width="${r - l}" height="${n1(b - yl + 3)}" fill="${AMBER}" clip-path="url(#${id})"/>`
    s += stroke(`M${l + 1} ${n1(yl)}H${r - 1}`, '#fde68a', 1)
  }
  s += `<path d="${body}" fill="none" stroke="${RIM}" stroke-width="${SW}" stroke-linejoin="round"/>`
  s += stroke(`M${r - 0.5} ${t + 4}C${r + 7} ${t + 3} ${r + 7} ${t + 13} ${r - 1.5} ${t + 13}`, RIM)
  if (waiting || lvl > 0) {
    for (const [k, dx] of [[0, 9], [1, 15]] as const) {
      const moving = animate && waiting
      const anim = moving
        ? `<animate attributeName="opacity" values="0;0.8;0" dur="2s" begin="${k * 0.7}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 2;0 -2" dur="2s" begin="${k * 0.7}s" repeatCount="indefinite"/>`
        : ''
      s += `<path d="M${l + dx} ${t - 2}c-2 -2 2 -4 0 -6c-2 -2 2 -3 0 -5" fill="none" stroke="${RIM}" stroke-width="1.3" stroke-linecap="round" opacity="${moving ? 0 : 0.6}">${anim}</path>`
    }
  }
  return s
}

/** Context: a glass cylinder filled as far as the context window, with marks where amber and red begin. */
export function tank(frac: number | null, col: [string, string], amber: number, red: number): string {
  const l = 7, r = 27, t = 6, b = 31, ry = 3.5, cx = (l + r) / 2
  let s = `<rect class="acg-gf" x="${l}" y="${t}" width="${r - l}" height="${b - t}"/>`
  const lvl = clamp(frac ?? 0)
  if (lvl > 0) {
    const yl = b - (b - t) * lvl
    s += `<path d="M${l} ${n1(yl)}V${b}A${(r - l) / 2} ${ry} 0 0 0 ${r} ${b}V${n1(yl)}Z" fill="${col[1]}"/>`
    s += `<ellipse cx="${cx}" cy="${n1(yl)}" rx="${(r - l) / 2}" ry="${ry}" fill="${col[0]}"/>`
  }
  s += `<path d="M${l} ${t}V${b}A${(r - l) / 2} ${ry} 0 0 0 ${r} ${b}V${t}" fill="none" stroke="${RIM}" stroke-width="${SW}"/>`
  s += `<ellipse cx="${cx}" cy="${t}" rx="${(r - l) / 2}" ry="${ry}" fill="none" stroke="${RIM}" stroke-width="${SW}"/>`
  for (const [m, c] of [[amber, AMBER], [red, RED]] as const) s += stroke(`M${r + 2} ${n1(b - (b - t) * m)}H${r + 5}`, c, 1.4)
  return s + `<rect class="acg-hl" x="${l + 3}" y="${t + 3}" width="2" height="${b - t - 6}" rx="1"/>`
}

/** Errors: a red warning sign while there are any, a calm green tick when there are none. */
export function warning(errors: number): string {
  const cx = 18
  if (errors === 0) {
    return `<circle class="acg-gf" cx="${cx}" cy="18" r="14"/><circle cx="${cx}" cy="18" r="14" fill="none" stroke="${GREEN}" stroke-width="${SW}"/>` + stroke(`M${cx - 6} 18l4 4l8 -8`, GREEN, 2.2)
  }
  return (
    `<path d="M${cx} 4L${cx + 15} 31H${cx - 15}Z" fill="${RED}" fill-opacity="0.18" stroke="${RED}" stroke-width="${SW}" stroke-linejoin="round"/>` +
    stroke(`M${cx} 13V22`, RED, 2.4) +
    `<circle cx="${cx}" cy="26.5" r="1.5" fill="${RED}"/>`
  )
}

/** Tool calls: an activity chart, one bar per minute, the newest in front. */
export function activity(perMinute: number[], animate: boolean): string {
  const bars = perMinute.slice(-7)
  const max = Math.max(1, ...bars)
  let s = stroke('M3 32H33', RIM, 1.2)
  bars.forEach((v, k) => {
    const h = Math.max(1.5, (v / max) * 24)
    const bx = 5 + k * 4.2
    const last = k === bars.length - 1
    const pulse = last && animate ? `<animate attributeName="fill-opacity" values="1;0.5;1" dur="1.2s" repeatCount="indefinite"/>` : ''
    s += `<rect x="${n1(bx)}" y="${n1(31 - h)}" width="3" height="${n1(h)}" rx="1.2" fill="${TEAL}" fill-opacity="${last ? 1 : n1(0.45 + (k / bars.length) * 0.4)}">${pulse}</rect>`
  })
  return s
}

/** Tokens: two bars, read in (blue, an arrow down) and written out (violet, an arrow up). */
export function tokenBars(inTok: number, outTok: number): string {
  const max = Math.max(1, inTok, outTok)
  let s = ''
  for (const [k, v, col, up] of [[0, inTok, BLUE, false], [1, outTok, VIOLET, true]] as const) {
    const y = 11 + k * 13
    s += `<rect class="acg-gf" x="10" y="${y - 3.5}" width="23" height="7" rx="3.5"/>`
    if (v > 0) s += `<rect x="10" y="${y - 3.5}" width="${n1(Math.max(4, (v / max) * 23))}" height="7" rx="3.5" fill="${col}"/>`
    s += stroke(up ? `M4 ${y + 3}V${y - 3}M1.5 ${y - 0.5}L4 ${y - 3}L6.5 ${y - 0.5}` : `M4 ${y - 3}V${y + 3}M1.5 ${y + 0.5}L4 ${y + 3}L6.5 ${y + 0.5}`, col, 1.5)
  }
  return s
}

/** Cost: a stack of coins growing toward the budget line; red once the budget is spent. */
export function coins(budgetFrac: number | null, usd: number | null): string {
  const n = budgetFrac === null ? Math.max(1, Math.min(6, Math.ceil(usd ?? 0))) : Math.max(1, Math.min(6, Math.ceil(budgetFrac * 6)))
  const over = budgetFrac !== null && budgetFrac >= 1
  const [side, top, edge] = over ? [RED, '#fda4af', '#9f1239'] : [GOLD, '#fde047', '#a16207']
  const cx = 17
  let s = budgetFrac === null ? '' : stroke(`M${cx - 13} ${n1(30 - 6 * 4.2 - 1)}H${cx + 13}`, RIM, 1, ' stroke-dasharray="2 2"')
  for (let k = 0; k < n; k++) {
    const y = 30 - k * 4.2
    s += `<path d="M${cx - 10} ${n1(y - 2)}V${n1(y)}A10 3 0 0 0 ${cx + 10} ${n1(y)}V${n1(y - 2)}" fill="${side}" fill-opacity="0.85" stroke="${edge}" stroke-width="0.9"/>`
    s += `<ellipse cx="${cx}" cy="${n1(y - 2)}" rx="10" ry="3" fill="${top}" stroke="${edge}" stroke-width="0.9"/>`
  }
  return s
}

/** Code: five blocks like a diff stat, green for lines added, red for lines removed. */
export function diffBlocks(added: number, removed: number): string {
  const total = added + removed
  const green = total === 0 ? 0 : Math.round((added / total) * 5)
  let s = ''
  for (let k = 0; k < 5; k++) {
    const col = total === 0 ? RIM : k < green ? GREEN : RED
    s += `<rect x="${1 + k * 7}" y="15" width="5.5" height="9" rx="1.5" fill="${col}" fill-opacity="${total === 0 ? 0.3 : 1}"/>`
  }
  return s + stroke('M4 7h5M6.5 4.5v5', GREEN, 1.6) + stroke('M27 7h5', RED, 1.6)
}

/** Calls per minute over the last `minutes`, oldest first, from the calls' start times. */
export function perMinute(ats: number[], now: number, minutes = 7): number[] {
  const out = new Array<number>(minutes).fill(0)
  for (const at of ats) {
    const ago = Math.floor((now - at) / 60_000)
    if (ago >= 0 && ago < minutes) out[minutes - 1 - ago]! += 1
  }
  return out
}
