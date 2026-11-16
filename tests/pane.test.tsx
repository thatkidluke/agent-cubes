import { expect, mock, test } from 'claude-code/testing'

import {
  addAgent,
  addStepUsage,
  applyTaskTool,
  callKind,
  emptyRun,
  endRun,
  eta,
  fromHistory,
  priorFrom,
  progress,
  startRun,
  stepCost,
  stepProgress,
  toHistory,
  toolEnd,
  toolStart,
} from '../hooks/model'
import { buildSvg } from '../hooks/iso'

const plan = (n: number, now: number) =>
  applyTaskTool(startRun(emptyRun, 'x', now), 'mcp__ccd_turn__update_plan', {
    items: Array.from({ length: n }, (_, i) => ({ content: `S${i}`, status: i === 0 ? 'in_progress' : 'pending' })),
  }, undefined, now)

test('calls are sorted by kind, and a failed one turns its cube red', async () => {
  expect(callKind('Read')).toBe('read')
  expect(callKind('Edit')).toBe('write')
  expect(callKind('Bash')).toBe('run')
  expect(callKind('Agent')).toBe('agent')
  expect(callKind('mcp__x__list_issues')).toBe('read')

  let r = plan(2, 1)
  r = toolStart(r, { id: 'a', tool: 'Bash', agentId: undefined, input: { command: 'ls' } }, 1)
  r = toolEnd(r, { id: 'a', tool: 'Bash', agentId: undefined, isError: true, errorText: 'boom' }, 501)
  r = toolStart(r, { id: 'b', tool: 'Write', agentId: undefined, input: { file_path: 'C:/x/out.png' } }, 600)
  expect(r.tasks[0]?.errors).toBe(1)
  expect(r.calls[0]?.ms).toBe(500)
  expect(r.calls[1]?.file).toBe('C:/x/out.png')

  const svg = buildSvg(r, 500, 600_000)
  expect(svg.source).toContain('id="m-err"')
  expect(svg.source).toContain('id="m-write"')
  expect(svg.source).toContain('fehlgeschlagene Tool-Aufrufe')
})

test('tokens and cost land on the step that used them', async () => {
  let r = { ...plan(2, 1), costAtStart: 1 }
  r = addStepUsage(r, undefined, { input_tokens: 100, output_tokens: 100 })
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', { advance: true }, undefined, 2)
  r = addStepUsage(r, undefined, { input_tokens: 100, output_tokens: 300 })
  expect(r.tasks[0]?.tokens).toBe(200)
  expect(r.tasks[1]?.tokens).toBe(400)
  // $1.60 spent in this run: step 2 used 1600 of 2200 weighted units.
  expect(Math.abs((stepCost(r, 1, 2.6) ?? 0) - (1.6 * 1600) / 2200)).toBeLessThan(1e-9)
})

test('the time left counts parallel work once and the rest in a row', async () => {
  let r = plan(3, 1)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', { advance: true }, undefined, 60_001)
  // Step 1 took 60 s; step 2 runs for 20 s; step 3 waits.
  expect(eta(r, 80_001)).toBe(40_000 + 60_000)
})

test('a finished run goes to the history and teaches the next run its pace', async () => {
  let r = plan(2, 1)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', { advance: true }, undefined, 30_001)
  r = applyTaskTool(r, 'mcp__ccd_turn__wrap_up', {}, undefined, 50_001)
  r = endRun(r, "answer", 50_001)
  const h = toHistory(r, 0.5)
  expect(h.tasks.map(t => t.ms)).toEqual([30_000, 20_000])
  expect(priorFrom([h]).ms).toBe(25_000)
  const back = fromHistory(h)
  expect(progress(back)).toEqual({ done: 2, total: 2 })
  expect(buildSvg(back, 400).alt).toContain('2 von 2')
})

test('a step in work fills over time and calls, but only a check-off makes it full', async () => {
  let r = startRun(emptyRun, 'x', 0)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', {
    items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }],
  }, undefined, 1_000)
  expect(r.tasks[0]?.startedAt).toBe(1_000)

  // A took 60 s and 8 calls: that becomes the yardstick for B.
  for (let i = 0; i < 8; i++) r = toolStart(r, { id: `a${i}`, tool: 'Read', agentId: undefined }, 1_000)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', { advance: true }, undefined, 61_000)
  expect(r.tasks[0]?.endedAt).toBe(61_000)
  expect(r.tasks[1]?.startedAt).toBe(61_000)

  const early = stepProgress(r, 1, 66_000)
  const later = stepProgress(r, 1, 121_000)
  expect(early).toBeGreaterThan(0)
  expect(later).toBeGreaterThan(early)
  expect(stepProgress(r, 1, 10_000_000)).toBeLessThan(1)
  expect(stepProgress(r, 0, 121_000)).toBe(1)
})

test('a subagent lands on the step its description matches and fills that cube', async () => {
  let r = startRun(emptyRun, 'Bild', 0)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', {
    items: [
      { content: 'Set up canvas and renderer', status: 'completed' },
      { content: 'Agent: forest + dramatic sky background', status: 'in_progress' },
      { content: 'Agent: motocross rider mid-jump', status: 'pending' },
      { content: 'Agent: foreground ramp, dirt and FX', status: 'pending' },
    ],
  }, undefined)
  r = addAgent(r, { id: 'a1', name: 'Pixel art motocross rider', kind: 'general-purpose' }, 0)
  r = addAgent(r, { id: 'a2', name: 'Pixel art ramp and FX', kind: 'general-purpose' }, 0)
  r = addAgent(r, { id: 'a3', name: 'Something unrelated', kind: 'general-purpose' }, 0)
  expect(r.agents.map(a => a.taskIndex)).toEqual([2, 3, 1])

  r = toolStart(r, { id: 't1', tool: 'Bash', agentId: 'a1' }, 0)
  expect(r.tasks[2]?.calls).toBe(1)

  // All four cubes are drawn from the start; the agents' cubes carry badges.
  const svg = buildSvg(r, 500)
  expect(svg.alt).toContain('von 4 Würfeln')
  expect(svg.alt).toContain('Würfel 2, 3, 4')
})

const PANE = {
  plugin: 'agent-cubes',
  component: 'Pane',
  requestId: 'agent-cubes',
  props: {
    title: 'Agent Cubes',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('the plan list drives progress and the grid', async () => {
  let r = startRun(emptyRun, 'Baue das Feature', 1000)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', {
    items: [
      { content: 'Code lesen', status: 'in_progress' },
      { content: 'Feature bauen', status: 'pending' },
      { content: 'Testen', status: 'pending' },
    ],
  }, undefined)
  r = toolStart(r, { id: 't1', tool: 'Read', agentId: undefined }, 1100)
  r = toolEnd(r, { id: 't1', tool: 'Read', agentId: undefined, isError: false, errorText: '' })
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', { advance: true }, undefined)

  expect(progress(r)).toEqual({ done: 1, total: 3 })
  expect(r.tasks[1]?.status).toBe('running')
  expect(r.tasks[0]?.calls).toBe(1)

  const svg = buildSvg(r, 400)
  expect(svg.source.startsWith('<svg')).toBe(true)
  expect(svg.source).toContain('<animate')
  expect(svg.alt).toContain('1 von 3')

  r = applyTaskTool(r, 'mcp__ccd_turn__wrap_up', {}, undefined)
  r = endRun(r, 'answer', 5000)
  expect(progress(r)).toEqual({ done: 3, total: 3 })
  expect(r.status).toBe('done')
})

test('TodoWrite and TaskCreate/TaskUpdate are read too', async () => {
  let r = applyTaskTool(emptyRun, 'TodoWrite', {
    todos: [
      { content: 'A', status: 'completed', activeForm: 'Macht A' },
      { content: 'B', status: 'in_progress', activeForm: 'Macht B' },
    ],
  }, undefined)
  expect(progress(r)).toEqual({ done: 1, total: 2 })

  r = applyTaskTool(emptyRun, 'TaskCreate', { subject: 'X', description: '' }, { task: { id: '7', subject: 'X' } })
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '7', status: 'completed' }, undefined)
  expect(progress(r)).toEqual({ done: 1, total: 1 })
})

test('the pane draws with a stored history row (no name may shadow the JSX factory)', async ($, on) => {
  mock.clock(on)
  const row = toHistory(endRun(plan(2, 1), 'answer', 60_001), 0.25)
  on('store.get', (_, e) => ({ value: (e as { key: string }).key === 'history' ? [row] : undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'cubes' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The history itself is not listed any more; it feeds the folded STATISTIK card.
  expect(await ui.find({ type: 'Text', text: /VERLAUF/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /STATISTIK/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Ø Dauer/ })).toBeUndefined()
  await ui.press({ key: 'stats-toggle' })
  expect(await ui.find({ type: 'Text', text: /Ø Dauer/ })).toBeDefined()
  // The data sits in titled cards.
  for (const title of [/ÜBERSICHT/, /JETZT/, /AGENTS/]) expect(await ui.find({ type: 'Text', text: title })).toBeDefined()
  await ui.unmount()
})

test('the pane draws the grid and the numbers', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'cubes' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__ccd_turn__update_plan',
    items: [
      { content: 'Eins', status: 'completed' },
      { content: 'Zwei', status: 'in_progress' },
      { content: 'Drei', status: 'pending' },
      { content: 'Vier', status: 'pending' },
    ],
  } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /25 %/ }))?.text).toBe('25 %')
  expect(await ui.find({ type: 'Text', text: /1 von 4 Würfeln/ })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  // The split-out blocks keep their keys.
  for (const key of ['export', 'view-main', 'skin', 'cube-0']) expect(await ui.find({ key })).toBeDefined()
  // No skin picked and no defaultSkin set: classic.
  expect((await ui.find({ key: 'skin' }))?.props.value).toBe('classic')

  // Pressing a cube's number opens its details; pressing it again closes them.
  await ui.press({ key: 'cube-1' })
  expect(await ui.find({ type: 'Text', text: /Würfel 02 · Zwei/ })).toBeDefined()
  await ui.press({ key: 'cube-1' })
  expect(await ui.find({ type: 'Text', text: /Würfel 02 · Zwei/ })).toBeUndefined()
  await ui.unmount()

  // The terminal has no Svg: it gets a text strip instead.
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /25 %/ })).toBeDefined()
  await term.unmount()
})
