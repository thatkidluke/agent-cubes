import type { CallKind, CubeCall, CubeRun, CubeStatus } from '../types'
import { blockersOf, currentTaskIndex, isActive, isWorked, stepProgress, stuckReason } from './model'
import { classic, CLASSIC_CAPTION_DARK } from './skins/classic'
import type { CubeCtx, MiniKind, SceneCtx, Skin } from './skins/types'
import { box, circle, esc, fmt, lin, line, mix, n1, phaseLock, pline, poly, seeded } from './svg'
import type { Pt } from './svg'
import { pipeBandPx, pipeDefs, progressPipe, type PipeGeometry } from './pipe'
import { fmtDuration } from './panel/format'
import { tr } from './i18n'
import { contextTank, cracks, dependencies, smoke, testSeal } from './overlays'
import type { Detail } from './overlays'

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
const N = 3
const SLOTS = N * N * N
/** The Svg element's limit on its markup. */
const MAX_SOURCE = 131072
/** In compact mode (many cubes) the drawing drops ornament past this size. */
const COMPACT_BUDGET = 100_000

// Side view: an oblique projection. u runs along the timeline (right), w is
// up, v is depth, drawn up and to the right.
const DX = 0.42
const DY = 0.3
/** Distance from one cube's left edge to the next one's. */
const PITCH = 1.3
/** Pedestal: how far it reaches in front of and behind the cubes, and its height. */
const PED_FRONT = -0.28
const PED_BACK = 1.18
const PED_H = 0.95
const FOOT = 0.14
/** How long a cube counts as just finished. */
const JUST_DONE_MS = 4000
/** Caption sizes under the plaques: readable at a glance, never under 10 px. */
const capSize = (S: number) => Math.max(10, S * 0.26)
const diffSize = (S: number) => Math.max(10, S * 0.24)

type Badge = { color: string; letter: string; title: string; isLive: boolean }

/** One step: a glass cube filling as it progresses, or a solid finished one. */
type Big = {
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


function layout(r: CubeRun, now: number): Big[] {
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
        },
      ]

  return steps.map((t, i): Big => {
    const badges: Badge[] = []
    if (active && i === mainIndex) {
      badges.push({ color: MAIN_COLOR, letter: 'H', title: tr('Hauptagent', 'Main agent'), isLive: true })
    }
    r.agents.forEach((a, k) => {
      if ((hasPlan ? a.taskIndex : 0) !== i || a.status !== 'running') return
      badges.push({ color: agentColor(k), letter: agentInitial(a.name), title: `${a.name} (${a.kind})`, isLive: true })
    })
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
    }
  })
}

const pad2 = (v: number) => String(v).padStart(2, '0')

/** From this many steps on, runs of finished steps fold into one stacked cube. */
const COMPACT_FROM = 11
/** At most this many cubes are drawn; more fold trailing pending (then other) runs too. */
const MAX_POS = 12

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
  }
}

/**
 * Compact mode: with more than ten steps, the leading run of finished steps
 * (all but the last of them) folds into one stacked cube; if more than
 * MAX_POS cubes are left, the trailing pending run folds too (all but its
 * first), then other runs of finished or pending steps, longest first.
 * Every cube gets its position `pos`; `index` stays the step's.
 */
function fold(bigs: Big[]): Big[] {
  const n = bigs.length
  if (n < COMPACT_FROM) return bigs
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
  if (positions > MAX_POS) {
    let s = n
    while (s > 0 && !taken[s - 1] && foldable(bigs[s - 1], 'pending')) s--
    const from = Math.max(s + 1, n - (positions - MAX_POS + 1))
    if (n - from >= 2) {
      take(from, n)
      positions -= n - from - 1
    }
  }
  while (positions > MAX_POS) {
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

/**
 * Drops every SMIL animation from markup: elements moved along a path by
 * <animateMotion> (they have no sensible resting place) go entirely, the
 * animation elements themselves are cut out of the rest.
 */
export function stripSmil(s: string): string {
  if (!/<(animate|set)/.test(s)) return s
  return s
    .replace(/<(g|circle|ellipse|rect|path|polygon|polyline|use|text|image)\b[^>]*>(?:(?!<\1[\s>/])(?!<\/\1>)[\s\S])*?<animateMotion\b(?:(?!<\1[\s>/])(?!<\/\1>)[\s\S])*?<\/\1>/g, '')
    .replace(/<(animate|animateTransform|animateMotion|animateColor|set)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/g, '')
}

/** Polylines as one path's data: "M x y L x y …" per run of points. */
const pathD = (runs: Pt[][]) => runs.map(ps => ps.map(([x, y], k) => `${k ? 'L' : 'M'}${n1(x)} ${n1(y)}`).join('')).join('')

/** Fill order: layer by layer from the bottom, back row first, left to right, so the level visibly rises. */
const FILL_ORDER: [number, number, number][] = (() => {
  const out: [number, number, number][] = []
  for (let k = 0; k < N; k++) for (let j = N - 1; j >= 0; j--) for (let i = 0; i < N; i++) out.push([i, j, k])
  return out
})()

/** A skin hook's markup; a hook that throws costs its decoration, never the drawing. */
function safe(fn: (() => string) | undefined): string {
  if (!fn) return ''
  try {
    return fn()
  } catch {
    return ''
  }
}

/** Extra facts the drawing shows that are not part of the run. */
export type DrawOptions = {
  /** The session's context-window fill, 0..1. */
  context?: number | null
  /** false draws a still picture: no SMIL animation at all (reduced motion, battery). Default true. */
  motion?: boolean
}

/** What one drawing is made from: the cubes after folding and the facts around them. */
type Scene = {
  /** The cubes to draw, one per position. */
  bigs: Big[]
  /** Each step's position. */
  posOf: number[]
  /** Overall progress 0..1 over every step. */
  overall: number
  targetWidth: number
  /** The selected cube's position, or -1. */
  selPos: number
  /** The context window's fill, rounded to whole percent; null when unknown. */
  ctxFill: number | null
  /** Draw a still picture, no SMIL. */
  still: boolean
}

function render(sc: Scene, detail: Detail, skin: Skin) {
  const { bigs, posOf, overall, targetWidth, selPos, ctxFill, still } = sc
  const n = bigs.length
  const pad = 10
  const uStart = -0.32
  const uEnd = (n - 1) * PITCH + 1 + 0.32
  const fit = (span: number) => Math.max(14, Math.min(64, (targetWidth - 2 * pad) / span))
  // Skin hook markup loses its animation in a still picture.
  const hook = (fn: (() => string) | undefined) => (still ? stripSmil(safe(fn)) : safe(fn))
  const spanU0 = uEnd - uStart + 0.2 + (PED_BACK - PED_FRONT) * DX
  // The context tank's label sits right of the pedestal: make room for "100 %".
  const S0 = fit(spanU0)
  const spanU = spanU0 + (ctxFill === null ? 0 : 0.12 + (capSize(S0) * 0.62 * 5 * 1.2) / S0)
  const S = fit(spanU)
  const cs = capSize(S)
  const ds = diffSize(S)
  // The captions, and a diff line under them, need room: the pedestal grows to fit them.
  const anyDiff = bigs.some(b => b.added > 0 || b.removed > 0)
  // The progress pipe gets its own band at the pedestal's foot, under the plaques and captions.
  const pipeR = Math.max(3.5, S * 0.085)
  const pipeBand = pipeBandPx(pipeR) / S
  const pedH = Math.max(PED_H, 0.8 + (0.4 * cs + (anyDiff ? 1.35 * ds : 0)) / S + 0.06) + pipeBand
  const badgeR = Math.max(7, S * 0.2)
  const drop = S * 0.9
  const above = Math.max(drop, S * 0.42 + badgeR * 2 + 6)
  const width = Math.ceil(spanU * S + 2 * pad)
  const ox = pad - (uStart - 0.1 + PED_FRONT * DX) * S
  const oy = pad + above + (1 + DY) * S
  const height = Math.ceil(oy + (pedH + FOOT - (PED_FRONT - 0.08) * DY) * S + pad)
  const P = (u: number, v: number, w: number): Pt => [ox + (u + v * DX) * S, oy - (w + v * DY) * S]
  const Pr = (u: number, v: number, w: number): Pt => [(u + v * DX) * S, -(w + v * DY) * S]
  const cubeU = (i: number) => i * PITCH

  const statuses = [...new Set(bigs.map(b => b.status))]
  const hasLive = bigs.some(b => b.isLive)
  // In a still picture nothing moves: no sweep, glint, sparks or pulses.
  const moving = hasLive && !still
  const ped = box(P, uStart, uEnd, PED_FRONT, PED_BACK, -pedH, 0)
  const ctx: SceneCtx = { width, height, S, detail, hasLive, n, P, pedestal: ped, cubeU, overall, context: ctxFill }
  const pipe: PipeGeometry = {
    x0: P(uStart, PED_FRONT, 0)[0] + pipeR * 3.4,
    x1: P(uEnd, PED_FRONT, 0)[0] - pipeR * 3.4,
    y: P(0, PED_FRONT, -pedH)[1] - (pipeBand * S) / 2 - 1,
    r: pipeR,
    joints: Array.from({ length: Math.max(0, n - 1) }, (_, k) => P(cubeU(k + 1) - (PITCH - 1) / 2, PED_FRONT, 0)[0]),
  }

  // ── Definitions ──
  const defs: string[] = []
  for (const s of statuses) {
    const [t, f, sd] = skin.status[s]
    defs.push(lin(`${s}T`, 1, 1, [[0, mix(t, '#ffffff', 0.5)], [1, t]]))
    defs.push(lin(`${s}F`, 0, 1, [[0, mix(f, '#ffffff', 0.18)], [1, mix(f, '#000000', 0.22)]]))
    defs.push(lin(`${s}S`, 0, 1, [[0, sd], [1, mix(sd, '#000000', 0.35)]]))
    defs.push(lin(`${s}G`, 0, 1, [[0, t, skin.glass.top], [1, f, skin.glass.bottom]]))
  }
  const pd = skin.pedestal
  defs.push(lin('pF', 0, 1, [[0, pd.front[0]], [0.5, pd.front[1]], [1, pd.front[2]]]))
  defs.push(lin('pT', 0, 1, [[0, pd.top[0]], [1, pd.top[1]]]))
  defs.push(lin('pS', 0, 1, [[0, pd.side[0]], [1, pd.side[1]]]))
  defs.push(lin('plq', 0, 1, [[0, skin.plaque.frame[0]], [1, skin.plaque.frame[1]]]))
  defs.push(lin('plqIn', 0, 1, [[0, skin.plaque.inner[0]], [1, skin.plaque.inner[1]]]))
  defs.push(pipeDefs(pipe, skin, moving))
  if (moving && detail > 0) {
    defs.push(
      lin('sh', 1, 0.5, [[0, '#ffffff', 0], [0.42, '#ffffff', 0], [0.5, '#ffffff', 0.5], [0.58, '#ffffff', 0]],
        '<animateTransform attributeName="gradientTransform" type="translate" values="-1 0;1 0;1 0" keyTimes="0;0.6;1" dur="3s" repeatCount="indefinite"/>'),
    )
  }
  defs.push(`<filter id="sd" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n1(Math.max(1.2, S * 0.06))}"/></filter>`)
  defs.push(`<filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${n1(Math.max(1.5, S * 0.05))}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`)

  // One mini cube per kind of work, tinted, drawn once and placed with <use>.
  const pIn = 0.05
  const cell = (1 - 2 * pIn) / N
  const q = 0.09
  const ms = cell * (1 - 2 * q)
  const mb = box(Pr, 0, ms, 0, ms, 0, ms)
  const mi = skin.mini
  const usedKinds = new Set<MiniKind>(['other', ...bigs.flatMap(b => b.kinds)])
  for (const k of usedKinds) {
    const [tint, amount] = skin.tint[k]
    const tc = (c: string) => (amount ? mix(c, tint, amount) : c)
    defs.push(lin(`mT-${k}`, 1, 1, [[0, tc(mi.top[0])], [1, tc(mi.top[1])]]))
    defs.push(lin(`mF-${k}`, 0, 1, [[0, tc(mi.front[0])], [1, tc(mi.front[1])]]))
    defs.push(lin(`mS-${k}`, 0, 1, [[0, tc(mi.side[0])], [1, tc(mi.side[1])]]))
    defs.push(
      `<g id="m-${k}">` +
        poly(mb.front, `fill="url(#mF-${k})" class="e"`) +
        poly(mb.right, `fill="url(#mS-${k})" class="e"`) +
        poly(mb.top, `fill="url(#mT-${k})" class="e"`) +
        (detail > 0 ? pline([mb.front[3], mb.front[2], mb.right[2]], `fill="none" stroke="${mi.highlight}" stroke-opacity="0.75" stroke-width="0.6"`) : '') +
        `</g>`,
    )
  }
  if (moving && detail > 1) {
    // A glint laid over a mini cube, in three phases so it runs through the pile like a wave.
    for (let k = 0; k < 3; k++) {
      defs.push(
        `<polygon id="g${k}" points="${mb.front.map(fmt).join(' ')}" fill="${mi.glint}" opacity="0">` +
          `<animate attributeName="opacity" values="0;0.6;0" dur="2.4s" begin="${k * 0.8}s" repeatCount="indefinite"/></polygon>`,
      )
    }
  }
  defs.push(hook(skin.defs && (() => skin.defs!(ctx))))

  const css =
    `<style>.e{stroke:${skin.edge.color};stroke-opacity:${skin.edge.opacity};stroke-width:.7;stroke-linejoin:round}` +
    `.t{font-family:${skin.font};font-weight:700}` +
    // Classic's dark captions turn light, with a dark halo, when the pane is dark.
    (skin.id === 'classic' ? `@media (prefers-color-scheme:dark){.cap{fill:${CLASSIC_CAPTION_DARK};paint-order:stroke;stroke:#0f172a;stroke-opacity:.5;stroke-width:2px}}` : '') +
    // Skins on dark, busy grounds (brick, wood, stars) get a dark halo so small captions stay legible.
    (skin.id !== 'classic' && skin.id !== 'minimal' ? `.cap{paint-order:stroke;stroke:#000;stroke-opacity:.6;stroke-width:2.2px;stroke-linejoin:round}` : '') +
    `</style>`
  const parts: string[] = []
  const overlay: string[] = []

  parts.push(hook(skin.backdrop && (() => skin.backdrop!(ctx))))

  // ── Pedestal: a foot, the block, a bevel ──
  {
    const foot = box(P, uStart - 0.08, uEnd + 0.08, PED_FRONT - 0.08, PED_BACK + 0.08, -pedH - FOOT, -pedH)
    parts.push(poly(foot.bottom.map(p => [p[0] + S * 0.1, p[1] + S * 0.06] as Pt), `fill="${pd.shadow}" opacity="0.25" filter="url(#sd)"`))
    parts.push(poly(foot.front, 'fill="url(#pS)" class="e"'), poly(foot.right, `fill="${pd.footSide}" class="e"`), poly(foot.top, `fill="${pd.footTop}" class="e"`))
    parts.push(poly(ped.front, 'fill="url(#pF)" class="e"'), poly(ped.right, 'fill="url(#pS)" class="e"'), poly(ped.top, 'fill="url(#pT)" class="e"'))
    parts.push(line(ped.front[3], ped.front[2], `stroke="${pd.light}" stroke-opacity="0.8" stroke-width="1.2"`))
    parts.push(line(ped.front[0], ped.front[1], `stroke="${pd.shadow}" stroke-opacity="0.35" stroke-width="1"`))
    parts.push(line(ped.front[2], ped.top[2], `stroke="${pd.light}" stroke-opacity="0.45" stroke-width="0.9"`))
  }
  parts.push(hook(skin.pedestalDecor && (() => skin.pedestalDecor!(ctx))))
  if (ctxFill !== null) parts.push(safe(() => contextTank(ctxFill, P, S, uEnd, pedH, PED_BACK, cs, detail, skin, still)))

  // ── The progress pipe, in its own band at the pedestal's foot ──
  parts.push(progressPipe(pipe, overall, skin, moving, detail, skin.track.groove, pd.light))

  // ── Plaques: an embossed number per step on the pedestal's front, its time below ──
  for (const big of bigs) {
    const cu = cubeU(big.pos) + 0.5
    const pw = 0.74
    const top = -0.14
    const ph = 0.46
    const [lx, ly] = P(cu - pw / 2, PED_FRONT, top)
    const [rx, ry] = P(cu + pw / 2, PED_FRONT, top - ph)
    const w = rx - lx
    const h = ry - ly
    const inset = Math.max(1.5, S * 0.05)
    const led = big.isGhost ? '#475569' : skin.status[big.status][1]
    const lit = skin.plaque.text[big.status]
    // The number (or a stack's range) with its status glyph in front, shrunk to fit the plaque.
    const num = big.label
    const glyph = STATUS_GLYPH[big.status]
    const fs = Math.min(Math.max(8, h * 0.55), (w - 2 * inset) / (num.length * 0.62 + 0.95))
    const gs = n1(fs * 0.7)
    const lab = `<tspan font-size="${gs}">${glyph}</tspan> ${num}`
    parts.push(
      `<g><title>${esc(big.title)}</title>` +
        (skin.effects?.plaqueShadow === false ? '' : `<rect x="${n1(lx + 0.8)}" y="${n1(ly + 1.2)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(S * 0.06)}" fill="#0f172a" opacity="0.3" filter="url(#sd)"/>`) +
        `<rect x="${n1(lx)}" y="${n1(ly)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(S * 0.06)}" fill="url(#plq)" stroke="#475569" stroke-opacity="0.6" stroke-width="0.8"/>` +
        `<rect x="${n1(lx + inset)}" y="${n1(ly + inset)}" width="${n1(w - 2 * inset)}" height="${n1(h - 2 * inset)}" rx="${n1(S * 0.04)}" fill="url(#plqIn)"/>` +
        line([lx + inset, ly + inset + 0.5], [lx + w - inset, ly + inset + 0.5], 'stroke="#000000" stroke-opacity="0.45" stroke-width="1"') +
        `<circle cx="${n1(lx + w - inset * 2.1)}" cy="${n1(ly + inset * 2.1)}" r="${n1(Math.max(1.4, S * 0.035))}" fill="${led}"${big.isLive ? ' filter="url(#gl)"' : ''}>` +
        (big.isLive && !still ? '<animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/>' : '') +
        `</circle>` +
        `<text class="t" x="${n1(lx + w / 2)}" y="${n1(ly + h / 2 + fs * 0.36 + 0.9)}" font-size="${n1(fs)}" fill="#000000" opacity="0.6" text-anchor="middle">${lab}</text>` +
        `<text class="t" x="${n1(lx + w / 2)}" y="${n1(ly + h / 2 + fs * 0.36)}" font-size="${n1(fs)}" fill="${lit}" text-anchor="middle"${big.isLive ? ' filter="url(#gl)"' : ''}>${lab}</text>` +
        `</g>`,
    )
    if (big.pos === selPos) {
      parts.push(
        `<rect x="${n1(lx - 2.5)}" y="${n1(ly - 2.5)}" width="${n1(w + 5)}" height="${n1(h + 5)}" rx="${n1(S * 0.08)}" fill="none" stroke="#fbbf24" stroke-width="2" filter="url(#gl)"/>`,
      )
    }
    if (big.errors > 0) {
      const er = Math.max(5, S * 0.12)
      parts.push(
        `<g><title>${big.errors} ${tr('fehlgeschlagene Tool-Aufrufe', 'failed tool calls')}</title>` +
          `<circle cx="${n1(lx + 1)}" cy="${n1(ly + 1)}" r="${n1(er)}" fill="#ef4444" stroke="#ffffff" stroke-width="1"/>` +
          `<text class="t" x="${n1(lx + 1)}" y="${n1(ly + 1 + er * 0.4)}" font-size="${n1(er * 1.1)}" fill="#ffffff" text-anchor="middle">${big.errors > 9 ? '9+' : big.errors}</text></g>`,
      )
    }
    const [cx, cy] = P(cu, PED_FRONT, top - ph - 0.2)
    parts.push(`<text class="t cap" x="${n1(cx)}" y="${n1(cy + cs * 0.35)}" font-size="${n1(cs)}" fill="${skin.plaque.caption}" fill-opacity="0.8" text-anchor="middle">${esc(big.caption)}</text>`)
    if (big.added > 0 || big.removed > 0) {
      // The step's diff as a second caption line: +added −removed.
      const k = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))
      const plus = big.added > 0 ? `<tspan fill="${skin.status.done[1]}">+${k(big.added)}</tspan>` : ''
      const minus = big.removed > 0 ? `<tspan fill="${skin.status.error[1]}">−${k(big.removed)}</tspan>` : ''
      parts.push(
        `<text class="t cap" x="${n1(cx)}" y="${n1(cy + cs * 0.35 + ds * 1.15)}" font-size="${n1(ds)}" text-anchor="middle">` +
          `<title>${tr(`${big.added} Zeilen hinzugefügt, ${big.removed} entfernt`, `${big.added} lines added, ${big.removed} removed`)}</title>${plus}${plus && minus ? ' ' : ''}${minus}</text>`,
      )
    }
    if (big.stuck) {
      // A warning triangle right of the plaque.
      const triR = Math.max(5, S * 0.14)
      const tx = lx + w + triR * 0.35 + 2
      const ty = ly + 1
      parts.push(
        `<g><title>${tr('Hängt', 'Stuck')}: ${esc(big.stuck)}</title>` +
          poly([[tx + triR, ty], [tx + triR * 2, ty + triR * 1.75], [tx, ty + triR * 1.75]], `fill="${skin.status.waiting[1]}" stroke="#0f172a" stroke-opacity="0.6" stroke-width="0.8" stroke-linejoin="round"`) +
          `<text class="t" x="${n1(tx + triR)}" y="${n1(ty + triR * 1.55)}" font-size="${n1(triR * 1.25)}" fill="#0f172a" text-anchor="middle">!</text></g>`,
      )
    }
  }

  // ── Cubes, left to right ──
  for (const big of bigs) {
    const u0 = cubeU(big.pos)
    const u1 = u0 + 1
    const v0 = 0
    const v1 = 1
    const w0 = 0
    const w1 = 1
    const b = box(P, u0, u1, v0, v1, w0, w1)
    const s = big.status
    const [cTop, cFront, cSide] = skin.status[s]
    const onFront = (a: number, c: number): Pt => P(u0 + a, v0, w0 + c)
    const cube: CubeCtx = {
      // Skins place things with cubeU(index): the position, not the step.
      index: big.pos,
      status: s,
      kind: big.kind,
      isLive: big.isLive,
      isGhost: big.isGhost,
      // A still picture plays no one-shot effects.
      justDone: big.justDone && !still,
      stuck: big.stuck,
      blockedBy: [...new Set(big.blockedBy.map(j => posOf[j] ?? -1).filter(p => p >= 0 && p !== big.pos))],
      added: big.added,
      removed: big.removed,
      test: big.test,
      fill: big.fill,
      slots: SLOTS,
      box: b,
      u0,
      u1,
      front: P(u0 + 0.5, v0, 0.5),
      top: P(u0 + 0.5, 0.5, w1),
    }

    // Soft contact shadow cast back and to the right.
    parts.push(poly(box(P, u0 + 0.06, u1 + 0.16, v0 + 0.05, v1 + 0.12, 0, 0).top, `fill="${pd.shadow}" opacity="${big.isGhost ? 0.08 : 0.3}" filter="url(#sd)"`))

    // A stack of folded steps: two more cubes peek out behind and above the front one.
    if (big.count > 1) {
      const fills = big.kind === 'solid' ? [`url(#${s}F)`, `url(#${s}S)`, `url(#${s}T)`] : [`url(#${s}G)`, `url(#${s}G)`, `url(#${s}G)`]
      const op = big.isGhost ? ` opacity="${skin.glass.ghost}"` : ''
      for (const k of [2, 1]) {
        const sb = box(P, u0 - 0.07 * k, u1 - 0.07 * k, v0 + 0.1 * k, v1 + 0.1 * k, w0, w1 + 0.06 * k)
        parts.push(
          `<g${op}>` + poly(sb.front, `fill="${fills[0]}" class="e"`) + poly(sb.right, `fill="${fills[1]}" class="e"`) + poly(sb.top, `fill="${fills[2]}" class="e"`) + `</g>`,
        )
      }
    }
    const out: string[] = [`<g><title>${esc(big.title)}</title>`]
    if (big.kind === 'solid') {
      out.push(poly(b.front, `fill="url(#${s}F)" class="e"`), poly(b.right, `fill="url(#${s}S)" class="e"`), poly(b.top, `fill="url(#${s}T)" class="e"`))
      if (detail > 0) {
        const seams: Pt[][] = []
        for (let k = 1; k < N; k++) {
          const t = k / N
          seams.push([P(u0 + t, v0, w0), P(u0 + t, v0, w1)], [P(u0, v0, t), P(u1, v0, t)])
          seams.push([P(u0 + t, v0, w1), P(u0 + t, v1, w1)], [P(u0, t, w1), P(u1, t, w1)])
          seams.push([P(u1, t, w0), P(u1, t, w1)], [P(u1, v0, t), P(u1, v1, t)])
        }
        out.push(`<path d="${pathD(seams)}" fill="none" stroke="${skin.edge.color}" stroke-opacity="0.13" stroke-width="0.6"/>`)
      }
      out.push(pline([b.front[0], b.front[3], b.front[2]], 'fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"'))
      out.push(line(b.front[2], b.right[2], 'stroke="#ffffff" stroke-opacity="0.6" stroke-width="1"'))
      const mk = `fill="none" stroke="#ffffff" stroke-opacity="0.95" stroke-width="${n1(Math.max(1.6, S * 0.08))}" stroke-linecap="round" stroke-linejoin="round"`
      if (s === 'done') out.push(pline([onFront(0.26, 0.5), onFront(0.43, 0.32), onFront(0.75, 0.7)], mk))
      if (s === 'error') out.push(line(onFront(0.3, 0.3), onFront(0.7, 0.7), mk), line(onFront(0.7, 0.3), onFront(0.3, 0.7), mk))
      out.push('</g>')
      parts.push(out.join(''))
    } else {
      const gOp = big.isGhost ? skin.glass.ghost : 1
      const stroke = `stroke="${cFront}" stroke-opacity="${big.isGhost ? 0.45 : 0.55}" stroke-width="${big.isGhost ? 0.8 : 1}" stroke-linejoin="round"${big.isGhost ? ' stroke-dasharray="2 2"' : ''}`
      out.push(`<g opacity="${gOp}" fill="url(#${s}G)" ${stroke}>`, poly(b.back, ''), poly(b.left, ''), poly(b.bottom, ''), '</g>')
      if (detail > 0 && !big.isGhost) {
        const grid: Pt[][] = []
        for (let k = 1; k < N; k++) {
          const t = k / N
          grid.push([P(u0 + t, v0, w0), P(u0 + t, v1, w0)], [P(u0, t, w0), P(u1, t, w0)])
        }
        out.push(`<path d="${pathD(grid)}" stroke="${cTop}" stroke-opacity="0.35" stroke-width="0.6"/>`)
      }

      // Mini cubes: fill in fill order, draw back to front, bottom to top, left to right.
      const at = ([i, j, k]: [number, number, number]): Pt => P(u0 + pIn + i * cell + cell * q, v0 + pIn + j * cell + cell * q, w0 + pIn + k * cell + cell * q)
      const filled = FILL_ORDER.slice(0, Math.min(big.fill, SLOTS))
      const newest = filled[filled.length - 1]
      const drawOrder = [...filled].sort((p, c) => c[1] - p[1] || p[2] - c[2] || p[0] - c[0])
      const shimmer = big.isLive && !still && detail > 1 && skin.effects?.glint !== false
      const use = (id: string, p: Pt) => `<use href="#${id}" x="${n1(p[0])}" y="${n1(p[1])}"/>`
      for (const slot of drawOrder) {
        const p = at(slot)
        const kind = big.kinds[FILL_ORDER.indexOf(slot)] ?? 'other'
        const body = use(`m-${kind}`, p) + (shimmer ? use(`g${(slot[0] + slot[2]) % 3}`, p) : '')
        // The newest mini cube drops in; in a still picture it simply sits there.
        if (big.isLive && !still && slot === newest) {
          out.push(
            `<g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.35s" fill="freeze"/>` +
              `<animateTransform attributeName="transform" type="translate" values="0 ${n1(-drop)};0 0;0 -1.5;0 0" keyTimes="0;0.7;0.85;1" dur="0.55s" fill="freeze"/>` +
              body + `</g>`,
          )
        } else out.push(body)
      }
      const next = FILL_ORDER[Math.min(big.fill, SLOTS)]
      // The next mini cube falling in over and over: only while things move.
      if (big.isLive && !still && next) {
        out.push(
          `<g opacity="0"><animate attributeName="opacity" values="0;0.8;0.8;0" keyTimes="0;0.25;0.8;1" dur="1.4s" repeatCount="indefinite"/>` +
            `<animateTransform attributeName="transform" type="translate" values="0 ${n1(-drop)};0 0;0 0" keyTimes="0;0.6;1" dur="1.4s" repeatCount="indefinite"/>` +
            use('m-other', at(next)) + `</g>`,
        )
      }
      out.push(hook(skin.cubeInner && (() => skin.cubeInner!(ctx, cube))))

      out.push(`<g opacity="${gOp}"><g fill="url(#${s}G)">`, poly(b.front, ''), poly(b.right, ''), poly(b.top, ''), '</g>')
      if (big.isLive && !still && detail > 0 && skin.effects?.sweep !== false) out.push(poly(b.front, 'fill="url(#sh)"'), poly(b.top, 'fill="url(#sh)"'))
      const pulse = big.isLive && !still && skin.effects?.pulse !== false
        ? `<animate attributeName="stroke-opacity" values="1;0.4;1" dur="${s === 'waiting' ? '0.9s' : '1.6s'}" repeatCount="indefinite"/>`
        : ''
      const edge = `fill="none" stroke="${big.isGhost ? cFront : cSide}" stroke-opacity="${big.isGhost ? 0.55 : 1}" stroke-width="${big.isGhost ? 0.9 : 1.4}" stroke-linejoin="round"${big.isGhost ? ' stroke-dasharray="2 2"' : ''}${big.isLive && skin.effects?.glow !== false ? ' filter="url(#gl)"' : ''}`
      const edges = pathD([[b.front[0], b.front[1], b.right[1], b.right[2], b.top[3], b.front[3], b.front[0]], [b.front[3], b.front[2], b.front[1]], [b.front[2], b.right[2]]])
      out.push(`<path d="${edges}" ${edge}>${pulse}</path>`)
      if (!big.isGhost) out.push(pline([b.front[3], b.front[2]], 'fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="0.7"'))
      out.push('</g></g>')
      parts.push(out.join(''))

      if (big.isLive && !still && detail > 1 && skin.effects?.sparks !== false) {
        const spots: [number, number][] = [[0.25, 0.4], [0.6, 0.7], [0.45, 0.2], [0.8, 0.45]]
        spots.forEach(([a, c], k) => {
          const [sx, sy] = P(u0 + a, v0 + c, w1)
          const rise = S * (0.4 + k * 0.07)
          overlay.push(
            `<circle cx="${n1(sx)}" cy="${n1(sy)}" r="${n1(Math.max(0.9, S * 0.03))}" fill="${cTop}" opacity="0">` +
              `<animate attributeName="opacity" values="0;1;0" dur="2.2s" begin="${n1(k * 0.55)}s" repeatCount="indefinite"/>` +
              `<animate attributeName="cy" values="${n1(sy)};${n1(sy - rise)}" dur="2.2s" begin="${n1(k * 0.55)}s" repeatCount="indefinite"/>` +
              `</circle>`,
          )
        })
      }
    }
    if (big.stuck) {
      parts.push(safe(() => cracks(cube, P, S, big.stuck)))
      // Smoke only shows while it moves.
      if (detail > 0 && !still) overlay.push(safe(() => smoke(cube, P, S, detail)))
    }
    parts.push(hook(skin.cubeOverlay && (() => skin.cubeOverlay!(ctx, cube))))
    if (big.test) overlay.push(safe(() => testSeal(big.test, b.front[2], S, skin)))

    // Agent badges above the cube.
    const [tx, ty] = P(u0 + 0.5, 0.5, w1)
    const count = big.badges.length
    big.badges.forEach((bd, k) => {
      const bx = tx + (k - (count - 1) / 2) * badgeR * 2.4
      const by = ty - S * 0.42 - badgeR
      const bob = bd.isLive && !still
        ?`<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="1.8s" begin="${n1(k * 0.3)}s" repeatCount="indefinite"/>`
        : ''
      overlay.push(
        `<g><title>${esc(bd.title)}</title>${bob}` +
          line([tx, ty], [bx, by + badgeR], `stroke="${bd.color}" stroke-width="1.3" stroke-opacity="0.85"`) +
          `<circle cx="${n1(tx)}" cy="${n1(ty)}" r="1.8" fill="${bd.color}"/>` +
          `<circle cx="${n1(bx + 1)}" cy="${n1(by + 1.5)}" r="${n1(badgeR)}" fill="#0f172a" opacity="0.3" filter="url(#sd)"/>` +
          `<circle cx="${n1(bx)}" cy="${n1(by)}" r="${n1(badgeR)}" fill="${bd.color}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="1.2"/>` +
          `<circle cx="${n1(bx - badgeR * 0.3)}" cy="${n1(by - badgeR * 0.35)}" r="${n1(badgeR * 0.35)}" fill="#ffffff" opacity="0.35"/>` +
          `<text class="t" x="${n1(bx)}" y="${n1(by + badgeR * 0.38)}" font-size="${n1(badgeR * 1.1)}" fill="#0f172a" text-anchor="middle">${esc(bd.letter)}</text>` +
          `</g>`,
      )
    })
  }
  overlay.push(safe(() => dependencies(bigs, posOf, P, S, cubeU, detail, skin, still)))
  overlay.push(hook(skin.overlay && (() => skin.overlay!(ctx))))

  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${css}<defs>${defs.join('')}</defs>${parts.join('')}${overlay.join('')}</svg>`
  return { source, width, height }
}

type Drawing = { source: string; width: number; height: number; alt: string }

/**
 * The last few drawings by everything that shows in them. The panel redraws
 * every second; while nothing visible changed, buildSvg hands back the very
 * same result, so the host keeps the frame and its animations keep running.
 */
const CACHE_SIZE = 6
const cache: { key: string; skin: Skin; raw: string; out: Drawing }[] = []

/** Forgets every cached drawing (tests). */
export function clearSvgCache(): void {
  cache.length = 0
}

export function buildSvg(
  r: CubeRun,
  targetWidth: number,
  now = 0,
  selected = -1,
  skin: Skin = classic,
  opts: DrawOptions = {},
): { source: string; width: number; height: number; alt: string } {
  const steps = layout(r, now)
  const done = steps.filter(b => b.status === 'done').length
  const working = steps.filter(b => b.badges.length > 0).map(b => b.index + 1)
  const alt = tr(
    `Würfel-Zeitleiste: ${done} von ${steps.length} Würfeln erledigt${working.length ? `, gearbeitet wird an Würfel ${working.join(', ')}` : ''}`,
    `Cube timeline: ${done} of ${steps.length} cubes done${working.length ? `, working on cube ${working.join(', ')}` : ''}`,
  )

  const bigs = fold(steps)
  const posOf: number[] = []
  for (const b of bigs) for (let k = 0; k < b.count; k++) posOf[b.index + k] = b.pos
  const ctxRaw = opts.context
  const sc: Scene = {
    bigs,
    posOf,
    overall: steps.reduce((s, b) => s + (b.status === 'done' ? SLOTS : b.fill), 0) / (SLOTS * steps.length),
    targetWidth,
    selPos: selected >= 0 && selected < posOf.length ? posOf[selected]! : -1,
    // Whole percent: the tank moves, and the drawing changes, once per percent.
    ctxFill: typeof ctxRaw === 'number' && Number.isFinite(ctxRaw) ? Math.round(Math.max(0, Math.min(1, ctxRaw)) * 100) / 100 : null,
    still: opts.motion === false,
  }

  // Everything that shows: the cubes (status, fill, kinds, badges, caption,
  // titles, justDone, stuck, blockers, diff, test, errors), the selection,
  // skin, width, context, motion and progress. Nothing that only moves with
  // `now` without changing the picture is in it.
  const key = JSON.stringify([skin.id, sc.targetWidth, sc.selPos, sc.ctxFill, sc.still, sc.overall, alt, bigs])
  const hit = cache.findIndex(e => e.key === key && e.skin === skin)
  if (hit >= 0) {
    const [e] = cache.splice(hit, 1)
    // The drawing shown last stays as it is. One coming back after another (A, B, A)
    // is locked to the clock afresh: the old picture's animations started long ago.
    if (hit > 0) e!.out = { ...e!.out, source: phaseLock(e!.raw, now) }
    cache.unshift(e!)
    return e!.out
  }

  // Compact mode: past ten cubes they are small, the finest ornament would not
  // show anyway, and the markup keeps well clear of the limit.
  const compact = bigs.length > 10
  const budget = compact ? COMPACT_BUDGET : MAX_SOURCE
  let out = render(sc, compact ? 1 : 2, skin)
  if (out.source.length > budget && !compact) out = render(sc, 1, skin)
  if (out.source.length > budget) {
    const bare = render(sc, 0, skin)
    if (bare.source.length < out.source.length) out = bare
  }
  // Endless animations start where the clock says, so this drawing carries on from the one it replaces.
  const drawing: Drawing = { source: phaseLock(out.source, now), width: out.width, height: out.height, alt }
  cache.unshift({ key, skin, raw: out.source, out: drawing })
  if (cache.length > CACHE_SIZE) cache.length = CACHE_SIZE
  return drawing
}
