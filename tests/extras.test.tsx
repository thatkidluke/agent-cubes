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
import { buildSummary } from '../hooks/summary'
import { BOARD_THEMES, buildBoard } from '../hooks/board'
import { buildBoardSummary } from '../hooks/board-summary'
import { memo, phaseLock } from '../hooks/svg'
import { buildGauges, buildTiles, warnColors } from '../hooks/gauges'
import { buildAgents, buildLive, buildNow, clip } from '../hooks/panel/live'
import { activity, clock, coins, cup, diffBlocks, hourglass, perMinute, tank, tokenBars, warning } from '../hooks/pictos'
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
  expect(await ui.find({ type: 'Text', text: /TIMELINE/ }), 'no timeline card').toBeUndefined()
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

test('the figure tiles: a pictogram in a badge each, a level bar where the figure has a level', async () => {
  const t = buildTiles(
    [
      { key: 'ctx', label: 'Context', value: '40 %', level: 0.4, color: '#f59e0b', pic: tank(0.4, ['#fcd34d', '#f59e0b'], 0.7, 0.85), title: 'c' },
      { key: 'calls', label: 'Tool calls', value: '12', level: null, color: '#14b8a6', pic: activity([1, 2, 3], false), title: 't' },
      { key: 'code', label: 'Code', value: '+3 −1', valueHtml: '<tspan>+3</tspan>', level: 0.75, rest: '#e11d48', color: '#16a34a', pic: diffBlocks(3, 1), title: 'd' },
    ],
    360,
    3,
  )
  expect(t.source).toContain('tile-ctx-clip')
  expect(t.source).not.toContain('tile-calls-clip')
  expect(t.source).toContain('<tspan>+3</tspan>')
  expect(t.source).toContain('prefers-color-scheme:dark')
  expect(t.alt).toBe('Context: 40 %, Tool calls: 12, Code: +3 −1')
})

test('the pictograms show their figure', async () => {
  expect(warning(0)).toContain('#16a34a')
  expect(warning(2)).toContain('#e11d48')
  expect(perMinute([0, 30_000, 61_000, 400_000], 419_999)).toEqual([2, 1, 0, 0, 0, 0, 1])
  expect(coins(1.2, 6)).toContain('#e11d48')
  expect(cup('c1', 0.5, true, true)).toContain('id="c1"')
  expect(clock(0.5), 'the hand stands still').not.toContain('<animate')
  expect(hourglass(0.4, true)).toContain('<animate')
  expect(tokenBars(10, 0)).toContain('#3b82f6')
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

test('with the summary on screen the overview keeps only context and tokens; Code replaces Cubes', async ($, on) => {
  world(on)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(PLAN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  let alts = (await ui.findAll({ type: 'Svg' })).map(n => String(n.props.alt))
  expect(alts.some(a => a.includes('Code: ') && a.startsWith('Elapsed:')), 'code tile while working').toBe(true)
  expect(alts.some(a => a.includes('Cubes: ')), 'no cubes tile').toBe(false)
  await $.turn.complete({ reason: 'answer', answer: 'done' } as never)
  alts = (await ui.findAll({ type: 'Svg' })).map(n => String(n.props.alt))
  expect(alts.some(a => a.startsWith('Summary:')), 'summary picture').toBe(true)
  expect(alts.some(a => a === `Context: –, Tokens: ${a.split('Tokens: ')[1]}`), 'slim overview').toBe(true)
  await ui.unmount()
})

test('phaseLock starts endless animations where the clock is; one-shot ones stay', async () => {
  const src =
    '<svg><circle><animate attributeName="r" values="1;2;1" dur="2s" repeatCount="indefinite"/></circle>' +
    '<rect><animate attributeName="opacity" values="0;1" dur="3s" begin="0.5s" repeatCount="indefinite"/></rect>' +
    '<rect><animate attributeName="x" values="0;9" dur="1s" begin="0.1s" fill="freeze"/></rect></svg>'
  const out = phaseLock(src, 5_500)
  expect(out).toContain('<animate begin="-1.65s" attributeName="r"')
  expect(out).toContain('begin="-2.15s"')
  expect(out).toContain('begin="0.1s" fill="freeze"')
  expect(phaseLock('<svg/>', 1000)).toBe('<svg/>')
})

test('memo keeps a drawing while its key stays', async () => {
  let made = 0
  const a = memo('test-slot', 'k1', () => ++made)
  const b = memo('test-slot', 'k1', () => ++made)
  const c = memo('test-slot', 'k2', () => ++made)
  expect([a, b, c, made]).toEqual([1, 1, 2, 2])
})

test('the tiles keep their very source from one second to the next', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'cubes' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(PLAN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const tileSrc = async () => String((await ui.findAll({ type: 'Svg' })).find(n => String(n.props.alt).startsWith('Elapsed:'))?.props.source)
  await clock.advance(2_000)
  const first = await tileSrc()
  // The run is live: elapsed shows whole minutes, and the second that passed changes nothing visible.
  expect(String((await ui.findAll({ type: 'Svg' })).find(n => String(n.props.alt).startsWith('Elapsed:'))?.props.alt)).toContain('Elapsed: < 1 min')
  await clock.advance(1_000)
  expect(await tileSrc()).toBe(first)
  await ui.unmount()
})

test('NOW, AGENTS and LIVE are drawings; while work goes on they are images, so an update never flashes white', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(PLAN)
  await $.tool.call({ tool: 'Read', file_path: '/p/a.ts' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svgs = await ui.findAll({ type: 'Svg' })
  for (const start of ['Eins', 'Main agent', 'Read']) {
    const pic = svgs.find(n => String(n.props.alt).startsWith(start) || String(n.props.alt).includes(`: ${start}`))
    expect(pic, start).toBeDefined()
  }
  for (const n of svgs) expect(n.props.isInteractive, String(n.props.alt).slice(0, 30)).toBe(false)
  expect(await ui.find({ key: 'view-main' })).toBeDefined()
  await ui.unmount()
})

test('the feed and the avatars carry what they show', async () => {
  const live = buildLive([{ kind: 'write', status: 'error', letter: 'H', color: '#818cf8', tool: 'Edit', detail: 'a.ts' }], 360, true)
  expect(live.source).toContain('Edit')
  expect(live.alt).toBe('Edit a.ts (error)')
  const agents = buildAgents([{ letter: 'R', color: '#f472b6', name: 'Reviewer', where: '→ Cube 02', doing: 'Read', kind: 'read', status: 'running' }], 360, true)
  expect(agents.source).toContain('Reviewer')
  expect(agents.source).toContain('<animate')
  const now = buildNow({ cube: '03', color: '#3b82f6', title: 'Write the code', sub: 'for 2 min', progress: 0.4, agents: [{ letter: 'H', color: '#818cf8' }], state: 'running' }, 360, false)
  expect(now.source).toContain('>03<')
  expect(now.source).not.toContain('<animate')
  expect(clip('a very long title indeed', 60, 12)).toMatch(/…$/)
})

test('every drawing is well-formed: no attribute twice on one element', async () => {
  const live = buildLive([{ kind: 'run', status: 'done', letter: 'H', color: '#818cf8', tool: 'Bash', detail: 'npm test' }], 360, true)
  const agents = buildAgents([{ letter: 'H', color: '#818cf8', name: 'Main agent', where: '', doing: 'Bash', kind: 'run', status: 'running' }], 360, true)
  const now = buildNow({ cube: '', color: '#16a34a', title: 'Task complete', sub: '', progress: null, agents: [], state: 'done' }, 360, true)
  for (const src of [live.source, agents.source, now.source]) {
    for (const tag of src.match(/<[a-zA-Z][^>]*>/g) ?? []) {
      const names = [...tag.matchAll(/\s([a-zA-Z:-]+)="/g)].map(m => m[1])
      expect(new Set(names).size, tag.slice(0, 60)).toBe(names.length)
    }
  }
})

test('the view dropdown switches between cubes and the circuit board, and the pick is kept', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(PLAN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const scene = async () => (await ui.findAll({ type: 'Svg' })).map(n => String(n.props.alt)).find(a => a.startsWith('Cube timeline') || a.startsWith('Circuit board'))
  expect((await ui.find({ type: 'Select', key: 'view' }))?.props.value).toBe('cubes')
  expect(await scene()).toContain('Cube timeline')
  expect(await ui.find({ key: 'skin' }), 'skins dress the cubes').toBeDefined()
  await ui.select({ key: 'view', value: 'board' })
  expect((await ui.find({ type: 'Select', key: 'view' }))?.props.value).toBe('board')
  expect(await scene()).toContain('Circuit board: 0 of 2 chips done')
  expect(await ui.find({ key: 'skin' }), 'the board has its own look').toBeUndefined()
  await ui.unmount()
})

test('the circuit board: a chip per step, lit traces after finished steps, LEDs by kind of work', async () => {
  let r = startRun(emptyRun, 'Build it', 1)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', { items: [{ content: 'Read it', status: 'completed' }, { content: 'Write it', status: 'in_progress' }, { content: 'Test it', status: 'pending' }] }, undefined, 2)
  r = toolStart(r, { id: 'x', tool: 'Edit', agentId: undefined, input: { file_path: '/a', old_string: 'a', new_string: 'a\nb' } }, 1000)
  r = toolEnd(r, { id: 'x', tool: 'Edit', agentId: undefined, isError: false, errorText: '' }, 1500)
  const b = buildBoard(r, 560, 9000, 1, { context: 0.9 })
  expect(b.source.startsWith('<svg') && b.source.endsWith('</svg>')).toBe(true)
  expect((b.source.match(/<title>Cube /g) ?? []).length, 'three chips').toBe(3)
  expect(b.source).toContain('#5eead4')
  expect(b.source).toContain('>1/3</tspan>')
  expect(b.source).toContain('CTX <tspan font-weight="700">90%</tspan>')
  expect(b.source, 'the write call lights an amber LED').toContain('fill="#f59e0b"')
  expect(b.source.includes('<animate'), 'current runs while work goes on').toBe(true)
  expect(buildBoard(r, 560, 9000, 1, { motion: false }).source.includes('<animate'), 'still mode').toBe(false)
  // Many steps stay under the element's limit, and every tag is well-formed.
  let long = startRun(emptyRun, 'Long', 1)
  long = applyTaskTool(long, 'mcp__ccd_turn__update_plan', { items: Array.from({ length: 40 }, (_, i) => ({ content: `S${i}`, status: i < 20 ? 'completed' : i === 20 ? 'in_progress' : 'pending' })) }, undefined, 2)
  const big = buildBoard(long, 680, 9000).source
  expect(big.length < 131072, `40 steps: ${big.length}`).toBe(true)
  for (const tag of big.match(/<[a-zA-Z][^>]*>/g) ?? []) {
    const names = [...tag.matchAll(/\s([a-zA-Z:-]+)="/g)].map(m => m[1])
    expect(new Set(names).size, tag.slice(0, 60)).toBe(names.length)
  }
})

test('the board: solder masks, a default view, waiting traces, a mini board and a test report', async () => {
  let r = startRun(emptyRun, 'Build it', 1)
  for (const [i, title] of ['Research it', 'Write it', 'Run the tests'].entries()) r = applyTaskTool(r, 'TaskCreate', { subject: title }, { task: { id: String(i + 1) } }, 2)
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '1', status: 'in_progress' }, undefined, 3)
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '3', addBlockedBy: ['2'] }, undefined, 4)
  const green = buildBoard(r, 560, 9000).source
  expect(green, 'the step that waits is tied to the one it waits for').toContain('Step 03 waits for step 02')
  expect(green, 'part kinds are printed on the parts').toContain('>MEM<')
  expect(green).toContain('>TST<')
  expect(green, 'the step name in silkscreen').toContain('>Run the tests<')
  expect(BOARD_THEMES.map(t => t.id)).toEqual(['green', 'black', 'blue', 'white', 'red'])
  const white = buildBoard(r, 560, 9000, -1, { theme: 'white', cost: '$1.2', left: '≈ 3 min' }).source
  expect(white).toContain('#f4f6f9')
  expect(white).toContain('>$1.2<')
  expect(white).toContain('≈ 3 min')
  const mini = buildBoard(r, 180, 9000, -1, { mini: true })
  expect(mini.width).toBe(180)
  expect(mini.source.includes('CHIPS'), 'the mini board has no display').toBe(false)
  expect(readSettings({ defaultView: 'board' }).defaultView).toBe('board')
  expect(readSettings({}).defaultView).toBe('cubes')
  const done = endRun(r, 'answer', 60_000)
  const report = buildBoardSummary(done, summaryOf(done, 0.5), 480, 'blue')
  expect(report.source).toContain('TEST REPORT')
  expect(report.alt).toContain('Test report')
})

test('defaultView: board starts on the circuit board, with a picker for its solder mask', { options: { defaultView: 'board' } }, async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(PLAN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Select', key: 'view' }))?.props.value).toBe('board')
  expect((await ui.find({ type: 'Select', key: 'board' }))?.props.value).toBe('green')
  await ui.select({ key: 'board', value: 'black' })
  expect((await ui.find({ type: 'Select', key: 'board' }))?.props.value).toBe('black')
  const scene = (await ui.findAll({ type: 'Svg' })).find(n => String(n.props.alt).startsWith('Circuit board'))
  expect(String(scene?.props.source)).toContain('#1c1c22')
  await ui.unmount()
})
