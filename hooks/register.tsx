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
  toHistory,
  toolEnd,
  toolStart,
} from './model'
import { agentRow, callColor, card, figures, glyphOf, whoCalled, type Els, type Figure } from './panel/blocks'
import { cubeDetails, KINDS } from './panel/details'
import { contextFrac, cubeNo, fileStamp, fmtDuration, fmtEta, fmtTokens, fmtUsd, joinPath, type ContextLike } from './panel/format'
import { readSettings } from './panel/settings'
import { statsCard } from './panel/stats'

const PANE = 'agent-cubes'
const TITLE = 'Agent Cubes'
const HISTORY_KEY = 'history'
const HISTORY_MAX = 12

// Change a tag when its value's fields change: older stored values are then read as the initial one.
const run = atom({ plugin: 'agent-cubes', key: 'run' } as const, emptyRun, { shape: 'run-4' })
// The beat carries the meters, so a redraw reads them from state instead of asking the host each time.
const tick = atom({ plugin: 'agent-cubes', key: 'tick' } as const, { beat: 0, usd: null as number | null, ctx: null as number | null }, { shape: 'tick-2' })
const selected = atom({ plugin: 'agent-cubes', key: 'selected' } as const, -1)
const history = atom({ plugin: 'agent-cubes', key: 'history' } as const, [] as HistRun[], { shape: 'hist-1' })
/** The skin the person picked in the panel; '' while they have not, so the defaultSkin setting applies. */
const skinPick = atom({ plugin: 'agent-cubes', key: 'skin' } as const, '')
const exported = atom({ plugin: 'agent-cubes', key: 'exported' } as const, '')
const SKIN_KEY = 'skin'

/** Context fill from which the stats row warns. */
const CONTEXT_WARN = 0.8

/** Whether the STATISTIK section is unfolded. */
const statsOpenAtom = atom({ plugin: 'agent-cubes', key: 'statsOpen' } as const, false)

const RUN_LABEL: Record<CubeRun['status'], string> = {
  idle: 'Bereit',
  running: 'Läuft',
  waiting: 'Wartet auf dich',
  done: 'Fertig',
  error: 'Fehler',
  aborted: 'Abgebrochen',
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
  await update($, tick, t => ({ beat: (t?.beat ?? 0) + 1, usd, ctx }))
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
  const limits = settings.stuck

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cubes', description: 'Zeigt das Agent-Cubes-Panel neben dem Chat' })
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
    return { text: 'Agent-Cubes-Panel geöffnet.' }
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
      await update($, run, r => markWaiting(r ?? emptyRun, id, e.tool))
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
    const warnColor = (frac: number) => (frac >= 0.92 ? PALETTE.error[1] : frac >= CONTEXT_WARN ? PALETTE.waiting[1] : undefined)
    const stuck = r.tasks.map((_t, i) => ({ i, why: stuckReason(r, i, now, limits) })).filter(s => s.why)
    const stats2 = statsFrom(hist)

    const exportSvg = async () => {
      try {
        const at = await $.clock.now()
        const pic = buildSvg(r, 1000, at, -1, skin, drawOpts)
        const path = joinPath(await $.session.cwd(), `agent-cubes-${fileStamp(at)}.svg`)
        await $.fs.write(path, pic.source)
        await update($, exported, () => path)
        $.ui.toast(`Gespeichert: ${path}`)
      } catch (err) {
        $.ui.toast(`Speichern fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
      }
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
    const overview: Figure[] = [
      ['Laufzeit', r.startedAt ? fmtDuration(elapsed) : '–'],
      ['Restzeit', left === null ? '–' : `${fmtEta(left)}${exp.isMeasured ? '' : '*'}`],
      ['Kontext', ctxFrac === null ? '–' : `${Math.round(ctxFrac * 100)} %`, ctxFrac === null ? undefined : warnColor(ctxFrac)],
      ['Fehler', String(r.errors), r.errors > 0 ? PALETTE.error[1] : undefined],
      ['Tokens', `${fmtTokens(r.tokensIn)} ↓ ${fmtTokens(r.tokensOut)} ↑`],
      ['Kosten', runUsd === null ? '–' : `≈ ${fmtUsd(runUsd)}`],
      ['Tool-Aufrufe', String(r.toolCalls)],
      ['Würfel', prog ? `${prog.done} / ${prog.total}` : '1'],
    ]

    // ── Now: the current step, its time and estimate, the last error ──
    const nowLine = curTask
      ? curTask.active || curTask.title
      : r.status === 'done'
        ? 'Auftrag abgeschlossen'
        : r.prompt
          ? r.prompt.replace(/\s+/g, ' ').slice(0, 140)
          : 'Warte auf den nächsten Auftrag'
    const nowMeta =
      curTask && curTask.startedAt && active
        ? `Würfel ${cubeNo(cur)} · seit ${fmtDuration(now - curTask.startedAt)} · ca. ${Math.floor(stepProgress(r, cur, now) * 100)} %`
        : ''

    const details = sel >= 0 ? cubeDetails(blockEls, { r, i: sel, now, usd, cur, active, limits }) : null

    const ticker = r.calls.slice(-5).reverse()
    const skinPicker = Select ? (
      <Select
        key="skin"
        label="Skin"
        value={skin.id}
        options={SKINS.map(s => ({ value: s.id, label: s.name }))}
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
              {prog ? `${prog.done} von ${prog.total} Würfeln erledigt` : 'Noch kein Plan: 1 Würfel für den ganzen Auftrag'}
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

        {/* Things that need attention */}
        {r.status === 'waiting' && (
          <Box borderStyle="round" borderColor={PALETTE.waiting[1]} paddingX={1}>
            <Text color={PALETTE.waiting[1]} weight="semibold">
              ⏸ Wartet auf deine Antwort{r.waitingFor ? `: ${r.waitingFor}` : ''}
            </Text>
          </Box>
        )}
        {stuck.length > 0 && (
          <Box flexDirection="column" borderStyle="round" borderColor={PALETTE.error[1]} paddingX={1}>
            {stuck.map(s => (
              <Text key={`stuck-${s.i}`} color={PALETTE.error[1]} weight="semibold">
                ⚠ Würfel {cubeNo(s.i)} hängt: {s.why}
              </Text>
            ))}
          </Box>
        )}

        {svg && Svg ? (
          <Box flexDirection="row" justifyContent="center">
            <Svg source={svg.source} alt={svg.alt} width={svg.width} height={svg.height} isInteractive />
          </Box>
        ) : (
          <Text>{r.tasks.map(t => (t.status === 'done' ? '■' : t.status === 'running' ? '▣' : '□')).join(' ')}</Text>
        )}

        {/* 1. Overview */}
        {card(
          blockEls,
          'card-overview',
          'ÜBERSICHT',
          <Box flexDirection="column" gap={1}>
            {figures(blockEls, 'ov', overview)}
            {left !== null && !exp.isMeasured && (
              <Text size="footnote" dimColor>
                * Restzeit geschätzt aus {hist.length > 0 ? 'früheren Aufträgen' : 'Standardwerten'}, bis der erste Würfel fertig ist.
              </Text>
            )}
          </Box>,
        )}

        {/* 2. Now */}
        {card(
          blockEls,
          'card-now',
          'JETZT',
          <Box flexDirection="column" gap={0}>
            <Text weight="medium">{nowLine}</Text>
            {nowMeta && (
              <Text size="caption" dimColor>
                {nowMeta}
              </Text>
            )}
            {r.lastError && (
              <Text size="footnote" color={PALETTE.error[1]}>
                Letzter Fehler: {r.lastError}
              </Text>
            )}
          </Box>,
        )}

        {/* 3. Agents */}
        {card(
          blockEls,
          'card-agents',
          'AGENTS',
          <Box flexDirection="column" gap={0}>
            {agentRow(blockEls, {
              key: 'view-main',
              letter: 'H',
              color: active ? MAIN_COLOR : PALETTE.pending[2],
              name: 'Hauptagent',
              where: active ? `→ Würfel ${r.tasks.length > 0 ? (cur >= 0 ? cubeNo(cur) : '–') : '01'}` : '',
              doing: active ? r.mainTool || 'denkt nach' : 'inaktiv',
              dim: !active,
              onView: () => viewAgent(undefined),
            })}
            {r.agents
              .map((a, k) => ({ a, k }))
              .slice(-6)
              .map(({ a, k }) =>
                agentRow(blockEls, {
                  key: `view-${a.id}`,
                  letter: agentInitial(a.name),
                  color: a.status === 'running' ? agentColor(k) : PALETTE[a.status][1],
                  name: a.name,
                  where: `→ Würfel ${r.tasks.length > 0 ? cubeNo(a.taskIndex) : '01'}`,
                  doing: a.status === 'running' ? a.tool || 'denkt nach' : STATUS_LABEL[a.status],
                  dim: a.status !== 'running',
                  onView: () => viewAgent(a.id),
                }),
              )}
          </Box>,
        )}

        {/* 4. Live ticker */}
        {ticker.length > 0 &&
          card(
            blockEls,
            'card-live',
            'LIVE',
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
            </Box>,
          )}

        {/* 5. Cubes: pick one for its details */}
        {r.tasks.length > 0 &&
          card(
            blockEls,
            'card-cubes',
            'WÜRFEL-DETAILS',
            <Box flexDirection="column" gap={1}>
              <Box flexDirection="row" flexWrap="wrap" gap={1}>
                {r.tasks.map((_t, i) => (
                  <Button
                    key={`cube-${i}`}
                    variant={sel === i ? 'primary' : 'secondary'}
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
            Als Bild speichern
          </Button>
          {savedTo && (
            <Text size="footnote" dimColor>
              Gespeichert: {savedTo}
            </Text>
          )}
        </Box>
      </Box>
    )
  })
}
