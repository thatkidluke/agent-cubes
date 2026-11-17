import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { CubeRun, CubeStatus, HistRun } from '../types'
import { buildSvg, KIND_COLOR, MAIN_COLOR, PALETTE, STATUS_LABEL } from './iso'
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
import { BOARD_THEMES, boardThemeById, buildBoard } from './board'
import { buildBoardSummary } from './board-summary'
import { buildGauges, buildTiles, type Tile } from './gauges'
import { agentRow, callColor, card, figures, glyphOf, whoCalled, type Els } from './panel/blocks'
import { cubeDetails, KINDS } from './panel/details'
import { contextFrac, cubeNo, fileStamp, fmtDuration, fmtEta, fmtUsd, joinPath, type ContextLike } from './panel/format'
import { memo, phaseLock } from './svg'
import { overviewOf } from './panel/overview'
import { liveInfoOf } from './panel/live-info'
import { buildAgents, buildLive, buildNow } from './panel/live'
import { readSettings } from './panel/settings'
import { setLang, tr } from './i18n'
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
/** How the task is drawn: as cubes on a pedestal, or as chips on a circuit board. */
const VIEWS = ['cubes', 'board'] as const
type View = (typeof VIEWS)[number]
/** The view the person picked in the panel; '' while they have not, so the defaultView setting applies. */
const viewPick = atom({ plugin: 'agent-cubes', key: 'view' } as const, '')
const VIEW_KEY = 'view'
/** The circuit board's solder mask. */
const boardPick = atom({ plugin: 'agent-cubes', key: 'board' } as const, 'green')
const BOARD_KEY = 'board'


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
    const storedView = await $.store.get(VIEW_KEY).catch(() => undefined)
    if (typeof storedView === 'string' && (VIEWS as readonly string[]).includes(storedView)) await update($, viewPick, () => storedView)
    const storedBoard = await $.store.get(BOARD_KEY).catch(() => undefined)
    if (typeof storedBoard === 'string' && BOARD_THEMES.some(t => t.id === storedBoard)) await update($, boardPick, () => storedBoard)
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
    const view: View = ((await read($, viewPick)) || settings.defaultView) === 'board' ? 'board' : 'cubes'
    const boardTheme = boardThemeById(await read($, boardPick))
    const sceneWidth = isWidget ? 180 : Math.max(260, Math.min(680, cols * 7.5))
    // The board's display also shows cost and time left: in tenths of a dollar and whole minutes, so it stays calm.
    const leftNow = eta(r, now)
    const boardOpts = {
      ...drawOpts,
      theme: boardTheme.id,
      cost: runUsd === null ? null : runUsd < 1 ? fmtUsd(runUsd) : `${runUsd.toFixed(1)}`,
      left: !isActive(r) || leftNow === null ? null : fmtEta(leftNow),
      // The widget gets a tiny board: parts and traces only.
      mini: isWidget,
    }
    const svg = !Svg ? undefined : view === 'board' ? buildBoard(r, sceneWidth, now, sel, boardOpts) : buildSvg(r, sceneWidth, now, sel, skin, drawOpts)

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
        const pic = view === 'board' ? buildBoard(r, 1000, at, -1, { ...boardOpts, mini: false }) : buildSvg(r, 1000, at, -1, skin, drawOpts)
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
    const pickView = async (id: string) => {
      const picked: View = id === 'board' ? 'board' : 'cubes'
      await update($, viewPick, () => picked)
      await $.store.set(VIEW_KEY, picked).catch(() => undefined)
    }
    const pickBoard = async (id: string) => {
      const picked = boardThemeById(id).id
      await update($, boardPick, () => picked)
      await $.store.set(BOARD_KEY, picked).catch(() => undefined)
    }
    const pickSkin = async (id: string) => {
      const picked = skinById(id).id
      await update($, skinPick, () => picked)
      await $.store.set(SKIN_KEY, picked).catch(() => undefined)
    }

    // ── Overview: the figures, the canisters and the tiles ──
    // Every drawing sits centred in the pane, so the scene and the cards below it keep one axis at any pane width.
    const drawWidth = Math.max(240, Math.min(680, cols * 7.5))
    const moving = settings.animations && active
    const { overview, gaugeItems, tileSpec } = overviewOf({ r, now, elapsed, left, exp, waitNow, ctxFrac, runUsd, settings, budgetFrac, costColor, overall, active, moving })
    // Each drawing is made anew only when what it shows changes, its endless animations locked to the clock.
    const gauges =
      Svg && settings.gaugeRow
        ? memo('gauges', JSON.stringify([gaugeItems, drawWidth, moving]), () => {
            const g = buildGauges(gaugeItems, drawWidth, moving)
            return { ...g, source: phaseLock(g.source, now) }
          })
        : null
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
    // The summary follows the view: a test report on a piece of the board, or the ring and bars.
    const summaryPic =
      summary && Svg
        ? memo('summary', JSON.stringify([summary, drawWidth, r.tasks.length, r.endedAt, view, boardTheme.id]), () =>
            view === 'board' ? buildBoardSummary(r, summary, drawWidth, boardTheme.id) : buildSummary(r, summary, drawWidth),
          )
        : null

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
    const { nowInfo, agentInfos, callInfos } = liveInfoOf({ r, now, cur, curTask, active, elapsed, nowLine, ticker })
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

    const viewLabel = (v: View) => (v === 'board' ? tr('Platine', 'Circuit board') : tr('Würfel', 'Cubes'))
    const boardPicker = Select ? (
      <Select
        key="board"
        label={tr('Platine', 'Board')}
        value={boardTheme.id}
        options={BOARD_THEMES.map(t => ({ value: t.id, label: tr(t.name[0], t.name[1]) }))}
        onSelect={value => pickBoard(value)}
      />
    ) : null
    const viewPicker = Select ? (
      <Select key="view" label={tr('Ansicht', 'View')} value={view} options={VIEWS.map(v => ({ value: v, label: viewLabel(v) }))} onSelect={value => pickView(value)} />
    ) : (
      <Text dimColor>
        {tr('Ansicht', 'View')}: {viewLabel(view)}
      </Text>
    )

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        {/* Head: progress figure, status, view and skin */}
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
            <Box flexDirection="row" gap={1} alignItems="center">
              {viewPicker}
              {/* Skins dress the cubes; the board has a look of its own. */}
              {view === 'cubes' && skinPicker}
              {view === 'board' && boardPicker}
            </Box>
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
                <Box key="sum-pic" flexDirection="row" justifyContent="center">
                  <Svg source={summaryPic.source} alt={summaryPic.alt} width={summaryPic.width} height={summaryPic.height} isInteractive={!active} />
                </Box>
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
              <Box key="ov-tiles" flexDirection="row" justifyContent="center">
                <Svg source={tiles.source} alt={tiles.alt} width={tiles.width} height={tiles.height} isInteractive={!active} />
              </Box>
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
              <Box key="now-pic" flexDirection="row" justifyContent="center">
                <Svg source={nowPic.source} alt={nowPic.alt} width={nowPic.width} height={nowPic.height} isInteractive={!active} />
              </Box>
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
              <Box key="agents-pic" flexDirection="row" justifyContent="center">
                <Svg source={agentsPic.source} alt={agentsPic.alt} width={agentsPic.width} height={agentsPic.height} isInteractive={!active} />
              </Box>
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
              <Box key="live-pic" flexDirection="row" justifyContent="center">
                <Svg source={livePic.source} alt={livePic.alt} width={livePic.width} height={livePic.height} isInteractive={!active} />
              </Box>
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
