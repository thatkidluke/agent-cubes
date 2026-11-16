import { expect, test } from 'claude-code/testing'

import {
  applyTaskTool,
  blockersOf,
  detailOf,
  diffOf,
  emptyRun,
  isTestCommand,
  startRun,
  statsFrom,
  STUCK,
  stuckReason,
  toolEnd,
  toolStart,
} from '../hooks/model'
import { buildSvg } from '../hooks/iso'
import { SKINS } from '../hooks/skins/index'
import type { CubeRun, HistRun } from '../types'

const plan = (n: number, now: number) =>
  applyTaskTool(startRun(emptyRun, 'x', now), 'mcp__ccd_turn__update_plan', {
    items: Array.from({ length: n }, (_, i) => ({ content: `S${i}`, status: i === 0 ? 'in_progress' : 'pending' })),
  }, undefined, now)

const call = (r: CubeRun, id: string, tool: string, input: Record<string, unknown>, at: number, end: number, isError = false) =>
  toolEnd(toolStart(r, { id, tool, agentId: undefined, input }, at), { id, tool, agentId: undefined, isError, errorText: isError ? 'x' : '' }, end)

// 1. diffOf
test('diffOf counts lines of Edit, MultiEdit and Write', async () => {
  expect(diffOf('Edit', { old_string: 'a\nb\nc', new_string: '1\n2\n3\n4\n5' })).toEqual({ add: 5, del: 3 })
  expect(diffOf('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b\nc' }, { old_string: 'x\ny', new_string: 'z\nw\nv' }] })).toEqual({ add: 5, del: 3 })
  expect(diffOf('Write', { content: 'l1\nl2\nl3\nl4' })).toEqual({ add: 4, del: 0 })
  expect(diffOf('Read', { file_path: 'a.ts' })).toEqual({ add: 0, del: 0 })
  expect(diffOf('Bash', { command: 'echo hi' })).toEqual({ add: 0, del: 0 })
  expect(diffOf('Edit', undefined)).toEqual({ add: 0, del: 0 })
})

test('only a successful Edit adds its lines to the step', async () => {
  const input = { file_path: 'a.ts', old_string: 'a\nb\nc', new_string: '1\n2\n3\n4\n5' }
  let r = call(plan(1, 1), 'e1', 'Edit', input, 10, 20, true)
  expect(r.calls[0]?.add).toBe(5)
  expect(r.calls[0]?.del).toBe(3)
  expect(r.tasks[0]?.added).toBe(0)
  expect(r.tasks[0]?.removed).toBe(0)
  r = call(r, 'e2', 'Edit', input, 30, 40)
  expect(r.tasks[0]?.added).toBe(5)
  expect(r.tasks[0]?.removed).toBe(3)
})

// 2. isTestCommand
test('isTestCommand spots test runs and nothing else', async () => {
  for (const c of ['npm test', 'npm run test', 'pnpm test', 'npx vitest run', 'pytest -q', 'go test ./...', 'cargo test', 'dotnet test', 'claude plugin test .']) {
    expect([c, isTestCommand(c)]).toEqual([c, true])
  }
  for (const c of ['npm install', 'git status', 'echo testing', 'ls tests/']) {
    expect([c, isTestCommand(c)]).toEqual([c, false])
  }
})

// 3. Test tracking
test('test runs are counted as passed and failed', async () => {
  let r = call(plan(1, 1), 't1', 'Bash', { command: 'npm test' }, 10, 20)
  expect(r.calls[0]?.isTest).toBe(true)
  expect(r.tasks[0]?.testsPassed).toBe(1)
  expect(r.tasks[0]?.lastTest).toBe('pass')
  r = call(r, 't2', 'Bash', { command: 'npm test' }, 30, 40, true)
  expect(r.tasks[0]?.testsPassed).toBe(1)
  expect(r.tasks[0]?.testsFailed).toBe(1)
  expect(r.tasks[0]?.lastTest).toBe('fail')
  r = call(r, 't3', 'Bash', { command: 'git status' }, 50, 60)
  expect(r.calls[2]?.isTest).toBe(false)
  expect(r.tasks[0]?.lastTest).toBe('fail')
})

// 4. detailOf
test('detailOf gives a short ticker text', async () => {
  expect(detailOf('Read', { file_path: 'C:\\Users\\me\\proj\\src\\model.ts' })).toBe('model.ts')
  expect(detailOf('Write', { file_path: '/home/me/proj/out.png' })).toBe('out.png')
  const long = 'npm run build -- --verbose ' + 'x'.repeat(100)
  const d = detailOf('Bash', { command: long })
  expect(d.length).toBe(60)
  expect(d.endsWith('…')).toBe(true)
  expect(d.startsWith('npm run build')).toBe(true)
  expect(detailOf('Bash', { command: 'ls\n   -la' })).toBe('ls -la')
  expect(detailOf('WebFetch', { url: 'https://example.com/docs/a', prompt: 'p' })).toBe('example.com/docs/a')
  expect(detailOf('Read', undefined)).toBe('')
})

// 5. Dependencies
test('TaskUpdate fills blockedBy, blockersOf ignores done blockers, delete cleans up', async () => {
  let r = startRun(emptyRun, 'x', 1)
  for (const [id, subject] of [['1', 'A'], ['2', 'B'], ['3', 'C']]) {
    r = applyTaskTool(r, 'TaskCreate', { subject, description: '' }, { task: { id, subject } }, 2)
  }
  expect(r.tasks.map(t => t.id)).toEqual(['1', '2', '3'])
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '3', addBlockedBy: ['1', '2'] }, undefined, 3)
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '1', addBlocks: ['2'] }, undefined, 4)
  expect(r.tasks[2]?.blockedBy).toEqual(['1', '2'])
  expect(r.tasks[1]?.blockedBy).toEqual(['1'])
  expect(r.tasks[0]?.blockedBy).toEqual([])
  expect(blockersOf(r, 2)).toEqual([0, 1])
  expect(blockersOf(r, 1)).toEqual([0])
  expect(blockersOf(r, 0)).toEqual([])
  // Duplicates are not added twice.
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '3', addBlockedBy: ['1'] }, undefined, 5)
  expect(r.tasks[2]?.blockedBy).toEqual(['1', '2'])

  r = applyTaskTool(r, 'TaskUpdate', { taskId: '1', status: 'completed' }, undefined, 6)
  expect(blockersOf(r, 2)).toEqual([1])
  expect(blockersOf(r, 1)).toEqual([])

  r = applyTaskTool(r, 'TaskUpdate', { taskId: '2', status: 'deleted' }, undefined, 7)
  expect(r.tasks.map(t => t.id)).toEqual(['1', '3'])
  expect(r.tasks[1]?.blockedBy).toEqual(['1'])
  expect(blockersOf(r, 1)).toEqual([])
})

// 6. stuckReason
test('stuck: failures in a row', async () => {
  let r = plan(2, 1)
  for (let i = 0; i < STUCK.failsInRow; i++) r = call(r, `f${i}`, 'Bash', { command: `cmd ${i}` }, 10 + i * 10, 15 + i * 10, true)
  expect(stuckReason(r, 0, 100)).toContain('fehlgeschlagen')
})

test('stuck: the same call over and over', async () => {
  let r = plan(2, 1)
  for (let i = 0; i < STUCK.sameInRow; i++) r = call(r, `s${i}`, 'Read', { file_path: 'C:/p/a.ts' }, 10 + i * 10, 15 + i * 10)
  const why = stuckReason(r, 0, 100)
  expect(why).toContain('derselbe Aufruf')
  expect(why).toContain('a.ts')
  // Three are fine.
  let r3 = plan(2, 1)
  for (let i = 0; i < STUCK.sameInRow - 1; i++) r3 = call(r3, `s${i}`, 'Read', { file_path: 'C:/p/a.ts' }, 10 + i * 10, 15 + i * 10)
  expect(stuckReason(r3, 0, 100)).toBe('')
})

test('stuck: silence', async () => {
  const r = call(plan(2, 1), 'a', 'Read', { file_path: 'a.ts' }, 1000, 2000)
  expect(stuckReason(r, 0, 2000 + STUCK.silentMs - 1000)).toBe('')
  expect(stuckReason(r, 0, 2000 + STUCK.silentMs + 60_000)).toContain('keine Aktivität')
})

test('stuck: far longer than usual', async () => {
  const now = 1 + STUCK.minMs + 60_000
  // A call still running keeps the silence check quiet.
  const r = toolStart(plan(2, 1), { id: 'a', tool: 'Bash', agentId: undefined, input: { command: 'make' } }, now - 10_000)
  expect(stuckReason(r, 0, now)).toContain('länger')
  expect(stuckReason(r, 0, 1 + STUCK.minMs - 60_000)).toBe('')
})

test('stuck: a healthy step and one not in work are not stuck', async () => {
  let r = plan(2, 1)
  r = call(r, 'a', 'Read', { file_path: 'a.ts' }, 10, 20)
  r = call(r, 'b', 'Edit', { file_path: 'a.ts', old_string: 'a', new_string: 'b' }, 30, 40)
  r = call(r, 'c', 'Bash', { command: 'npm test' }, 50, 60, true)
  expect(stuckReason(r, 0, 1000)).toBe('')
  expect(stuckReason(r, 1, 1000)).toBe('')
  expect(stuckReason(r, 1, 1 + 60 * 60_000)).toBe('')
  expect(stuckReason(r, 5, 1000)).toBe('')
})

// 7. statsFrom
const hist = (at: number, ms: number, usd: number, errors: number, tasks: [string, number][]): HistRun => ({
  at, prompt: 'p', ms, tokens: 0, usd, errors, calls: 0,
  tasks: tasks.map(([title, tms]) => ({ title, ms: tms, calls: 1, tokens: 0, errors: 0 })),
})

test('statsFrom sums up the history', async () => {
  expect(statsFrom([])).toBe(null)
  const s = statsFrom([
    hist(1, 60_000, 0.5, 1, [['A', 20_000], ['B', 40_000]]),
    hist(2, 120_000, 1.5, 3, [['C', 90_000], ['D', 30_000], ['E', 0], ['F', 0]]),
  ])!
  expect(s.runs).toBe(2)
  expect(s.avgMs).toBe(90_000)
  expect(Math.abs(s.avgUsd - 1)).toBeLessThan(1e-9)
  expect(Math.abs(s.totalUsd - 2)).toBeLessThan(1e-9)
  expect(s.avgSteps).toBe(3)
  expect(s.avgErrors).toBe(2)
  expect(s.slowest).toEqual({ title: 'C', ms: 90_000 })
  expect(s.recentMs).toEqual([60_000, 120_000])
  expect(s.recentUsd).toEqual([0.5, 1.5])
  // Only the last ten runs, oldest first.
  const many = statsFrom(Array.from({ length: 12 }, (_, i) => hist(i, (i + 1) * 1000, 0, 0, [])))!
  expect(many.recentMs.length).toBe(10)
  expect(many.recentMs[0]).toBe(3000)
  expect(many.recentMs[9]).toBe(12_000)
})

// 9. Rendering smoke
test('every skin renders stuck steps, blockers, diffs, tests and context', async () => {
  let r = startRun(emptyRun, 'x', 1)
  for (const [id, subject] of [['1', 'Build'], ['2', 'Test'], ['3', 'Ship']]) {
    r = applyTaskTool(r, 'TaskCreate', { subject }, { task: { id, subject } }, 2)
  }
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '1', status: 'in_progress' }, undefined, 3)
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '3', addBlockedBy: ['1', '2'] }, undefined, 4)
  r = call(r, 'e', 'Edit', { file_path: 'a.ts', old_string: 'a\nb', new_string: 'c\nd\ne' }, 10, 20)
  r = call(r, 't', 'Bash', { command: 'npm test' }, 30, 40)
  for (let i = 0; i < 3; i++) r = call(r, `f${i}`, 'Bash', { command: 'npm test' }, 50 + i * 10, 55 + i * 10, true)
  expect(stuckReason(r, 0, 200)).toContain('fehlgeschlagen')
  expect(blockersOf(r, 2)).toEqual([0, 1])
  for (const skin of SKINS) {
    const svg = buildSvg(r, 600, 200, -1, skin, { context: 0.9 })
    expect([skin.id, svg.source.startsWith('<svg')]).toEqual([skin.id, true])
    expect(svg.source.length).toBeLessThan(131_073)
  }
})
