import type { CallKind, CubeCall, CubeRun, CubeStatus } from '../types'
import { blockersOf, currentTaskIndex, isActive, isWorked, stepProgress, stuckReason } from './model'
import { classic, CLASSIC_CAPTION_DARK } from './skins/classic'
import type { CubeCtx, MiniKind, SceneCtx, Skin } from './skins/types'
import { box, circle, esc, fmt, lin, line, mix, n1, pline, poly, seeded } from './svg'
import type { Pt } from './svg'

/** Status colours for the panel's text (the classic skin's): top, front, side. */
export const PALETTE: Record<CubeStatus, [string, string, string]> = classic.status

export const STATUS_LABEL: Record<CubeStatus, string> = {
  pending: 'offen',
  running: 'läuft',
  done: 'erledigt',
  error: 'Fehler',
  waiting: 'wartet auf dich',
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

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
  return `${m}:${String(s % 60).padStart(2, '0')}`
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
          title: 'Auftrag',
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
      badges.push({ color: MAIN_COLOR, letter: 'H', title: `Hauptagent${r.mainTool ? `, nutzt ${r.mainTool}` : ''}`, isLive: true })
    }
    r.agents.forEach((a, k) => {
      if ((hasPlan ? a.taskIndex : 0) !== i || a.status !== 'running') return
      badges.push({ color: agentColor(k), letter: agentInitial(a.name), title: `${a.name} (${a.kind})${a.tool ? `, nutzt ${a.tool}` : ''}`, isLive: true })
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
      title: `Würfel ${i + 1} von ${steps.length}: ${t.title} (${STATUS_LABEL[status]}${worked ? `, ca. ${pct} %` : ''}, ${t.calls} Tool-Aufrufe)`,
      badges,
      caption: status === 'done' ? (t.took ? fmtDuration(t.took) : '✓') : worked ? `≈ ${pct} %` : status === 'error' ? 'Fehler' : '–',
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
      `Würfel ${label} von ${total}: ${members.length} Schritte ${STATUS_LABEL[first.status]}` +
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

type Detail = 2 | 1 | 0

/** A skin hook's markup; a hook that throws costs its decoration, never the drawing. */
function safe(fn: (() => string) | undefined): string {
  if (!fn) return ''
  try {
    return fn()
  } catch {
    return ''
  }
}

type Proj = (u: number, v: number, w: number) => Pt
const HEX = /^#[0-9a-f]{6}$/i
/** `mix`, but leaves a colour it cannot parse unchanged. */
const shade = (c: string, to: string, t: number) => (HEX.test(c) ? mix(c, to, t) : c)

/** A glass tank on the pedestal's right side face, filled to the context window's use. */
function contextTank(fill: number, P: Proj, S: number, uEnd: number, pedH: number, fs: number, detail: Detail, skin: Skin, still: boolean): string {
  const u0 = uEnd
  const u1 = uEnd + 0.2
  const v0 = 0.22
  const v1 = 0.62
  const wB = -pedH + 0.1
  const wT = -0.08
  const pct = Math.round(fill * 100)
  const col = fill >= 0.8 ? skin.status.error[1] : fill >= 0.6 ? skin.status.waiting[1] : skin.track.from
  const g = box(P, u0, u1, v0, v1, wB, wT)
  let s = `<g><title>Kontextfenster zu ${pct} % gefüllt</title>`
  s += poly(g.back, `fill="#0f172a" fill-opacity="0.4"`)
  if (fill > 0) {
    const lq = box(P, u0 + 0.025, u1 - 0.025, v0 + 0.04, v1 - 0.04, wB + 0.01, wB + 0.01 + (wT - wB - 0.02) * fill)
    const pulse = fill >= 0.8 && detail > 0 && !still ?'<animate attributeName="opacity" values="1;0.5;1" dur="1.1s" repeatCount="indefinite"/>' : ''
    s +=
      `<g>${pulse}` +
      poly(lq.front, `fill="${col}" fill-opacity="0.9"`) +
      poly(lq.right, `fill="${shade(col, '#000000', 0.3)}" fill-opacity="0.9"`) +
      poly(lq.top, `fill="${shade(col, '#ffffff', 0.35)}"`) +
      `</g>`
  }
  // Marks at 60 % and 80 %.
  for (const m of [0.6, 0.8]) {
    const w = wB + (wT - wB) * m
    s += line(P(u0, v0, w), P(u0 + 0.08, v0, w), `stroke="${skin.pedestal.light}" stroke-opacity="0.7" stroke-width="0.8"`)
  }
  s +=
    poly(g.front, `fill="#ffffff" fill-opacity="0.12" class="e"`) +
    poly(g.right, `fill="#ffffff" fill-opacity="0.07" class="e"`) +
    poly(g.top, `fill="${skin.pedestal.footSide}" class="e"`) +
    line(P(u0 + 0.05, v0, wB + 0.06), P(u0 + 0.05, v0, wT - 0.06), `stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"`)
  const [lx] = P(uEnd, PED_BACK, 0)
  const [, ly] = P(u1, v0, (wB + wT) / 2)
  s +=
    `<text class="t cap" x="${n1(lx + 4)}" y="${n1(ly - 1)}" font-size="${n1(fs * 0.8)}" fill="${skin.plaque.caption}" fill-opacity="0.8">CTX</text>` +
    `<text class="t" x="${n1(lx + 4)}" y="${n1(ly + fs)}" font-size="${n1(fs)}" fill="${col}">${pct} %</text>`
  return s + `</g>`
}

/** Thin arched pipes from each unfinished blocker to the step that waits for it, and a lock on the waiting cube. */
function dependencies(bigs: Big[], posOf: number[], P: Proj, S: number, cubeU: (i: number) => number, detail: Detail, skin: Skin, still: boolean): string {
  const col = skin.status.waiting[1]
  const lk = Math.max(4.5, S * 0.12)
  let s = ''
  for (const big of bigs) {
    // Blockers are step indices; arcs run between the positions those steps are drawn at.
    const steps = [...new Set(big.blockedBy)].filter(j => j >= 0 && j < posOf.length && posOf[j] !== big.pos)
    if (steps.length === 0) continue
    const [ex, top] = P(cubeU(big.pos) + 0.5, 0.5, 1)
    const ey = top - lk * 2.1
    for (const at of [...new Set(steps.map(j => posOf[j]!))]) {
      const nums = steps.filter(j => posOf[j] === at).map(j => j + 1).join(', ')
      const [ax, ay] = P(cubeU(at) + 0.5, 0.5, 1)
      const hi = Math.min(ay, ey)
      const h = Math.max(4, Math.min(hi - 3, S * (0.3 + 0.12 * Math.abs(big.pos - at)), S * 0.85))
      const cx = (ax + ex) / 2
      const cy = 2 * (hi - h) - (ay + ey) / 2
      const d = `M${n1(ax)} ${n1(ay)}Q${n1(cx)} ${n1(cy)} ${n1(ex)} ${n1(ey)}`
      const len = Math.hypot(ex - cx, ey - cy) || 1
      const dx = (ex - cx) / len
      const dy = (ey - cy) / len
      const al = Math.max(4, S * 0.1)
      const flow = detail > 0 && !still ? '<animate attributeName="stroke-dashoffset" values="6;0" dur="0.7s" repeatCount="indefinite"/>' : ''
      s +=
        `<g><title>Schritt ${big.label} wartet auf Schritt ${nums}</title>` +
        `<path d="${d}" fill="none" stroke="#0f172a" stroke-opacity="0.25" stroke-width="2.6" stroke-linecap="round"/>` +
        `<path d="${d}" fill="none" stroke="${col}" stroke-opacity="0.9" stroke-width="1.2" stroke-dasharray="3 3" stroke-linecap="round">${flow}</path>` +
        circle([ax, ay], 1.8, `fill="${col}"`) +
        poly([[ex, ey], [ex - dx * al - dy * al * 0.5, ey - dy * al + dx * al * 0.5], [ex - dx * al + dy * al * 0.5, ey - dy * al - dx * al * 0.5]], `fill="${col}"`) +
        `</g>`
    }
    // The padlock on the cube's top.
    const bw = lk * 1.3
    const by = top - lk * 1.05
    const sw = n1(Math.max(1.1, lk * 0.24))
    s +=
      `<g><title>Wartet auf Schritt ${steps.map(j => j + 1).join(', ')}</title>` +
      `<path d="M${n1(ex - lk * 0.38)} ${n1(by)}v${n1(-lk * 0.32)}a${n1(lk * 0.38)} ${n1(lk * 0.38)} 0 0 1 ${n1(lk * 0.76)} 0v${n1(lk * 0.32)}" fill="none" stroke="${skin.pedestal.footSide}" stroke-width="${sw}"/>` +
      `<rect x="${n1(ex - bw / 2)}" y="${n1(by)}" width="${n1(bw)}" height="${n1(lk)}" rx="${n1(lk * 0.18)}" fill="${col}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="0.8"/>` +
      circle([ex, by + lk * 0.45], Math.max(0.8, lk * 0.15), `fill="#0f172a"`) +
      `</g>`
  }
  return s
}

/** A round seal on the cube's front-top-right corner: the last test run passed or failed. */
function testSeal(test: 'pass' | 'fail' | '', at: Pt, S: number, skin: Skin): string {
  if (!test) return ''
  const r = Math.max(5, S * 0.13)
  const [x, y] = at
  const ok = test === 'pass'
  const mk = `fill="none" stroke="#ffffff" stroke-width="${n1(Math.max(1.2, r * 0.28))}" stroke-linecap="round" stroke-linejoin="round"`
  return (
    `<g><title>${ok ? 'Letzter Testlauf bestanden' : 'Letzter Testlauf fehlgeschlagen'}</title>` +
    circle([x + 0.8, y + 1.2], r, `fill="#0f172a" opacity="0.3"`) +
    circle([x, y], r, `fill="${ok ? skin.status.done[1] : skin.status.error[1]}" stroke="#ffffff" stroke-width="1.2"`) +
    circle([x, y], r * 0.74, `fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.6" stroke-dasharray="1 1.2"`) +
    (ok
      ? pline([[x - r * 0.42, y + r * 0.02], [x - r * 0.1, y + r * 0.34], [x + r * 0.44, y - r * 0.34]], mk)
      : line([x - r * 0.32, y - r * 0.32], [x + r * 0.32, y + r * 0.32], mk) + line([x + r * 0.32, y - r * 0.32], [x - r * 0.32, y + r * 0.32], mk)) +
    `</g>`
  )
}

/** Jagged cracks over a stuck cube's front and top faces, dark with a light edge. */
function cracks(c: CubeCtx, P: Proj, S: number, why: string): string {
  const rnd = seeded(c.index * 7919 + 17)
  const cl = (v: number) => Math.max(0.06, Math.min(0.94, v))
  const f = (a: number, w: number): Pt => P(c.u0 + cl(a), 0, w)
  const a0 = 0.3 + rnd() * 0.35
  // One crack runs over the top edge and down the front, with a branch; one comes in from the right edge.
  const top: Pt[] = []
  for (let k = 3, a = a0; k >= 0; k--) {
    top.push(P(c.u0 + cl(a), k * (0.13 + rnd() * 0.05), 1))
    a += (rnd() - 0.5) * 0.25
  }
  const down: Pt[] = [f(a0, 1)]
  let branch: Pt[] = []
  for (let k = 0, a = a0, w = 1; k < 4; k++) {
    w -= 0.12 + rnd() * 0.09
    a += (rnd() - 0.5) * 0.24
    down.push(f(a, w))
    if (k === 1) branch = [f(a, w), f(a + 0.14 + rnd() * 0.08, w - 0.06 - rnd() * 0.08), f(a + 0.24, w - 0.18)]
  }
  const side: Pt[] = []
  for (let k = 0, a = 1, w = 0.3 + rnd() * 0.25; k < 3; k++) {
    side.push(f(a, w))
    a -= 0.11 + rnd() * 0.08
    w += (rnd() - 0.4) * 0.14
  }
  const dark = `fill="none" stroke="#0b0f17" stroke-opacity="0.75" stroke-width="${n1(Math.max(0.9, S * 0.025))}" stroke-linejoin="round" stroke-linecap="round"`
  const lit = `fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="0.7" stroke-linejoin="round"`
  const one = (ps: Pt[]) => pline(ps.map(([x, y]): Pt => [x + 0.8, y + 0.7]), lit) + pline(ps, dark)
  return `<g><title>Hängt: ${esc(why)}</title>${one([...top, ...down.slice(1)])}${one(branch)}${one(side)}</g>`
}

/** Grey wisps rising from a stuck cube's top and fading. */
function smoke(c: CubeCtx, P: Proj, S: number, detail: Detail): string {
  const count = detail > 1 ? 3 : 2
  let s = `<g fill="#9ca3af">`
  for (let k = 0; k < count; k++) {
    const [x, y] = P(c.u0 + 0.28 + k * 0.22, 0.45 + (k % 2) * 0.15, 1)
    const rise = S * (0.62 + k * 0.08)
    const r0 = Math.max(1.5, S * 0.05)
    const at = ` dur="3s" begin="${k}s" repeatCount="indefinite"`
    s +=
      `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r0)}" opacity="0">` +
      `<animate attributeName="cy" values="${n1(y)};${n1(y - rise)}"${at}/>` +
      `<animate attributeName="cx" values="${n1(x)};${n1(x + S * (k % 2 ? -0.08 : 0.1))}"${at}/>` +
      `<animate attributeName="r" values="${n1(r0)};${n1(r0 * 3)}"${at}/>` +
      `<animate attributeName="opacity" values="0;0.55;0"${at}/>` +
      `</circle>`
  }
  return s + `</g>`
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
  const spanU = spanU0 + (ctxFill === null ? 0 : 0.12 + (Math.max(7, S0 * 0.17) * 0.62 * 5 * 1.2) / S0)
  const S = fit(spanU)
  const cs = Math.max(7, S * 0.17)
  const ds = Math.max(6.5, S * 0.15)
  // A diff line under the captions needs a taller pedestal.
  const anyDiff = bigs.some(b => b.added > 0 || b.removed > 0)
  const pedH = anyDiff ? Math.max(PED_H, 0.8 + (0.35 * cs + 1.45 * ds) / S + 0.05) : PED_H
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
  defs.push(lin('track', 1, 0, [[0, skin.track.from], [1, skin.track.to]]))
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
  if (ctxFill !== null) parts.push(safe(() => contextTank(ctxFill, P, S, uEnd, pedH, cs, detail, skin, still)))

  // ── Timeline groove on the pedestal top, in front of the cubes ──
  const gv = PED_FRONT / 2
  {
    const [ax, ay] = P(uStart + 0.12, gv, 0)
    const [bx] = P(uEnd - 0.12, gv, 0)
    const gw = Math.max(2.5, S * 0.07)
    parts.push(line([ax, ay], [bx, ay], `stroke="${skin.track.groove}" stroke-opacity="0.55" stroke-width="${n1(gw + 1.5)}" stroke-linecap="round"`))
    parts.push(line([ax, ay + 0.8], [bx, ay + 0.8], `stroke="${pd.light}" stroke-opacity="0.35" stroke-width="0.8"`))
    for (let i = 1; i < n; i++) {
      const [tx] = P(cubeU(i) - (PITCH - 1) / 2, gv, 0)
      parts.push(line([tx, ay - gw], [tx, ay + gw], `stroke="${skin.track.groove}" stroke-opacity="0.6" stroke-width="1"`))
    }
    if (overall > 0) {
      const px = ax + (bx - ax) * overall
      // A rect, not a line: a gradient or filter on a box with no height draws nothing.
      parts.push(
        `<rect x="${n1(ax - gw / 2)}" y="${n1(ay - gw / 2)}" width="${n1(Math.max(gw, px - ax + gw))}" height="${n1(gw)}" rx="${n1(gw / 2)}" fill="url(#track)" filter="url(#gl)"/>`,
      )
      const pulse = moving ? '<animate attributeName="r" values="3;4.6;3" dur="1.4s" repeatCount="indefinite"/>' : ''
      overlay.push(`<circle cx="${n1(px)}" cy="${n1(ay)}" r="3.5" fill="#ffffff" stroke="${skin.track.head}" stroke-width="1.5" filter="url(#gl)">${pulse}</circle>`)
    }
    // A chequered finish flag at the end of the line.
    const fx = bx + 2
    const fh = S * 0.5
    const sq = fh / 6
    let flag = line([fx, ay], [fx, ay - fh], `stroke="${skin.track.groove}" stroke-width="1.2"`)
    for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
      flag += `<rect x="${n1(fx + a * sq)}" y="${n1(ay - fh + b * sq)}" width="${n1(sq)}" height="${n1(sq)}" fill="${(a + b) % 2 ? '#ffffff' : '#0f172a'}"/>`
    }
    if (skin.effects?.flag !== false) parts.push(`<g opacity="${overall >= 1 ? 1 : 0.7}">${flag}</g>`)
  }

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
        `<g><title>${big.errors} fehlgeschlagene Tool-Aufrufe</title>` +
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
          `<title>${big.added} Zeilen hinzugefügt, ${big.removed} entfernt</title>${plus}${plus && minus ? ' ' : ''}${minus}</text>`,
      )
    }
    if (big.stuck) {
      // A warning triangle right of the plaque.
      const tr = Math.max(5, S * 0.14)
      const tx = lx + w + tr * 0.35 + 2
      const ty = ly + 1
      parts.push(
        `<g><title>Hängt: ${esc(big.stuck)}</title>` +
          poly([[tx + tr, ty], [tx + tr * 2, ty + tr * 1.75], [tx, ty + tr * 1.75]], `fill="${skin.status.waiting[1]}" stroke="#0f172a" stroke-opacity="0.6" stroke-width="0.8" stroke-linejoin="round"`) +
          `<text class="t" x="${n1(tx + tr)}" y="${n1(ty + tr * 1.55)}" font-size="${n1(tr * 1.25)}" fill="#0f172a" text-anchor="middle">!</text></g>`,
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
const cache: { key: string; skin: Skin; out: Drawing }[] = []

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
  const alt = `Würfel-Zeitleiste: ${done} von ${steps.length} Würfeln erledigt${working.length ? `, gearbeitet wird an Würfel ${working.join(', ')}` : ''}`

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
  const drawing: Drawing = { source: out.source, width: out.width, height: out.height, alt }
  cache.unshift({ key, skin, out: drawing })
  if (cache.length > CACHE_SIZE) cache.length = CACHE_SIZE
  return drawing
}
