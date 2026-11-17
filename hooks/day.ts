/**
 * Day versions of the dark skins. Over the skin's own (night) backdrop the
 * renderer lays a light one that only shows when the pane is in light mode,
 * through a `prefers-color-scheme` rule: a pale sky in the skin's colours and
 * a quiet pattern in its spirit (a grid, a dusk skyline, faint stars, scanlines,
 * wood grain, hall windows). Pedestal and cubes stay as they are, like an
 * object standing in daylight.
 */
import { n1, seeded } from './svg'

export type DayStyle = {
  /** The sky: top and bottom of its gradient. */
  sky: [string, string]
  /** The pattern's colour. */
  ink: string
  pattern: 'grid' | 'skyline' | 'stars' | 'scan' | 'grain' | 'hall'
}

/** CSS: the day layer and its text show in light mode only; night-only overlays hide then. */
export const DAY_CSS =
  '.acd-day{display:none}@media (prefers-color-scheme:light){.acd-day{display:inline}.acd-night{display:none}.acd-bgtxt{fill:#334155}}'

export function dayDefs(d: DayStyle): string {
  return `<linearGradient id="acd-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${d.sky[0]}"/><stop offset="1" stop-color="${d.sky[1]}"/></linearGradient>`
}

/** The light backdrop: W × H, the pedestal top at `base` (y), S px per unit. */
export function dayBackdrop(d: DayStyle, W: number, H: number, S: number, base: number, seed: number): string {
  const rr = Math.min(14, S * 0.3)
  let s = `<rect width="${W}" height="${H}" rx="${n1(rr)}" fill="url(#acd-sky)"/>`
  const rnd = seeded(seed)
  const ink = `stroke="${d.ink}"`
  if (d.pattern === 'grid') {
    let g = ''
    const step = Math.max(14, S * 0.4)
    for (let x = step; x < W; x += step) g += `<line x1="${n1(x)}" y1="0" x2="${n1(x)}" y2="${H}"/>`
    for (let y = step; y < H; y += step) g += `<line x1="0" y1="${n1(y)}" x2="${W}" y2="${n1(y)}"/>`
    s += `<g ${ink} stroke-opacity="0.22" stroke-width="0.8">${g}</g>`
  } else if (d.pattern === 'skyline') {
    // A city at dusk: pale blocks against the sky, a few lit windows.
    let x = -S * 0.2
    let b = ''
    while (x < W) {
      const w = S * (0.5 + rnd() * 0.8)
      const h = (base - H * 0.12) * (0.35 + rnd() * 0.6)
      b += `<rect x="${n1(x)}" y="${n1(base - h)}" width="${n1(w)}" height="${n1(h + 2)}"/>`
      x += w + S * 0.08
    }
    s += `<g fill="${d.ink}" fill-opacity="0.22">${b}</g>`
  } else if (d.pattern === 'stars') {
    let st = ''
    for (let k = 0; k < Math.round(W / 22); k++) st += `<circle cx="${n1(rnd() * W)}" cy="${n1(rnd() * base)}" r="${n1(0.6 + rnd() * 1.1)}"/>`
    s += `<g fill="${d.ink}" fill-opacity="0.35">${st}</g>`
    s += `<ellipse cx="${n1(W * 0.78)}" cy="${n1(H * 0.2)}" rx="${n1(S * 1.6)}" ry="${n1(S * 0.5)}" fill="${d.ink}" fill-opacity="0.08"/>`
  } else if (d.pattern === 'scan') {
    let sc = ''
    for (let y = 2; y < H; y += 4) sc += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`
    s += `<g ${ink} stroke-opacity="0.08" stroke-width="1">${sc}</g>`
  } else if (d.pattern === 'grain') {
    // Light maple: long, gently waving grain lines.
    let gr = ''
    for (let y = 6; y < H; y += Math.max(7, S * 0.18)) {
      const a = S * (0.02 + rnd() * 0.04)
      let p = `M0 ${n1(y)}`
      for (let x = 0; x < W; x += S * 1.2) p += `q${n1(S * 0.3)} ${n1(-a)} ${n1(S * 0.6)} 0t${n1(S * 0.6)} 0`
      gr += `<path d="${p}"/>`
    }
    s += `<g fill="none" ${ink} stroke-opacity="0.18" stroke-width="0.8">${gr}</g>`
  } else if (d.pattern === 'hall') {
    // A bright hall: tall windows high up, a roof beam across.
    const ww = Math.max(16, S * 0.5)
    let wn = ''
    for (let x = ww * 0.6; x < W - ww; x += ww * 1.6) wn += `<rect x="${n1(x)}" y="${n1(H * 0.06)}" width="${n1(ww)}" height="${n1(base * 0.45)}" rx="2"/>`
    s += `<g fill="#ffffff" fill-opacity="0.65" ${ink} stroke-opacity="0.25">${wn}</g>`
    s += `<rect x="0" y="${n1(H * 0.03)}" width="${W}" height="${n1(Math.max(3, S * 0.08))}" fill="${d.ink}" fill-opacity="0.25"/>`
  }
  // A soft floor shadow under the pedestal.
  s += `<ellipse cx="${n1(W / 2)}" cy="${n1(H - S * 0.25)}" rx="${n1(W * 0.46)}" ry="${n1(S * 0.3)}" fill="#0f172a" fill-opacity="0.12"/>`
  return `<g class="acd-day">${s}</g>`
}
