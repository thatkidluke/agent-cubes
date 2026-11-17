/**
 * The NOW, AGENTS and LIVE cards as drawings: the current step as a numbered
 * badge with its progress, the agents as avatars with what they are doing, and
 * the latest calls as a feed with an icon per kind of work. Pure string
 * builders; register.tsx hands them what to show. They follow light and dark
 * mode through the theme classes of `gauges.ts`.
 */
import { esc, n1 } from '../svg'
import { FONT, STYLE } from '../gauges'
import type { CallKind, CubeStatus } from '../../types'
import { unitWord } from '../i18n'
import { STATUS_LABEL } from '../iso'

type Built = { source: string; width: number; height: number; alt: string }

const KIND: Record<CallKind, string> = { read: '#3b82f6', write: '#f59e0b', run: '#8b5cf6', agent: '#14b8a6', other: '#94a3b8' }
const OK = '#16a34a'
const BAD = '#e11d48'
const WAIT = '#f59e0b'
const RUN = '#3b82f6'

/** Clips text to about `px` pixels at `size`, with an ellipsis. */
export function clip(text: string, px: number, size: number): string {
  const max = Math.max(3, Math.floor(px / (size * 0.56)))
  const chars = [...text.replace(/\s+/g, ' ').trim()]
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('')
}

const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${n1(height)}" viewBox="0 0 ${n1(width)} ${n1(height)}">${STYLE}${body}</svg>`
const txt = (x: number, y: number, size: number, cls: string, body: string, extra = '', font = FONT) =>
  `<text class="${cls}" x="${n1(x)}" y="${n1(y)}" font-family="${font}" font-size="${size}"${extra}>${body}</text>`

/** An avatar: a coloured disc with a letter; a ring that breathes while it works. */
function avatar(cx: number, cy: number, r: number, letter: string, color: string, live: boolean, animate: boolean): string {
  let s = ''
  if (live) {
    const breathe = animate ? `<animate attributeName="r" values="${r + 1.5};${r + 4};${r + 1.5}" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0.15;0.7" dur="1.6s" repeatCount="indefinite"/>` : ''
    s += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${r + 2.5}" fill="none" stroke="${color}" stroke-width="1.6" opacity="0.6">${breathe}</circle>`
  }
  s += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${r}" fill="${color}"${live ? '' : ' fill-opacity="0.45"'}/>`
  return s + `<text x="${n1(cx)}" y="${n1(cy + r * 0.38)}" font-family="${FONT}" font-size="${n1(r * 1.05)}" font-weight="700" text-anchor="middle" fill="#ffffff">${esc(letter)}</text>`
}

/** A small icon for a kind of work, in a tinted rounded square. */
function kindIcon(x: number, y: number, kind: CallKind): string {
  const c = KIND[kind]
  let s = `<rect x="${n1(x)}" y="${n1(y)}" width="20" height="20" rx="6" fill="${c}" fill-opacity="0.16"/>`
  const p = (d: string) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
  const X = (v: number) => n1(x + v)
  const Y = (v: number) => n1(y + v)
  if (kind === 'read') s += p(`M${X(6)} ${Y(4.5)}H${X(12)}L${X(15)} ${Y(7.5)}V${Y(15.5)}H${X(6)}Z`) + p(`M${X(8)} ${Y(9.5)}H${X(13)}M${X(8)} ${Y(12.5)}H${X(12)}`)
  else if (kind === 'write') s += p(`M${X(5.5)} ${Y(14.5)}L${X(6.5)} ${Y(11)}L${X(12.5)} ${Y(5)}L${X(15)} ${Y(7.5)}L${X(9)} ${Y(13.5)}Z`) + p(`M${X(11)} ${Y(6.5)}L${X(13.5)} ${Y(9)}`)
  else if (kind === 'run') s += p(`M${X(5.5)} ${Y(7)}L${X(9)} ${Y(10)}L${X(5.5)} ${Y(13)}`) + p(`M${X(10.5)} ${Y(14)}H${X(15)}`)
  else if (kind === 'agent') s += `<circle cx="${X(8)}" cy="${Y(8)}" r="2.3" fill="${c}"/><circle cx="${X(13)}" cy="${Y(8)}" r="2.3" fill="${c}" fill-opacity="0.6"/>` + p(`M${X(4.5)} ${Y(15)}C${X(5)} ${Y(11.5)} ${X(11)} ${Y(11.5)} ${X(11.5)} ${Y(15)}`)
  else s += `<circle cx="${X(10)}" cy="${Y(10)}" r="2.5" fill="${c}"/>`
  return s
}

/** A status mark: a tick, a cross, a pause, or an arc that turns while it runs. */
function statusMark(cx: number, cy: number, status: CubeStatus, animate: boolean): string {
  const p = (d: string, c: string) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'done') return p(`M${n1(cx - 4)} ${n1(cy)}l3 3l5.5 -6`, OK)
  if (status === 'error') return p(`M${n1(cx - 3.5)} ${n1(cy - 3.5)}l7 7m0 -7l-7 7`, BAD)
  if (status === 'waiting') return p(`M${n1(cx - 2)} ${n1(cy - 4)}v8M${n1(cx + 2)} ${n1(cy - 4)}v8`, WAIT)
  const spin = animate ? `<animateTransform attributeName="transform" type="rotate" from="0 ${n1(cx)} ${n1(cy)}" to="360 ${n1(cx)} ${n1(cy)}" dur="1s" repeatCount="indefinite"/>` : ''
  return `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="5" fill="none" stroke="${RUN}" stroke-opacity="0.25" stroke-width="2"/><path d="M${n1(cx)} ${n1(cy - 5)}A5 5 0 0 1 ${n1(cx + 5)} ${n1(cy)}" fill="none" stroke="${RUN}" stroke-width="2" stroke-linecap="round">${spin}</path>`
}

export type NowInfo = {
  /** The cube's number ("03"), or "" when no step is in work. */
  cube: string
  color: string
  title: string
  /** e.g. "for 4 min · about 40 %" */
  sub: string
  /** The step's estimated progress, 0..1, or null. */
  progress: number | null
  /** Who works on it. */
  agents: Array<{ letter: string; color: string }>
  state: 'running' | 'waiting' | 'done' | 'idle'
}

/** NOW: the current step as a numbered badge, its title, a progress bar and the agents on it. */
export function buildNow(n: NowInfo, width: number, animate: boolean): Built {
  const H = 62
  let s = ''
  // The badge: the cube's number, or a tick / a dot when no step is in work.
  s += `<rect x="0" y="4" width="54" height="54" rx="14" fill="${n.color}" fill-opacity="0.15"/>`
  s += `<rect x="0.75" y="4.75" width="52.5" height="52.5" rx="13.5" fill="none" stroke="${n.color}" stroke-opacity="0.6" stroke-width="1.5"/>`
  if (n.state === 'running' || n.state === 'waiting') {
    const pulse = animate ? `<animate attributeName="stroke-opacity" values="0.7;0.1;0.7" dur="1.6s" repeatCount="indefinite"/>` : ''
    s += `<rect x="-2" y="2" width="58" height="58" rx="16" fill="none" stroke="${n.color}" stroke-width="1.5" stroke-opacity="0.5">${pulse}</rect>`
  }
  if (n.cube) s += txt(27, 38, 21, 'acg-vp', esc(n.cube), ` font-weight="800" text-anchor="middle" style="fill:${n.color}"`)
  else if (n.state === 'done') s += `<path d="M17 31l7 7l13 -14" fill="none" stroke="${n.color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
  else s += `<circle cx="27" cy="31" r="5" fill="${n.color}"/>`
  // The title, the details below, the agents at the right.
  const avW = n.agents.length * 18
  const tx = 68
  s += txt(tx, 22, 14, 'acg-vp', esc(clip(n.title, width - tx - avW - 8, 14)), ' font-weight="650"')
  s += txt(tx, 40, 11.5, 'acg-lb', esc(clip(n.sub, width - tx - 4, 11.5)))
  n.agents.forEach((a, k) => {
    s += avatar(width - 9 - k * 18, 16, 8, a.letter, a.color, n.state === 'running', animate)
  })
  if (n.progress !== null) {
    const bw = width - tx
    s += `<rect class="acg-gf" x="${tx}" y="49" width="${n1(bw)}" height="6" rx="3"/>`
    s += `<rect x="${tx}" y="49" width="${n1(Math.max(6, bw * Math.max(0, Math.min(1, n.progress))))}" height="6" rx="3" fill="${n.color}"/>`
  }
  const alt = `${n.cube ? `${unitWord()} ${n.cube}: ` : ''}${n.title}${n.sub ? ` (${n.sub})` : ''}`
  return { source: svg(width, H, s), width, height: H, alt }
}

export type AgentInfo = {
  letter: string
  color: string
  name: string
  /** "→ 03", or "" */
  where: string
  /** The tool it uses, "thinking", or its state. */
  doing: string
  kind: CallKind | null
  status: 'running' | 'done' | 'error' | 'idle'
}

/** AGENTS: one row per agent, an avatar, its name, the cube it works on and what it does. */
export function buildAgents(agents: AgentInfo[], width: number, animate: boolean): Built {
  const ROW = 34
  let s = ''
  agents.forEach((a, k) => {
    const y = k * ROW
    const live = a.status === 'running'
    s += avatar(14, y + 17, 11, a.letter, a.color, live, animate)
    s += txt(34, y + 15, 12.5, live ? 'acg-vp' : 'acg-lb', esc(clip(a.name, width * 0.42, 12.5)), live ? ' font-weight="650"' : '')
    if (a.where) s += txt(34, y + 29, 10.5, 'acg-lb', esc(a.where))
    // What it does, as a pill in the colour of its kind of work.
    const pillText = clip(a.doing, width * 0.36, 11)
    const pw = Math.min(width * 0.42, [...pillText].length * 6.4 + 18)
    const px = width - pw - 22
    const col = a.status === 'error' ? BAD : a.kind ? KIND[a.kind] : '#94a3b8'
    s += `<rect x="${n1(px)}" y="${y + 7}" width="${n1(pw)}" height="20" rx="10" fill="${col}" fill-opacity="${live ? 0.18 : 0.09}"/>`
    s += txt(px + pw / 2, y + 21, 11, live ? 'acg-vp' : 'acg-lb', esc(pillText), ` text-anchor="middle"${live ? ` style="fill:${col}"` : ''}`)
    s += statusMark(width - 8, y + 17, a.status === 'idle' ? 'pending' : a.status, animate)
    if (k < agents.length - 1) s += `<line class="acg-mk" x1="34" y1="${y + ROW - 0.5}" x2="${n1(width)}" y2="${y + ROW - 0.5}" stroke-width="0.6"/>`
  })
  const height = Math.max(ROW, agents.length * ROW)
  const alt = agents.map(a => `${a.name}${a.where ? ` ${a.where}` : ''}: ${a.doing}`).join('; ')
  return { source: svg(width, height, s), width, height, alt }
}

export type CallInfo = { kind: CallKind; status: CubeStatus; letter: string; color: string; tool: string; detail: string }

/** LIVE: the latest calls as a feed: kind icon, who made it, the tool, what it touched, how it went. */
export function buildLive(calls: CallInfo[], width: number, animate: boolean): Built {
  const ROW = 28
  let s = ''
  calls.forEach((c, k) => {
    const y = k * ROW
    const fade = k === 0 ? 1 : Math.max(0.55, 1 - k * 0.1)
    s += `<g opacity="${n1(fade)}">`
    s += kindIcon(0, y + 4, c.kind)
    s += `<circle cx="34" cy="${y + 14}" r="7" fill="${c.color}"/><text x="34" y="${y + 17.5}" font-family="${FONT}" font-size="8.5" font-weight="700" text-anchor="middle" fill="#ffffff">${esc(c.letter)}</text>`
    const toolW = 78
    s += txt(48, y + 18, 11.5, 'acg-vp', esc(clip(c.tool, toolW - 4, 11.5)), ` font-weight="600"`, 'ui-monospace,Consolas,monospace')
    s += txt(48 + toolW, y + 18, 11.5, 'acg-lb', esc(clip(c.detail, width - 48 - toolW - 22, 11.5)))
    s += statusMark(width - 8, y + 14, c.status, animate)
    s += `</g>`
  })
  const height = Math.max(ROW, calls.length * ROW)
  const alt = calls.map(c => `${c.tool} ${c.detail} (${STATUS_LABEL[c.status]})`).join('; ')
  return { source: svg(width, height, s), width, height, alt }
}
