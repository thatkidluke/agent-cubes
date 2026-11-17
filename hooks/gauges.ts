/**
 * Gauges and figure tiles: glass that fills with liquid.
 *
 * - `buildGauges`: a row of glass canisters, one per figure worth watching at a
 *   glance (progress, context, budget or success rate, time spent waiting).
 * - `buildTiles`: the overview's figures as glass tiles, a symbol, label and value
 *   in each, and behind them a liquid filled to the figure's level.
 *
 * Both follow the pane's light or dark mode: glass, labels and plain values are
 * drawn through CSS classes with a `prefers-color-scheme: dark` override, while
 * values over liquid stay white with a dark halo, legible in both.
 */
import { esc, n1, type Drawing } from './svg'

export type Gauge = {
  /** Short stable key, used for the canister's own ids. */
  key: string
  label: string
  /** One glyph drawn over the label. */
  icon: string
  /** 0..1, or null when unknown (drawn empty with a dash). */
  level: number | null
  /** The text inside the canister, e.g. "42 %". */
  value: string
  /** Liquid colour: [top, bottom] of its gradient. */
  color: [string, string]
  /** A hover text. */
  title: string
}

export type Tile = {
  key: string
  label: string
  value: string
  /** The value as SVG text markup when parts of it take their own colour (e.g. "+12 −3"); escaped by the caller. */
  valueHtml?: string
  /** The value's colour where it signals something. */
  valueColor?: string
  /** The tile's colour: its badge's tint and its level bar. */
  color: string
  /** The pictogram, drawn in a 36 × 36 box (see `pictos.ts`). */
  pic: string
  /** The level bar along the tile's foot, 0..1; a second colour fills the rest (code: added, then removed). Null for none. */
  level: number | null
  rest?: string
  title: string
}

export const FONT = 'system-ui,-apple-system,Segoe UI,sans-serif'

/**
 * Light first, dark as the override. Classes: glass fill, glass edge, glass cap,
 * label, plain value, scale mark, glass highlight, value over liquid.
 */
export const STYLE =
  `<style>` +
  `.acg-gf{fill:#0f172a;fill-opacity:.045}.acg-ge{fill:none;stroke:#64748b;stroke-opacity:.45}.acg-gc{fill:#64748b}` +
  `.acg-lb{fill:#475569}.acg-vp{fill:#0f172a;stroke:#ffffff;stroke-opacity:.7;stroke-width:2.5px;paint-order:stroke}` +
  `.acg-mk{stroke:#64748b;stroke-opacity:.55}.acg-hl{fill:#ffffff;fill-opacity:.55}` +
  `.acg-vw{fill:#ffffff;stroke:#0f172a;stroke-opacity:.55;stroke-width:2.5px;paint-order:stroke}.acg-hand{stroke:#334155}` +
  `@media (prefers-color-scheme:dark){` +
  `.acg-gf{fill:#94a3b8;fill-opacity:.09}.acg-ge{stroke:#94a3b8;stroke-opacity:.5}.acg-gc{fill:#64748b}` +
  `.acg-lb{fill:#cbd5e1}.acg-vp{fill:#ffffff;stroke:#0f172a;stroke-opacity:.5}` +
  `.acg-mk{stroke:#94a3b8;stroke-opacity:.6}.acg-hl{fill-opacity:.3}.acg-hand{stroke:#e2e8f0}}` +
  `</style>`

/** A wavy liquid surface at `top`, from `x0` to `x1`, filled down to `bottom`. */
function liquidPath(x0: number, x1: number, top: number, bottom: number, amp: number, seg: number): string {
  let d = `M${n1(x0 - seg * 2)} ${n1(top)}`
  for (let sx = x0 - seg * 2; sx < x1 + seg; sx += seg) d += `q${n1(seg / 4)} ${n1(-amp)} ${n1(seg / 2)} 0t${n1(seg / 2)} 0`
  return d + `L${n1(x1 + seg * 2)} ${n1(bottom + 2)}L${n1(x0 - seg * 2)} ${n1(bottom + 2)}Z`
}

const drift = (seg: number, dur: number) =>
  `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(seg)} 0" dur="${dur}s" repeatCount="indefinite"/>`

/** An SVG document that follows light and dark mode through the theme classes above. */
export const themed = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${n1(height)}" viewBox="0 0 ${n1(width)} ${n1(height)}">${STYLE}${body}</svg>`

const wrap = (width: number, height: number, defs: string[], parts: string[]) => themed(width, height, `<defs>${defs.join('')}</defs>${parts.join('')}`)

const W_CAN = 46
const H_CAN = 74
const GAP = 18
const LABEL_H = 30

export function buildGauges(items: Gauge[], width: number, animate: boolean): Drawing {
  const n = items.length
  const gap = Math.max(8, Math.min(GAP * 2, (width - n * W_CAN) / Math.max(1, n)))
  const total = n * W_CAN + (n - 1) * gap
  const x0 = Math.max(4, (width - total) / 2)
  const top = 6
  const height = top + H_CAN + LABEL_H + 4
  const defs: string[] = []
  const parts: string[] = []

  items.forEach((g, i) => {
    const x = x0 + i * (W_CAN + gap)
    const id = `gauge-${g.key}`
    const r = 12
    const innerX = x + 4
    const innerW = W_CAN - 8
    const innerTop = top + 8
    const innerH = H_CAN - 14
    const lvl = Math.max(0, Math.min(1, g.level ?? 0))
    const liquidY = innerTop + innerH * (1 - lvl)

    // The canister: a cap, the glass body.
    parts.push(`<g><title>${esc(g.title)}</title>`)
    parts.push(`<rect class="acg-gc" x="${n1(x + W_CAN * 0.3)}" y="${top}" width="${n1(W_CAN * 0.4)}" height="6" rx="2"/>`)
    parts.push(`<rect class="acg-gf" x="${n1(x)}" y="${top + 4}" width="${W_CAN}" height="${H_CAN - 4}" rx="${r}"/>`)

    // The liquid, with a wavy surface that drifts and bubbles that rise while work goes on.
    if (lvl > 0) {
      defs.push(
        `<clipPath id="${id}-clip"><rect x="${n1(innerX)}" y="${n1(innerTop)}" width="${n1(innerW)}" height="${n1(innerH)}" rx="${r - 4}"/></clipPath>`,
        `<linearGradient id="${id}-liq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g.color[0]}"/><stop offset="1" stop-color="${g.color[1]}"/></linearGradient>`,
      )
      const amp = lvl >= 0.999 ? 0 : 2.2
      const seg = innerW / 2
      const moving = animate && amp > 0
      const bubbles = moving && lvl > 0.15
        ? [0.3, 0.65].map((fx, k) => {
            const bx = innerX + innerW * fx
            const y1 = innerTop + innerH - 2
            const dur = 1.8 + k * 0.7
            return `<circle cx="${n1(bx)}" cy="${n1(y1)}" r="1.3" fill="#ffffff" opacity="0"><animate attributeName="cy" values="${n1(y1)};${n1(liquidY + 3)}" dur="${dur}s" begin="${k * 0.9}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.6;0" dur="${dur}s" begin="${k * 0.9}s" repeatCount="indefinite"/></circle>`
          }).join('')
        : ''
      parts.push(
        `<g clip-path="url(#${id}-clip)"><path d="${liquidPath(innerX, innerX + innerW, liquidY, innerTop + innerH, amp, seg)}" fill="url(#${id}-liq)">${moving ? drift(seg, 2.4) : ''}</path>${bubbles}</g>`,
      )
    }

    // The glass edge over the liquid, a highlight and scale marks.
    parts.push(`<rect class="acg-ge" x="${n1(x)}" y="${top + 4}" width="${W_CAN}" height="${H_CAN - 4}" rx="${r}" stroke-width="1.2"/>`)
    parts.push(`<rect class="acg-hl" x="${n1(x + 6)}" y="${top + 12}" width="3" height="${H_CAN - 26}" rx="1.5"/>`)
    for (const m of [0.25, 0.5, 0.75]) {
      const y = innerTop + innerH * (1 - m)
      parts.push(`<line class="acg-mk" x1="${n1(x + W_CAN - 9)}" y1="${n1(y)}" x2="${n1(x + W_CAN - 4)}" y2="${n1(y)}" stroke-width="1"/>`)
    }

    // The value inside (white over liquid, the plain colour over empty glass), the icon and label below.
    const cx = x + W_CAN / 2
    const valueY = top + H_CAN / 2 + 8
    const overLiquid = lvl > 0 && liquidY < valueY - 4
    parts.push(
      `<text class="${overLiquid ? 'acg-vw' : 'acg-vp'}" x="${n1(cx)}" y="${n1(valueY)}" font-family="${FONT}" font-size="12" font-weight="700" text-anchor="middle">${esc(g.level === null ? '–' : g.value)}</text>`,
      `<text x="${n1(cx)}" y="${n1(top + H_CAN + 14)}" font-family="${FONT}" font-size="13" text-anchor="middle" fill="${g.color[1]}">${esc(g.icon)}</text>`,
      `<text class="acg-lb" x="${n1(cx)}" y="${n1(top + H_CAN + 27)}" font-family="${FONT}" font-size="10" text-anchor="middle">${esc(g.label)}</text>`,
    )
    parts.push(`</g>`)
  })

  const alt = items.map(g => `${g.label}: ${g.level === null ? '–' : g.value}`).join(', ')
  return { source: wrap(width, height, defs, parts), width, height, alt }
}

const TILE_H = 64
const TILE_GAP = 8

/**
 * The overview's figures as tiles, `perRow` to a row: the label at the top, the
 * value below, a pictogram that shows the figure in a tinted badge on the
 * right, and a level bar along the foot.
 */
export function buildTiles(items: Tile[], width: number, perRow: number): Drawing {
  const rows = Math.ceil(items.length / perRow)
  const w = (width - (perRow - 1) * TILE_GAP) / perRow
  const height = rows * TILE_H + (rows - 1) * TILE_GAP
  const parts: string[] = []
  items.forEach((t, i) => {
    const x = (i % perRow) * (w + TILE_GAP)
    const y = Math.floor(i / perRow) * (TILE_H + TILE_GAP)
    const id = `tile-${t.key}`
    parts.push(`<g><title>${esc(t.title)}</title>`)
    parts.push(`<rect class="acg-gf" x="${n1(x)}" y="${y}" width="${n1(w)}" height="${TILE_H}" rx="11"/>`)
    // The badge: a tinted rounded square with the pictogram.
    const bx = x + w - 50
    parts.push(`<rect x="${n1(bx)}" y="${y + 8}" width="42" height="42" rx="12" fill="${t.color}" fill-opacity="0.14"/>`)
    parts.push(`<g transform="translate(${n1(bx + 3)} ${y + 11})">${t.pic}</g>`)
    // The level bar along the foot, clipped to the tile's round corners.
    const lvl = t.level === null ? null : Math.max(0, Math.min(1, t.level))
    if (lvl !== null) {
      parts.push(
        `<clipPath id="${id}-clip"><rect x="${n1(x)}" y="${y}" width="${n1(w)}" height="${TILE_H}" rx="11"/></clipPath>` +
          `<g clip-path="url(#${id}-clip)">` +
          `<rect x="${n1(x)}" y="${y + TILE_H - 4}" width="${n1(w)}" height="4" fill="${t.rest ?? '#94a3b8'}" fill-opacity="${t.rest ? 1 : 0.2}"/>` +
          (lvl > 0 ? `<rect x="${n1(x)}" y="${y + TILE_H - 4}" width="${n1(w * lvl)}" height="4" fill="${t.color}"/>` : '') +
          `</g>`,
      )
    }
    parts.push(`<rect class="acg-ge" x="${n1(x + 0.5)}" y="${y + 0.5}" width="${n1(w - 1)}" height="${TILE_H - 1}" rx="11"/>`)
    // Label and value; a long value shrinks to keep clear of the badge.
    const size = n1(Math.max(10.5, Math.min(17, (w - 70) / (Math.max(1, [...t.value].length) * 0.6))))
    parts.push(
      `<text class="acg-lb" x="${n1(x + 11)}" y="${y + 20}" font-family="${FONT}" font-size="11.5">${esc(t.label)}</text>`,
      `<text class="acg-vp" x="${n1(x + 11)}" y="${y + 47}" font-family="${FONT}" font-size="${size}" font-weight="700"${t.valueColor ? ` style="fill:${t.valueColor}"` : ''}>${t.valueHtml ?? esc(t.value)}</text>`,
    )
    parts.push(`</g>`)
  })
  const alt = items.map(t => `${t.label}: ${t.value}`).join(', ')
  return { source: wrap(width, height, [], parts), width, height, alt }
}

/** A liquid colour pair for a level where more is worse: calm, then amber, then red. */
export function warnColors(level: number | null, amber: number, red: number): [string, string] {
  if (level !== null && level >= red) return ['#fb7185', '#e11d48']
  if (level !== null && level >= amber) return ['#fcd34d', '#f59e0b']
  return ['#5eead4', '#0d9488']
}
