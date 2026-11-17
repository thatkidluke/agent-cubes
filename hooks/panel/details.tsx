// The details of the cube picked in the WÜRFEL-DETAILS card.
import type { RenderChildren } from 'claude-code'

import type { CubeRun, CubeStatus } from '../../types'
import { agentColor, agentInitial, MAIN_COLOR, PALETTE, STATUS_LABEL, WORK_COLOR } from '../iso'
import { blockersOf, isWorked, stepCost, stepProgress, stuckReason, WORK_KINDS, WORK_LABEL, workOf, type StuckThresholds } from '../model'
import { callColor, figures, glyphOf, whoCalled, type Els } from './blocks'
import { baseName, cubeNo, fmtDuration, fmtTokens, fmtUsd } from './format'
import { tr, unitWord } from '../i18n'

export type DetailsInput = {
  r: CubeRun
  /** The picked cube. */
  i: number
  now: number
  /** The session's cost in USD, when known. */
  usd: number | undefined
  /** The cube the main agent works on, -1 for none. */
  cur: number
  active: boolean
  limits: StuckThresholds
}

export function cubeDetails(els: Els, d: DetailsInput): RenderChildren {
  const { Box, Text } = els
  const { r, i, now, usd, cur, active, limits } = d
  const task = r.tasks[i]
  if (!task) return null
  const calls = r.calls.filter(c => c.taskIndex === i)
  const worked = isWorked(r, i)
  const status: CubeStatus = task.status === 'done' ? 'done' : worked ? (r.status === 'waiting' ? 'waiting' : 'running') : 'pending'
  const took = task.status === 'done' && task.startedAt && task.endedAt > task.startedAt ? task.endedAt - task.startedAt : 0
  const since = worked && task.startedAt ? now - task.startedAt : 0
  const cost = stepCost(r, i, usd)
  const agentsOn = r.agents.map((a, k) => ({ a, k })).filter(({ a }) => a.taskIndex === i)
  const mainOn = calls.some(c => c.agentId === '') || (i === cur && active)
  const byKind = WORK_KINDS.map(k => [k, calls.filter(c => workOf(c) === k).length] as const).filter(([, n]) => n > 0)
  const files = [...new Set(calls.map(c => c.file).filter(Boolean))].slice(-6)
  const recent = calls.slice(-6).reverse()
  const hangs = stuckReason(r, i, now, limits)
  const blockers = blockersOf(r, i)
  const tests = task.testsPassed + task.testsFailed

  const facts: [string, RenderChildren][] = []
  if (mainOn || agentsOn.length > 0) {
    facts.push([
      tr('Agents', 'Agents'),
      <Box key="f-agents" flexDirection="row" flexWrap="wrap" columnGap={2}>
        {mainOn && (
          <Text color={MAIN_COLOR} weight="bold">
            H {tr('Hauptagent', 'Main agent')}
          </Text>
        )}
        {agentsOn.map(({ a, k }) => (
          <Text key={`fa-${a.id}`} color={agentColor(k)} weight="bold">
            {agentInitial(a.name)} {a.name}
          </Text>
        ))}
      </Box>,
    ])
  }
  if (byKind.length > 0) {
    facts.push([
      tr('Arbeit', 'Work'),
      <Box key="f-kinds" flexDirection="row" flexWrap="wrap" columnGap={2}>
        {byKind.map(([k, n]) => (
          <Box key={`fk-${k}`} flexDirection="row" gap={1}>
            <Text color={WORK_COLOR[k]}>■</Text>
            <Text>
              {WORK_LABEL[k]} {n}
            </Text>
          </Box>
        ))}
      </Box>,
    ])
  }
  if (task.added > 0 || task.removed > 0) {
    facts.push([
      tr('Code', 'Code'),
      <Box key="f-code" flexDirection="row" gap={1}>
        <Text tabular color={PALETTE.done[1]}>
          +{task.added}
        </Text>
        <Text tabular color={PALETTE.error[1]}>
          −{task.removed}
        </Text>
      </Box>,
    ])
  }
  if (tests > 0) {
    facts.push([
      tr('Tests', 'Tests'),
      <Text key="f-tests" tabular>
        {task.testsPassed} ✓ {task.testsFailed} ✕{task.lastTest ? ` · ${tr('zuletzt', 'last')} ${task.lastTest === 'pass' ? '✓' : '✕'}` : ''}
      </Text>,
    ])
  }
  if (blockers.length > 0) {
    facts.push([tr('Wartet auf', 'Waits for'), <Text key="f-wait" color={PALETTE.waiting[1]}>{unitWord()} {blockers.map(cubeNo).join(', ')}</Text>])
  }
  if (files.length > 0) facts.push([tr('Dateien', 'Files'), <Text key="f-files" dimColor>{files.map(baseName).join(', ')}</Text>])

  return (
    <Box flexDirection="column" gap={1} borderStyle="round" borderColor="#fbbf24" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text weight="bold">
          {unitWord()} {cubeNo(i)} · {task.title}
        </Text>
        <Text color={PALETTE[status][1]} weight="semibold">
          ● {STATUS_LABEL[status]}
        </Text>
      </Box>
      {hangs && (
        <Text color={PALETTE.error[1]} weight="semibold">
          ⚠ {tr('Hängt', 'Stuck')}: {hangs}
        </Text>
      )}
      {figures(els, 'det', [
        [tr('Dauer', 'Time'), took ? fmtDuration(took) : since ? `${tr('seit', 'for')} ${fmtDuration(since)}` : '–'],
        [tr('Fortschritt', 'Progress'), `≈ ${Math.floor(stepProgress(r, i, now) * 100)} %`],
        ['Tokens', fmtTokens(task.tokens)],
        [tr('Kosten', 'Cost'), cost === null ? '–' : `≈ ${fmtUsd(cost)}`],
        [tr('Tool-Aufrufe', 'Tool calls'), String(task.calls)],
        [tr('Fehler', 'Errors'), String(task.errors), task.errors > 0 ? PALETTE.error[1] : undefined],
      ], 3)}
      {facts.length > 0 && (
        <Box flexDirection="column">
          {facts.map(([label, value]) => (
            <Box key={`fact-${label}`} flexDirection="row" gap={1}>
              <Box width={11}>
                <Text size="caption" dimColor>
                  {label}
                </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                {value}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {recent.length > 0 && (
        <Box flexDirection="column">
          <Text size="caption" dimColor>
            {tr('Letzte Aufrufe', 'Recent calls')}
          </Text>
          {recent.map(c => {
            const who = whoCalled(r, c.agentId)
            return (
              <Box key={`dc-${c.id}`} flexDirection="row" gap={1}>
                <Text color={callColor(c)}>{glyphOf(c.status)}</Text>
                <Text color={who.color} weight="bold">
                  {who.letter}
                </Text>
                <Box width={10}>
                  <Text mono color={WORK_COLOR[workOf(c)]}>
                    {c.tool}
                  </Text>
                </Box>
                <Text dimColor tabular>
                  {c.ms ? `${(c.ms / 1000).toFixed(1)} s` : c.status === 'running' ? tr('läuft', 'running') : ''}
                  {c.detail ? ` · ${c.detail}` : ''}
                </Text>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
