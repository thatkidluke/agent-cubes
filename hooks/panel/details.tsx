// The details of the cube picked in the WÜRFEL-DETAILS card.
import type { RenderChildren } from 'claude-code'

import type { CallKind, CubeRun, CubeStatus } from '../../types'
import { agentColor, agentInitial, KIND_COLOR, MAIN_COLOR, PALETTE, STATUS_LABEL } from '../iso'
import { blockersOf, isWorked, KIND_LABEL, stepCost, stepProgress, stuckReason, type StuckThresholds } from '../model'
import { callColor, figures, glyphOf, whoCalled, type Els } from './blocks'
import { baseName, cubeNo, fmtDuration, fmtTokens, fmtUsd } from './format'

export const KINDS: CallKind[] = ['read', 'write', 'run', 'agent', 'other']

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
  const byKind = KINDS.map(k => [k, calls.filter(c => c.kind === k).length] as const).filter(([, n]) => n > 0)
  const files = [...new Set(calls.map(c => c.file).filter(Boolean))].slice(-6)
  const recent = calls.slice(-6).reverse()
  const hangs = stuckReason(r, i, now, limits)
  const blockers = blockersOf(r, i)
  const tests = task.testsPassed + task.testsFailed

  const facts: [string, RenderChildren][] = []
  if (mainOn || agentsOn.length > 0) {
    facts.push([
      'Agents',
      <Box key="f-agents" flexDirection="row" flexWrap="wrap" columnGap={2}>
        {mainOn && (
          <Text color={MAIN_COLOR} weight="bold">
            H Hauptagent
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
      'Arbeit',
      <Box key="f-kinds" flexDirection="row" flexWrap="wrap" columnGap={2}>
        {byKind.map(([k, n]) => (
          <Box key={`fk-${k}`} flexDirection="row" gap={1}>
            <Text color={KIND_COLOR[k]}>■</Text>
            <Text>
              {KIND_LABEL[k]} {n}
            </Text>
          </Box>
        ))}
      </Box>,
    ])
  }
  if (task.added > 0 || task.removed > 0) {
    facts.push([
      'Code',
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
      'Tests',
      <Text key="f-tests" tabular>
        {task.testsPassed} ✓ {task.testsFailed} ✕{task.lastTest ? ` · zuletzt ${task.lastTest === 'pass' ? '✓' : '✕'}` : ''}
      </Text>,
    ])
  }
  if (blockers.length > 0) {
    facts.push(['Wartet auf', <Text key="f-wait" color={PALETTE.waiting[1]}>Würfel {blockers.map(cubeNo).join(', ')}</Text>])
  }
  if (files.length > 0) facts.push(['Dateien', <Text key="f-files" dimColor>{files.map(baseName).join(', ')}</Text>])

  return (
    <Box flexDirection="column" gap={1} borderStyle="round" borderColor="#fbbf24" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text weight="bold">
          Würfel {cubeNo(i)} · {task.title}
        </Text>
        <Text color={PALETTE[status][1]} weight="semibold">
          ● {STATUS_LABEL[status]}
        </Text>
      </Box>
      {hangs && (
        <Text color={PALETTE.error[1]} weight="semibold">
          ⚠ Hängt: {hangs}
        </Text>
      )}
      {figures(els, 'det', [
        ['Dauer', took ? fmtDuration(took) : since ? `seit ${fmtDuration(since)}` : '–'],
        ['Fortschritt', `≈ ${Math.floor(stepProgress(r, i, now) * 100)} %`],
        ['Tokens', fmtTokens(task.tokens)],
        ['Kosten', cost === null ? '–' : `≈ ${fmtUsd(cost)}`],
        ['Tool-Aufrufe', String(task.calls)],
        ['Fehler', String(task.errors), task.errors > 0 ? PALETTE.error[1] : undefined],
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
            Letzte Aufrufe
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
                  <Text mono>{c.tool}</Text>
                </Box>
                <Text dimColor tabular>
                  {c.ms ? `${(c.ms / 1000).toFixed(1)} s` : c.status === 'running' ? 'läuft' : ''}
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
