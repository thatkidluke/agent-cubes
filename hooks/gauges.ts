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
import { esc, n1 } from './svg'

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
  icon: string
  label: string
  value: string
  /** How full the tile's liquid stands, 0..1, or null for a tile without liquid. */
  level: number | null
  /** Liquid colour: [top, bottom] of its gradient; also the symbol's colour. */
  color: [string, string]
  /** The value's colour where it signals something and no liquid is behind it. */
  valueColor?: string
  title: string
}

type Built = { source: string; width: number; height: number; alt: string }

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
  `.acg-vw{fill:#ffffff;stroke:#0f172a;stroke-opacity:.55;stroke-width:2.5px;paint-order:stroke}` +
  `@media (prefers-color-scheme:dark){` +
  `.acg-gf{fill:#94a3b8;fill-opacity:.09}.acg-ge{stroke:#94a3b8;stroke-opacity:.5}.acg-gc{fill:#64748b}` +
  `.acg-lb{fill:#cbd5e1}.acg-vp{fill:#ffffff;stroke:#0f172a;stroke-opacity:.5}` +
  `.acg-mk{stroke:#94a3b8;stroke-opacity:.6}.acg-hl{fill-opacity:.3}}` +
  `</style>`

/** A wavy liquid surface at `top`, from `x0` to `x1`, filled down to `bottom`. */
function liquidPath(x0: number, x1: number, top: number, bottom: number, amp: number, seg: number): string {
  let d = `M${n1(x0 - seg * 2)} ${n1(top)}`
  for (let sx = x0 - seg * 2; sx < x1 + seg; sx += seg) d += `q${n1(seg / 4)} ${n1(-amp)} ${n1(seg / 2)} 0t${n1(seg / 2)} 0`
  return d + `L${n1(x1 + seg * 2)} ${n1(bottom + 2)}L${n1(x0 - seg * 2)} ${n1(bottom + 2)}Z`
}

const drift = (seg: number, dur: number) =>
  `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(seg)} 0" dur="${dur}s" repeatCount="indefinite"/>`

const wrap = (width: number, height: number, defs: string[], parts: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${n1(height)}" viewBox="0 0 ${n1(width)} ${n1(height)}">${STYLE}<defs>${defs.join('')}</defs>${parts.join('')}</svg>`

const W_CAN = 46
const H_CAN = 74
const GAP = 18
const LABEL_H = 30

export function buildGauges(items: Gauge[], width: number, animate: boolean): Built {
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

const TILE_H = 60
const TILE_GAP = 8

/**
 * The overview's figures as glass tiles, `perRow` to a row: symbol and label at
 * the top, the value below, and behind them a liquid filled to the figure's level
 * (progress, context, budget, waiting share...), with a moving surface while work
 * goes on. A figure without a natural level gets an empty tile.
 */
export function buildTiles(items: Tile[], width: number, perRow: number, animate: boolean): Built {
  const rows = Math.ceil(items.length / perRow)
  const w = (width - (perRow - 1) * TILE_GAP) / perRow
  const height = rows * TILE_H + (rows - 1) * TILE_GAP
  const defs: string[] = []
  const parts: string[] = []
  items.forEach((t, i) => {
    const x = (i % perRow) * (w + TILE_GAP)
    const y = Math.floor(i / perRow) * (TILE_H + TILE_GAP)
    const id = `tile-${t.key}`
    const lvl = t.level === null ? 0 : Math.max(0, Math.min(1, t.level))
    const top = y + TILE_H * (1 - lvl)
    parts.push(`<g><title>${esc(t.title)}</title>`)
    parts.push(`<rect class="acg-gf" x="${n1(x)}" y="${y}" width="${n1(w)}" height="${TILE_H}" rx="10"/>`)
    if (lvl > 0) {
      defs.push(
        `<clipPath id="${id}-clip"><rect x="${n1(x)}" y="${y}" width="${n1(w)}" height="${TILE_H}" rx="10"/></clipPath>`,
        `<linearGradient id="${id}-liq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.color[0]}" stop-opacity="0.6"/><stop offset="1" stop-color="${t.color[1]}" stop-opacity="0.85"/></linearGradient>`,
      )
      const amp = lvl >= 0.999 ? 0 : 1.8
      const seg = 24
      const moving = animate && amp > 0
      parts.push(
        `<g clip-path="url(#${id}-clip)"><path d="${liquidPath(x, x + w, top, y + TILE_H, amp, seg)}" fill="url(#${id}-liq)">${moving ? drift(seg, 2.2) : ''}</path>` +
          // A bright line on the surface, so the level reads even where the liquid is pale.
          (amp ? `<line x1="${n1(x)}" y1="${n1(top)}" x2="${n1(x + w)}" y2="${n1(top)}" stroke="${t.color[0]}" stroke-opacity="0.7" stroke-width="1"/>` : '') +
          `</g>`,
      )
    }
    parts.push(`<rect class="acg-ge" x="${n1(x + 0.5)}" y="${y + 0.5}" width="${n1(w - 1)}" height="${TILE_H - 1}" rx="10"/>`)
    // Over liquid the value is white with a dark halo; over empty glass it takes its signal colour.
    const valueY = y + 46
    // Long values shrink to fit their tile instead of running into the next one.
    const valueSize = n1(Math.max(11, Math.min(17, (w - 20) / (Math.max(1, [...t.value].length) * 0.6))))
    const overLiquid = lvl > 0 && top < valueY - 6
    const plainColor = !overLiquid && t.valueColor ? ` style="fill:${t.valueColor}"` : ''
    const labelOverLiquid = lvl > 0 && top < y + 22
    parts.push(
      `<text class="${labelOverLiquid ? 'acg-vw' : 'acg-lb'}" x="${n1(x + 11)}" y="${y + 20}" font-family="${FONT}" font-size="12"${labelOverLiquid ? ' font-weight="600"' : ''}><tspan fill="${t.color[1]}" font-size="13"${labelOverLiquid ? ' style="fill:#ffffff"' : ''}>${esc(t.icon)}</tspan> ${esc(t.label)}</text>`,
      `<text class="${overLiquid ? 'acg-vw' : 'acg-vp'}"${plainColor} x="${n1(x + 11)}" y="${valueY}" font-family="${FONT}" font-size="${valueSize}" font-weight="700">${esc(t.value)}</text>`,
    )
    parts.push(`</g>`)
  })
  const alt = items.map(t => `${t.label}: ${t.value}`).join(', ')
  return { source: wrap(width, height, defs, parts), width, height, alt }
}

/** A liquid colour pair for a level where more is worse: calm, then amber, then red. */
export function warnColors(level: number | null, amber: number, red: number): [string, string] {
  if (level !== null && level >= red) return ['#fb7185', '#e11d48']
  if (level !== null && level >= amber) return ['#fcd34d', '#f59e0b']
  return ['#5eead4', '#0d9488']
}
