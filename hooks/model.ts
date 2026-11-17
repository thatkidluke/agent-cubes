import type { CallKind, CubeAgent, CubeCall, CubeRun, CubeStatus, CubeTask, HistRun } from '../types'
import { tr } from './i18n'

export const DEFAULT_PRIOR = { calls: 10, ms: 90_000 }

export const emptyRun: CubeRun = {
  status: 'idle',
  prompt: '',
  startedAt: 0,
  endedAt: 0,
  tasks: [],
  agents: [],
  calls: [],
  mainTool: '',
  toolCalls: 0,
  errors: 0,
  lastError: '',
  waitingId: '',
  waitingFor: '',
  tokensIn: 0,
  tokensOut: 0,
  units: 0,
  costAtStart: 0,
  waitMs: 0,
  waitSince: 0,
  waits: [],
  prior: DEFAULT_PRIOR,
}

const MAX_CALLS = 300
const WAITING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

type Args = Record<string, unknown>

export const isActive = (r: CubeRun) => r.status === 'running' || r.status === 'waiting'

/** `mcp__ccd_turn__update_plan` → `update_plan`, `Bash` stays `Bash`. */
export function shortTool(tool: string): string {
  if (!tool.startsWith('mcp__')) return tool
  const parts = tool.split('__')
  return parts[parts.length - 1] ?? tool
}

const READ = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'NotebookRead', 'TaskGet', 'TaskList', 'TaskOutput', 'ToolSearch', 'ListMcpResourcesTool', 'ReadMcpResourceTool'])
const WRITE = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const RUN = new Set(['Bash', 'PowerShell', 'Monitor', 'TaskStop', 'KillShell', 'BashOutput'])
const AGENT = new Set(['Agent', 'Task', 'SendMessage'])

/** Sorts a tool into the kind of work it does. */
export function callKind(tool: string): CallKind {
  if (READ.has(tool)) return 'read'
  if (WRITE.has(tool)) return 'write'
  if (RUN.has(tool)) return 'run'
  if (AGENT.has(tool) || tool.startsWith('mcp__ccd_session')) return 'agent'
  if (tool.startsWith('mcp__')) {
    const name = shortTool(tool).toLowerCase()
    if (/(^|_)(get|list|read|search|query|fetch|find|describe)/.test(name)) return 'read'
    if (/(^|_)(create|update|write|edit|set|delete|add|send|publish)/.test(name)) return 'write'
  }
  return 'other'
}

/** Kinds of work, read in the current language each time. */
export const KIND_LABEL: Record<CallKind, string> = {
  get read() { return tr('Lesen', 'Read') },
  get write() { return tr('Schreiben', 'Write') },
  get run() { return tr('Ausführen', 'Run') },
  get agent() { return tr('Agents', 'Agents') },
  get other() { return tr('Sonstiges', 'Other') },
}

export function currentTaskIndex(r: CubeRun): number {
  return r.tasks.findIndex(t => t.status === 'running')
}

export function progress(r: CubeRun): { done: number; total: number } | null {
  if (r.tasks.length === 0) return null
  return { done: r.tasks.filter(t => t.status === 'done').length, total: r.tasks.length }
}

/** A main-loop turn begins: a new run, unless one is still going. */
export function startRun(
  r: CubeRun,
  prompt: string,
  now: number,
  extra: { costAtStart?: number; prior?: Prior } = {},
): CubeRun {
  if (isActive(r)) return prompt ? { ...r, prompt } : r
  const keepTasks = r.tasks.some(t => t.status !== 'done')
  return {
    ...emptyRun,
    status: 'running',
    prompt: prompt || r.prompt,
    startedAt: now,
    tasks: keepTasks ? r.tasks : [],
    costAtStart: extra.costAtStart ?? 0,
    prior: extra.prior ?? r.prior ?? DEFAULT_PRIOR,
  }
}

function ensureRunning(r: CubeRun, now: number): CubeRun {
  return isActive(r) ? r : startRun(r, '', now)
}

/** The step a loop's work counts towards: a subagent's own step, else the current one. */
function stepOf(r: CubeRun, agentId: string | undefined): number {
  const agent = agentId ? r.agents.find(a => a.id === agentId) : undefined
  if (agent) return agent.taskIndex
  return r.tasks.length > 0 ? currentTaskIndex(r) : -1
}

function fileOf(input: Args | undefined): string {
  if (!input) return ''
  const v = input.file_path ?? input.notebook_path ?? input.path
  return typeof v === 'string' ? v : ''
}

const lineCount = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v.split('\n').length : 0)

/** Lines a call adds and removes, read from its input: Edit, MultiEdit, Write. */
export function diffOf(tool: string, input: Args | undefined): { add: number; del: number } {
  if (!input) return { add: 0, del: 0 }
  if (tool === 'Edit') return { add: lineCount(input.new_string), del: lineCount(input.old_string) }
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    return (input.edits as Args[]).reduce<{ add: number; del: number }>((s, e) => ({ add: s.add + lineCount(e.new_string), del: s.del + lineCount(e.old_string) }), { add: 0, del: 0 })
  }
  if (tool === 'Write') return { add: lineCount(input.content), del: 0 }
  return { add: 0, del: 0 }
}

const TEST_RE =
  /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|npx\s+(?:jest|vitest|mocha|playwright\s+test)|pytest|py\.test|jest|vitest|mocha|go\s+test|cargo\s+(?:test|nextest)|dotnet\s+test|mvn\b[^\n]*\btest|gradlew?\b[^\n]*\btest|phpunit|rspec|plugin\s+test|deno\s+test|ctest|tox)\b/i

/** Does a shell command run a test suite. */
export function isTestCommand(command: string): boolean {
  return TEST_RE.test(command)
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const base = (p: string) => p.split(/[\\/]/).pop() ?? p

/** A short what-it-did for the ticker. */
export function detailOf(tool: string, input: Args | undefined): string {
  if (!input) return ''
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const file = fileOf(input)
  if (file) return base(file)
  if (s('command')) return clip(s('command').replace(/\s+/g, ' ').trim(), 60)
  if (s('pattern')) return clip(s('pattern'), 40)
  if (s('url')) return clip(s('url').replace(/^https?:\/\//, ''), 50)
  if (s('query')) return clip(s('query'), 50)
  if (s('description')) return clip(s('description'), 50)
  if (s('subject')) return clip(s('subject'), 50)
  return ''
}

export function toolStart(
  r0: CubeRun,
  c: { id: string; tool: string; agentId: string | undefined; input?: Args },
  now: number,
): CubeRun {
  const r = ensureRunning(r0, now)
  const isWaiting = WAITING_TOOLS.has(c.tool)
  const idx = stepOf(r, c.agentId)
  const label = shortTool(c.tool)
  return {
    ...r,
    status: isWaiting ? 'waiting' : r.status,
    waitSince: isWaiting && !r.waitSince ? now : r.waitSince,
    waitingId: isWaiting ? c.id : r.waitingId,
    waitingFor: isWaiting ? label : r.waitingFor,
    toolCalls: r.toolCalls + 1,
    calls: [
      ...r.calls,
      {
        id: c.id,
        status: (isWaiting ? 'waiting' : 'running') as CubeStatus,
        tool: label,
        kind: callKind(c.tool),
        agentId: c.agentId ?? '',
        taskIndex: idx,
        at: now,
        ms: 0,
        // The base name only: the full path is never shown and would bloat the stored run.
        file: base(fileOf(c.input)),
        detail: detailOf(c.tool, c.input),
        ...diffOf(c.tool, c.input),
        isTest: (c.tool === 'Bash' || c.tool === 'PowerShell') && isTestCommand(typeof c.input?.command === 'string' ? c.input.command : ''),
      },
    ].slice(-MAX_CALLS),
    tasks: idx < 0 ? r.tasks : r.tasks.map((t, i) => (i === idx ? { ...t, calls: t.calls + 1 } : t)),
    agents: c.agentId ? r.agents.map(a => (a.id === c.agentId ? { ...a, tool: label, calls: a.calls + 1 } : a)) : r.agents,
    mainTool: c.agentId ? r.mainTool : label,
  }
}

export function toolEnd(
  r: CubeRun,
  c: { id: string; tool: string; agentId: string | undefined; isError: boolean; errorText: string },
  now = 0,
): CubeRun {
  const label = shortTool(c.tool)
  const wasWaiting = r.waitingId === c.id
  const call = r.calls.find(x => x.id === c.id)
  const idx = call?.taskIndex ?? -1
  return {
    ...r,
    status: wasWaiting && r.status === 'waiting' ? 'running' : r.status,
    ...(wasWaiting ? closeWait(r, now) : {}),
    waitingId: wasWaiting ? '' : r.waitingId,
    waitingFor: wasWaiting ? '' : r.waitingFor,
    calls: r.calls.map(x =>
      x.id === c.id ? { ...x, status: (c.isError ? 'error' : 'done') as CubeStatus, ms: now && x.at ? Math.max(0, now - x.at) : 0 } : x,
    ),
    tasks:
      idx < 0 || !call
        ? r.tasks
        : r.tasks.map((t, i) => {
            if (i !== idx) return t
            let next = c.isError ? { ...t, errors: t.errors + 1 } : t
            if (!c.isError && (call.add || call.del)) next = { ...next, added: next.added + call.add, removed: next.removed + call.del }
            if (call.isTest) {
              next = c.isError
                ? { ...next, testsFailed: next.testsFailed + 1, lastTest: 'fail' as const }
                : { ...next, testsPassed: next.testsPassed + 1, lastTest: 'pass' as const }
            }
            return next
          }),
    errors: c.isError ? r.errors + 1 : r.errors,
    lastError: c.isError ? `${label}: ${c.errorText || 'Fehler'}`.replace(/\s+/g, ' ').slice(0, 180) : r.lastError,
    agents: c.agentId ? r.agents.map(a => (a.id === c.agentId && a.tool === label ? { ...a, tool: '' } : a)) : r.agents,
    mainTool: !c.agentId && r.mainTool === label ? '' : r.mainTool,
  }
}

/** A permission prompt is shown for this call. */
export function markWaiting(r: CubeRun, id: string, tool: string, now = 0): CubeRun {
  if (!isActive(r)) return r
  return { ...r, status: 'waiting', waitingId: id, waitingFor: shortTool(tool), waitSince: r.waitSince || now }
}

/** Closes the wait that is open, adding its length to the run's waiting time. */
function closeWait(r: CubeRun, now: number): Pick<CubeRun, 'waitMs' | 'waitSince' | 'waits'> {
  if (!r.waitSince || !now || now <= r.waitSince) return { waitMs: r.waitMs ?? 0, waitSince: 0, waits: r.waits ?? [] }
  return {
    waitMs: (r.waitMs ?? 0) + (now - r.waitSince),
    waitSince: 0,
    waits: [...(r.waits ?? []), { start: r.waitSince, end: now }].slice(-50),
  }
}

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/**
 * One model request's tokens, counted to the run and to the step its loop works
 * on. Units weigh tokens by their usual relative price (output 5×, cache
 * writes 1.25×, cache reads 0.1× an input token) to share the run's cost out.
 */
export function addStepUsage(r: CubeRun, agentId: string | undefined, u: Usage | null | undefined): CubeRun {
  if (!u) return r
  const cr = u.cache_read_input_tokens ?? 0
  const cw = u.cache_creation_input_tokens ?? 0
  const tokensIn = u.input_tokens + cr + cw
  const tokens = tokensIn + u.output_tokens
  const units = u.input_tokens + 5 * u.output_tokens + 1.25 * cw + 0.1 * cr
  const idx = stepOf(r, agentId)
  return {
    ...r,
    tokensIn: r.tokensIn + tokensIn,
    tokensOut: r.tokensOut + u.output_tokens,
    units: r.units + units,
    tasks: idx < 0 ? r.tasks : r.tasks.map((t, i) => (i === idx ? { ...t, tokens: t.tokens + tokens, units: t.units + units } : t)),
  }
}

function mapStatus(s: unknown): CubeTask['status'] {
  if (s === 'in_progress') return 'running'
  if (s === 'completed') return 'done'
  return 'pending'
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function newTask(id: string, title: string, active: string, status: CubeTask['status']): CubeTask {
  return {
    id, title, active, status, calls: 0, startedAt: 0, endedAt: 0, tokens: 0, units: 0, errors: 0,
    blockedBy: [], added: 0, removed: 0, testsPassed: 0, testsFailed: 0, lastTest: '',
  }
}

/** Rebuilds a list, keeping what was counted for tasks whose title survived. */
function replaceTasks(r: CubeRun, items: { title: string; active: string; status: CubeTask['status'] }[], prefix: string): CubeTask[] {
  const old = new Map(r.tasks.map(t => [t.title, t]))
  return items.map((t, i) => {
    const was = old.get(t.title)
    return was ? { ...was, id: `${prefix}-${i}`, active: t.active || was.active, status: t.status } : newTask(`${prefix}-${i}`, t.title, t.active, t.status)
  })
}

/**
 * Stamps when each step started and ended: a step that turns running starts
 * now, one that turns done ends now (and, never seen running, starts where the
 * step before it ended).
 */
export function stampTimes(tasks: CubeTask[], now: number): CubeTask[] {
  if (!now) return tasks
  let prevEnd = 0
  return tasks.map(t => {
    let { startedAt, endedAt } = t
    if (t.status === 'running' && !startedAt) startedAt = now
    if (t.status === 'done' && !endedAt) {
      endedAt = now
      if (!startedAt) startedAt = prevEnd || now
    }
    if (t.status !== 'done') endedAt = 0
    if (endedAt) prevEnd = endedAt
    return startedAt === t.startedAt && endedAt === t.endedAt ? t : { ...t, startedAt, endedAt }
  })
}

/** Reads the task-list tools: TodoWrite, TaskCreate/TaskUpdate, the desktop app's plan list. */
export function applyTaskTool(r: CubeRun, tool: string, input: Args, result: unknown, now = 0): CubeRun {
  const next = readTaskTool(r, tool, input, result)
  return next === r ? r : { ...next, tasks: stampTimes(next.tasks, now) }
}

function readTaskTool(r: CubeRun, tool: string, input: Args, result: unknown): CubeRun {
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    const items = (input.todos as Args[]).map(t => ({ title: str(t.content), active: str(t.activeForm), status: mapStatus(t.status) }))
    return { ...r, tasks: replaceTasks(r, items, 'todo') }
  }

  if (tool === 'TaskCreate') {
    const task = (result as { task?: { id?: unknown; subject?: unknown } } | undefined)?.task
    const id = str(task?.id) || `task-${r.tasks.length}`
    if (r.tasks.some(t => t.id === id)) return r
    const title = str(task?.subject) || str(input.subject)
    return { ...r, tasks: [...r.tasks, newTask(id, title, str(input.activeForm), 'pending')] }
  }

  if (tool === 'TaskUpdate') {
    const id = str(input.taskId)
    if (input.status === 'deleted') return { ...r, tasks: r.tasks.filter(t => t.id !== id).map(t => ({ ...t, blockedBy: t.blockedBy.filter(b => b !== id) })) }
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
    const blockedBy = ids(input.addBlockedBy)
    const blocks = ids(input.addBlocks)
    const uniq = (a: string[]) => [...new Set(a)]
    return {
      ...r,
      tasks: r.tasks.map(t => {
        if (t.id === id) {
          return {
            ...t,
            title: str(input.subject) || t.title,
            active: str(input.activeForm) || t.active,
            status: input.status === undefined ? t.status : mapStatus(input.status),
            blockedBy: blockedBy.length ? uniq([...t.blockedBy, ...blockedBy]) : t.blockedBy,
          }
        }
        // "id blocks t" is "t is blocked by id".
        return blocks.includes(t.id) ? { ...t, blockedBy: uniq([...t.blockedBy, id]) } : t
      }),
    }
  }

  if (tool.endsWith('__update_plan')) {
    let tasks = r.tasks
    if (Array.isArray(input.items)) {
      const items = (input.items as Args[]).map(t => ({ title: str(t.content), active: '', status: mapStatus(t.status) }))
      tasks = replaceTasks(r, items, 'plan')
    }
    if (input.advance === true) {
      const cur = tasks.findIndex(t => t.status === 'running')
      const nextIdx = tasks.findIndex((t, i) => i > cur && t.status === 'pending')
      tasks = tasks.map((t, i) => (i === cur ? { ...t, status: 'done' as const } : i === nextIdx ? { ...t, status: 'running' as const } : t))
    }
    if (Array.isArray(input.done)) {
      const done = new Set((input.done as unknown[]).map(n => Number(n) - 1))
      tasks = tasks.map((t, i) => (done.has(i) ? { ...t, status: 'done' as const } : t))
    }
    if (typeof input.start === 'number') {
      const s = input.start - 1
      tasks = tasks.map((t, i) => (i === s ? { ...t, status: 'running' as const } : t))
    }
    return { ...r, tasks }
  }

  // The desktop app's wrap-up checks off the whole list.
  if (tool.endsWith('__wrap_up') && tool.includes('ccd_turn')) {
    return { ...r, tasks: r.tasks.map(t => ({ ...t, status: 'done' as const })) }
  }

  return r
}

const STOP = new Set(['agent', 'subagent', 'the', 'and', 'with', 'from', 'into', 'pixel', 'art', 'und', 'der', 'die', 'das', 'mit', 'für'])
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9äöüß]+/)
      .filter(w => w.length >= 3 && !STOP.has(w)),
  )

/**
 * The step a subagent works on: the plan step whose title shares the most
 * words with the agent's description, preferring steps not yet done; else the
 * current step.
 */
export function matchTask(r: CubeRun, description: string): number {
  const want = words(description)
  let best = -1
  let bestScore = 0
  r.tasks.forEach((t, i) => {
    let score = 0
    for (const w of words(t.title)) if (want.has(w)) score += 2
    if (score > 0 && t.status !== 'done') score += 1
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  })
  if (best >= 0) return best
  const cur = currentTaskIndex(r)
  return cur >= 0 ? cur : Math.max(0, r.tasks.length - 1)
}

export function addAgent(r0: CubeRun, a: { id: string; name: string; kind: string }, now: number): CubeRun {
  const r = ensureRunning(r0, now)
  if (r.agents.some(x => x.id === a.id)) return r
  const taskIndex = matchTask(r, a.name)
  const agent: CubeAgent = { ...a, status: 'running', tool: '', calls: 0, taskIndex, spawnedAt: now }
  // An agent sitting down on a step starts that step's clock.
  const tasks = r.tasks.map((t, i) => (i === taskIndex && !t.startedAt && t.status !== 'done' ? { ...t, startedAt: now } : t))
  return { ...r, tasks, agents: [...r.agents, agent] }
}

export function endAgent(r: CubeRun, id: string, reason: string): CubeRun {
  return {
    ...r,
    agents: r.agents.map(a => (a.id === id ? { ...a, status: reason === 'error' ? ('error' as const) : ('done' as const), tool: '' } : a)),
  }
}

export function endRun(r: CubeRun, reason: string, now: number): CubeRun {
  if (!isActive(r)) return r
  const status = reason === 'aborted' ? 'aborted' : reason === 'error' || reason === 'refusal' ? 'error' : 'done'
  return {
    ...r,
    status,
    endedAt: now,
    ...closeWait(r, now),
    mainTool: '',
    waitingId: '',
    waitingFor: '',
    calls: r.calls.map(c => (c.status === 'running' || c.status === 'waiting' ? { ...c, status: 'done' as const } : c)),
    agents: r.agents.map(a => (a.status === 'running' ? { ...a, status: 'done' as const, tool: '' } : a)),
  }
}

/** What a step usually takes, from earlier runs: overall and per kind of step. */
export type Prior = CubeRun['prior']

/** The kinds of step whose length is learned apart: a test run takes another time than writing code. */
export type StepKind = 'test' | 'review' | 'research' | 'docs' | 'setup' | 'ship' | 'work'

const STEP_KINDS: [StepKind, RegExp][] = [
  ['docs', /(?:^|[^a-zäöü])(?:docs?|readme|changelog|dokument|beschreib|anleitung|guide)/i],
  ['test', /(?:^|[^a-zäöü])(?:tests?|testen|teste|prüf|pruef|verif|check|qa|lint|typecheck|type-check)/i],
  ['review', /(?:^|[^a-zäöü])(?:review|überprüf|ueberpruef|begutacht|feedback|polish|feinschliff|verfeiner|refin|clean ?up|aufräum)/i],
  ['ship', /(?:^|[^a-zäöü])(?:deploy|release|publish|veröffentlich|push|commit|merge|ship|build|bundle|export)/i],
  ['setup', /(?:^|[^a-zäöü])(?:setup|set up|install|einricht|konfig|config|scaffold|grundlage|foundation|vorbereit|prepare)/i],
  ['research', /(?:^|[^a-zäöü])(?:research|recherch|analy|untersuch|investigat|explor|erkund|lies|lesen|read|look|find|such|understand|versteh)/i],
]

/** The kind of a step, read from its title; 'work' when no keyword says otherwise. */
export function stepKind(title: string): StepKind {
  for (const [kind, re] of STEP_KINDS) if (re.test(title)) return kind
  return 'work'
}

/** Calls and time of finished, timed steps, averaged; null without any. */
function averageOf(steps: { calls: number; ms: number }[]): { calls: number; ms: number } | null {
  if (steps.length === 0) return null
  return {
    calls: Math.max(1, steps.reduce((s, t) => s + t.calls, 0) / steps.length),
    ms: steps.reduce((s, t) => s + t.ms, 0) / steps.length,
  }
}

const timedOf = (r: CubeRun) =>
  r.tasks
    .filter(t => t.status === 'done' && t.startedAt && t.endedAt > t.startedAt)
    .map(t => ({ title: t.title, calls: t.calls, ms: t.endedAt - t.startedAt }))

/**
 * What a step is expected to take. For step i, the best evidence first: finished
 * steps of the same kind in this run, then that kind in earlier runs (from two
 * steps on), then every finished step of this run, then earlier runs overall.
 * Without i, the run-wide figure.
 */
export function expected(r: CubeRun, i?: number): { calls: number; ms: number; isMeasured: boolean; basis: 'kind' | 'history-kind' | 'run' | 'prior' } {
  const timed = timedOf(r)
  const prior = r.prior ?? DEFAULT_PRIOR
  const t = i === undefined ? undefined : r.tasks[i]
  if (t) {
    const kind = stepKind(t.title)
    const same = averageOf(timed.filter(x => stepKind(x.title) === kind))
    if (same) return { ...same, isMeasured: true, basis: 'kind' }
    const past = prior.byKind?.[kind]
    if (past && past.n >= 2) return { calls: Math.max(1, past.calls), ms: past.ms, isMeasured: false, basis: 'history-kind' }
  }
  const run = averageOf(timed)
  if (run) return { ...run, isMeasured: true, basis: 'run' }
  return { calls: prior.calls, ms: prior.ms, isMeasured: false, basis: 'prior' }
}

/** Is someone working on step i right now: the plan says so, or a running agent sits on it. */
export function isWorked(r: CubeRun, i: number): boolean {
  const t = r.tasks[i]
  if (!t) return false
  if (t.status === 'running') return true
  return t.status === 'pending' && r.agents.some(a => a.taskIndex === i && a.status === 'running')
}

/**
 * How far step i has come, 0..1. Done is 1, untouched is 0. A step in work is
 * estimated from its tool calls and its time so far against what finished
 * steps take: equal to an average step reads about 75 %, and it never reaches
 * 100 % before the step is checked off.
 */
export function stepProgress(r: CubeRun, i: number, now: number): number {
  const t = r.tasks[i]
  if (!t) return 0
  if (t.status === 'done') return 1
  if (!isWorked(r, i)) return 0
  const exp = expected(r, i)
  const elapsed = t.startedAt && now > t.startedAt ? now - t.startedAt : 0
  const effort = 0.5 * (t.calls / exp.calls) + 0.5 * (elapsed / exp.ms)
  return 0.96 * (1 - Math.exp(-1.4 * effort))
}

/** The whole job's progress, 0..1, counting the estimated part of steps in work. */
export function overallProgress(r: CubeRun, now: number): number | null {
  if (r.tasks.length === 0) return null
  const sum = r.tasks.reduce((s, _t, i) => s + stepProgress(r, i, now), 0)
  return sum / r.tasks.length
}

/**
 * Time left, in ms: steps in work run side by side, so the slowest of them
 * counts once; steps not started follow one after another. Null without a plan
 * or before anything says how long a step takes.
 */
export function eta(r: CubeRun, now: number): number | null {
  if (r.tasks.length === 0 || !isActive(r)) return null
  let inWork = 0
  let pending = 0
  r.tasks.forEach((t, i) => {
    if (t.status === 'done') return
    const exp = expected(r, i)
    if (isWorked(r, i)) {
      const elapsed = t.startedAt ? now - t.startedAt : 0
      inWork = Math.max(inWork, Math.max(exp.ms - elapsed, exp.ms * 0.1))
    } else pending += exp.ms
  })
  return inWork + pending
}

/** The run's cost share of step i, in USD, from the session's cost since the run began. */
export function stepCost(r: CubeRun, i: number, sessionUsd: number | undefined): number | null {
  const t = r.tasks[i]
  if (!t || sessionUsd === undefined || r.units <= 0) return null
  return Math.max(0, sessionUsd - r.costAtStart) * (t.units / r.units)
}

/** The run, kept as one row of history. */
export function toHistory(r: CubeRun, usd: number): HistRun {
  return {
    at: r.startedAt,
    prompt: r.prompt.replace(/\s+/g, ' ').slice(0, 160),
    ms: Math.max(0, (r.endedAt || r.startedAt) - r.startedAt),
    tokens: r.tokensIn + r.tokensOut,
    usd,
    waitMs: r.waitMs ?? 0,
    errors: r.errors,
    calls: r.toolCalls,
    tasks: r.tasks.map(t => ({
      title: t.title,
      ms: t.endedAt > t.startedAt && t.startedAt ? t.endedAt - t.startedAt : 0,
      calls: t.calls,
      tokens: t.tokens,
      errors: t.errors,
    })),
  }
}

/** What a step takes, averaged over past runs' timed steps, overall and per kind; the default without any. */
export function priorFrom(history: HistRun[]): Prior {
  const steps = history.flatMap(h => h.tasks).filter(t => t.ms > 0)
  const all = averageOf(steps)
  if (!all) return DEFAULT_PRIOR
  const byKind: NonNullable<Prior['byKind']> = {}
  for (const kind of new Set(steps.map(t => stepKind(t.title)))) {
    const same = steps.filter(t => stepKind(t.title) === kind)
    const avg = averageOf(same)
    if (avg) byKind[kind] = { ...avg, n: same.length }
  }
  return { ...all, byKind }
}

/** Indices of the unfinished steps that step i waits for. */
/** Whether a step was freed just now: one of the steps it waited for finished within `ms`. */
export function unlockedRecently(r: CubeRun, i: number, now: number, ms: number): boolean {
  const t = r.tasks[i]
  if (!t || t.blockedBy.length === 0 || t.status === 'done') return false
  return t.blockedBy.some(id => {
    const b = r.tasks.find(x => x.id === id)
    return !!b && b.status === 'done' && b.endedAt > 0 && now - b.endedAt >= 0 && now - b.endedAt < ms
  })
}

export function blockersOf(r: CubeRun, i: number): number[] {
  const t = r.tasks[i]
  if (!t || t.blockedBy.length === 0) return []
  return t.blockedBy.map(id => r.tasks.findIndex(x => x.id === id)).filter(j => j >= 0 && r.tasks[j]?.status !== 'done')
}

/** How long a step may stay quiet, or run, before it counts as stuck. */
export const STUCK = {
  /** Failed calls in a row. */
  failsInRow: 3,
  /** The same call (tool and target) in a row. */
  sameInRow: 4,
  /** No call at all for this long while worked on. */
  silentMs: 5 * 60_000,
  /** Running this many times longer than a usual step (and at least minMs). */
  slowFactor: 3,
  minMs: 8 * 60_000,
}

/** The limits stuckReason judges by; the panel builds them from the plugin's settings. */
export type StuckThresholds = { [K in keyof typeof STUCK]: number }

/**
 * Why step i looks stuck, in one short German sentence, or '' when it does not:
 * failures in a row, the same call over and over, long silence, or far longer
 * than a usual step. Only a step being worked on can be stuck. `limits` defaults
 * to STUCK.
 */
export function stuckReason(r: CubeRun, i: number, now: number, limits: StuckThresholds = STUCK): string {
  const t = r.tasks[i]
  if (!t || !isActive(r) || !isWorked(r, i)) return ''
  const calls = r.calls.filter(c => c.taskIndex === i)
  const done = calls.filter(c => c.status === 'done' || c.status === 'error')

  const tail = done.slice(-limits.failsInRow)
  if (tail.length === limits.failsInRow && tail.every(c => c.status === 'error')) {
    const tools = [...new Set(tail.map(c => c.tool))].join('/')
    return tr(`${limits.failsInRow}× hintereinander fehlgeschlagen (${tools})`, `failed ${limits.failsInRow}× in a row (${tools})`)
  }

  const same = calls.slice(-limits.sameInRow)
  const key = (c: CubeCall) => `${c.tool}|${c.detail}`
  if (same.length === limits.sameInRow && same[0] && same.every(c => key(c) === key(same[0]!))) {
    const c = same[0]
    return `${tr(`${limits.sameInRow}× derselbe Aufruf`, `the same call ${limits.sameInRow}×`)}: ${c.tool}${c.detail ? ` ${c.detail}` : ''}`
  }

  const last = calls[calls.length - 1]
  const quietSince = last ? (last.status === 'running' ? 0 : last.at + last.ms) : t.startedAt
  if (quietSince && now - quietSince > limits.silentMs) {
    return tr(`seit ${Math.round((now - quietSince) / 60_000)} Min keine Aktivität`, `no activity for ${Math.round((now - quietSince) / 60_000)} min`)
  }

  const exp = expected(r)
  const elapsed = t.startedAt ? now - t.startedAt : 0
  if (elapsed > Math.max(limits.minMs, limits.slowFactor * exp.ms)) {
    return tr(`läuft ${Math.round(elapsed / exp.ms)}× länger als ein üblicher Schritt`, `running ${Math.round(elapsed / exp.ms)}× longer than a usual step`)
  }
  return ''
}

/** What past runs add up to, for the stats section. */
export type RunStats = {
  runs: number
  avgMs: number
  avgUsd: number
  totalUsd: number
  avgSteps: number
  avgErrors: number
  /** The slowest single step across the history. */
  slowest: { title: string; ms: number } | null
  /** Durations of the last runs, oldest first, for a sparkline. */
  recentMs: number[]
  recentUsd: number[]
}

export function statsFrom(history: HistRun[]): RunStats | null {
  if (history.length === 0) return null
  const sum = (f: (h: HistRun) => number) => history.reduce((s, h) => s + f(h), 0)
  let slowest: RunStats['slowest'] = null
  for (const h of history) for (const t of h.tasks) if (t.ms > (slowest?.ms ?? 0)) slowest = { title: t.title, ms: t.ms }
  const recent = history.slice(-10)
  return {
    runs: history.length,
    avgMs: sum(h => h.ms) / history.length,
    avgUsd: sum(h => h.usd) / history.length,
    totalUsd: sum(h => h.usd),
    avgSteps: sum(h => Math.max(1, h.tasks.length)) / history.length,
    avgErrors: sum(h => h.errors) / history.length,
    slowest,
    recentMs: recent.map(h => h.ms),
    recentUsd: recent.map(h => h.usd),
  }
}


const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`
}

/** The figures of a finished run, for the summary card and its Markdown. */
export type RunSummary = {
  steps: number
  done: number
  ms: number
  waitMs: number
  agents: number
  calls: number
  errors: number
  added: number
  removed: number
  testsPassed: number
  testsFailed: number
  lastTest: '' | 'pass' | 'fail'
  usd: number | null
}

export function summaryOf(r: CubeRun, usd: number | null): RunSummary {
  const sum = (f: (t: CubeTask) => number) => r.tasks.reduce((s, t) => s + f(t), 0)
  const last = [...r.tasks].reverse().find(t => t.lastTest)?.lastTest ?? ''
  return {
    steps: r.tasks.length,
    done: r.tasks.filter(t => t.status === 'done').length,
    ms: Math.max(0, (r.endedAt || r.startedAt) - r.startedAt),
    waitMs: r.waitMs ?? 0,
    agents: r.agents.length,
    calls: r.toolCalls,
    errors: r.errors,
    added: sum(t => t.added),
    removed: sum(t => t.removed),
    testsPassed: sum(t => t.testsPassed),
    testsFailed: sum(t => t.testsFailed),
    lastTest: last,
    usd,
  }
}

/** A Markdown summary of a finished run, for a pull request or a status note. */
export function summaryMarkdown(r: CubeRun, usd: number | null): string {
  const s = summaryOf(r, usd)
  const lines = [
    `### ${tr('Agent Cubes: Zusammenfassung', 'Agent Cubes: summary')}`,
    '',
    r.prompt ? `> ${r.prompt.replace(/\s+/g, ' ').slice(0, 200)}` : '',
    '',
    `| | |`,
    `| --- | --- |`,
    `| ${tr('Schritte', 'Steps')} | ${s.done} / ${s.steps} |`,
    `| ${tr('Dauer', 'Time')} | ${mmss(s.ms)} |`,
    `| ${tr('Wartezeit auf dich', 'Waiting for you')} | ≈ ${mmss(s.waitMs)} |`,
    `| ${tr('Subagents', 'Subagents')} | ${s.agents} |`,
    `| ${tr('Tool-Aufrufe', 'Tool calls')} | ${s.calls} (${s.errors} ${tr('Fehler', 'errors')}) |`,
    `| Code | +${s.added} −${s.removed} |`,
    s.testsPassed + s.testsFailed > 0
      ? `| Tests | ${s.testsPassed} ✓ ${s.testsFailed} ✕${s.lastTest ? ` (${tr('zuletzt', 'last')} ${s.lastTest === 'pass' ? '✓' : '✕'})` : ''} |`
      : '',
    s.usd !== null ? `| ${tr('Kosten', 'Cost')} | ≈ $${s.usd.toFixed(2)} |` : '',
    '',
    `**${tr('Schritte', 'Steps')}**`,
    '',
    ...r.tasks.map((t, i) => {
      const took = t.status === 'done' && t.startedAt && t.endedAt > t.startedAt ? ` · ${mmss(t.endedAt - t.startedAt)}` : ''
      return `${i + 1}. ${t.status === 'done' ? '✓' : '○'} ${t.title}${took}`
    }),
  ]
  return lines.filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n').trim() + '\n'
}

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Every stored run, one row per step, as CSV for a spreadsheet. */
export function historyCsv(history: HistRun[]): string {
  const rows: (string | number)[][] = [
    ['run_started', 'prompt', 'run_ms', 'run_usd', 'run_wait_ms', 'step', 'step_title', 'step_kind', 'step_ms', 'step_calls', 'step_tokens', 'step_errors'],
  ]
  for (const h of history) {
    const started = new Date(h.at).toISOString()
    h.tasks.forEach((t, i) =>
      rows.push([started, h.prompt, h.ms, h.usd.toFixed(4), h.waitMs ?? '', i + 1, t.title, stepKind(t.title), t.ms, t.calls, t.tokens, t.errors]),
    )
    if (h.tasks.length === 0) rows.push([started, h.prompt, h.ms, h.usd.toFixed(4), h.waitMs ?? '', '', '', '', '', h.calls, h.tokens, h.errors])
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n'
}
