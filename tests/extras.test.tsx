import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  applyTaskTool,
  emptyRun,
  endRun,
  historyCsv,
  markWaiting,
  startRun,
  summaryMarkdown,
  summaryOf,
  toHistory,
  toolEnd,
  toolStart,
} from '../hooks/model'
import { buildLanes } from '../hooks/lanes'
import { buildSummary } from '../hooks/summary'
import { buildGauges, buildTiles, warnColors } from '../hooks/gauges'
import { readSettings } from '../hooks/panel/settings'

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

const PLAN = {
  tool: 'mcp__ccd_turn__update_plan',
  items: [
    { content: 'Eins', status: 'in_progress' },
    { content: 'Zwei', status: 'pending' },
  ],
} as never

function world(on: On) {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'cubes' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
}

/** A two-step run: step 1 with an edit, a passing test and a question that waited 30 s. */
function finishedRun() {
  let r = startRun(emptyRun, 'Build the thing', 1_000)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', {
    items: [{ content: 'Code schreiben', status: 'in_progress' }, { content: 'Tests', status: 'pending' }],
  }, undefined, 1_000)
  r = toolStart(r, { id: 'e', tool: 'Edit', agentId: undefined, input: { file_path: '/p/a.ts', old_string: 'a', new_string: 'a\nb' } }, 2_000)
  r = toolEnd(r, { id: 'e', tool: 'Edit', agentId: undefined, isError: false, errorText: '' }, 2_500)
  r = toolStart(r, { id: 'q', tool: 'AskUserQuestion', agentId: undefined }, 10_000)
  r = toolEnd(r, { id: 'q', tool: 'AskUserQuestion', agentId: undefined, isError: false, errorText: '' }, 40_000)
  r = toolStart(r, { id: 't', tool: 'Bash', agentId: undefined, input: { command: 'npm test' } }, 41_000)
  r = toolEnd(r, { id: 't', tool: 'Bash', agentId: undefined, isError: false, errorText: '' }, 45_000)
  r = applyTaskTool(r, 'mcp__ccd_turn__wrap_up', {}, undefined, 60_000)
  return endRun(r, 'answer', 61_000)
}

test('waiting for the person is measured: a question, and a permission prompt until its call ends', async () => {
  const r = finishedRun()
  expect(r.waitMs).toBe(30_000)
  expect(r.waits).toEqual([{ start: 10_000, end: 40_000 }])

  let p = startRun(emptyRun, 'x', 1)
  p = toolStart(p, { id: 'b', tool: 'Bash', agentId: undefined, input: { command: 'rm x' } }, 100)
  p = markWaiting(p, 'b', 'Bash', 200)
  expect(p.status).toBe('waiting')
  p = toolEnd(p, { id: 'b', tool: 'Bash', agentId: undefined, isError: false, errorText: '' }, 5_200)
  expect(p.waitMs).toBe(5_000)
  expect(p.status).toBe('running')

  // A wait still open when the run ends is closed at its end.
  let o = startRun(emptyRun, 'x', 1)
  o = markWaiting(toolStart(o, { id: 'b', tool: 'Bash', agentId: undefined }, 10), 'b', 'Bash', 100)
  o = endRun(o, 'aborted', 1_100)
  expect(o.waitMs).toBe(1_000)
  expect(toHistory(o, 0).waitMs).toBe(1_000)
})

test('the summary adds up a finished run and reads as Markdown', async () => {
  const r = finishedRun()
  const s = summaryOf(r, 0.42)
  expect(s.steps).toBe(2)
  expect(s.done).toBe(2)
  expect(s.added).toBe(2)
  expect(s.removed).toBe(1)
  expect(s.testsPassed).toBe(1)
  expect(s.waitMs).toBe(30_000)
  const md = summaryMarkdown(r, 0.42)
  expect(md).toContain('### Agent Cubes')
  expect(md).toContain('> Build the thing')
  expect(md).toContain('| Code | +2 −1 |')
  expect(md).toContain('$0.42')
  expect(md).toContain('1. ✓ Code schreiben')
  expect(md.includes('\n\n\n')).toBe(false)
})

test('the history exports as CSV, one row per step, quoting what needs it', async () => {
  const h = toHistory(finishedRun(), 0.42)
  const csv = historyCsv([{ ...h, prompt: 'Say "hi", then go' }])
  const lines = csv.trim().split('\n')
  expect(lines[0]).toBe('run_started,prompt,run_ms,run_usd,run_wait_ms,step,step_title,step_kind,step_ms,step_calls,step_tokens,step_errors')
  expect(lines.length).toBe(3)
  expect(lines[1]).toContain('"Say ""hi"", then go"')
  expect(lines[2]).toContain(',2,Tests,test,')
})

test('the timeline has a lane per agent, bars per call and the waits in amber', async () => {
  const r = finishedRun()
  const lanes = buildLanes(r, 61_000, 400)
  expect(lanes).not.toBeNull()
  expect(lanes!.source.startsWith('<svg')).toBe(true)
  expect(lanes!.source).toContain('<title>Edit · a.ts</title>')
  expect(lanes!.alt).toContain('1 waiting phases')
  expect(buildLanes(emptyRun, 0, 400)).toBeNull()
})

test('a budget is read and clamped', async () => {
  expect(readSettings({}).budgetUsd).toBe(0)
  expect(readSettings({ budgetUsd: 2.5 }).budgetUsd).toBe(2.5)
  expect(readSettings({ budgetUsd: -1 }).budgetUsd).toBe(0)
})

test('the panel: cube hotkeys, the timeline card and the data export', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(PLAN)
  await $.tool.call({ tool: 'Read', file_path: '/p/a.ts' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'cube-0' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ type: 'Button', key: 'cube-1' }))?.props.hotkey).toBe('2')
  expect(await ui.find({ type: 'Text', text: /TIMELINE/ }), 'timeline card').toBeDefined()
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.some(n => String(n.props.alt).includes('Waiting:')), 'waiting tile').toBe(true)
  await ui.unmount()
})

test('the gauges: a canister per figure, filled to its level, coloured by its state', async () => {
  const g = buildGauges(
    [
      { key: 'a', label: 'Progress', icon: '▲', level: 0.5, value: '50 %', color: ['#fff', '#000'], title: 'p' },
      { key: 'b', label: 'Context', icon: '◧', level: null, value: '–', color: warnColors(null, 0.7, 0.85), title: 'c' },
    ],
    300,
    true,
  )
  expect(g.source).toContain('gauge-a-clip')
  expect(g.source).toContain('animateTransform')
  expect(g.alt).toBe('Progress: 50 %, Context: –')
  expect(buildGauges([{ key: 'a', label: 'x', icon: 'x', level: 0.5, value: '', color: ['#fff', '#000'], title: '' }], 200, false).source).not.toContain('<animate')
  expect(warnColors(0.9, 0.7, 0.85)[1]).toBe('#e11d48')
  expect(warnColors(0.75, 0.7, 0.85)[1]).toBe('#f59e0b')
  expect(warnColors(0.1, 0.7, 0.85)[1]).toBe('#0d9488')
})

test('the figure tiles: liquid at each level, none for a figure without one', async () => {
  const t = buildTiles(
    [
      { key: 'ctx', icon: '◧', label: 'Context', value: '40 %', level: 0.4, color: ['#fff', '#000'], title: 'c' },
      { key: 'calls', icon: '⌁', label: 'Tool calls', value: '12', level: null, color: ['#fff', '#000'], title: 't' },
    ],
    300,
    3,
    true,
  )
  expect(t.source).toContain('tile-ctx-clip')
  expect(t.source).not.toContain('tile-calls-clip')
  expect(t.alt).toBe('Context: 40 %, Tool calls: 12')
})

test('tiles and canisters follow light and dark mode', async () => {
  const t = buildTiles([{ key: 'a', icon: '◷', label: 'Elapsed', value: '1 min', level: null, color: ['#fff', '#000'], title: '' }], 200, 3, false)
  expect(t.source).toContain('prefers-color-scheme:dark')
  expect(t.source).toContain('class="acg-lb"')
})

test('the summary picture: a ring, the bars and one row per step', async () => {
  let r = startRun(emptyRun, 'Build it', 1000)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', { items: [{ content: 'Research it', status: 'completed' }, { content: 'Run the tests', status: 'in_progress' }] }, undefined, 2000)
  r = endRun(r, 'done', 60_000)
  const pic = buildSummary(r, summaryOf(r, 0.5), 320)
  expect(pic.source).toContain('stroke-dasharray')
  expect(pic.source).toContain('Research it')
  expect(pic.source).toContain('prefers-color-scheme:dark')
  expect(pic.alt).toContain('steps')
})
