import { tr } from '../i18n'
// Formatting helpers for the panel: durations, tokens, money, paths, file stamps.

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const hh = Math.floor(m / 60)
  if (hh > 0) return `${hh}h ${String(m % 60).padStart(2, '0')}m`
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function fmtEta(ms: number): string {
  if (ms < 60_000) return tr('< 1 Min', '< 1 min')
  const m = Math.round(ms / 60_000)
  return m >= 60 ? `≈ ${Math.floor(m / 60)} h ${m % 60} ${tr('Min', 'min')}` : `≈ ${m} ${tr('Min', 'min')}`
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

export const fmtUsd = (usd: number) => (usd < 0.01 ? '< $0.01' : `$${usd.toFixed(2)}`)

export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

/** A cube's number as the panel shows it: 01, 02, … */
export const cubeNo = (i: number) => String(i + 1).padStart(2, '0')

export type ContextLike = { tokens?: number; window: number; percent?: number }

/** The context window's fill, 0..1, or null when unknown. */
export function contextFrac(c: ContextLike | undefined): number | null {
  if (!c) return null
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  if (typeof c.percent === 'number' && Number.isFinite(c.percent)) return clamp(c.percent / 100)
  if (typeof c.tokens === 'number' && c.window > 0) return clamp(c.tokens / c.window)
  return null
}

const SPARK = '▁▂▃▄▅▆▇█'
export function sparkline(values: number[]): string {
  if (values.length === 0) return ''
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return values.map(v => SPARK[hi > lo ? Math.round(((v - lo) / (hi - lo)) * (SPARK.length - 1)) : 3]).join('')
}

export function fileStamp(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export function joinPath(dir: string, name: string): string {
  if (dir.endsWith('/') || dir.endsWith('\\')) return dir + name
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return dir + sep + name
}

/** A duration in whole minutes, for figures that should not change every second: "< 1 min", "12 min", "1 h 05 min". */
export function fmtMinutes(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return tr('< 1 Min', '< 1 min')
  if (m >= 60) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} ${tr('Min', 'min')}`
  return `${m} ${tr('Min', 'min')}`
}
