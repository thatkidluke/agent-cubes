import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { CubeRun, CubeStatus, HistRun } from '../types'
import { agentColor, agentInitial, buildSvg, KIND_COLOR, MAIN_COLOR, PALETTE, STATUS_LABEL } from './iso'
import { SKINS, skinById } from './skins'
import {
  addAgent,
  addStepUsage,
  applyTaskTool,
  currentTaskIndex,
  emptyRun,
  endAgent,
  endRun,
  eta,
  expected,
  isActive,
  KIND_LABEL,
  markWaiting,
  overallProgress,
  priorFrom,
  progress,
  startRun,
  statsFrom,
  stepProgress,
  stuckReason,
  historyCsv,
  summaryMarkdown,
  summaryOf,
  toHistory,
  toolEnd,
  toolStart,
} from './model'
import { buildSummary } from './summary'
import { buildGauges, buildTiles, warnColors, type Gauge, type Tile } from './gauges'
import { activity, AMBER as P_AMBER, BLUE as P_BLUE, clock, coins, cup, diffBlocks, GOLD as P_GOLD, GREEN as P_GREEN, hourglass, perMinute, RED as P_RED, tank, TEAL as P_TEAL, tokenBars, VIOLET as P_VIOLET, warning } from './pictos'
import { agentRow, callColor, card, figures, glyphOf, whoCalled, type Els, type Figure } from './panel/blocks'
import { cubeDetails, KINDS } from './panel/details'
import { contextFrac, cubeNo, fileStamp, fmtDuration, fmtEta, fmtMinutes, fmtTokens, fmtUsd, joinPath, type ContextLike } from './panel/format'
import { memo, phaseLock } from './svg'
import { buildAgents, buildLive, buildNow, type AgentInfo, type CallInfo, type NowInfo } from './panel/live'
import { readSettings } from './panel/settings'
import { setLang, tr } from './i18n'
import { CONTEXT_AMBER, CONTEXT_RED } from './overlays'
import { statsCard } from './panel/stats'

const PANE = 'agent-cubes'
const TITLE = 'Agent Cubes'
const HISTORY_KEY = 'history'
const HISTORY_MAX = 12

// Change a tag when its value's fields change: older stored values are then read as the initial one.
const run = atom({ plugin: 'agent-cubes', key: 'run' } as const, emptyRun, { shape: 'run-5' })
// The beat carries the meters, so a redraw reads them from state instead of asking the host each time.
const tick = atom({ plugin: 'agent-cubes', key: 'tick' } as const, { beat: 0, usd: null as number | null, ctx: null as number | null }, { shape: 'tick-2' })
const selected = atom({ plugin: 'agent-cubes', key: 'selected' } as const, -1)
const history = atom({ plugin: 'agent-cubes', key: 'history' } as const, [] as HistRun[], { shape: 'hist-1' })
/** The skin the person picked in the panel; '' while they have not, so the defaultSkin setting applies. */
const skinPick = atom({ plugin: 'agent-cubes', key: 'skin' } as const, '')
const exported = atom({ plugin: 'agent-cubes', key: 'exported' } as const, '')
const SKIN_KEY = 'skin'


/** Whether the STATISTIK section is unfolded. */
const statsOpenAtom = atom({ plugin: 'agent-cubes', key: 'statsOpen' } as const, false)

const RUN_LABEL: Record<CubeRun['status'], string> = {
  get idle() { return tr('Bereit', 'Ready') },
  get running() { return tr('Läuft', 'Running') },
  get waiting() { return tr('Wartet auf dich', 'Waiting for you') },
  get done() { return tr('Fertig', 'Done') },
  get error() { return tr('Fehler', 'Error') },
  get aborted() { return tr('Abgebrochen', 'Aborted') },
}
const RUN_COLOR: Record<CubeRun['status'], string> = {
  idle: PALETTE.pending[2],
  running: PALETTE.running[1],
  waiting: PALETTE.waiting[1],
  done: PALETTE.done[1],
  error: PALETTE.error[1],
  aborted: PALETTE.pending[2],
}

type UsageLike = { cost?: { usd: number }; context?: ContextLike }

/** The session's usage figures, or undefined where the host cannot say. */
async function sessionUsage($: { session: { usage: () => Promise<UsageLike> } }): Promise<UsageLike | undefined> {
  try {
    return await $.session.usage()
  } catch {
    return undefined
  }
}

/** The session's cost in USD, or undefined where the host keeps no ledger or cannot say. */
/** Reads cost and context once and hands them to the drawing with the next beat. */
async function refreshMeters($: Parameters<typeof sessionUsage>[0] & Parameters<typeof update>[0]): Promise<void> {
  const usage = await sessionUsage($)
  const usd = usage?.cost?.usd ?? null
  const ctx = contextFrac(usage?.context)
  // A read that fails keeps the last figures: a value flickering to "–" and back would redraw the panel for nothing.
  await update($, tick, t => ({ beat: (t?.beat ?? 0) + 1, usd: usd ?? t?.usd ?? null, ctx: ctx ?? t?.ctx ?? null }))
}

async function sessionUsd($: { session: { usage: () => Promise<UsageLike> } }): Promise<number | undefined> {
  return (await sessionUsage($))?.cost?.usd
}

function isHistRun(v: unknown): v is HistRun {
  if (typeof v !== 'object' || v === null) return false
  const row = v as Record<string, unknown>
  return typeof row.at === 'number' && typeof row.ms === 'number' && Array.isArray(row.tasks)
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)
  setLang(settings.language)
  const limits = settings.stuck

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cubes', description: tr('Zeigt das Agent-Cubes-Panel neben dem Chat', 'Shows the Agent Cubes panel beside the chat') })
    // Past runs live in the store across sessions.
    const stored = await $.store.get(HISTORY_KEY).catch(() => undefined)
    if (Array.isArray(stored)) {
      const list = stored.filter(isHistRun).slice(-HISTORY_MAX)
      await update($, history, () => list)
    }
    const storedSkin = await $.store.get(SKIN_KEY).catch(() => undefined)
    if (typeof storedSkin === 'string' && SKINS.some(s => s.id === storedSkin)) await update($, skinPick, () => storedSkin)
    if (settings.autoOpen) void $.ui.open({ id: PANE, title: TITLE })
    // Keeps the elapsed time, the estimated fill and the meters moving while a run is active: one write a second.
    await refreshMeters($)
    $.clock.every(1000, async () => {
      const r = await read($, run)
      if (isActive(r)) await refreshMeters($)
    })
    return next(e)
  })

  on('command.run', { command: 'cubes' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: tr('Agent-Cubes-Panel geöffnet.', 'Agent Cubes panel opened.') }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      const before = await read($, run)
      if (!isActive(before)) {
        const usd = await sessionUsd($)
        const prior = priorFrom(await read($, history))
        await update($, run, r => startRun(r ?? emptyRun, e.text, now, { costAtStart: usd ?? 0, prior }))
        await update($, selected, () => -1)
      } else {
        await update($, run, r => startRun(r ?? emptyRun, e.text, now))
      }
    }
    return next(e)
  })

  // Every model request's tokens, as they come, counted to the step its loop works on.
  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    if (res.usage) {
      const usage = res.usage
      await update($, run, r => addStepUsage(r ?? emptyRun, e.agentId, usage))
    }
    return res
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      await update($, run, r => endAgent(r ?? emptyRun, agentId, e.reason))
      return next(e)
    }
    const before = await read($, run)
    await update($, run, r => endRun(r ?? emptyRun, e.reason, now))
    // A run that did something is kept in the history.
    const after = await read($, run)
    if (isActive(before) && !isActive(after) && (after.tasks.length > 0 || after.toolCalls > 0)) {
      const total = await sessionUsd($)
      const usd = total === undefined ? 0 : Math.max(0, total - after.costAtStart)
      const row = toHistory(after, usd)
      await update($, history, list => [...(list ?? []), row].slice(-HISTORY_MAX))
      await $.store.set(HISTORY_KEY, await read($, history)).catch(() => undefined)
    }
    // The run's final cost and context fill, shown once the beat has stopped.
    await refreshMeters($)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const res = await next(e)
    if (res.agentId !== undefined) {
      const id = res.agentId
      const now = await $.clock.now()
      await update($, run, r => addAgent(r ?? emptyRun, { id, name: e.description || e.subagentType, kind: e.subagentType }, now))
    }
    return res
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.tool_use_id !== undefined) {
      const id = e.tool_use_id
      const at = await $.clock.now()
      await update($, run, r => markWaiting(r ?? emptyRun, id, e.tool, at))
    }
    return verdict
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const id = e.tool_use_id
    const agentId = e.agentId
    const args = e as unknown as Record<string, unknown>
    const now = await $.clock.now()
    await update($, run, r => toolStart(r ?? emptyRun, { id, tool, agentId, input: args }, now))

    const res = await next(e)

    const isError = res.deny !== undefined || res.isError === true
    const errorText = res.deny ?? (isError ? (res.text ?? '') : '')
    const doneAt = await $.clock.now()
    await update($, run, r0 => {
      const r = toolEnd(r0 ?? emptyRun, { id, tool, agentId, isError, errorText }, doneAt)
      return isError ? r : applyTaskTool(r, tool, args, res.result, doneAt)
    })
    return res
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Progress, Button } = els
    const blockEls: Els = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const Select = 'Select' in els ? els.Select : undefined
    const r = await read($, run)
    const meters = await read($, tick)
    const sel = await read($, selected)
    const hist = await read($, history)
    const skin = skinById((await read($, skinPick)) || settings.defaultSkin)
    const statsOpen = await read($, statsOpenAtom)
    const savedTo = await read($, exported)
    const now = await $.clock.now()
    const usd = meters.usd ?? undefined
    const ctxFrac = meters.ctx
    const runUsd = usd !== undefined && r.units > 0 ? Math.max(0, usd - r.costAtStart) : null

    const prog = progress(r)
    const overall = overallProgress(r, now)
    const pct = overall !== null ? Math.floor(overall * 100) : null
    const elapsed = r.startedAt ? (r.endedAt || now) - r.startedAt : 0
    const runColor = RUN_COLOR[r.status]
    const cols = e.props.bodyColumns
    const isWidget = e.props.placement === 'widget'
    const active = isActive(r)

    const cur = currentTaskIndex(r)
    const curTask = cur >= 0 ? r.tasks[cur] : undefined

    const drawOpts = { context: ctxFrac, motion: settings.animations }
    const svg = Svg ? buildSvg(r, isWidget ? 180 : Math.max(260, Math.min(680, cols * 7.5)), now, sel, skin, drawOpts) : undefined

    if (isWidget) {
      return (
        <Box flexDirection="column" alignItems="center" gap={0}>
          {svg && Svg && <Svg source={svg.source} alt={svg.alt} width={svg.width} height={svg.height} />}
          <Text weight="bold" tabular color={runColor}>
            {pct !== null ? `${pct} %` : RUN_LABEL[r.status]}
          </Text>
        </Box>
      )
    }

    const left = eta(r, now)
    const exp = expected(r)
    const warnColor = (frac: number) => (frac >= CONTEXT_RED ? PALETTE.error[1] : frac >= CONTEXT_AMBER ? PALETTE.waiting[1] : undefined)
    const stuck = r.tasks.map((_t, i) => ({ i, why: stuckReason(r, i, now, limits) })).filter(s => s.why)
    // The cost budget: amber from 80 %, a status line once it is passed.
    const budgetFrac = settings.budgetUsd > 0 && runUsd !== null ? runUsd / settings.budgetUsd : null
    const overBudget = budgetFrac !== null && budgetFrac > 1
    const costColor = budgetFrac === null ? undefined : budgetFrac > 1 ? PALETTE.error[1] : budgetFrac >= 0.8 ? PALETTE.waiting[1] : undefined
    const waitNow = (r.waitMs ?? 0) + (r.waitSince ? Math.max(0, now - r.waitSince) : 0)
    // The status line's content: a question first, then a stuck step, else a calm line.
    const clip = (t: string) => (t.length > 90 ? t.slice(0, 89) + '…' : t)
    const firstStuck = stuck[0]
    const alert: { text: string; color: string | undefined; strong: boolean } =
      r.status === 'waiting'
        ? { text: clip(`⏸ ${tr('Wartet auf deine Antwort', 'Waiting for your answer')}${r.waitingFor ? `: ${r.waitingFor}` : ''}`), color: PALETTE.waiting[1], strong: true }
        : firstStuck
          ? {
              text: clip(
                `⚠ ${tr('Würfel', 'Cube')} ${cubeNo(firstStuck.i)} ${tr('hängt', 'is stuck')}: ${firstStuck.why}` +
                  (stuck.length > 1 ? ` (+${stuck.length - 1})` : ''),
              ),
              color: PALETTE.error[1],
              strong: true,
            }
          : overBudget
            ? {
                text: clip(`$ ${tr('Kostenbudget überschritten', 'Cost budget exceeded')}: ≈ ${fmtUsd(runUsd ?? 0)} / ${fmtUsd(settings.budgetUsd)}`),
                color: PALETTE.error[1],
                strong: true,
              }
            : { text: active ? tr('● Keine offenen Hinweise', '● Nothing needs you') : tr('○ Bereit', '○ Ready'), color: undefined, strong: false }
    const stats2 = statsFrom(hist)

    const exportSvg = async () => {
      try {
        const at = await $.clock.now()
        const pic = buildSvg(r, 1000, at, -1, skin, drawOpts)
        const path = joinPath(await $.session.cwd(), `agent-cubes-${fileStamp(at)}.svg`)
        await $.fs.write(path, pic.source)
        await update($, exported, () => path)
        $.ui.toast(`${tr('Gespeichert', 'Saved')}: ${path}`)
      } catch (err) {
        $.ui.toast(`${tr('Speichern fehlgeschlagen', 'Saving failed')}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    // The stored runs as CSV (one row per step, for a spreadsheet) and JSON, next to the work.
    const exportData = async () => {
      try {
        const at = await $.clock.now()
        const dir = await $.session.cwd()
        const csv = joinPath(dir, `agent-cubes-history-${fileStamp(at)}.csv`)
        const json = joinPath(dir, `agent-cubes-history-${fileStamp(at)}.json`)
        await $.fs.write(csv, historyCsv(hist))
        await $.fs.write(json, JSON.stringify(hist, null, 2) + '\n')
        await update($, exported, () => csv)
        $.ui.toast(`${tr('Gespeichert', 'Saved')}: ${csv}`)
      } catch (err) {
        $.ui.toast(`${tr('Speichern fehlgeschlagen', 'Saving failed')}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    // The finished run's summary as Markdown, onto the clipboard of the surface that asked.
    const copySummary = async () => {
      const copied = await $.ui.copy({ text: summaryMarkdown(r, runUsd), surface: e.surface })
      $.ui.toast(copied.isCopied ? tr('Zusammenfassung kopiert', 'Summary copied') : tr('Kopieren nicht möglich', 'Could not copy'))
    }
    const viewAgent = async (agentId: string | undefined) => {
      const shown = await $.ui.view(agentId ? { agentId } : {})
      if (shown.deny) $.ui.toast(shown.deny)
    }
    const pickSkin = async (id: string) => {
      const picked = skinById(id).id
      await update($, skinPick, () => picked)
      await $.store.set(SKIN_KEY, picked).catch(() => undefined)
    }

    // ── Overview ──
    const linesAdded = r.tasks.reduce((t, x) => t + x.added, 0)
    const linesRemoved = r.tasks.reduce((t, x) => t + x.removed, 0)
    const GREEN_TEXT = '#16a34a'
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
      [`± ${tr('Code', 'Code')}`, linesAdded + linesRemoved > 0 ? `+${linesAdded} −${linesRemoved}` : '–', linesAdded + linesRemoved > 0 ? GREEN_TEXT : undefined],
    ]
    // The canisters at the top of the overview: what to watch at a glance.
    const pctOf = (v: number) => `${Math.round(v * 100)} %`
    const callsOk = r.toolCalls > 0 ? 1 - r.errors / r.toolCalls : null
    // Levels move in steps of 5 %, so a liquid only redraws when it visibly rises.
    const step5 = (v: number | null) => (v === null ? null : Math.round(Math.max(0, Math.min(1, v)) * 20) / 20)
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
    const drawWidth = Math.max(240, Math.min(680, cols * 7.5))
    const moving = settings.animations && active
    // Each drawing is made anew only when what it shows changes, its endless animations locked to the clock.
    const gauges =
      Svg && settings.gaugeRow
        ? memo('gauges', JSON.stringify([gaugeItems, drawWidth, moving]), () => {
            const g = buildGauges(gaugeItems, drawWidth, moving)
            return { ...g, source: phaseLock(g.source, now) }
          })
        : null
    // The same figures as tiles: each with a pictogram that shows it and a level bar along its foot.
    const span = left === null ? null : elapsed + left
    const errRate = r.toolCalls > 0 ? r.errors / r.toolCalls : null
    const ctxCols = warnColors(ctxFrac, CONTEXT_AMBER, CONTEXT_RED)
    const tokSum = r.tokensIn + r.tokensOut
    const codeSum = linesAdded + linesRemoved
    // Calls per minute, read at the minute, so the chart moves once a minute or with a new call.
    const minuteNow = Math.floor(now / 60_000) * 60_000 + 59_999
    const tileSpec: Array<{ key: string; pic: string; level: number | null; color: string; rest?: string; valueHtml?: string; title: string }> = [
      { key: 'elapsed', pic: clock(span ? step5(elapsed / span) : null, moving), level: span ? step5(elapsed / span) : null, color: P_BLUE, title: tr('Laufzeit im Verhältnis zur geschätzten Gesamtdauer', 'Elapsed against the estimated total') },
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
    const summary = !active && r.status === 'done' && r.tasks.length > 0 ? summaryOf(r, runUsd) : null
    // With the summary on screen, the overview keeps only what the summary does not show.
    const SUMMARY_KEEPS = new Set(['context', 'tokens'])
    const shownIdx = overview.map((_, k) => k).filter(k => !summary || SUMMARY_KEEPS.has(tileSpec[k]!.key))
    const overviewShown = shownIdx.map(k => overview[k]!)
    const tileItems: Tile[] = shownIdx.map(k => {
      const [label, value, color] = overview[k]!
      const spec = tileSpec[k]!
      return { ...spec, label: label.split(' ').slice(1).join(' '), value, valueColor: color }
    })
    const tiles = Svg
      ? memo('tiles', JSON.stringify([tileItems, drawWidth]), () => {
          const t = buildTiles(tileItems, drawWidth, Math.min(3, tileItems.length))
          return { ...t, source: phaseLock(t.source, now) }
        })
      : null
    const summaryPic = summary && Svg ? memo('summary', JSON.stringify([summary, drawWidth, r.tasks.length, r.endedAt]), () => buildSummary(r, summary, drawWidth)) : null

    // ── Now: the current step, its time and estimate, the last error ──
    const nowLine = curTask
      ? curTask.active || curTask.title
      : r.status === 'done'
        ? tr('Auftrag abgeschlossen', 'Task complete')
        : r.prompt
          ? r.prompt.replace(/\s+/g, ' ').slice(0, 140)
          : tr('Warte auf den nächsten Auftrag', 'Waiting for the next task')
    const nowMeta =
      curTask && curTask.startedAt && active
        ? `${tr('Würfel', 'Cube')} ${cubeNo(cur)} · ${tr('seit', 'for')} ${fmtDuration(now - curTask.startedAt)} · ${tr('ca.', 'about')} ${Math.floor(stepProgress(r, cur, now) * 100)} %`
        : ''

    const details = sel >= 0 ? cubeDetails(blockEls, { r, i: sel, now, usd, cur, active, limits }) : null

    const ticker = r.calls.slice(-5).reverse()
    // NOW, AGENTS and LIVE as drawings, each made anew only when what it shows changes.
    const lastKind = (agentId: string) => [...r.calls].reverse().find(c => c.agentId === agentId)?.kind ?? null
    const nowState: NowInfo['state'] = r.status === 'waiting' ? 'waiting' : curTask && active ? 'running' : r.status === 'done' ? 'done' : 'idle'
    const nowColor = { running: PALETTE.running[1], waiting: PALETTE.waiting[1], done: PALETTE.done[1], idle: PALETTE.pending[1] }[nowState]
    const nowInfo: NowInfo = {
      cube: curTask && active ? cubeNo(cur) : '',
      color: nowColor,
      title: nowLine,
      sub:
        curTask && curTask.startedAt && active
          ? `${tr('Würfel', 'Cube')} ${cubeNo(cur)} · ${tr('seit', 'for')} ${fmtMinutes(now - curTask.startedAt)} · ${tr('ca.', 'about')} ${Math.round((step5(stepProgress(r, cur, now)) ?? 0) * 100)} %`
          : r.status === 'done'
            ? `${r.tasks.length} ${tr('Würfel', 'cubes')} · ${fmtDuration(elapsed)}`
            : '',
      progress: curTask && active ? step5(stepProgress(r, cur, now)) : null,
      agents: [
        ...(active && curTask ? [{ letter: 'H', color: MAIN_COLOR }] : []),
        ...r.agents
          .map((a, k) => ({ a, k }))
          .filter(({ a }) => a.status === 'running' && a.taskIndex === cur)
          .map(({ a, k }) => ({ letter: agentInitial(a.name), color: agentColor(k) })),
      ].slice(0, 4),
      state: nowState,
    }
    const agentInfos: AgentInfo[] = [
      {
        letter: 'H',
        color: active ? MAIN_COLOR : PALETTE.pending[2],
        name: tr('Hauptagent', 'Main agent'),
        where: active ? `→ ${tr('Würfel', 'Cube')} ${r.tasks.length > 0 ? (cur >= 0 ? cubeNo(cur) : '–') : '01'}` : '',
        doing: active ? r.mainTool || tr('denkt nach', 'thinking') : tr('inaktiv', 'idle'),
        kind: active && r.mainTool ? lastKind('') : null,
        status: active ? 'running' : 'idle',
      },
      ...r.agents
        .map((a, k) => ({ a, k }))
        .slice(-6)
        .map(({ a, k }): AgentInfo => ({
          letter: agentInitial(a.name),
          color: a.status === 'running' ? agentColor(k) : PALETTE[a.status][1],
          name: a.name,
          where: `→ ${tr('Würfel', 'Cube')} ${r.tasks.length > 0 ? cubeNo(a.taskIndex) : '01'}`,
          doing: a.status === 'running' ? a.tool || tr('denkt nach', 'thinking') : STATUS_LABEL[a.status],
          kind: a.status === 'running' && a.tool ? lastKind(a.id) : null,
          status: a.status,
        })),
    ]
    const callInfos: CallInfo[] = ticker.map(c => {
      const who = whoCalled(r, c.agentId)
      return { kind: c.kind, status: c.status, letter: who.letter, color: who.color, tool: c.tool, detail: c.detail }
    })
    const lock = <T extends { source: string }>(b: T): T => ({ ...b, source: phaseLock(b.source, now) })
    const nowPic = Svg ? memo('now', JSON.stringify([nowInfo, drawWidth, moving]), () => lock(buildNow(nowInfo, drawWidth, moving))) : null
    const agentsPic = Svg ? memo('agents', JSON.stringify([agentInfos, drawWidth, moving]), () => lock(buildAgents(agentInfos, drawWidth, moving))) : null
    const livePic = Svg && callInfos.length > 0 ? memo('live', JSON.stringify([callInfos, drawWidth, moving]), () => lock(buildLive(callInfos, drawWidth, moving))) : null
    const skinPicker = Select ? (
      <Select
        key="skin"
        label="Skin"
        value={skin.id}
        options={SKINS.map(s => ({ value: s.id, label: s.id === 'classic' ? tr('Klassisch', 'Classic') : s.id === 'factory' ? tr('Roboterfabrik', 'Robot factory') : s.name }))}
        onSelect={value => pickSkin(value)}
      />
    ) : (
      <Text dimColor>Skin: {skin.name}</Text>
    )

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        {/* Head: progress figure, status, skin */}
        <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end">
          <Box flexDirection="column">
            <Text size="title" weight="bold" tabular>
              {pct !== null ? `${pct} %` : '–'}
            </Text>
            <Text dimColor>
              {prog ? tr(`${prog.done} von ${prog.total} Würfeln erledigt`, `${prog.done} of ${prog.total} cubes done`) : tr('Noch kein Plan: 1 Würfel für den ganzen Auftrag', 'No plan yet: 1 cube for the whole task')}
            </Text>
          </Box>
          <Box flexDirection="column" alignItems="flex-end" gap={0}>
            <Text weight="semibold" color={runColor}>
              ● {RUN_LABEL[r.status]}
            </Text>
            {skinPicker}
          </Box>
        </Box>
        <Progress
          label="Fortschritt"
          {...(prog && overall !== null ? { value: overall, max: 1, valueText: `${prog.done}/${prog.total}` } : {})}
          color={runColor}
        />

        {/*
          One status line that is always there and always one row high, so the drawing
          below never moves when a question or a stuck step comes and goes.
        */}
        <Box key="alert-line" flexDirection="row" gap={1}>
          <Text color={alert.color} weight={alert.strong ? 'semibold' : 'regular'} dimColor={!alert.strong}>
            {alert.text}
          </Text>
        </Box>

        {svg && Svg ? (
          <Box flexDirection="row" justifyContent="center">
            <Svg source={svg.source} alt={svg.alt} width={svg.width} height={svg.height} isInteractive={!active} />
          </Box>
        ) : (
          <Text>{r.tasks.map(t => (t.status === 'done' ? '■' : t.status === 'running' ? '▣' : '□')).join(' ')}</Text>
        )}

        {/* 0. Once a task is finished: its summary, ready to copy as Markdown */}
        {summary &&
          card(
            blockEls,
            'card-summary',
            tr('ZUSAMMENFASSUNG', 'SUMMARY'),
            <Box flexDirection="column" gap={1}>
              {summaryPic && Svg ? (
                <Svg key="sum-pic" source={summaryPic.source} alt={summaryPic.alt} width={summaryPic.width} height={summaryPic.height} isInteractive={!active} />
              ) : figures(
                blockEls,
                'sum',
                [
                  [tr('Schritte', 'Steps'), `${summary.done} / ${summary.steps}`],
                  [tr('Dauer', 'Time'), fmtDuration(summary.ms)],
                  [tr('Wartezeit', 'Waiting'), summary.waitMs > 0 ? `≈ ${fmtDuration(summary.waitMs)}` : '–'],
                  [tr('Subagents', 'Subagents'), String(summary.agents)],
                  [tr('Code', 'Code'), `+${summary.added} −${summary.removed}`],
                  [
                    tr('Tests', 'Tests'),
                    summary.testsPassed + summary.testsFailed > 0 ? `${summary.testsPassed} ✓ ${summary.testsFailed} ✕` : '–',
                    summary.lastTest === 'fail' ? PALETTE.error[1] : undefined,
                  ],
                ],
                3,
              )}
            </Box>,
            <Button key="copy-summary" variant="secondary" onPress={copySummary}>
              {tr('Als Markdown kopieren', 'Copy as Markdown')}
            </Button>,
          )}

        {/* 1. Overview */}
        {card(
          blockEls,
          'card-overview',
          tr('ÜBERSICHT', 'OVERVIEW'),
          <Box flexDirection="column" gap={1}>
            {gauges && Svg && (
              <Box flexDirection="row" justifyContent="center">
                <Svg source={gauges.source} alt={gauges.alt} width={gauges.width} height={gauges.height} isInteractive={!active} />
              </Box>
            )}
            {tiles && Svg ? (
              <Svg key="ov-tiles" source={tiles.source} alt={tiles.alt} width={tiles.width} height={tiles.height} isInteractive={!active} />
            ) : (
              figures(blockEls, 'ov', overviewShown, 3)
            )}
            {left !== null && !exp.isMeasured && (
              <Text size="footnote" dimColor>
                {tr(
                  `* Restzeit geschätzt aus ${hist.length > 0 ? 'früheren Aufträgen' : 'Standardwerten'}, bis der erste Würfel fertig ist.`,
                  `* Time left estimated from ${hist.length > 0 ? 'earlier tasks' : 'defaults'} until the first cube is done.`,
                )}
              </Text>
            )}
          </Box>,
        )}

        {/* 2. Now */}
        {card(
          blockEls,
          'card-now',
          tr('JETZT', 'NOW'),
          <Box flexDirection="column" gap={1}>
            {nowPic && Svg ? (
              <Svg key="now-pic" source={nowPic.source} alt={nowPic.alt} width={nowPic.width} height={nowPic.height} isInteractive={!active} />
            ) : (
              <Box flexDirection="column" gap={0}>
                <Text weight="medium">{nowLine}</Text>
                {nowMeta && (
                  <Text size="caption" dimColor>
                    {nowMeta}
                  </Text>
                )}
              </Box>
            )}
            {r.lastError && (
              <Text size="footnote" color={PALETTE.error[1]}>
                {tr('Letzter Fehler', 'Last error')}: {r.lastError}
              </Text>
            )}
          </Box>,
        )}

        {/* 3. Agents: avatars with what they do; a button each opens its transcript */}
        {card(
          blockEls,
          'card-agents',
          'AGENTS',
          agentsPic && Svg ? (
            <Box flexDirection="column" gap={1}>
              <Svg key="agents-pic" source={agentsPic.source} alt={agentsPic.alt} width={agentsPic.width} height={agentsPic.height} isInteractive={!active} />
              <Box flexDirection="row" flexWrap="wrap" gap={1}>
                <Button key="view-main" variant="secondary" onPress={() => viewAgent(undefined)}>
                  {`↗ ${tr('Hauptagent', 'Main agent')}`}
                </Button>
                {r.agents.slice(-6).map(a => (
                  <Button key={`view-${a.id}`} variant="secondary" onPress={() => viewAgent(a.id)}>
                    {`↗ ${a.name.length > 18 ? a.name.slice(0, 17) + '…' : a.name}`}
                  </Button>
                ))}
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column" gap={0}>
              {agentRow(blockEls, {
                key: 'view-main',
                letter: 'H',
                color: active ? MAIN_COLOR : PALETTE.pending[2],
                name: tr('Hauptagent', 'Main agent'),
                where: agentInfos[0]!.where,
                doing: agentInfos[0]!.doing,
                dim: !active,
                onView: () => viewAgent(undefined),
              })}
              {r.agents.slice(-6).map((a, k) => {
                const info = agentInfos[k + 1]!
                return agentRow(blockEls, {
                  key: `view-${a.id}`,
                  letter: info.letter,
                  color: info.color,
                  name: a.name,
                  where: info.where,
                  doing: info.doing,
                  dim: a.status !== 'running',
                  onView: () => viewAgent(a.id),
                })
              })}
            </Box>
          ),
        )}

        {/* 4. Live: the latest calls */}
        {ticker.length > 0 &&
          card(
            blockEls,
            'card-live',
            'LIVE',
            livePic && Svg ? (
              <Svg key="live-pic" source={livePic.source} alt={livePic.alt} width={livePic.width} height={livePic.height} isInteractive={!active} />
            ) : (
              <Box flexDirection="column" gap={0}>
                {ticker.map(c => {
                  const who = whoCalled(r, c.agentId)
                  return (
                    <Box key={`tick-${c.id}`} flexDirection="row" gap={1}>
                      <Text color={callColor(c)}>{glyphOf(c.status)}</Text>
                      <Text color={who.color} weight="bold">
                        {who.letter}
                      </Text>
                      <Box width={10}>
                        <Text mono color={KIND_COLOR[c.kind]}>
                          {c.tool}
                        </Text>
                      </Box>
                      <Box flexGrow={1} flexShrink={1}>
                        <Text dimColor>{c.detail}</Text>
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            ),
          )}

        {/* 5. Cubes: pick one for its details */}
        {r.tasks.length > 0 &&
          card(
            blockEls,
            'card-cubes',
            tr('WÜRFEL-DETAILS', 'CUBE DETAILS'),
            <Box flexDirection="column" gap={1}>
              <Box flexDirection="row" flexWrap="wrap" gap={1}>
                {r.tasks.map((_t, i) => (
                  <Button
                    key={`cube-${i}`}
                    variant={sel === i ? 'primary' : 'secondary'}
                    // Keys 1–9 open the first nine cubes while the panel has the keyboard.
                    {...(i < 9 ? { hotkey: String(i + 1) } : {})}
                    onPress={() => update($, selected, s => (s === i ? -1 : i))}
                  >
                    {cubeNo(i)}
                  </Button>
                ))}
              </Box>
              {details}
            </Box>,
          )}

        {/* 6. Statistics across runs, folded */}
        {stats2 && statsCard(blockEls, stats2, statsOpen, () => update($, statsOpenAtom, open => !open))}

        {/* Footer: legend and export */}
        <Box flexDirection="column" gap={0}>
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {(['pending', 'running', 'done', 'waiting', 'error'] as CubeStatus[]).map(s => (
              <Box key={`lg-${s}`} flexDirection="row" gap={1}>
                <Text color={PALETTE[s][1]}>●</Text>
                <Text size="caption" dimColor>
                  {STATUS_LABEL[s]}
                </Text>
              </Box>
            ))}
          </Box>
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {KINDS.map(k => (
              <Box key={`lk-${k}`} flexDirection="row" gap={1}>
                <Text color={KIND_COLOR[k]}>■</Text>
                <Text size="caption" dimColor>
                  {KIND_LABEL[k]}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
          <Button key="export" variant="secondary" onPress={exportSvg}>
            {tr('Als Bild speichern', 'Save as image')}
          </Button>
          {hist.length > 0 && (
            <Button key="export-data" variant="secondary" onPress={exportData}>
              {tr('Daten exportieren (CSV/JSON)', 'Export data (CSV/JSON)')}
            </Button>
          )}
          {savedTo && (
            <Text size="footnote" dimColor>
              {tr('Gespeichert', 'Saved')}: {savedTo}
            </Text>
          )}
        </Box>
      </Box>
    )
  })
}
