/**
 * The orbit view: the task as a small solar system. The main agent is the sun
 * in the middle, with the plan as a ring of segments around it, one per step,
 * and the progress written on it. Its latest calls circle it as a comet, a dot
 * per call in the colour of its kind of work. Every subagent is a planet on an
 * orbit of its own: it travels while it works, a moon in the colour of what it
 * does turning around it, and docks at the front once it is done.
 *
 * It stands free on the pane like the cubes do and follows light and dark mode
 * through the theme classes of `gauges.ts`. Movement is written as translations
 * along sampled ellipses, so it needs nothing but <animateTransform>.
 */
import type { CubeRun, CubeStatus } from '../types'
import { FONT, STYLE } from './gauges'
import { tr } from './i18n'
import { isActive, isWorked, overallProgress } from './model'
import { cubeNo } from './panel/format'
import { agentColor, agentInitial, MAIN_COLOR, PALETTE, WORK_COLOR } from './scene'
import { esc, memo, mix, n1, phaseLock, rad } from './svg'

export type OrbitOptions = {
  /** false draws a still picture. Default true. */
  motion?: boolean
  /** The widget's tiny version: the sun and the ring of steps only. */
  mini?: boolean
}

type Drawing = { source: string; width: number; height: number; alt: string }

/** How long after the task's end the finale plays. */
const FINALE_MS = 4000
const RING = 38
const SUN = 27
const MAX_PLANETS = 7
const BELT = 10

/** A point on a circle of radius `r`, `deg` clockwise from the top. */
const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [r * Math.sin(a), -r * Math.cos(a)]
}
/** A point on an ellipse; 0° is its right end, 90° its front. */
const onEllipse = (rx: number, ry: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [rx * Math.cos(a), ry * Math.sin(a)]
}
/** One lap round an ellipse as the values of a translation. */
const lap = (rx: number, ry: number): string => {
  const pts: string[] = []
  for (let j = 0; j <= 24; j++) {
    const [x, y] = onEllipse(rx, ry, j * 15)
    pts.push(`${n1(x)} ${n1(y)}`)
  }
  return pts.join(';')
}
const arc = (r: number, d0: number, d1: number): string => {
  const [x0, y0] = polar(r, d0)
  const [x1, y1] = polar(r, d1)
  return `M${n1(x0)} ${n1(y0)}A${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${n1(x1)} ${n1(y1)}`
}

export function buildOrbit(r: CubeRun, width: number, now: number, selected = -1, opts: OrbitOptions = {}): Drawing {
  const still = opts.motion === false
  const mini = opts.mini === true
  const active = isActive(r)
  const moving = active && !still
  const n = r.tasks.length
  const overall = overallProgress(r, now)
  const pct = overall === null ? null : Math.floor(overall * 100)
  const finale = !still && r.status === 'done' && r.endedAt > 0 && now - r.endedAt < FINALE_MS

  const stepStatus = (i: number): CubeStatus =>
    r.tasks[i]!.status === 'done' ? 'done' : isWorked(r, i) ? (r.status === 'waiting' ? 'waiting' : 'running') : 'pending'
  const steps: CubeStatus[] = n > 0 ? r.tasks.map((_t, i) => stepStatus(i)) : [r.status === 'done' ? 'done' : r.status === 'waiting' ? 'waiting' : active ? 'running' : 'pending']
  const planets = mini ? [] : r.agents.map((a, k) => ({ a, k })).slice(-MAX_PLANETS)
  const lastWork = (agentId: string) => {
    const c = [...r.calls].reverse().find(c => c.agentId === agentId)
    return c ? (c.work ?? c.kind) : null
  }
  const belt = mini ? [] : r.calls.filter(c => !c.agentId).slice(-BELT).reverse()

  // Everything the picture shows; `now` is in it only through what it changes.
  const key = JSON.stringify([
    width, selected, still, mini, moving, finale, pct, r.status, steps,
    planets.map(({ a, k }) => [a.id, k, a.status, a.taskIndex, a.status === 'running' ? lastWork(a.id) : null, a.name, a.tool]),
    belt.map(c => [c.id, c.status, c.work ?? c.kind]),
    tr('de', 'en'),
  ])
  return memo(`orbit-${mini ? 'mini' : 'full'}-${width}`, key, () => {
    const nOrb = mini ? 0 : 1 + planets.length
    const ryOf = (k: number) => 60 + k * 17
    const ryLast = nOrb > 0 ? ryOf(nOrb - 1) : 0
    // As wide as the pane lets it be, between nearly round and two to one.
    const ratio = Math.min(2.05, Math.max(1.15, (width / 2 - 18) / Math.max(1, ryLast)))
    const rxOf = (k: number) => ryOf(k) * ratio
    const reachX = nOrb > 0 ? rxOf(nOrb - 1) + 16 : RING + 8
    const reachY = nOrb > 0 ? ryLast + 16 : RING + 8
    const scale = Math.min(mini ? 1.6 : 1.3, (width / 2 - 2) / reachX)
    const height = Math.ceil(2 * reachY * scale)

    const sunColor =
      r.status === 'running' ? MAIN_COLOR : r.status === 'waiting' ? PALETTE.waiting[1] : r.status === 'done' ? PALETTE.done[1] : r.status === 'error' ? PALETTE.error[1] : '#94a3b8'
    let s = ''

    // ── The orbits ──
    for (let k = 0; k < nOrb; k++) {
      s += `<ellipse class="acg-mk" rx="${n1(rxOf(k))}" ry="${ryOf(k)}" fill="none" stroke-width="0.8"${k > 0 ? ' stroke-dasharray="1.5 5"' : ''}/>`
    }

    // ── The sun: the main agent, breathing while it works ──
    if (moving) {
      s += `<circle r="${SUN}" fill="${sunColor}" opacity="0.35"><animate attributeName="r" values="${SUN};${SUN + 7};${SUN}" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.4;0.05;0.4" dur="2.4s" repeatCount="indefinite"/></circle>`
    }
    s += `<circle r="${SUN + 3}" fill="${sunColor}" opacity="0.14"/>`
    s += `<circle r="${SUN}" fill="url(#ob-sun)"><title>${esc(tr('Hauptagent', 'Main agent'))}${r.mainTool && active ? `: ${esc(r.mainTool)}` : ''}</title></circle>`
    s += `<circle cx="${-SUN * 0.32}" cy="${-SUN * 0.36}" r="${SUN * 0.34}" fill="#ffffff" opacity="0.22"/>`
    const label = pct === null ? 'H' : `${pct}%`
    s += `<text y="${pct === null ? 5.5 : 4.8}" font-family="${FONT}" font-size="${pct === null ? 16 : 13.5}" font-weight="800" text-anchor="middle" fill="#ffffff" stroke="#0f172a" stroke-opacity="0.35" stroke-width="2" paint-order="stroke">${label}</text>`

    // ── The plan: a ring of segments, one per step ──
    const count = steps.length
    const gap = count === 1 ? 0 : Math.min(5, (360 / count) * 0.22)
    const seg = (i: number, radius: number, attrs: string, inner = '') => {
      if (count === 1) return `<circle r="${radius}" fill="none" ${attrs}>${inner}</circle>`
      const d0 = (i * 360) / count + gap / 2
      const d1 = ((i + 1) * 360) / count - gap / 2
      return `<path d="${arc(radius, d0, d1)}" fill="none" ${attrs}>${inner}</path>`
    }
    steps.forEach((st, i) => {
      const title = n > 0 ? `<title>${esc(`${cubeNo(i)} ${r.tasks[i]!.title}`)}</title>` : ''
      if (st === 'pending') s += seg(i, RING, 'class="acg-mk" stroke-width="6"', title)
      else {
        const pulse = (st === 'running' || st === 'waiting') && !still ? `<animate attributeName="stroke-opacity" values="1;0.35;1" dur="${st === 'waiting' ? 0.9 : 1.5}s" repeatCount="indefinite"/>` : ''
        s += seg(i, RING, `stroke="${PALETTE[st][1]}" stroke-width="6"`, title + pulse)
      }
      if (i === selected) s += seg(i, RING + 5.5, 'stroke="#fbbf24" stroke-width="2"')
      if (!mini && n > 1 && n <= 12) {
        const [tx, ty] = polar(RING + 11.5, ((i + 0.5) * 360) / count)
        s += `<text class="acg-lb" x="${n1(tx)}" y="${n1(ty + 2.6)}" font-family="${FONT}" font-size="7.5" text-anchor="middle">${cubeNo(i)}</text>`
      }
    })

    // ── The comet: the main agent's latest calls, the newest at its head ──
    if (belt.length > 0) {
      const rx = rxOf(0)
      const ry = ryOf(0)
      const path = moving ? lap(rx, ry) : ''
      belt.forEach((c, k) => {
        const col = c.status === 'error' ? PALETTE.error[1] : WORK_COLOR[c.work ?? c.kind]
        const rad0 = Math.max(1.8, 4.4 - k * 0.28)
        const dot = `<circle r="${n1(rad0)}" fill="${col}" opacity="${n1(Math.max(0.3, 1 - k * 0.075))}"><title>${esc(c.tool)}${c.detail ? ` · ${esc(c.detail.slice(0, 40))}` : ''}</title></circle>`
        const ring = k === 0 && c.status === 'running' && !still ? `<circle r="${n1(rad0 + 2)}" fill="none" stroke="${col}" stroke-width="1.2"><animate attributeName="r" values="${n1(rad0 + 1)};${n1(rad0 + 5)}" dur="1.1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1.1s" repeatCount="indefinite"/></circle>` : ''
        if (moving) {
          s += `<g transform="translate(${n1(rx)} 0)"><animateTransform attributeName="transform" type="translate" values="${path}" dur="18s" begin="${n1(-(9 - k * 0.42))}s" repeatCount="indefinite"/>${ring}${dot}</g>`
        } else {
          const [x, y] = onEllipse(rx, ry, 68 - k * 12)
          s += `<g transform="translate(${n1(x)} ${n1(y)})">${dot}</g>`
        }
      })
    }

    // ── The planets: one subagent each ──
    planets.forEach(({ a, k }, idx) => {
      const rx = rxOf(idx + 1)
      const ry = ryOf(idx + 1)
      const live = a.status === 'running'
      const col = a.status === 'error' ? PALETTE.error[1] : agentColor(k)
      const work = live ? lastWork(a.id) : null
      let body = `<title>${esc(a.name)}${live && a.tool ? `: ${esc(a.tool)}` : ''}</title>`
      if (live && work) {
        const moon = `<circle cx="14.5" r="2.8" fill="${WORK_COLOR[work]}" stroke="#ffffff" stroke-opacity="0.7" stroke-width="0.6"/>`
        body += still ? moon : `<g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2.6s" repeatCount="indefinite"/>${moon}</g>`
      }
      body += `<circle r="9.5" fill="${col}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="1.2"/>`
      body += `<circle cx="-3" cy="-3.4" r="3.2" fill="#ffffff" opacity="0.3"/>`
      body += `<text y="3.6" font-family="${FONT}" font-size="10" font-weight="800" text-anchor="middle" fill="#0f172a">${esc(agentInitial(a.name))}</text>`
      if (!live) {
        const ok = a.status === 'done'
        body += `<circle cx="8" cy="-8" r="5" fill="${ok ? PALETTE.done[1] : PALETTE.error[1]}" stroke="#ffffff" stroke-width="0.8"/>`
        body += `<path d="${ok ? 'M5.6 -8l1.8 1.8l3 -3.6' : 'M6 -10l4 4m0 -4l-4 4'}" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
      }
      if (live && n > 0 && a.taskIndex >= 0) body += `<text class="acg-lb" y="21" font-family="${FONT}" font-size="8" text-anchor="middle">→${cubeNo(a.taskIndex)}</text>`
      if (live && moving) {
        s += `<g transform="translate(${n1(rx)} 0)"><animateTransform attributeName="transform" type="translate" values="${lap(rx, ry)}" dur="${20 + idx * 5}s" begin="${n1(-(idx * 4.3))}s" repeatCount="indefinite"/>${body}</g>`
      } else {
        // At rest: a working one where it stands, a finished one docked at the front.
        const [x, y] = onEllipse(rx, ry, live ? 200 + idx * 47 : 58 + idx * 13)
        s += `<g transform="translate(${n1(x)} ${n1(y)})"${live ? '' : ' opacity="0.7"'}>${body}</g>`
      }
    })

    // ── The finale: the ring lights up segment by segment and a wave runs outwards ──
    if (finale) {
      steps.forEach((_st, i) => {
        s += seg(i, RING, 'stroke="#ffffff" stroke-width="7" opacity="0" pointer-events="none"', `<animate attributeName="opacity" values="0;1;0" dur="0.5s" begin="${n1(i * Math.min(0.09, 1.2 / count))}s" fill="freeze"/>`)
      })
      const ex = nOrb > 0 ? rxOf(nOrb - 1) : RING + 6
      const ey = nOrb > 0 ? ryLast : RING + 6
      for (const delay of [0.5, 0.95]) {
        s += `<ellipse rx="${RING}" ry="${RING}" fill="none" stroke="${PALETTE.done[1]}" stroke-width="2" opacity="0" pointer-events="none"><animate attributeName="rx" values="${RING};${n1(ex)}" dur="1.3s" begin="${delay}s" fill="freeze"/><animate attributeName="ry" values="${RING};${n1(ey)}" dur="1.3s" begin="${delay}s" fill="freeze"/><animate attributeName="opacity" values="0.9;0" dur="1.3s" begin="${delay}s" fill="freeze"/></ellipse>`
      }
    }

    const defs = `<defs>${rad('ob-sun', [[0, mix(sunColor, '#ffffff', 0.45)], [1, sunColor]])}</defs>`
    const raw = `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${height}" viewBox="0 0 ${n1(width)} ${height}">${STYLE}${defs}<g transform="translate(${n1(width / 2)} ${n1(height / 2)}) scale(${scale.toFixed(3)})">${s}</g></svg>`
    const working = planets.filter(p => p.a.status === 'running').length
    const alt =
      tr('Umlaufbahn', 'Orbit') +
      `: ${pct === null ? tr('kein Plan', 'no plan') : `${pct} %`}` +
      (n > 0 ? `, ${steps.filter(st => st === 'done').length}/${n}` : '') +
      (planets.length > 0 ? `, ${tr(`${planets.length} Subagents, ${working} aktiv`, `${planets.length} subagents, ${working} working`)}` : '')
    return { source: phaseLock(raw, now), width, height, alt }
  })
}
