import { expect, mock, test } from 'claude-code/testing'

import type { CubeRun, CubeStatus } from '../types'
import { buildSvg } from '../hooks/iso'
import { addAgent, applyTaskTool, emptyRun, endRun, startRun, toolEnd, toolStart } from '../hooks/model'
import { SKINS, skinById } from '../hooks/skins'
import type { CubeCtx, SceneCtx, Skin } from '../hooks/skins'
import { box } from '../hooks/svg'
import type { Pt } from '../hooks/svg'

const MAX_SOURCE = 131072
const SVG_NS = 'http://www.w3.org/2000/svg'
const PLAN = 'mcp__ccd_turn__update_plan'
const WIDTH = 520
const NOW = 600_000

// ---------------------------------------------------------------------------
// Runs in every state the renderer must handle.
// ---------------------------------------------------------------------------

const KIND_TOOLS = ['Read', 'Edit', 'Bash', 'Agent', 'mcp__x__do_thing']

function planRun(titles: string[], statuses: string[], now = 1): CubeRun {
  return applyTaskTool(startRun(emptyRun, 'job', now), PLAN, {
    items: titles.map((content, i) => ({ content, status: statuses[i] ?? 'pending' })),
  }, undefined, now)
}

/** `count` calls of every kind on whoever `agentId` is; every third one fails. */
function calls(r0: CubeRun, prefix: string, agentId: string | undefined, count: number, at: number): CubeRun {
  let r = r0
  for (let i = 0; i < count; i++) {
    const tool = KIND_TOOLS[i % KIND_TOOLS.length]!
    const id = `${prefix}-${i}`
    r = toolStart(r, { id, tool, agentId, input: { file_path: `C:/x/${id}.txt` } }, at + i)
    r = toolEnd(r, { id, tool, agentId, isError: i % 3 === 2, errorText: 'boom' }, at + i + 50)
  }
  return r
}

function idleRun(): CubeRun {
  return emptyRun
}

function noPlanRun(): CubeRun {
  let r = startRun(emptyRun, 'no plan', 1)
  r = calls(r, 'np', undefined, 7, 10)
  // One still running.
  r = toolStart(r, { id: 'np-live', tool: 'Bash', agentId: undefined }, 500)
  return r
}

function busyRun(): CubeRun {
  let r = planRun(
    ['Set up canvas', 'Agent: forest background', 'Agent: motocross rider', 'Agent: ramp and dirt', 'Polish and test'],
    ['completed', 'in_progress', 'pending', 'pending', 'pending'],
  )
  r = calls(r, 'main', undefined, 10, 100)
  r = addAgent(r, { id: 'a1', name: 'Forest background', kind: 'general-purpose' }, 200)
  r = addAgent(r, { id: 'a2', name: 'Motocross rider', kind: 'general-purpose' }, 200)
  r = addAgent(r, { id: 'a3', name: 'Ramp and dirt', kind: 'general-purpose' }, 200)
  r = calls(r, 'a1', 'a1', 6, 300)
  r = calls(r, 'a2', 'a2', 8, 400)
  r = calls(r, 'a3', 'a3', 5, 500)
  // A call still in flight on a subagent.
  r = toolStart(r, { id: 'a2-live', tool: 'Read', agentId: 'a2' }, 900)
  return r
}

function waitingRun(): CubeRun {
  let r = planRun(['Ask', 'Do'], ['in_progress', 'pending'])
  r = calls(r, 'w', undefined, 3, 10)
  return toolStart(r, { id: 'ask', tool: 'AskUserQuestion', agentId: undefined }, 100)
}

function allDoneRun(): CubeRun {
  let r = planRun(['One', 'Two', 'Three'], ['in_progress', 'pending', 'pending'])
  r = calls(r, 'd1', undefined, 4, 10)
  r = applyTaskTool(r, PLAN, { advance: true }, undefined, 30_000)
  r = calls(r, 'd2', undefined, 4, 30_010)
  r = applyTaskTool(r, PLAN, { done: [2, 3] }, undefined, 60_000)
  return endRun(r, 'answer', 60_000)
}

const GREEK = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima']

function heavyRun(): CubeRun {
  const titles = GREEK.map(g => `Build ${g} module`)
  let r = planRun(titles, titles.map((_, i) => (i < 8 ? 'in_progress' : 'pending')))
  for (let i = 0; i < 8; i++) {
    const id = `ag-${GREEK[i]}`
    r = addAgent(r, { id, name: `${GREEK[i]} module`, kind: 'general-purpose' }, 1)
    r = calls(r, id, id, 27, 10 + i * 100)
  }
  return r
}

const STATES: [string, () => CubeRun][] = [
  ['empty idle', idleRun],
  ['no plan, tool calls', noPlanRun],
  ['5 steps, 3 subagents, errors', busyRun],
  ['waiting', waitingRun],
  ['all done', allDoneRun],
  ['heavy 12 steps, 8 full', heavyRun],
]

// ---------------------------------------------------------------------------
// Checks.
// ---------------------------------------------------------------------------

function unsafe(src: string): string[] {
  const out: string[] = []
  if (/<script/i.test(src)) out.push('<script')
  const ev = src.match(/\son[a-z]+\s*=/i)
  if (ev) out.push(`event attribute ${ev[0].trim()}`)
  if (/javascript:/i.test(src)) out.push('javascript:')
  for (const m of src.match(/https?:\/\/[^\s"'<>)]*/gi) ?? []) if (m !== SVG_NS) out.push(`url ${m}`)
  return out
}

const ids = (src: string) => [...src.matchAll(/\sid\s*=\s*["']([^"']*)["']/g)].map(m => m[1] ?? '')

test('skins: the registry has unique ids and a classic fallback', async () => {
  expect(SKINS.length).toBeGreaterThan(0)
  expect(SKINS[0]?.id).toBe('classic')
  expect(new Set(SKINS.map(s => s.id)).size).toBe(SKINS.length)
  for (const s of SKINS) {
    expect(/^[a-z][a-z0-9-]*$/.test(s.id), `skin id "${s.id}" is a plain lowercase id`).toBe(true)
    expect(skinById(s.id)).toBe(s)
  }
  expect(skinById('nope').id).toBe('classic')
  expect(skinById(undefined).id).toBe('classic')
  expect(skinById('').id).toBe('classic')
})

test('skins: every state renders a bounded, well-formed svg', async () => {
  for (const skin of SKINS) {
    for (const [name, make] of STATES) {
      for (const width of [180, WIDTH, 680]) {
        const label = `${skin.id} / ${name} / width ${width}`
        const svg = buildSvg(make(), width, NOW, -1, skin)
        expect(svg.source.startsWith('<svg'), `${label}: starts with <svg`).toBe(true)
        expect(svg.source.endsWith('</svg>'), `${label}: ends with </svg>`).toBe(true)
        expect(svg.source.length <= MAX_SOURCE, `${label}: ${svg.source.length} chars > ${MAX_SOURCE}`).toBe(true)
        expect(svg.width > 0 && svg.height > 0, `${label}: positive size`).toBe(true)
      }
    }
  }
})

test('skins: the test runs are in the states they claim', async () => {
  const heavy = heavyRun()
  expect(heavy.tasks).toHaveLength(12)
  for (let i = 0; i < 8; i++) {
    expect(heavy.tasks[i]?.status).toBe('running')
    expect(heavy.tasks[i]?.calls).toBe(27)
  }
  expect(buildSvg(heavy, WIDTH, NOW).alt).toContain('Würfel 1, 2, 3, 4, 5, 6, 7, 8')
  const busy = busyRun()
  expect(busy.tasks).toHaveLength(5)
  expect(busy.tasks[0]?.status).toBe('done')
  expect(new Set(busy.agents.map(a => a.taskIndex)).size).toBe(3)
  expect(busy.errors > 0).toBe(true)
  expect(noPlanRun().tasks).toHaveLength(0)
  expect(waitingRun().status).toBe('waiting')
  expect(allDoneRun().tasks.every(t => t.status === 'done')).toBe(true)
})

test('skins: the heavy run fits the limit at every width', async () => {
  for (const skin of SKINS) {
    for (const width of [180, 260, 400, 520, 680, 1200]) {
      const src = buildSvg(heavyRun(), width, NOW, 3, skin).source
      expect(src.length <= MAX_SOURCE && src.endsWith('</svg>'), `${skin.id} heavy at ${width}: ${src.length}`).toBe(true)
    }
  }
})

test('skins: a selected cube renders too', async () => {
  for (const skin of SKINS) {
    for (const sel of [0, 2, 4]) {
      const svg = buildSvg(busyRun(), WIDTH, NOW, sel, skin)
      expect(svg.source.endsWith('</svg>'), `${skin.id} selected ${sel}`).toBe(true)
      expect(svg.source.length <= MAX_SOURCE, `${skin.id} selected ${sel}: ${svg.source.length}`).toBe(true)
    }
  }
})

test('skins: no scripts, event handlers, javascript: or external urls', async () => {
  for (const skin of SKINS) {
    for (const [name, make] of STATES) {
      const src = buildSvg(make(), WIDTH, NOW, 1, skin).source
      const bad = unsafe(src)
      expect(bad, `${skin.id} / ${name}: ${bad.join(', ')}`).toEqual([])
    }
  }
})

// ---------------------------------------------------------------------------
// The skin's hooks, called directly with hand-built contexts.
// ---------------------------------------------------------------------------

const STATUSES: CubeStatus[] = ['pending', 'running', 'done', 'error', 'waiting']

function sceneCtx(n: number, detail: 0 | 1 | 2, hasLive: boolean, overall: number): SceneCtx {
  const S = 40
  const ox = 30
  const oy = 120
  const P = (u: number, v: number, w: number): Pt => [ox + (u + v * 0.42) * S, oy - (w + v * 0.3) * S]
  const uEnd = (n - 1) * 1.3 + 1.32
  return {
    width: Math.ceil((uEnd + 1) * S + 60),
    height: 220,
    S,
    detail,
    hasLive,
    n,
    P,
    pedestal: box(P, -0.32, uEnd, -0.28, 1.18, -0.95, 0),
    cubeU: (i: number) => i * 1.3,
    overall,
    context: 0.5,
  }
}

function cubeCtx(ctx: SceneCtx, index: number, status: CubeStatus, fill: number): CubeCtx {
  const u0 = ctx.cubeU(index)
  const b = box(ctx.P, u0, u0 + 1, 0, 1, 0, 1)
  const solid = status === 'done' || status === 'error'
  return {
    index,
    status,
    kind: solid ? 'solid' : 'glass',
    isLive: status === 'running' || status === 'waiting',
    isGhost: status === 'pending',
    fill,
    slots: 27,
    box: b,
    u0,
    u1: u0 + 1,
    front: ctx.P(u0 + 0.5, 0, 0.5),
    top: ctx.P(u0 + 0.5, 0.5, 1),
    justDone: false,
    stuck: '',
    blockedBy: [],
    added: 0,
    removed: 0,
    test: '',
  }
}

type HookOut = { where: string; markup: string }

/** Calls every hook the skin has over the edge cases; throws name the case. */
function hookOutputs(skin: Skin): HookOut[] {
  const out: HookOut[] = []
  const call = (where: string, fn: () => string | undefined) => {
    let markup: unknown
    try {
      markup = fn()
    } catch (e) {
      throw new Error(`${skin.id}: ${where} threw: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (markup === undefined) return
    if (typeof markup !== 'string') throw new Error(`${skin.id}: ${where} returned ${typeof markup}, not a string`)
    out.push({ where, markup })
  }
  for (const n of [1, 2, 5, 12]) {
    for (const detail of [0, 1, 2] as const) {
      for (const hasLive of [false, true]) {
        for (const overall of [0, 0.5, 1]) {
          const ctx = sceneCtx(n, detail, hasLive, overall)
          const tag = `n=${n} detail=${detail} live=${hasLive} overall=${overall}`
          if (skin.defs) call(`defs(${tag})`, () => skin.defs!(ctx))
          if (skin.backdrop) call(`backdrop(${tag})`, () => skin.backdrop!(ctx))
          if (skin.pedestalDecor) call(`pedestalDecor(${tag})`, () => skin.pedestalDecor!(ctx))
          if (skin.overlay) call(`overlay(${tag})`, () => skin.overlay!(ctx))
          if (overall !== 0.5) continue
          for (let i = 0; i < n; i += Math.max(1, n - 1)) {
            for (const status of STATUSES) {
              for (const fill of [0, 1, 13, 27]) {
                const cube = cubeCtx(ctx, i, status, fill)
                const ctag = `${tag} cube=${i} ${status} fill=${fill}`
                if (skin.cubeInner) call(`cubeInner(${ctag})`, () => skin.cubeInner!(ctx, cube))
                if (skin.cubeOverlay) call(`cubeOverlay(${ctag})`, () => skin.cubeOverlay!(ctx, cube))
              }
            }
          }
        }
      }
    }
  }
  return out
}

test('skins: hooks do not throw on edge cases (n = 1, detail 0..2, fill 0 and full)', async () => {
  for (const skin of SKINS) {
    let err: unknown
    try {
      hookOutputs(skin)
    } catch (e) {
      err = e
    }
    expect(err === undefined, err instanceof Error ? err.message : String(err)).toBe(true)
  }
})

test('skins: hook markup is safe', async () => {
  for (const skin of SKINS) {
    for (const { where, markup } of hookOutputs(skin)) {
      const bad = unsafe(markup)
      expect(bad, `${skin.id} ${where}: ${bad.join(', ')}`).toEqual([])
    }
  }
})

test('skins: every id a skin defines starts with "<skin id>-"', async () => {
  for (const skin of SKINS) {
    if (skin.id === 'classic') continue
    const bad = new Set<string>()
    for (const { where, markup } of hookOutputs(skin)) {
      for (const id of ids(markup)) if (!id.startsWith(`${skin.id}-`)) bad.add(`${id} (${where.split('(')[0]})`)
    }
    expect([...bad], `${skin.id}: ids without the "${skin.id}-" prefix`).toEqual([])
  }
})

test('skins: in a full render, ids beyond classic\'s carry the skin prefix and none repeats', async () => {
  for (const [name, make] of STATES) {
    const base = new Set(ids(buildSvg(make(), WIDTH, NOW, -1, skinById('classic')).source))
    for (const skin of SKINS) {
      const all = ids(buildSvg(make(), WIDTH, NOW, -1, skin).source)
      const dup = all.filter((id, i) => all.indexOf(id) !== i)
      expect([...new Set(dup)], `${skin.id} / ${name}: duplicate ids`).toEqual([])
      if (skin.id === 'classic') continue
      const extra = all.filter(id => !base.has(id) && !id.startsWith(`${skin.id}-`))
      expect(extra, `${skin.id} / ${name}: ids without the "${skin.id}-" prefix`).toEqual([])
    }
  }
})

test('skins: every skin colours every status and kind', async () => {
  for (const skin of SKINS) {
    for (const s of STATUSES) {
      expect(skin.status[s]?.length, `${skin.id} status.${s}`).toBe(3)
      expect(typeof skin.plaque.text[s], `${skin.id} plaque.text.${s}`).toBe('string')
    }
    for (const k of ['read', 'write', 'run', 'agent', 'other', 'err'] as const) {
      const t = skin.tint[k]
      expect(Array.isArray(t) && typeof t[0] === 'string' && t[1] >= 0 && t[1] <= 1, `${skin.id} tint.${k}`).toBe(true)
    }
    expect(skin.name.length > 0 && skin.description.length > 0, `${skin.id} name and description`).toBe(true)
  }
})

// ---------------------------------------------------------------------------
// The picker in the desktop pane.
// ---------------------------------------------------------------------------

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

test('skins: the pane picker switches the drawing', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'cubes' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: PLAN,
    items: [
      { content: 'Eins', status: 'completed' },
      { content: 'Zwei', status: 'in_progress' },
      { content: 'Drei', status: 'pending' },
    ],
  } as never)

  // Whether two skins draw a run like the pane's differently at all (a skin
  // that only renames itself draws exactly what classic draws).
  const paneRun = busyRun()
  const differs = (a: string, b: string) =>
    buildSvg(paneRun, WIDTH, NOW, -1, skinById(a)).source !== buildSvg(paneRun, WIDTH, NOW, -1, skinById(b)).source

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const source = async (label: string) => {
    const el = await ui.find({ type: 'Svg' })
    expect(el, `${label}: Svg drawn`).toBeDefined()
    const src = el?.props.source
    expect(typeof src, `${label}: Svg source is a string`).toBe('string')
    const s = src as string
    expect(s.startsWith('<svg') && s.endsWith('</svg>'), `${label}: well-formed`).toBe(true)
    expect(s.length <= MAX_SOURCE, `${label}: within the limit`).toBe(true)
    return s
  }

  // The picker is one compact Select listing every skin.
  const picker = async (u: typeof ui) => (await u.find({ type: 'Select', key: 'skin' }))?.props as { value?: string; options?: { value: string }[] } | undefined
  expect((await picker(ui))?.options?.map(o => o.value)).toEqual(SKINS.map(s => s.id))

  const first = await source('classic')
  expect((await picker(ui))?.value).toBe('classic')

  await ui.select({ key: 'skin', value: 'cyber' })
  const cyber = await source('cyber')
  expect((await picker(ui))?.value).toBe('cyber')
  // A skin changes the drawing exactly when it draws such a run differently.
  expect(cyber !== first, 'cyber changes the drawing').toBe(differs('classic', 'cyber'))

  await ui.select({ key: 'skin', value: 'stellar' })
  const stellar = await source('stellar')
  expect((await picker(ui))?.value).toBe('stellar')
  expect(stellar !== cyber, 'stellar changes the drawing').toBe(differs('cyber', 'stellar'))
  expect(stellar !== first, 'stellar differs from classic').toBe(differs('classic', 'stellar'))
  await ui.unmount()

  // The pick outlives the drawing.
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await picker(again))?.value).toBe('stellar')
  expect(await again.find({ type: 'Svg' })).toBeDefined()
  await again.unmount()
})
