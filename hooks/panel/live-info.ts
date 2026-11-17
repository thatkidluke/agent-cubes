/**
 * What the NOW, AGENTS and LIVE drawings show, read from the run: the step in
 * work with its progress and the agents on it, every agent with its cube and
 * tool, and the latest calls. Pure: the same input gives the same infos.
 */
import type { CubeCall, CubeRun, CubeTask } from '../../types'
import { tr } from '../i18n'
import { agentColor, agentInitial, MAIN_COLOR, PALETTE, STATUS_LABEL } from '../iso'
import { stepProgress } from '../model'
import { whoCalled } from './blocks'
import { cubeNo, fmtDuration, fmtMinutes } from './format'
import type { AgentInfo, CallInfo, NowInfo } from './live'
import { step5 } from './overview'

export type LiveInput = {
  r: CubeRun
  now: number
  /** The step in work and its index; -1 and undefined for none. */
  cur: number
  curTask: CubeTask | undefined
  active: boolean
  elapsed: number
  /** The NOW card's headline. */
  nowLine: string
  /** The latest calls, newest first. */
  ticker: CubeCall[]
}

export function liveInfoOf(i: LiveInput): { nowInfo: NowInfo; agentInfos: AgentInfo[]; callInfos: CallInfo[] } {
  const { r, now, cur, curTask, active, elapsed, nowLine, ticker } = i
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
  return { nowInfo, agentInfos, callInfos }
}
