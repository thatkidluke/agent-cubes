export type CubeStatus = 'pending' | 'running' | 'done' | 'error' | 'waiting'

/** What kind of work a tool call is: it tints its silver cube. */
export type CallKind = 'read' | 'write' | 'run' | 'agent' | 'other'
/** The finer kinds a summary tells apart: the call kinds, and browser work, planning and connected tools cut out of them. */
export type WorkKind = CallKind | 'browser' | 'plan' | 'tools'

export type CubeTask = {
  id: string
  title: string
  active: string
  status: 'pending' | 'running' | 'done'
  calls: number
  /** When work on the step began / it was checked off, in $.clock.now() ms; 0 when not yet. */
  startedAt: number
  endedAt: number
  /** Tokens of the model requests made while this step was worked on. */
  tokens: number
  /** Price-weighted token units, for sharing the run's cost out across steps. */
  units: number
  errors: number
  /** Ids of the tasks this one waits for (TaskUpdate addBlockedBy / addBlocks). */
  blockedBy: string[]
  /** Lines added / removed by this step's successful Edit, MultiEdit and Write calls. */
  added: number
  removed: number
  /** Test runs in this step (npm test, pytest, …) that passed / failed, and the last one's outcome. */
  testsPassed: number
  testsFailed: number
  lastTest: '' | 'pass' | 'fail'
}

export type CubeAgent = {
  id: string
  name: string
  kind: string
  status: 'running' | 'done' | 'error'
  tool: string
  calls: number
  taskIndex: number
  /** When the agent was spawned, in $.clock.now() ms; absent in runs stored before. */
  spawnedAt?: number
}

export type CubeCall = {
  id: string
  status: CubeStatus
  tool: string
  kind: CallKind
  /** Its finer kind for the summary; absent on calls stored before it existed, which count by `kind`. */
  work?: WorkKind
  /** '' for the main agent. */
  agentId: string
  /** The step the call counted towards; -1 for none. */
  taskIndex: number
  at: number
  /** How long it ran; 0 while running. */
  ms: number
  /** The file it read or wrote, when it names one. */
  file: string
  /** A short what-it-did for the ticker: a command, a file name, a pattern, a URL. */
  detail: string
  /** Lines it adds / removes, counted when it succeeds (Edit, MultiEdit, Write). */
  add: number
  del: number
  /** It runs a test suite. */
  isTest: boolean
}

export type CubeRun = {
  status: 'idle' | 'running' | 'waiting' | 'done' | 'error' | 'aborted'
  prompt: string
  startedAt: number
  endedAt: number
  tasks: CubeTask[]
  agents: CubeAgent[]
  calls: CubeCall[]
  mainTool: string
  toolCalls: number
  errors: number
  lastError: string
  waitingId: string
  waitingFor: string
  tokensIn: number
  tokensOut: number
  units: number
  /** The session's cost in USD when the run began. */
  costAtStart: number
  /** Time the agents spent waiting for the person (permission prompts, questions), summed; and the phases, for the timeline. */
  waitMs: number
  /** When the current wait began; 0 while nobody waits. */
  waitSince: number
  waits: { start: number; end: number }[]
  /** What a step takes, from earlier runs: the yardstick until a step of this run is done. */
  prior: { calls: number; ms: number; byKind?: Record<string, { calls: number; ms: number; n: number }> }
}

export type HistTask = { title: string; ms: number; calls: number; tokens: number; errors: number }

/** A finished run, kept across sessions. */
export type HistRun = {
  at: number
  /** Time spent waiting for the person; absent in rows from before 0.4. */
  waitMs?: number
  prompt: string
  ms: number
  tokens: number
  usd: number
  errors: number
  calls: number
  tasks: HistTask[]
}

declare module 'claude-code' {
  interface PluginState {
    'agent-cubes': {
      run: Shaped<CubeRun>
      /** The once-a-second beat while a run is active, carrying the session's cost and context fill read with it. */
      tick: Shaped<{ beat: number; usd: number | null; ctx: number | null }>
      /** The step whose details are open; -1 for none. */
      selected: number
      history: Shaped<HistRun[]>
      /** The chosen skin's id. */
      skin: string
      /** How the task is drawn: 'cubes' or 'board'; '' while the person has not picked. */
      view: string
      /** The circuit board's solder mask. */
      board: string
      /** Where the last export was written, for the panel to show; '' for none. */
      exported: string
      /** Whether the STATISTIK section is unfolded. */
      statsOpen: boolean
    }
  }
}
