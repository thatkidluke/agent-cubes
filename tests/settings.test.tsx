import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { applyTaskTool, emptyRun, startRun, STUCK, stuckReason, toolEnd, toolStart } from '../hooks/model'
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

/** The engine beneath the plugin: Bash fails, everything else succeeds. Returns how often ui.open was asked. */
function world(on: On, store?: Record<string, unknown>) {
  const opened = { count: 0 }
  mock.clock(on)
  mock.store(on, store)
  on('command.register', () => ({ value: { command: 'cubes' } }))
  on('ui.open', () => {
    opened.count++
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => (String(e.tool) === 'Bash' ? { result: 'boom', isError: true, text: 'boom' } : { result: {} }))
  return opened
}

test('settings are checked and clamped', async () => {
  const d = readSettings({})
  expect(d.defaultSkin).toBe('classic')
  expect(d.autoOpen).toBe(true)
  expect(d.animations).toBe(true)
  expect(d.stuck).toEqual(STUCK)

  const s = readSettings({ defaultSkin: 'nope', stuckSilentMinutes: -4, stuckFailsInRow: 2.6, stuckSlowFactor: 1000 })
  expect(s.defaultSkin).toBe('classic')
  expect(s.stuck.silentMs).toBe(30_000)
  expect(s.stuck.failsInRow).toBe(3)
  expect(s.stuck.slowFactor).toBe(50)
  expect(readSettings({ stuckFailsInRow: 0 }).stuck.failsInRow).toBe(1)
})

test('stuckReason takes thresholds and defaults to STUCK', async () => {
  let r = applyTaskTool(startRun(emptyRun, 'x', 0), 'mcp__ccd_turn__update_plan', {
    items: [{ content: 'A', status: 'in_progress' }],
  }, undefined, 0)
  r = toolStart(r, { id: 'a', tool: 'Bash', agentId: undefined }, 1000)
  r = toolEnd(r, { id: 'a', tool: 'Bash', agentId: undefined, isError: true, errorText: 'x' }, 2000)
  expect(stuckReason(r, 0, 3000)).toBe('')
  expect(stuckReason(r, 0, 3000, { ...STUCK, failsInRow: 1 })).toContain('1× hintereinander fehlgeschlagen')
  // Quiet for 2 minutes: stuck only under a 1-minute limit.
  expect(stuckReason(r, 0, 122_000)).toBe('')
  expect(stuckReason(r, 0, 122_000, { ...STUCK, silentMs: 60_000 })).toContain('keine Aktivität')
})

test('the options reach the panel\'s stuck checks', { options: { stuckFailsInRow: 1 } }, async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(PLAN)
  await $.tool.call({ tool: 'Bash', command: 'false' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Würfel 01 hängt: 1× hintereinander fehlgeschlagen/ })).toBeDefined()
  await ui.unmount()
})

test('with the defaults one failure is not stuck', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(PLAN)
  await $.tool.call({ tool: 'Bash', command: 'false' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /hängt:/ })).toBeUndefined()
  await ui.unmount()
})

test('animations: false draws a still Svg', { options: { animations: false } }, async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(PLAN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  expect(String(svg?.props.source)).not.toContain('<animate')
  await ui.unmount()
})

test('defaultSkin applies while nothing is picked', { options: { defaultSkin: 'cyber' } }, async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'skin' }))?.props.value).toBe('cyber')
  await ui.unmount()
})

test('a skin picked in the panel wins over defaultSkin', { options: { defaultSkin: 'cyber' } }, async ($, on) => {
  world(on, { skin: 'retro' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'skin' }))?.props.value).toBe('retro')
  await ui.unmount()
})

test('autoOpen: false opens no pane at session start', { options: { autoOpen: false } }, async ($, on) => {
  const opened = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opened.count).toBe(0)
})

test('autoOpen defaults to opening the pane', async ($, on) => {
  const opened = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opened.count).toBe(1)
})
