/**
 * The orbit view: the task as a small solar system. The main agent is the sun
 * in the middle, with the plan as an instrument ring around it, one segment
 * per step, and the progress written on it. Its latest calls circle it as a
 * comet, a dot per call in the colour of its kind of work. Every subagent is a
 * planet on an orbit of its own: it travels while it works, a moon in the
 * colour of what it does turning around it and a trail behind it, grows as it
 * comes to the front and shrinks as it goes behind, and docks at the front
 * once it is done.
 *
 * It stands free on the pane like the cubes do and follows light and dark mode
 * through the theme classes of `gauges.ts` and a few of its own. Movement is
 * written as translations along sampled ellipses, so it needs nothing but
 * <animate> and <animateTransform>; glow is drawn with gradients, not filters.
 */
import type { CubeRun, CubeStatus } from '../types'
import { FONT, STYLE } from './gauges'
import { tr } from './i18n'
import { isActive, isWorked, overallProgress, stepProgress, workOf } from './model'
import { cubeNo } from './panel/format'
import { agentColor, agentInitial, MAIN_COLOR, PALETTE, WORK_COLOR } from './scene'
import { ellipsis, esc, memo, mix, n1, phaseLock, seeded, type Drawing } from './svg'

export type OrbitOptions = {
  /** false draws a still picture. Default true. */
  motion?: boolean
  /** The widget's tiny version: the sun and the ring of steps only. */
  mini?: boolean
}

/** How long after the task's end the finale plays. */
const FINALE_MS = 4000
const RING = 38
const SUN = 27
const MAX_PLANETS = 7
const BELT = 10
const TRAIL = 5

/** Stars and the ring's frame: slate on a light pane, pale on a dark one. */
const OWN_STYLE =
  `<style>.ob-st{fill:#64748b;fill-opacity:.4}.ob-fr{fill:none;stroke:#64748b;stroke-opacity:.5}.ob-pl{fill:none;stroke:#0f172a;stroke-opacity:.07}` +
  `@media (prefers-color-scheme:dark){.ob-st{fill:#e2e8f0;fill-opacity:.6}.ob-fr{stroke:#94a3b8;stroke-opacity:.55}.ob-pl{stroke:#020617;stroke-opacity:.5}}</style>`

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
/** How large something looks at that point of its orbit: larger in front, smaller behind. */
const depth = (deg: number) => 0.97 + 0.17 * Math.sin((deg * Math.PI) / 180)
/** One lap round an ellipse as the values of a translation, and the sizes that go with it. */
const lap = (rx: number, ry: number): string => {
  const pts: string[] = []
  for (let j = 0; j <= 24; j++) {
    const [x, y] = onEllipse(rx, ry, j * 15)
    pts.push(`${n1(x)} ${n1(y)}`)
  }
  return pts.join(';')
}
const LAP_SIZES = Array.from({ length: 25 }, (_, j) => depth(j * 15).toFixed(2)).join(';')
const arc = (r: number, d0: number, d1: number): string => {
  const [x0, y0] = polar(r, d0)
  const [x1, y1] = polar(r, d1)
  return `M${n1(x0)} ${n1(y0)}A${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${n1(x1)} ${n1(y1)}`
}
const short = (t: string, max: number) => ellipsis(t.replace(/\s+/g, ' ').trim(), max)

/** A planet's body in its colour: a lit sphere, and by turns bands, a ring or craters. */
function planetBody(idx: number, col: string, letter: string): string {
  const dark = mix(col, '#0f172a', 0.55)
  const look = idx % 3
  let s = ''
  // A ring lies behind the sphere and comes round in front of its lower half.
  const ring = (half: string) => `<path d="${half}" fill="none" stroke="${mix(col, '#ffffff', 0.55)}" stroke-width="1.8" stroke-opacity="0.9" transform="rotate(-16)"/>`
  if (look === 1) s += ring('M-15.5 0A15.5 4.6 0 0 1 15.5 0')
  s += `<circle r="9.5" fill="url(#ob-p${idx})" stroke="#ffffff" stroke-opacity="0.85" stroke-width="1.1"/>`
  if (look === 0) s += `<path d="M-8.6 -3.6Q0 -1.4 8.6 -3.6M-9 1.6Q0 3.8 9 1.6M-7.2 6Q0 7.6 7.2 6" fill="none" stroke="${dark}" stroke-opacity="0.4" stroke-width="1.3" stroke-linecap="round"/>`
  if (look === 2) s += `<circle cx="-4.2" cy="2.6" r="2" fill="${dark}" fill-opacity="0.35"/><circle cx="3.6" cy="-4" r="1.4" fill="${dark}" fill-opacity="0.35"/><circle cx="4.4" cy="4.4" r="1.1" fill="${dark}" fill-opacity="0.3"/>`
  if (look === 1) s += ring('M15.5 0A15.5 4.6 0 0 1 -15.5 0')
  s += `<circle cx="-3.2" cy="-3.6" r="2.6" fill="#ffffff" opacity="0.4"/>`
  return s + `<text y="3.6" font-family="${FONT}" font-size="10" font-weight="800" text-anchor="middle" fill="#ffffff" stroke="#0f172a" stroke-opacity="0.55" stroke-width="2" paint-order="stroke">${esc(letter)}</text>`
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
  // How far a step in work has come, in steps of 5 %, so the picture changes only that often.
  const fills = steps.map((st, i) => (n > 0 && (st === 'running' || st === 'waiting') ? Math.round(stepProgress(r, i, now) * 20) / 20 : 0))
  const planets = mini ? [] : r.agents.map((a, k) => ({ a, k })).slice(-MAX_PLANETS)
  const lastWork = (agentId: string) => {
    const c = [...r.calls].reverse().find(c => c.agentId === agentId)
    return c ? workOf(c) : null
  }
  const belt = mini ? [] : r.calls.filter(c => !c.agentId).slice(-BELT).reverse()
  const mainTool = active && r.mainTool ? short(r.mainTool, 10) : ''

  // Everything the picture shows; `now` is in it only through what it changes.
  const key = JSON.stringify([
    width, selected, still, mini, moving, finale, pct, r.status, steps, fills, mainTool, r.errors,
    planets.map(({ a, k }) => [a.id, k, a.status, a.taskIndex, a.status === 'running' ? lastWork(a.id) : null, a.name, a.tool]),
    belt.map(c => [c.id, c.status, workOf(c)]),
    tr('de', 'en'),
  ])
  return memo(`orbit-${mini ? 'mini' : 'full'}-${width}`, key, () => {
    const nOrb = mini ? 0 : 1 + planets.length
    const ryOf = (k: number) => 68 + k * 19
    const ryLast = nOrb > 0 ? ryOf(nOrb - 1) : 0
    // As wide as the pane lets it be, between nearly round and two to one.
    const ratio = Math.min(2.05, Math.max(1.15, (width / 2 - 22) / Math.max(1, ryLast)))
    const rxOf = (k: number) => ryOf(k) * ratio
    const reachX = nOrb > 0 ? rxOf(nOrb - 1) + 20 : RING + 12
    const reachY = nOrb > 0 ? ryLast + 26 : RING + 12
    const scale = Math.min(mini ? 1.5 : 1.3, (width / 2 - 2) / reachX)
    const height = Math.ceil(2 * reachY * scale)

    const sunColor =
      r.status === 'running' ? MAIN_COLOR : r.status === 'waiting' ? PALETTE.waiting[1] : r.status === 'done' ? PALETTE.done[1] : r.status === 'error' ? PALETTE.error[1] : '#94a3b8'
    let s = ''
    let defs =
      `<radialGradient id="ob-sun" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="${mix(sunColor, '#ffffff', 0.7)}"/><stop offset="0.45" stop-color="${sunColor}"/><stop offset="1" stop-color="${mix(sunColor, '#0f172a', 0.45)}"/></radialGradient>` +
      `<radialGradient id="ob-halo"><stop offset="0.3" stop-color="${sunColor}" stop-opacity="0.42"/><stop offset="0.62" stop-color="${sunColor}" stop-opacity="0.12"/><stop offset="1" stop-color="${sunColor}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="ob-neb"><stop offset="0" stop-color="${sunColor}" stop-opacity="0.16"/><stop offset="0.6" stop-color="${sunColor}" stop-opacity="0.05"/><stop offset="1" stop-color="${sunColor}" stop-opacity="0"/></radialGradient>`

    if (!mini) {
      // ── Space: a faint glow over the whole system and a scatter of stars, a few of them twinkling ──
      s += `<ellipse rx="${n1(reachX)}" ry="${n1(reachY)}" fill="url(#ob-neb)"/>`
      const rnd = seeded(7)
      const stars = Math.round(Math.min(54, 14 + (reachX * reachY) / 900))
      for (let k = 0; k < stars; k++) {
        const a = rnd() * 360
        const d = 0.3 + 0.68 * Math.sqrt(rnd())
        const [x, y] = onEllipse(reachX * d, reachY * d, a)
        const size = 0.5 + rnd() * 0.9
        const twinkle = moving && k % 6 === 0 ? `<animate attributeName="opacity" values="1;0.15;1" dur="${n1(2.6 + rnd() * 3)}s" begin="${n1(-rnd() * 3)}s" repeatCount="indefinite"/>` : ''
        // The brightest get four points.
        s +=
          k % 9 === 0
            ? `<path class="ob-st" d="M${n1(x)} ${n1(y - size * 2.6)}L${n1(x + size * 0.5)} ${n1(y - size * 0.5)}L${n1(x + size * 2.6)} ${n1(y)}L${n1(x + size * 0.5)} ${n1(y + size * 0.5)}L${n1(x)} ${n1(y + size * 2.6)}L${n1(x - size * 0.5)} ${n1(y + size * 0.5)}L${n1(x - size * 2.6)} ${n1(y)}L${n1(x - size * 0.5)} ${n1(y - size * 0.5)}Z">${twinkle}</path>`
            : `<circle class="ob-st" cx="${n1(x)}" cy="${n1(y)}" r="${n1(size)}">${twinkle}</circle>`
      }

      // ── The orbits: dashed and faint where they pass behind, a clear line in front ──
      for (let k = 0; k < nOrb; k++) {
        const rx = n1(rxOf(k))
        const ry = ryOf(k)
        s += `<path class="acg-mk" d="M-${rx} 0A${rx} ${ry} 0 0 1 ${rx} 0" fill="none" stroke-width="0.7" stroke-dasharray="1.5 4.5" opacity="0.6"/>`
        s += `<path class="acg-mk" d="M${rx} 0A${rx} ${ry} 0 0 1 -${rx} 0" fill="none" stroke-width="${k === 0 ? 1 : 0.8}"/>`
        // Where a finished subagent docks.
        if (k > 0) {
          const [dx, dy] = onEllipse(rxOf(k), ry, 58 + (k - 1) * 13)
          s += `<circle class="ob-fr" cx="${n1(dx)}" cy="${n1(dy)}" r="2.2" stroke-width="0.8"/>`
        }
      }
    }

    // ── The sun: the main agent, with a glow, a corona that turns and a surface ──
    s += `<circle r="${mini ? RING + 10 : 62}" fill="url(#ob-halo)"/>`
    if (moving) {
      s += `<circle r="${SUN}" fill="${sunColor}" opacity="0.35"><animate attributeName="r" values="${SUN};${SUN + 7};${SUN}" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.4;0.05;0.4" dur="2.4s" repeatCount="indefinite"/></circle>`
    }
    const turn = (dur: number, back = false) => (moving ? `<animateTransform attributeName="transform" type="rotate" from="${back ? 360 : 0}" to="${back ? 0 : 360}" dur="${dur}s" repeatCount="indefinite"/>` : '')
    s += `<circle r="${SUN + 2.2}" fill="none" stroke="${mix(sunColor, '#ffffff', 0.35)}" stroke-width="1.6" stroke-dasharray="2.2 3.4" stroke-linecap="round" opacity="0.85">${turn(26)}</circle>`
    s += `<circle r="${SUN + 4.6}" fill="none" stroke="${sunColor}" stroke-width="1" stroke-dasharray="0.8 7.2" stroke-linecap="round" opacity="0.7">${turn(40, true)}</circle>`
    s += `<circle r="${SUN}" fill="url(#ob-sun)"><title>${esc(tr('Hauptagent', 'Main agent'))}${r.mainTool && active ? `: ${esc(r.mainTool)}` : ''}</title></circle>`
    // Its surface: a few darker and lighter cells, and a gloss at the upper left.
    const cell = seeded(11)
    for (let k = 0; k < 7; k++) {
      const [x, y] = polar(SUN * (0.25 + cell() * 0.55), cell() * 360)
      s += `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(2.4 + cell() * 3.4)}" ry="${n1(1.4 + cell() * 1.8)}" fill="${k % 2 ? '#ffffff' : '#0f172a'}" opacity="${k % 2 ? 0.1 : 0.12}" pointer-events="none"/>`
    }
    s += `<ellipse cx="${n1(-SUN * 0.3)}" cy="${n1(-SUN * 0.42)}" rx="${n1(SUN * 0.5)}" ry="${n1(SUN * 0.28)}" fill="#ffffff" opacity="0.24" transform="rotate(-28)" pointer-events="none"/>`
    const label = pct === null ? 'H' : `${pct}%`
    const lift = mainTool && !mini ? -2.4 : 0
    s += `<text y="${n1((pct === null ? 5.5 : 4.8) + lift)}" font-family="${FONT}" font-size="${pct === null ? 16 : 13.5}" font-weight="800" text-anchor="middle" fill="#ffffff" stroke="#0f172a" stroke-opacity="0.4" stroke-width="2.2" paint-order="stroke">${label}</text>`
    // What the main agent is using, under the figure.
    if (mainTool && !mini) s += `<text y="13.6" font-family="${FONT}" font-size="6.4" font-weight="600" text-anchor="middle" fill="#ffffff" fill-opacity="0.92" stroke="#0f172a" stroke-opacity="0.35" stroke-width="1.6" paint-order="stroke">${esc(mainTool)}</text>`

    // ── The plan: an instrument ring, one segment per step, the step in work filled as far as it has come ──
    const count = steps.length
    const gap = count === 1 ? 0 : Math.min(5, (360 / count) * 0.22)
    const span = (i: number): [number, number] => [(i * 360) / count + gap / 2, ((i + 1) * 360) / count - gap / 2]
    const seg = (i: number, radius: number, attrs: string, inner = '', part = 1) => {
      if (count === 1 && part >= 1) return `<circle r="${radius}" fill="none" ${attrs}>${inner}</circle>`
      const [d0, d1] = count === 1 ? [0, 359.9] : span(i)
      return `<path d="${arc(radius, d0, d0 + (d1 - d0) * part)}" fill="none" ${attrs}>${inner}</path>`
    }
    s += `<circle class="ob-pl" r="${RING}" stroke-width="9.2"/>`
    s += `<circle class="ob-fr" r="${RING - 4.6}" stroke-width="0.6"/><circle class="ob-fr" r="${RING + 4.6}" stroke-width="0.6"/>`
    s += `<circle class="ob-fr" r="${RING + 7.6}" stroke-width="2.2" stroke-dasharray="0.6 ${n1((2 * Math.PI * (RING + 7.6)) / 72 - 0.6)}"/>`
    steps.forEach((st, i) => {
      const title = n > 0 ? `<title>${esc(`${cubeNo(i)} ${r.tasks[i]!.title}`)}</title>` : ''
      const col = PALETTE[st][1]
      if (st === 'pending') s += seg(i, RING, 'class="acg-mk" stroke-width="6"', title)
      else if (st === 'done') {
        s += seg(i, RING, `stroke="${col}" stroke-width="6"`, title)
        // A light line along its inner edge, so the ring reads as glass.
        s += seg(i, RING - 1.9, `stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.9" pointer-events="none"`)
      } else {
        const pulse = still ? '' : `<animate attributeName="stroke-opacity" values="1;0.45;1" dur="${st === 'waiting' ? 0.9 : 1.5}s" repeatCount="indefinite"/>`
        s += seg(i, RING, `stroke="${col}" stroke-opacity="0.28" stroke-width="6"`, title)
        const part = n > 0 ? Math.max(0.08, fills[i] ?? 0) : 1
        s += seg(i, RING, `stroke="${col}" stroke-width="6" pointer-events="none"`, pulse, part)
        // A spark runs along the segment while it is worked on.
        if (!still && count > 1) {
          const [d0, d1] = span(i)
          s += `<g pointer-events="none"><animateTransform attributeName="transform" type="rotate" values="${n1(d0)};${n1(d1)}" dur="1.6s" repeatCount="indefinite"/><circle cy="${-RING}" r="1.7" fill="#ffffff"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="1.6s" repeatCount="indefinite"/></circle></g>`
        }
      }
      if (i === selected) s += seg(i, RING + 5.6, 'stroke="#fbbf24" stroke-width="2"')
      if (!mini && n > 1 && n <= 12) {
        const [tx, ty] = polar(RING + 14.5, ((i + 0.5) * 360) / count)
        s += `<text class="acg-lb" x="${n1(tx)}" y="${n1(ty + 2.6)}" font-family="${FONT}" font-size="7.5" font-weight="${st === 'running' || st === 'waiting' ? 800 : 500}" text-anchor="middle">${cubeNo(i)}</text>`
      }
    })
    // Failed calls: a red count on the sun's lower right.
    if (r.errors > 0 && !mini) {
      const [ex, ey] = polar(SUN - 3, 132)
      s += `<g><title>${r.errors} ${tr('fehlgeschlagene Tool-Aufrufe', 'failed tool calls')}</title><circle cx="${n1(ex)}" cy="${n1(ey)}" r="5.4" fill="${PALETTE.error[1]}" stroke="#ffffff" stroke-width="0.9"/><text x="${n1(ex)}" y="${n1(ey + 2.5)}" font-family="${FONT}" font-size="7.2" font-weight="800" text-anchor="middle" fill="#ffffff">${r.errors > 9 ? '9+' : r.errors}</text></g>`
    }

    // ── The comet: the main agent's latest calls, the newest at its head ──
    if (belt.length > 0) {
      const rx = rxOf(0)
      const ry = ryOf(0)
      const path = moving ? lap(rx, ry) : ''
      belt.forEach((c, k) => {
        const col = c.status === 'error' ? PALETTE.error[1] : WORK_COLOR[workOf(c)]
        const rad0 = Math.max(1.6, 4.6 - k * 0.32)
        const tip = `<title>${esc(c.tool)}${c.detail ? ` · ${esc(c.detail.slice(0, 40))}` : ''}</title>`
        let dot = ''
        // The head glows and carries a bright core.
        if (k === 0) dot += `<circle r="${n1(rad0 + 4)}" fill="${col}" opacity="0.22"/>`
        dot += `<circle r="${n1(rad0)}" fill="${col}" opacity="${n1(Math.max(0.28, 1 - k * 0.08))}">${tip}</circle>`
        if (k === 0) dot += `<circle r="${n1(rad0 * 0.42)}" fill="#ffffff" opacity="0.85"/>`
        const ring = k === 0 && c.status === 'running' && !still ? `<circle r="${n1(rad0 + 2)}" fill="none" stroke="${col}" stroke-width="1.2"><animate attributeName="r" values="${n1(rad0 + 1)};${n1(rad0 + 6)}" dur="1.1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1.1s" repeatCount="indefinite"/></circle>` : ''
        if (moving) {
          s += `<g transform="translate(${n1(rx)} 0)"><animateTransform attributeName="transform" type="translate" values="${path}" dur="18s" begin="${n1(-(9 - k * 0.4))}s" repeatCount="indefinite"/>${ring}${dot}</g>`
        } else {
          const [x, y] = onEllipse(rx, ry, 68 - k * 11)
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
      defs += `<radialGradient id="ob-p${idx}" cx="0.34" cy="0.3" r="0.85"><stop offset="0" stop-color="${mix(col, '#ffffff', 0.55)}"/><stop offset="0.5" stop-color="${col}"/><stop offset="1" stop-color="${mix(col, '#0f172a', 0.6)}"/></radialGradient>`
      let body = `<title>${esc(a.name)}${live && a.tool ? `: ${esc(a.tool)}` : ''}</title>`
      body += `<circle r="13" fill="${col}" opacity="${live ? 0.16 : 0.08}"/>`
      if (live && work) {
        const moon = `<circle class="ob-moon" cx="15.5" r="2.9" fill="${WORK_COLOR[work]}" stroke="#ffffff" stroke-opacity="0.8" stroke-width="0.7"/>`
        body += `<circle class="ob-fr" r="15.5" stroke-width="0.5" stroke-dasharray="1 2.4"/>`
        body += still ? moon : `<g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2.6s" repeatCount="indefinite"/>${moon}</g>`
      }
      body += planetBody(idx, col, agentInitial(a.name))
      if (!live) {
        const ok = a.status === 'done'
        body += `<circle cx="8.4" cy="-8.4" r="5" fill="${ok ? PALETTE.done[1] : PALETTE.error[1]}" stroke="#ffffff" stroke-width="0.8"/>`
        body += `<path d="${ok ? 'M6 -8.4l1.8 1.8l3 -3.6' : 'M6.4 -10.4l4 4m0 -4l-4 4'}" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
      }
      // Its name, and the step it works on, below it.
      const where = live && n > 0 && a.taskIndex >= 0 ? `→${cubeNo(a.taskIndex)} ` : ''
      // A docked one carries it at its right, clear of the next one below.
      body += `<text class="acg-lb" ${live ? 'y="24" text-anchor="middle"' : 'x="17" y="3"'} font-family="${FONT}" font-size="7.4" font-weight="${live ? 700 : 500}">${esc(where + short(a.name, 14))}</text>`
      if (live && moving) {
        const dur = 20 + idx * 5
        const begin = -(idx * 4.3)
        const path = lap(rx, ry)
        // A trail of fading dots follows it round.
        for (let j = TRAIL; j >= 1; j--) {
          s += `<g transform="translate(${n1(rx)} 0)" pointer-events="none"><animateTransform attributeName="transform" type="translate" values="${path}" dur="${dur}s" begin="${n1(begin + j * 0.34 - dur)}s" repeatCount="indefinite"/><circle r="${n1(3.4 - j * 0.5)}" fill="${col}" opacity="${n1(0.5 - j * 0.085)}"/></g>`
        }
        s +=
          `<g transform="translate(${n1(rx)} 0)"><animateTransform attributeName="transform" type="translate" values="${path}" dur="${dur}s" begin="${n1(begin)}s" repeatCount="indefinite"/>` +
          `<g><animateTransform attributeName="transform" type="scale" values="${LAP_SIZES}" dur="${dur}s" begin="${n1(begin)}s" repeatCount="indefinite"/>${body}</g></g>`
      } else {
        // At rest: a working one where it stands, a finished one docked at the front.
        const deg = live ? 200 + idx * 47 : 58 + idx * 13
        const [x, y] = onEllipse(rx, ry, deg)
        s += `<g transform="translate(${n1(x)} ${n1(y)}) scale(${depth(deg).toFixed(2)})"${live ? '' : ' opacity="0.8"'}>${body}</g>`
      }
    })

    // ── The finale: the ring lights up segment by segment and waves run outwards ──
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

    const raw = `<svg xmlns="http://www.w3.org/2000/svg" width="${n1(width)}" height="${height}" viewBox="0 0 ${n1(width)} ${height}">${STYLE}${OWN_STYLE}<defs>${defs}</defs><g transform="translate(${n1(width / 2)} ${n1(height / 2)}) scale(${scale.toFixed(3)})">${s}</g></svg>`
    const working = planets.filter(p => p.a.status === 'running').length
    const alt =
      tr('Umlaufbahn', 'Orbit') +
      `: ${pct === null ? tr('kein Plan', 'no plan') : `${pct} %`}` +
      (n > 0 ? `, ${steps.filter(st => st === 'done').length}/${n}` : '') +
      (planets.length > 0 ? `, ${tr(`${planets.length} Subagents, ${working} aktiv`, `${planets.length} subagents, ${working} working`)}` : '')
    return { source: phaseLock(raw, now), width, height, alt }
  })
}
