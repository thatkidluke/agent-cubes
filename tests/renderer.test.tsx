import { expect, test } from 'claude-code/testing'

import type { CubeRun } from '../types'
import { buildSvg, clearSvgCache, STATUS_GLYPH, stripSmil } from '../hooks/iso'
import { addAgent, applyTaskTool, emptyRun, endRun, startRun, toolEnd, toolStart } from '../hooks/model'
import { SKINS } from '../hooks/skins'

const PLAN = 'mcp__ccd_turn__update_plan'
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima']
const SMIL = /<(animate|animateTransform|animateMotion|animateColor|set)\b/

let seq = 0
function call(r: CubeRun, tool: string, input: Record<string, unknown>, err = false, agentId?: string, t = 10): CubeRun {
  const id = `c${seq++}`
  r = toolStart(r, { id, tool, agentId, input }, t)
  return toolEnd(r, { id, tool, agentId, isError: err, errorText: 'boom' }, t + 5)
}
const edit = (a: number, d: number) => ({ file_path: 'x.ts', old_string: Array(d).fill('o').join('\n'), new_string: Array(a).fill('n').join('\n') })

/** `n` steps: the first done, `live` in work (subagents, diffs, tests), a stuck one, blockers. */
function busy(n: number, live: number): CubeRun {
  let r = startRun(emptyRun, 'Features', 1)
  for (let i = 0; i < n; i++) r = applyTaskTool(r, 'TaskCreate', { subject: `${WORDS[i % 12]} ${i}` }, { task: { id: String(i + 1), subject: `${WORDS[i % 12]} ${i}` } }, 2)
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '1', status: 'in_progress' }, undefined, 3)
  r = call(r, 'Edit', edit(120, 30))
  r = call(r, 'Bash', { command: 'npm test' })
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '1', status: 'completed' }, undefined, 100)
  r = applyTaskTool(r, 'TaskUpdate', { taskId: '2', status: 'in_progress' }, undefined, 101)
  r = call(r, 'Write', { file_path: 'y.ts', content: Array(1450).fill('l').join('\n') })
  r = applyTaskTool(r, 'TaskUpdate', { taskId: String(Math.min(n, 4)), addBlockedBy: ['2', '3'] }, undefined, 102)
  if (n > 6) r = applyTaskTool(r, 'TaskUpdate', { taskId: String(n), addBlockedBy: ['2'] }, undefined, 102)
  for (let k = 0; k < live - 1 && k + 2 < n; k++) {
    const t = k + 2
    r = applyTaskTool(r, 'TaskUpdate', { taskId: String(t + 1), status: 'in_progress' }, undefined, 103)
    r = addAgent(r, { id: `a${k}`, name: `${WORDS[t % 12]} ${t}`, kind: 'general-purpose' }, 104)
    for (let j = 0; j < 6; j++) r = call(r, j % 3 ? 'Edit' : 'Bash', j % 3 ? edit(5 + j, 2) : { command: j === 3 ? 'npm test' : 'ls' }, false, `a${k}`)
  }
  r = addAgent(r, { id: 'stk', name: 'bravo', kind: 'general-purpose' }, 105)
  for (let k = 0; k < 3; k++) r = call(r, 'Bash', { command: 'npm test' }, true, 'stk')
  return r
}

/** `n` steps, the first `done` finished one after another, the next one in work, the last waiting on it. */
function finished(n: number, done: number): CubeRun {
  let r = startRun(emptyRun, 'Fold', 1)
  for (let i = 0; i < n; i++) r = applyTaskTool(r, 'TaskCreate', { subject: `Step ${WORDS[i % 12]} ${i}` }, { task: { id: String(i + 1), subject: `Step ${WORDS[i % 12]} ${i}` } }, 2)
  for (let i = 0; i < done; i++) {
    r = applyTaskTool(r, 'TaskUpdate', { taskId: String(i + 1), status: 'in_progress' }, undefined, 3 + i * 1000)
    r = call(r, 'Edit', edit(10 + i, 2), false, undefined, 4 + i * 1000)
    r = applyTaskTool(r, 'TaskUpdate', { taskId: String(i + 1), status: 'completed' }, undefined, 500 + i * 1000)
  }
  r = applyTaskTool(r, 'TaskUpdate', { taskId: String(done + 1), status: 'in_progress' }, undefined, 100_000)
  for (let j = 0; j < 5; j++) r = call(r, 'Read', { file_path: `a${j}` }, false, undefined, 100_001 + j)
  return applyTaskTool(r, 'TaskUpdate', { taskId: String(n), addBlockedBy: [String(done + 1)] }, undefined, 100_010)
}

function allDone(): CubeRun {
  let r = applyTaskTool(startRun(emptyRun, 'job', 1), PLAN, { items: [{ content: 'One', status: 'in_progress' }, { content: 'Two', status: 'pending' }] }, undefined, 1)
  r = call(r, 'Read', { file_path: 'a' }, false, undefined, 10)
  r = applyTaskTool(r, PLAN, { done: [1, 2] }, undefined, 30_000)
  return endRun(r, 'answer', 30_000)
}

test('renderer: an unchanged picture is the very same result, a changed one is not', async () => {
  clearSvgCache()
  const r = allDone()
  for (const skin of SKINS) {
    const a = buildSvg(r, 520, 600_000, -1, skin, { context: 0.421 })
    // A second later, the context a hair fuller: nothing visible changed.
    const b = buildSvg(r, 520, 601_000, -1, skin, { context: 0.4235 })
    expect(b.source === a.source, `${skin.id}: same source`).toBe(true)
    expect(b === a, `${skin.id}: cached result`).toBe(true)
    const c = buildSvg(r, 520, 601_000, 1, skin, { context: 0.4235 })
    expect(c.source !== a.source, `${skin.id}: selection redraws`).toBe(true)
    const d = buildSvg(r, 520, 602_000, -1, skin, { context: 0.43 })
    expect(d.source !== a.source, `${skin.id}: a new percent redraws`).toBe(true)
  }
  // A live run redrawn at the same moment is identical too.
  const live = busy(6, 3)
  const x = buildSvg(live, 600, 200, 2, SKINS[1], { context: 0.9 })
  const y = buildSvg(live, 600, 200, 2, SKINS[1], { context: 0.9 })
  expect(y.source).toBe(x.source)
})

test('renderer: many steps fold the finished ones into a stack', async () => {
  const r14 = finished(14, 7)
  const r20f = finished(20, 7)
  // Fourteen steps all have a place of their own in two rows: nothing folds.
  expect(buildSvg(r14, 640, 100_100).source.includes('01–06'), 'fourteen steps do not fold').toBe(false)
  for (const skin of SKINS) {
    const src = buildSvg(r20f, 640, 100_100, -1, skin).source
    expect(src.includes('01–06'), `${skin.id}: range label`).toBe(true)
    expect(src.includes('6 ✓'), `${skin.id}: stack caption`).toBe(true)
    expect(src.includes('Step alpha 0') && src.includes('Step foxtrot 5'), `${skin.id}: folded titles in the tooltip`).toBe(true)
    // Step 7 stays a cube of its own, the arc still names the real steps.
    expect(src.includes('> 07<'), `${skin.id}: last finished step kept`).toBe(true)
    expect(buildSvg(r14, 640, 100_100, -1, skin).source.includes('Step 14 waits for step 8'), `${skin.id}: dependency mapped`).toBe(true)
  }
  // Sixteen steps or fewer never fold.
  expect(buildSvg(finished(10, 7), 640, 100_100).source.includes('–0')).toBe(false)
  // 20 steps: the finished run and the trailing pending run fold, at most 12 cubes are drawn.
  const r20 = finished(20, 3)
  const src20 = buildSvg(r20, 640, 100_100, 19).source
  expect(src20.includes('01–02')).toBe(true)
  expect(/1\d–20/.test(src20)).toBe(true)
  expect((src20.match(/<g><title>Cube /g) ?? []).length).toBeLessThan(17 * 2 + 1)
})

test('renderer: the worst case stays well under the limit in every skin', async () => {
  const worst = [busy(12, 8), busy(14, 8), busy(20, 8), busy(20, 12)]
  for (const skin of SKINS) {
    for (const r of worst) {
      for (const width of [260, 400, 640, 680, 1000]) {
        const n = buildSvg(r, width, 200, 3, skin, { context: 0.95 }).source.length
        expect(n < 110_000, `${skin.id} ${r.tasks.length} steps at ${width}: ${n}`).toBe(true)
      }
    }
  }
})

test('renderer: motion false draws a still picture with every mini cube', async () => {
  for (const skin of SKINS) {
    for (const r of [busy(5, 3), busy(12, 8), finished(14, 7)]) {
      const moving = buildSvg(r, 640, 200, 1, skin, { context: 0.9 }).source
      const still = buildSvg(r, 640, 200, 1, skin, { context: 0.9, motion: false }).source
      expect(SMIL.test(still), `${skin.id}: no SMIL`).toBe(false)
      expect(still.endsWith('</svg>'), `${skin.id}: well-formed`).toBe(true)
      // Every mini cube shows; only the falling "next" one per live cube is gone.
      const minis = (s: string) => (s.match(/<use href="#(?:r2-)?m-/g) ?? []).length
      const incoming = (moving.match(/values="0;0\.8;0\.8;0"/g) ?? []).length
      // A cube finished just now shows its minis fusing into the block: 27 that only exist while that plays.
      const fusing = (moving.match(/values="0.95;0"/g) ?? []).length * 27
      expect(minis(still), `${skin.id}: mini cubes`).toBe(minis(moving) - incoming - fusing)
      expect(minis(still) > 0, `${skin.id}: some mini cubes`).toBe(true)
      // Nothing waits invisible for an animation that never runs: the drop-in wrapper is gone.
      expect(still.includes('<g opacity="0"><use'), `${skin.id}: no hidden mini cube`).toBe(false)
    }
  }
  expect(stripSmil('<g><animate attributeName="x" values="1;2"/><rect/></g><g opacity="0.6"><animateMotion path="M0 0"/><circle/></g><set attributeName="y" to="1"/>')).toBe('<g><rect/></g>')
})

test('renderer: plaques carry a status glyph and titles a status word', async () => {
  expect(Object.keys(STATUS_GLYPH).sort()).toEqual(['done', 'error', 'pending', 'running', 'waiting'])
  const src = buildSvg(busy(5, 2), 640, 200).source
  for (const g of ['✓', '▶', '○']) expect(src.includes(`>${g}`), `glyph ${g}`).toBe(true)
  expect(src.includes('(done') && src.includes('(running') && src.includes('(open')).toBe(true)
  let w = applyTaskTool(startRun(emptyRun, 'job', 1), PLAN, { items: [{ content: 'Ask', status: 'in_progress' }] }, undefined, 1)
  w = toolStart(w, { id: 'ask', tool: 'AskUserQuestion', agentId: undefined }, 100)
  const ws = buildSvg(w, 400, 200).source
  expect(ws.includes('⏸')).toBe(true)
  expect(ws.includes('(waiting for you')).toBe(true)
})

test('every skin carries the progress in a pipe of its own, in the band at the pedestal foot', async () => {
  let r = startRun(emptyRun, 'Build it', 1)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', { items: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'in_progress' }, { content: 'C', status: 'pending' }] }, undefined, 2)
  for (const skin of SKINS) {
    const src = buildSvg(r, 600, 60_000, -1, skin).source
    expect(src.includes('pp-clip'), `${skin.id}: pipe`).toBe(true)
    expect(src.includes('url(#track)'), `${skin.id}: no old track`).toBe(false)
  }
  const retroSrc = buildSvg(r, 600, 60_000, -1, SKINS.find(s => s.id === 'retro')!).source
  expect(retroSrc.includes('fill="url(#pp-fill)"'), 'retro fills with pixel blocks, not a gradient bar').toBe(false)
})

test('a drawing that comes back (A, B, A) is locked to the clock afresh; the same one twice stays as it was', async () => {
  clearSvgCache()
  let a = startRun(emptyRun, 'Build it', 1)
  a = applyTaskTool(a, 'mcp__ccd_turn__update_plan', { items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }] }, undefined, 2)
  a = toolStart(a, { id: 'x', tool: 'Read', agentId: undefined, input: { file_path: '/a' } }, 3)
  const b = toolEnd(a, { id: 'x', tool: 'Read', agentId: undefined, isError: true, errorText: 'no' }, 4)
  const first = buildSvg(a, 600, 10_000).source
  expect(buildSvg(a, 600, 11_000).source, 'same picture, same source').toBe(first)
  buildSvg(b, 600, 12_000)
  const back = buildSvg(a, 600, 13_300).source
  expect(back.includes('repeatCount="indefinite"')).toBe(true)
  expect(back, 'a picture coming back starts its animations where the clock is').not.toBe(first)
})

test('the scene tells its state: mood lights, flights, landings, no backdrop and two rows', async () => {
  clearSvgCache()
  let r = startRun(emptyRun, 'Build it', 1)
  r = applyTaskTool(r, 'mcp__ccd_turn__update_plan', { items: [{ content: 'Read it', status: 'completed' }, { content: 'Write it', status: 'in_progress' }, { content: 'Test it', status: 'pending' }] }, undefined, 2)
  r = toolStart(r, { id: 'x', tool: 'Edit', agentId: undefined, input: { file_path: '/a', old_string: 'a', new_string: 'a\nb' } }, 1000)
  r = toolEnd(r, { id: 'x', tool: 'Edit', agentId: undefined, isError: false, errorText: '' }, 1500)
  r = addAgent(r, { id: 'a1', name: 'Test it', kind: 'general-purpose' }, 1600)
  const now = buildSvg(r, 640, 2000).source
  expect(now.includes('values="0 -'), 'the newest mini cube drops in').toBe(true)
  expect(now.includes('calcMode="spline"'), 'the new subagent flies over').toBe(true)
  const later = buildSvg(r, 640, 9000).source
  expect(later.includes('calcMode="spline"'), 'and settles').toBe(false)
  const waiting = buildSvg({ ...r, status: 'waiting' }, 640, 9000).source
  expect(waiting.includes('url(#mood-cone)'), 'a warm spot on the waiting step').toBe(true)
  // The scene stands free: no skin lays a ground over the whole drawing, whatever the state.
  for (const skin of SKINS) {
    for (const run of [r, { ...r, status: 'waiting' as const }, endRun(r, 'answer', 9500)]) {
      const d = buildSvg(run, 640, 9600, -1, skin)
      const whole = d.source.split(`width="${d.width}" height="${d.height}"`).length - 1
      expect(whole, `${skin.id}: only the drawing itself spans the whole size`).toBe(1)
    }
  }
  let long = startRun(emptyRun, 'Long', 1)
  long = applyTaskTool(long, 'mcp__ccd_turn__update_plan', { items: Array.from({ length: 10 }, (_, i) => ({ content: `S${i}`, status: i === 0 ? 'in_progress' : 'pending' })) }, undefined, 2)
  expect(buildSvg(long, 640, 9000).source.includes('id="r2-'), 'ten steps stand in two rows').toBe(true)
})
