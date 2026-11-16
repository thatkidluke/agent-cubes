// The plugin's userConfig values, checked and clamped to sane ranges.
import type { PluginOptions } from 'claude-code'

import { STUCK, type StuckThresholds } from '../model'
import { SKINS } from '../skins'

export type PanelSettings = {
  /** The skin used while the person has not picked one in the panel. */
  defaultSkin: string
  /** Open the pane at session start. */
  autoOpen: boolean
  /** false draws still pictures: buildSvg gets motion: false. */
  animations: boolean
  /** The limits the stuck checks judge by. */
  stuck: StuckThresholds
}

export const DEFAULTS = {
  defaultSkin: 'classic',
  autoOpen: true,
  animations: true,
  stuckSilentMinutes: STUCK.silentMs / 60_000,
  stuckFailsInRow: STUCK.failsInRow,
  stuckSlowFactor: STUCK.slowFactor,
} as const

/** A number in [lo, hi]; anything that is not a finite number gives `fallback`. */
export function clampNum(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return fallback
}

export function readSettings(options: PluginOptions | undefined): PanelSettings {
  const o: Record<string, unknown> = options ?? {}
  const skin = typeof o.defaultSkin === 'string' && SKINS.some(s => s.id === o.defaultSkin) ? o.defaultSkin : DEFAULTS.defaultSkin
  const silentMin = clampNum(o.stuckSilentMinutes, DEFAULTS.stuckSilentMinutes, 0.5, 240)
  const fails = Math.round(clampNum(o.stuckFailsInRow, DEFAULTS.stuckFailsInRow, 1, 50))
  const slow = clampNum(o.stuckSlowFactor, DEFAULTS.stuckSlowFactor, 1.1, 50)
  return {
    defaultSkin: skin,
    autoOpen: bool(o.autoOpen, DEFAULTS.autoOpen),
    animations: bool(o.animations, DEFAULTS.animations),
    stuck: { ...STUCK, silentMs: Math.round(silentMin * 60_000), failsInRow: fails, slowFactor: slow },
  }
}
