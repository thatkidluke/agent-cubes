/**
 * Gauges: a row of modern glass canisters that fill with liquid, one per figure
 * worth watching at a glance (progress, context, budget or success rate, time
 * spent waiting). Each has a level, a colour that follows its state, a gently
 * moving surface while work goes on, its value inside and an icon and label
 * below. A small SVG of its own, beside the main drawing.
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

const W_CAN = 46
const H_CAN = 74
const GAP = 18
const LABEL_H = 30

export function buildGauges(items: Gauge[], width: number, animate: boolean): { source: string; width: number; height: number; alt: string } {
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

    defs.push(
      `<clipPath id="${id}-clip"><rect x="${n1(innerX)}" y="${n1(innerTop)}" width="${n1(innerW)}" height="${n1(innerH)}" rx="${r - 4}"/></clipPath>`,
      `<linearGradient id="${id}-liq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g.color[0]}"/><stop offset="1" stop-color="${g.color[1]}"/></linearGradient>`,
    )

    // The canister: a cap, the glass body, its rim.
    parts.push(`<g><title>${esc(g.title)}</title>`)
    parts.push(`<rect x="${n1(x + W_CAN * 0.3)}" y="${top}" width="${n1(W_CAN * 0.4)}" height="6" rx="2" fill="#64748b"/>`)
    parts.push(`<rect x="${n1(x)}" y="${top + 4}" width="${W_CAN}" height="${H_CAN - 4}" rx="${r}" fill="#94a3b8" fill-opacity="0.12" stroke="#94a3b8" stroke-opacity="0.55" stroke-width="1.2"/>`)

    // The liquid, with a wavy surface that drifts while work goes on.
    if (lvl > 0) {
      const amp = lvl >= 0.999 ? 0 : 2.2
      const wave = (dx: number) => {
        let d = `M${n1(innerX - innerW + dx)} ${n1(liquidY)}`
        for (let k = 0; k < 4; k++) {
          const sx = innerX - innerW + dx + (k * innerW) / 2
          d += `Q${n1(sx + innerW / 4)} ${n1(liquidY - amp)} ${n1(sx + innerW / 2)} ${n1(liquidY)}`
        }
        return d + `L${n1(innerX + innerW * 2)} ${n1(innerTop + innerH + 2)}L${n1(innerX - innerW)} ${n1(innerTop + innerH + 2)}Z`
      }
      const drift = animate && amp ? `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(innerW)} 0" dur="2.4s" repeatCount="indefinite"/>` : ''
      parts.push(
        `<g clip-path="url(#${id}-clip)"><path d="${wave(0)}" fill="url(#${id}-liq)">${drift}</path>` +
          // Bubbles rising through the liquid.
          (animate && lvl > 0.15
            ? [0.3, 0.65].map((fx, k) => {
                const bx = innerX + innerW * fx
                const y1 = innerTop + innerH - 2
                return `<circle cx="${n1(bx)}" cy="${n1(y1)}" r="1.3" fill="#ffffff" opacity="0"><animate attributeName="cy" values="${n1(y1)};${n1(liquidY + 3)}" dur="${1.8 + k * 0.7}s" begin="${k * 0.9}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.6;0" dur="${1.8 + k * 0.7}s" begin="${k * 0.9}s" repeatCount="indefinite"/></circle>`
              }).join('')
            : '') +
          `</g>`,
      )
    }

    // Glass highlight and scale marks.
    parts.push(`<rect x="${n1(x + 6)}" y="${top + 12}" width="3" height="${H_CAN - 26}" rx="1.5" fill="#ffffff" fill-opacity="0.35"/>`)
    for (const m of [0.25, 0.5, 0.75]) {
      const y = innerTop + innerH * (1 - m)
      parts.push(`<line x1="${n1(x + W_CAN - 9)}" y1="${n1(y)}" x2="${n1(x + W_CAN - 4)}" y2="${n1(y)}" stroke="#94a3b8" stroke-opacity="0.6" stroke-width="1"/>`)
    }

    // The value inside, the icon and label below.
    const cx = x + W_CAN / 2
    parts.push(
      `<text x="${n1(cx)}" y="${n1(top + H_CAN / 2 + 8)}" font-family="system-ui,sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="#ffffff" stroke="#0f172a" stroke-opacity="0.55" stroke-width="2.5" paint-order="stroke">${esc(g.level === null ? '–' : g.value)}</text>`,
      `<text x="${n1(cx)}" y="${n1(top + H_CAN + 14)}" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle" fill="${g.color[0]}">${esc(g.icon)}</text>`,
      `<text x="${n1(cx)}" y="${n1(top + H_CAN + 27)}" font-family="system-ui,sans-serif" font-size="10" text-anchor="middle" fill="#94a3b8">${esc(g.label)}</text>`,
    )
    parts.push(`</g>`)
  })

  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs.join('')}</defs>${parts.join('')}</svg>`
  const alt = items.map(g => `${g.label}: ${g.level === null ? '–' : g.value}`).join(', ')
  return { source, width, height, alt }
}

/** A liquid colour pair for a level where more is worse: calm, then amber, then red. */
export function warnColors(level: number | null, amber: number, red: number): [string, string] {
  if (level !== null && level >= red) return ['#fb7185', '#e11d48']
  if (level !== null && level >= amber) return ['#fcd34d', '#f59e0b']
  return ['#5eead4', '#0d9488']
}

export type Tile = {
  key: string
  icon: string
  label: string
  value: string
  /** How full the tile's liquid stands, 0..1, or null for a tile without liquid. */
  level: number | null
  /** Liquid colour: [top, bottom] of its gradient. */
  color: [string, string]
  /** The value's colour where it signals something, else white. */
  valueColor?: string
  title: string
}

const TILE_H = 50
const TILE_GAP = 6

/**
 * The overview's figures as glass tiles, `perRow` to a row: icon and label at the
 * top, the value below, and behind them a liquid filled to the figure's level
 * (progress, context, budget, waiting share...), with a moving surface while work
 * goes on. A figure without a natural level gets an empty tile.
 */
export function buildTiles(items: Tile[], width: number, perRow: number, animate: boolean): { source: string; width: number; height: number; alt: string } {
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
    parts.push(`<g><title>${esc(t.title)}</title>`)
    parts.push(`<rect x="${n1(x)}" y="${y}" width="${n1(w)}" height="${TILE_H}" rx="9" fill="#94a3b8" fill-opacity="0.08"/>`)
    if (lvl > 0) {
      defs.push(
        `<clipPath id="${id}-clip"><rect x="${n1(x)}" y="${y}" width="${n1(w)}" height="${TILE_H}" rx="9"/></clipPath>`,
        `<linearGradient id="${id}-liq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.color[0]}" stop-opacity="0.55"/><stop offset="1" stop-color="${t.color[1]}" stop-opacity="0.75"/></linearGradient>`,
      )
      const top = y + TILE_H * (1 - lvl)
      const amp = lvl >= 0.999 ? 0 : 1.8
      const seg = 24
      let d = `M${n1(x - seg * 2)} ${n1(top)}`
      for (let sx = x - seg * 2; sx < x + w + seg; sx += seg) d += `q${seg / 4} ${-amp} ${seg / 2} 0t${seg / 2} 0`
      d += `L${n1(x + w + seg * 2)} ${y + TILE_H + 2}L${n1(x - seg * 2)} ${y + TILE_H + 2}Z`
      const drift = animate && amp ? `<animateTransform attributeName="transform" type="translate" values="0 0;${seg} 0" dur="2.2s" repeatCount="indefinite"/>` : ''
      parts.push(`<g clip-path="url(#${id}-clip)"><path d="${d}" fill="url(#${id}-liq)">${drift}</path>`)
      // A bright line on the surface, so the level reads even when the liquid is pale.
      if (amp) parts.push(`<line x1="${n1(x)}" y1="${n1(top)}" x2="${n1(x + w)}" y2="${n1(top)}" stroke="${t.color[0]}" stroke-opacity="0.6" stroke-width="1"/>`)
      parts.push(`</g>`)
    }
    parts.push(`<rect x="${n1(x + 0.5)}" y="${y + 0.5}" width="${n1(w - 1)}" height="${TILE_H - 1}" rx="9" fill="none" stroke="#94a3b8" stroke-opacity="${lvl > 0 ? 0.5 : 0.3}"/>`)
    parts.push(
      `<text x="${n1(x + 10)}" y="${y + 17}" font-family="system-ui,sans-serif" font-size="11" fill="#cbd5e1"><tspan fill="${t.color[0]}" font-size="12">${esc(t.icon)}</tspan> ${esc(t.label)}</text>`,
      `<text x="${n1(x + 10)}" y="${y + 39}" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="${lvl < 0.3 && t.valueColor ? t.valueColor : '#ffffff'}" stroke="#0f172a" stroke-opacity="0.55" stroke-width="2.5" paint-order="stroke">${esc(t.value)}</text>`,
    )
    parts.push(`</g>`)
  })
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${height}" viewBox="0 0 ${n1(width)} ${height}"><defs>${defs.join('')}</defs>${parts.join('')}</svg>`
  const alt = items.map(t => `${t.label}: ${t.value}`).join(', ')
  return { source, width, height, alt }
}
