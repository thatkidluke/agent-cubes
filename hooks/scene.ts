/**
 * The scene: what the drawings show, whatever draws them. Each step of the run
 * becomes a `Big` (its status, how full it is, who works on it, what just
 * happened to it), and long plans fold runs of steps into stacks. The cubes
 * and the circuit board both draw from here.
 */
import type { CallKind, CubeCall, CubeRun, CubeStatus } from '../types'
import type { WorkKind } from './model'
import { blockersOf, currentTaskIndex, isActive, isWorked, stepProgress, stuckReason, unlockedRecently } from './model'
import { classic } from './skins/classic'
import type { MiniKind } from './skins/types'
import { fmtDuration } from './panel/format'
import { tr } from './i18n'

/** Status colours for the panel's text (the classic skin's): top, front, side. */
export const PALETTE: Record<CubeStatus, [string, string, string]> = classic.status

/** Status words, read in the current language each time. */
export const STATUS_LABEL: Record<CubeStatus, string> = {
  get pending() { return tr('offen', 'open') },
  get running() { return tr('läuft', 'running') },
  get done() { return tr('erledigt', 'done') },
  get error() { return tr('Fehler', 'error') },
  get waiting() { return tr('wartet auf dich', 'waiting for you') },
}

export const KIND_COLOR: Record<CallKind, string> = {
  read: '#3b82f6',
  write: '#f59e0b',
  run: '#8b5cf6',
  agent: '#14b8a6',
  other: '#94a3b8',
}

/** The summaries' finer kinds of work: the call kinds' colours and three more. */
export const WORK_COLOR: Record<WorkKind, string> = { ...KIND_COLOR, browser: '#ec4899', plan: '#84cc16', tools: '#06b6d4' }

/** The main agent's marker color, then one per subagent in spawn order. */
export const MAIN_COLOR = '#818cf8'
const AGENT_COLORS = ['#f472b6', '#22d3ee', '#fb923c', '#a3e635', '#c084fc', '#facc15', '#2dd4bf', '#f87171']
export const agentColor = (index: number) => AGENT_COLORS[index % AGENT_COLORS.length] ?? MAIN_COLOR
const GENERIC = new Set(['pixel', 'art', 'agent', 'subagent', 'the', 'a', 'an', 'run', 'do', 'make', 'create', 'build', 'write', 'erstelle', 'baue', 'der', 'die', 'das', 'ein', 'eine'])
/** The first letter of the first telling word: "Pixel art ramp and FX" → "R". */
export function agentInitial(name: string): string {
  const words = name.split(/[^A-Za-z0-9ÄÖÜäöüß]+/).filter(Boolean)
  const word = words.find(w => !GENERIC.has(w.toLowerCase())) ?? words[0] ?? '?'
  return (word[0] ?? '?').toUpperCase()
}

/** Small cubes per edge: N³ slots per big cube. */
export const N = 3
export const SLOTS = N * N * N
/** How long a cube counts as just finished. */
const JUST_DONE_MS = 4000
/** How long the newest mini cube takes to land, an agent to fly over, a padlock to spring open. */
const LAND_MS = 1500
const FLY_MS = 1200
const UNLOCK_MS = 3000

/** An agent's badge; `from` is the step it is flying over from just now, or -1. */
export type Badge = { color: string; letter: string; title: string; isLive: boolean; from: number }

/** One step: a glass cube filling as it progresses, or a solid finished one. */
export type Big = {
  /** The step's index (the first step's, for a stack of folded steps). */
  index: number
  /** Where the cube stands on the pedestal: 0, 1, 2… left to right. Differs from `index` once steps are folded. */
  pos: number
  /** The plaque's text: "03", or "01–06" for a stack. */
  label: string
  /** How many steps this cube stands for: 1, or more for a stack. */
  count: number
  /** The step's own title, without the status. */
  name: string
  kind: 'glass' | 'solid'
  status: CubeStatus
  /** Mini cubes showing, from the step's estimated progress. */
  fill: number
  isLive: boolean
  isGhost: boolean
  /** Finished within the last few seconds: plays a one-shot completion effect. */
  justDone: boolean
  stuck: string
  blockedBy: number[]
  added: number
  removed: number
  test: '' | 'pass' | 'fail'
  title: string
  badges: Badge[]
  /** The text under the plaque: a duration, a percentage, or a dash. */
  caption: string
  /** The look of each mini cube in fill order: the kind of call it stands for, or an error. */
  kinds: MiniKind[]
  errors: number
  /** A call of this step ended just now: its newest mini cube drops in. */
  landing: boolean
  /** A step it waited for finished just now: the padlock springs open. */
  unlocked: boolean
}

/**
 * Which call each of `fill` mini cubes stands for: the step's calls spread
 * evenly over the cubes, in order, so the pile reads like the step's history.
 */
function miniKinds(calls: CubeCall[], fill: number): MiniKind[] {
  if (calls.length === 0) return Array.from({ length: fill }, () => 'other')
  return Array.from({ length: fill }, (_, k) => {
    const c = calls[Math.min(calls.length - 1, Math.floor((k * calls.length) / fill))]
    return !c ? 'other' : c.status === 'error' ? 'err' : c.kind
  })
}


export function layout(r: CubeRun, now: number): Big[] {
  const isWaiting = r.status === 'waiting'
  const active = isActive(r)
  const cur = currentTaskIndex(r)
  const hasPlan = r.tasks.length > 0
  const mainIndex = hasPlan ? cur : 0

  const steps = hasPlan
    ? r.tasks.map((t, i) => ({
        title: t.title,
        status: t.status as CubeStatus,
        calls: t.calls,
        worked: isWorked(r, i),
        progress: stepProgress(r, i, now),
        took: t.status === 'done' && t.startedAt && t.endedAt > t.startedAt ? t.endedAt - t.startedAt : 0,
        justDone: t.status === 'done' && t.endedAt > 0 && now - t.endedAt < JUST_DONE_MS,
        stuck: stuckReason(r, i, now),
        blockedBy: blockersOf(r, i),
        added: t.added,
        removed: t.removed,
        test: t.lastTest,
        errors: t.errors,
        callList: r.calls.filter(c => c.taskIndex === i),
        unlocked: unlockedRecently(r, i, now, UNLOCK_MS),
      }))
    : [
        {
          title: tr('Auftrag', 'Task'),
          status: (r.status === 'done' ? 'done' : r.status === 'error' ? 'error' : active ? 'running' : 'pending') as CubeStatus,
          calls: r.toolCalls,
          worked: active,
          progress: r.status === 'done' ? 1 : active ? 0.96 * (1 - Math.exp(-r.toolCalls / 15)) : 0,
          took: r.status === 'done' && r.endedAt > r.startedAt ? r.endedAt - r.startedAt : 0,
          justDone: r.status === 'done' && r.endedAt > 0 && now - r.endedAt < JUST_DONE_MS,
          stuck: '',
          blockedBy: [] as number[],
          added: 0,
          removed: 0,
          test: '' as '' | 'pass' | 'fail',
          errors: r.errors,
          callList: r.calls,
          unlocked: false,
        },
      ]

  // The main agent moved on just now: from the step finished last to the one it starts.
  const curStart = hasPlan && cur >= 0 ? (r.tasks[cur]?.startedAt ?? 0) : 0
  let mainFrom = -1
  if (active && cur > 0 && curStart > 0 && now - curStart >= 0 && now - curStart < FLY_MS) {
    let best = -1
    r.tasks.forEach((t, j) => {
      if (j !== cur && t.status === 'done' && t.endedAt > 0 && (best < 0 || t.endedAt > (r.tasks[best]?.endedAt ?? 0))) best = j
    })
    mainFrom = best >= 0 ? best : cur - 1
  }
  return steps.map((t, i): Big => {
    const badges: Badge[] = []
    if (active && i === mainIndex) {
      badges.push({ color: MAIN_COLOR, letter: 'H', title: tr('Hauptagent', 'Main agent'), isLive: true, from: mainFrom })
    }
    r.agents.forEach((a, k) => {
      if ((hasPlan ? a.taskIndex : 0) !== i || a.status !== 'running') return
      // A subagent spawned just now flies over from the main agent's step.
      const fresh = a.spawnedAt !== undefined && now - a.spawnedAt >= 0 && now - a.spawnedAt < FLY_MS
      const from = fresh && hasPlan && mainIndex >= 0 && mainIndex !== i ? mainIndex : -1
      badges.push({ color: agentColor(k), letter: agentInitial(a.name), title: `${a.name} (${a.kind})`, isLive: true, from })
    })
    const lastEnd = t.callList.reduce((m, c) => (c.ms && c.at + c.ms > m ? c.at + c.ms : m), 0)
    const worked = t.worked || (t.status === 'pending' && badges.length > 0)
    const status: CubeStatus = worked ? (isWaiting && i === mainIndex ? 'waiting' : 'running') : t.status
    const isSolid = status === 'done' || status === 'error'
    const fill = worked ? Math.max(1, Math.round(t.progress * SLOTS)) : 0
    const pct = Math.round((fill / SLOTS) * 100)
    return {
      index: i,
      pos: i,
      label: pad2(i + 1),
      count: 1,
      name: t.title,
      kind: isSolid ? 'solid' : 'glass',
      status,
      fill,
      isLive: worked && active,
      isGhost: status === 'pending',
      justDone: status === 'done' && t.justDone,
      stuck: t.stuck,
      blockedBy: t.blockedBy,
      added: t.added,
      removed: t.removed,
      test: t.test,
      title: `${tr('Würfel', 'Cube')} ${i + 1} ${tr('von', 'of')} ${steps.length}: ${t.title} (${STATUS_LABEL[status]}${worked ? `, ${tr('ca.', 'about')} ${pct} %` : ''}, ${t.calls} ${tr('Tool-Aufrufe', 'tool calls')})`,
      badges,
      caption: status === 'done' ? (t.took ? fmtDuration(t.took) : '✓') : worked ? `≈ ${pct} %` : status === 'error' ? tr('Fehler', 'Error') : '–',
      kinds: miniKinds(t.callList, Math.min(fill, SLOTS)),
      errors: t.errors,
      landing: worked && active && lastEnd > 0 && now - lastEnd >= 0 && now - lastEnd < LAND_MS,
      unlocked: t.unlocked,
    }
  })
}

const pad2 = (v: number) => String(v).padStart(2, '0')

/** At most this many cubes are drawn; more fold trailing pending (then other) runs too. */
export const MAX_POS = 12
/** From this many cubes on they stand in two rows, the earlier steps in the back row; up to this many in all. */
export const TWO_ROWS_FROM = 8
export const MAX_POS_TWO_ROWS = 16

/** Many steps folded into one stacked cube: a range on the plaque, the count below, every title in the tooltip. */
function stackOf(members: Big[], total: number): Big {
  const first = members[0]!
  const last = members[members.length - 1]!
  const label = `${pad2(first.index + 1)}–${pad2(last.index + 1)}`
  const sum = (f: (b: Big) => number) => members.reduce((s, b) => s + f(b), 0)
  const done = first.status === 'done'
  return {
    ...first,
    label,
    count: members.length,
    name: members.map(m => m.name).join('; '),
    fill: 0,
    isLive: false,
    justDone: members.some(m => m.justDone),
    stuck: members.find(m => m.stuck)?.stuck ?? '',
    blockedBy: [...new Set(members.flatMap(m => m.blockedBy))],
    added: sum(m => m.added),
    removed: sum(m => m.removed),
    test: [...members].reverse().find(m => m.test)?.test ?? '',
    title:
      `${tr('Würfel', 'Cube')} ${label} ${tr('von', 'of')} ${total}: ${members.length} ${tr('Schritte', 'steps')} ${STATUS_LABEL[first.status]}` +
      members.map(m => `\n${pad2(m.index + 1)} ${m.name}`).join(''),
    badges: members.flatMap(m => m.badges),
    caption: `${members.length} ${done ? '✓' : '○'}`,
    kinds: [],
    errors: sum(m => m.errors),
    landing: false,
    unlocked: false,
  }
}

/**
 * Folding: with more steps than there are places, the leading run of finished steps
 * (all but the last of them) folds into one stacked cube; if more than
 * MAX_POS cubes are left, the trailing pending run folds too (all but its
 * first), then other runs of finished or pending steps, longest first.
 * Every cube gets its position `pos`; `index` stays the step's.
 */
export function fold(bigs: Big[], maxPos = MAX_POS): Big[] {
  const n = bigs.length
  // Nothing folds while every cube has a place of its own.
  if (n <= maxPos) return bigs
  const runs: [number, number][] = []
  const taken = new Array<boolean>(n).fill(false)
  const take = (a: number, b: number) => {
    runs.push([a, b])
    for (let i = a; i < b; i++) taken[i] = true
  }
  const firstOpen = bigs.findIndex(b => b.status !== 'done')
  const keep = (firstOpen < 0 ? n : firstOpen) - 1
  if (keep >= 2) take(0, keep)
  let positions = n - runs.reduce((s, [a, b]) => s + b - a - 1, 0)
  const foldable = (b: Big | undefined, status: CubeStatus) => !!b && b.status === status && b.badges.length === 0
  if (positions > maxPos) {
    let s = n
    while (s > 0 && !taken[s - 1] && foldable(bigs[s - 1], 'pending')) s--
    const from = Math.max(s + 1, n - (positions - maxPos + 1))
    if (n - from >= 2) {
      take(from, n)
      positions -= n - from - 1
    }
  }
  while (positions > maxPos) {
    let best: [number, number] | null = null
    for (const status of ['done', 'pending'] as const) {
      for (let i = 0; i < n; ) {
        if (taken[i] || !foldable(bigs[i], status)) {
          i++
          continue
        }
        let j = i
        while (j < n && !taken[j] && foldable(bigs[j], status)) j++
        if (j - i >= 2 && (!best || j - i > best[1] - best[0])) best = [i, j]
        i = j
      }
    }
    if (!best) break
    take(best[0], best[1])
    positions -= best[1] - best[0] - 1
  }
  if (runs.length === 0) return bigs
  const out: Big[] = []
  for (let i = 0; i < n; ) {
    const run = runs.find(([a]) => a === i)
    if (run) {
      out.push({ ...stackOf(bigs.slice(run[0], run[1]), n), pos: out.length })
      i = run[1]
    } else {
      out.push({ ...bigs[i]!, pos: out.length })
      i++
    }
  }
  return out
}
/** A small symbol per status on the plaque, so the state does not hang on colour alone. */
export const STATUS_GLYPH: Record<CubeStatus, string> = {
  done: '✓',
  // U+FE0E asks for the plain text glyph, not a coloured emoji.
  running: '▶︎',
  waiting: '⏸︎',
  error: '✕',
  pending: '○',
}
