/**
 * The overview's figures: the nine label-and-value pairs, the canisters'
 * items, and each tile's pictogram, level and colour. Pure: the same input
 * gives the same figures.
 */
import type { CubeRun } from '../../types'
import { type Gauge, warnColors } from '../gauges'
import { tr } from '../i18n'
import { PALETTE } from '../iso'
import { CONTEXT_AMBER, CONTEXT_RED } from '../overlays'
import { activity, AMBER as P_AMBER, BLUE as P_BLUE, clock, coins, cup, diffBlocks, GOLD as P_GOLD, GREEN as P_GREEN, hourglass, perMinute, RED as P_RED, tank, TEAL as P_TEAL, tokenBars, VIOLET as P_VIOLET, warning } from '../pictos'
import type { Figure } from './blocks'
import { fmtDuration, fmtEta, fmtMinutes, fmtTokens, fmtUsd } from './format'

/** Levels move in steps of 5 %, so a liquid or a bar only redraws when it visibly changes. */
export const step5 = (v: number | null) => (v === null ? null : Math.round(Math.max(0, Math.min(1, v)) * 20) / 20)

/** A tile's own part: its pictogram, level and colours; label and value come from the figure of the same index. */
export type TileSpec = { key: string; pic: string; level: number | null; color: string; rest?: string; valueHtml?: string; title: string }

export type OverviewInput = {
  r: CubeRun
  now: number
  elapsed: number
  /** Estimated time left in ms, or null. */
  left: number | null
  /** Whether the estimate rests on steps measured in this run. */
  exp: { isMeasured: boolean }
  /** Time spent waiting for the person so far, in ms. */
  waitNow: number
  ctxFrac: number | null
  runUsd: number | null
  settings: { budgetUsd: number; animations: boolean }
  budgetFrac: number | null
  costColor: string | undefined
  overall: number | null
  active: boolean
  /** Things move: animations are on and a run is active. */
  moving: boolean
}

export function overviewOf(i: OverviewInput): { overview: Figure[]; gaugeItems: Gauge[]; tileSpec: TileSpec[] } {
  const { r, now, elapsed, left, exp, waitNow, ctxFrac, runUsd, settings, budgetFrac, costColor, overall, active, moving } = i
  const warnColor = (frac: number) => (frac >= CONTEXT_RED ? PALETTE.error[1] : frac >= CONTEXT_AMBER ? PALETTE.waiting[1] : undefined)
  const linesAdded = r.tasks.reduce((t, x) => t + x.added, 0)
  const linesRemoved = r.tasks.reduce((t, x) => t + x.removed, 0)
  const overview: Figure[] = [
    // While work goes on, times show whole minutes: a figure that changes every second redraws every second.
    [`◷ ${tr('Laufzeit', 'Elapsed')}`, r.startedAt ? (active ? fmtMinutes(elapsed) : fmtDuration(elapsed)) : '–'],
    [`⧗ ${tr('Restzeit', 'Time left')}`, left === null ? '–' : `${fmtEta(left)}${exp.isMeasured ? '' : '*'}`],
    [`‖ ${tr('Wartezeit', 'Waiting')}`, waitNow > 0 ? `≈ ${active ? fmtMinutes(waitNow) : fmtDuration(waitNow)}` : '–', r.status === 'waiting' ? PALETTE.waiting[1] : undefined],
    [`◧ ${tr('Kontext', 'Context')}`, ctxFrac === null ? '–' : `${Math.round(ctxFrac * 100)} %`, ctxFrac === null ? undefined : warnColor(ctxFrac)],
    [`✕ ${tr('Fehler', 'Errors')}`, String(r.errors), r.errors > 0 ? PALETTE.error[1] : undefined],
    [`⌁ ${tr('Tool-Aufrufe', 'Tool calls')}`, String(r.toolCalls)],
    [`⇅ ${tr('Tokens', 'Tokens')}`, `${fmtTokens(r.tokensIn)} ↓ ${fmtTokens(r.tokensOut)} ↑`],
    [
      `$ ${tr('Kosten', 'Cost')}`,
      runUsd === null ? '–' : `≈ ${fmtUsd(runUsd)}${settings.budgetUsd > 0 ? ` / ${fmtUsd(settings.budgetUsd)}` : ''}`,
      costColor,
    ],
    // The cubes done stand in the head already; the tile shows the lines changed instead.
    [`± ${tr('Code', 'Code')}`, linesAdded + linesRemoved > 0 ? `+${linesAdded} −${linesRemoved}` : '–', linesAdded + linesRemoved > 0 ? P_GREEN : undefined],
  ]
  // The canisters at the top of the overview: what to watch at a glance.
  const pctOf = (v: number) => `${Math.round(v * 100)} %`
  const callsOk = r.toolCalls > 0 ? 1 - r.errors / r.toolCalls : null
  const waitShare = elapsed > 0 ? step5(Math.min(1, waitNow / elapsed)) : null
  const gaugeItems: Gauge[] = [
    {
      key: 'progress',
      label: tr('Fortschritt', 'Progress'),
      icon: '▲',
      level: step5(overall),
      value: overall === null ? '–' : pctOf(overall),
      color: overall !== null && overall >= 1 ? ['#86efac', '#16a34a'] : ['#93c5fd', '#2563eb'],
      title: tr('Geschätzter Fortschritt des Auftrags', 'Estimated progress of the task'),
    },
    {
      key: 'context',
      label: tr('Kontext', 'Context'),
      icon: '◧',
      level: ctxFrac,
      value: ctxFrac === null ? '–' : pctOf(ctxFrac),
      color: warnColors(ctxFrac, CONTEXT_AMBER, CONTEXT_RED),
      title: tr('Füllstand des Kontextfensters', 'How full the context window is'),
    },
    settings.budgetUsd > 0
      ? {
          key: 'budget',
          label: tr('Budget', 'Budget'),
          icon: '$',
          level: budgetFrac === null ? null : Math.min(1, budgetFrac),
          value: runUsd === null ? '–' : fmtUsd(runUsd),
          color: warnColors(budgetFrac, 0.8, 1),
          title: tr(`Kosten im Verhältnis zum Budget von ${fmtUsd(settings.budgetUsd)}`, `Cost against the budget of ${fmtUsd(settings.budgetUsd)}`),
        }
      : {
          key: 'success',
          label: tr('Erfolg', 'Success'),
          icon: '✓',
          level: callsOk,
          value: callsOk === null ? '–' : pctOf(callsOk),
          color: callsOk !== null && callsOk < 0.8 ? ['#fb7185', '#e11d48'] : ['#86efac', '#16a34a'],
          title: tr('Anteil der Tool-Aufrufe ohne Fehler', 'Share of tool calls without an error'),
        },
    {
      key: 'waiting',
      label: tr('Warten', 'Waiting'),
      icon: '‖',
      level: waitShare,
      value: waitShare === null ? '–' : pctOf(waitShare),
      color: warnColors(waitShare, 0.25, 0.5),
      title: tr('Anteil der Laufzeit, in der auf dich gewartet wurde', 'Share of the time spent waiting for you'),
    },
  ]
  // The same figures as tiles: each with a pictogram that shows it and a level bar along its foot.
  const span = left === null ? null : elapsed + left
  const errRate = r.toolCalls > 0 ? r.errors / r.toolCalls : null
  const ctxCols = warnColors(ctxFrac, CONTEXT_AMBER, CONTEXT_RED)
  const tokSum = r.tokensIn + r.tokensOut
  const codeSum = linesAdded + linesRemoved
  // Calls per minute, read at the minute, so the chart moves once a minute or with a new call.
  const minuteNow = Math.floor(now / 60_000) * 60_000 + 59_999
  const tileSpec: TileSpec[] = [
    { key: 'elapsed', pic: clock(span ? step5(elapsed / span) : null), level: span ? step5(elapsed / span) : null, color: P_BLUE, title: tr('Laufzeit im Verhältnis zur geschätzten Gesamtdauer', 'Elapsed against the estimated total') },
    { key: 'left', pic: hourglass(span ? step5((left ?? 0) / span) : null, moving), level: span ? step5((left ?? 0) / span) : null, color: P_VIOLET, title: tr('Restzeit im Verhältnis zur geschätzten Gesamtdauer', 'Time left against the estimated total') },
    { key: 'waiting', pic: cup('tile-cup', waitShare, r.status === 'waiting', settings.animations), level: waitShare, color: P_AMBER, title: tr('Anteil der Laufzeit, in der auf dich gewartet wurde', 'Share of the time spent waiting for you') },
    { key: 'context', pic: tank(step5(ctxFrac), ctxCols, CONTEXT_AMBER, CONTEXT_RED), level: step5(ctxFrac), color: ctxCols[1], title: tr('Füllstand des Kontextfensters', 'How full the context window is') },
    { key: 'errors', pic: warning(r.errors), level: errRate === null ? null : step5(errRate), color: r.errors > 0 ? P_RED : P_GREEN, title: tr('Anteil fehlgeschlagener Tool-Aufrufe', 'Share of failed tool calls') },
    { key: 'calls', pic: activity(perMinute(r.calls.map(c => c.at), minuteNow), moving), level: null, color: P_TEAL, title: tr('Tool-Aufrufe pro Minute, die letzten sieben Minuten', 'Tool calls per minute, the last seven minutes') },
    { key: 'tokens', pic: tokenBars(r.tokensIn, r.tokensOut), level: tokSum > 0 ? step5(r.tokensIn / tokSum) : null, color: P_BLUE, rest: P_VIOLET, title: tr('Tokens hinein (blau) und heraus (violett)', 'Tokens in (blue) and out (violet)') },
    { key: 'cost', pic: coins(budgetFrac === null ? null : step5(budgetFrac), runUsd), level: budgetFrac === null ? null : step5(budgetFrac), color: budgetFrac !== null && budgetFrac >= 1 ? P_RED : P_GOLD, title: settings.budgetUsd > 0 ? tr('Kosten im Verhältnis zum Budget', 'Cost against the budget') : tr('Geschätzte Kosten', 'Estimated cost') },
    {
      key: 'code', pic: diffBlocks(linesAdded, linesRemoved), level: codeSum > 0 ? linesAdded / codeSum : null, color: P_GREEN, rest: P_RED,
      valueHtml: codeSum > 0 ? `<tspan style="fill:${P_GREEN}">+${linesAdded}</tspan> <tspan style="fill:${P_RED}">−${linesRemoved}</tspan>` : undefined,
      title: tr('Zeilen hinzugefügt und entfernt', 'Lines added and removed'),
    },
  ]
  return { overview, gaugeItems, tileSpec }
}
