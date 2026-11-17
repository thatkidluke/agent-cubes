/**
 * The progress pipe: a glass tube in a recessed band at the pedestal's foot,
 * filled from the left as far as the task has come. What flows in it follows
 * the skin: glowing energy with pulses running through it, a liquid with a
 * moving sheen and rising bubbles, pixel blocks, or a calm flat fill. Metal
 * couplings mark where one step ends and the next begins; caps close both ends.
 */
import { n1 } from './svg'
import type { Skin } from './skins/types'

export type PipeGeometry = {
  /** Left and right end of the tube, its centre line, its radius (px). */
  x0: number
  x1: number
  y: number
  r: number
  /** x of each step boundary along the tube. */
  joints: number[]
}

export function pipeStyle(skin: Skin): Skin['pipe'] {
  return skin.pipe
}

/** The band's height in px for a tube of radius r: the recess around it. */
export const pipeBandPx = (r: number) => r * 4.2 + 6

export function progressPipe(g: PipeGeometry, overall: number, skin: Skin, moving: boolean, detail: number, groove: string, light: string): string {
  const st = pipeStyle(skin)
  const { x0, x1, y, r } = g
  const [c0, c1, c2] = st.colors
  const len = x1 - x0
  const f = Math.max(0, Math.min(1, overall))
  const fx = x0 + len * f
  const glow = st.fill !== 'flat' && skin.effects?.glow !== false
  let s = ''

  // The recess: a darker channel cut into the pedestal, shaded on top, lit below.
  const bh = r * 3.6
  const bx0 = x0 - r * 2.6
  const bx1 = x1 + r * 2.6
  s += `<rect x="${n1(bx0)}" y="${n1(y - bh / 2)}" width="${n1(bx1 - bx0)}" height="${n1(bh)}" rx="${n1(r * 1.3)}" fill="${groove}" fill-opacity="0.62"/>`
  s += `<rect x="${n1(bx0)}" y="${n1(y - bh / 2)}" width="${n1(bx1 - bx0)}" height="${n1(bh)}" rx="${n1(r * 1.3)}" fill="url(#pp-recess)"/>`
  s += `<line x1="${n1(bx0 + r)}" y1="${n1(y + bh / 2 + 0.6)}" x2="${n1(bx1 - r)}" y2="${n1(y + bh / 2 + 0.6)}" stroke="${light}" stroke-opacity="0.35" stroke-width="0.8"/>`

  // The glass tube, empty.
  s += `<rect x="${n1(x0)}" y="${n1(y - r)}" width="${n1(len)}" height="${n1(2 * r)}" rx="${n1(r)}" fill="url(#pp-glass)"/>`

  // What flows in it, clipped to the tube.
  if (f > 0) {
    s += `<g clip-path="url(#pp-clip)">`
    if (st.fill === 'pixel') {
      // Blocks, as many as the progress fills, the last one blinking while work goes on.
      const bw = r * 1.6
      const gap = Math.max(1, r * 0.35)
      const count = Math.max(1, Math.floor((len * f) / (bw + gap)))
      for (let k = 0; k < count; k++) {
        const t = count === 1 ? 0 : k / (count - 1)
        const col = t < 0.5 ? c0 : c1
        const last = k === count - 1
        const blink = last && moving ? `<animate attributeName="opacity" values="1;0.35;1" dur="0.8s" repeatCount="indefinite"/>` : ''
        s += `<rect x="${n1(x0 + gap + k * (bw + gap))}" y="${n1(y - r + gap)}" width="${n1(bw)}" height="${n1(2 * r - 2 * gap)}" fill="${last ? c2 : col}">${blink}</rect>`
      }
    } else {
      s += `<rect x="${n1(x0)}" y="${n1(y - r)}" width="${n1(Math.max(r, fx - x0))}" height="${n1(2 * r)}" fill="url(#pp-fill)"${glow ? ' filter="url(#gl)"' : ''}/>`
      if (moving && detail > 0 && st.fill === 'energy') {
        // Pulses running to the right through the energy.
        const dash = r * 1.6
        const gapE = r * 4.5
        s += `<line x1="${n1(x0)}" y1="${n1(y)}" x2="${n1(fx)}" y2="${n1(y)}" stroke="#ffffff" stroke-opacity="0.75" stroke-width="${n1(r * 0.7)}" stroke-linecap="round" stroke-dasharray="${n1(dash)} ${n1(gapE)}">` +
          `<animate attributeName="stroke-dashoffset" values="${n1(dash + gapE)};0" dur="0.9s" repeatCount="indefinite"/></line>`
      }
      if (moving && detail > 0 && st.fill === 'liquid') {
        // A sheen drifting along, and bubbles rising through the liquid.
        s += `<rect x="${n1(x0)}" y="${n1(y - r)}" width="${n1(fx - x0)}" height="${n1(2 * r)}" fill="url(#pp-wave)"/>`
        const span = Math.max(r * 4, fx - x0 - r * 2)
        for (let k = 0; k < 3; k++) {
          const bx = x0 + r + ((k + 0.5) / 3) * span
          const dur = 1.6 + k * 0.5
          s += `<circle cx="${n1(bx)}" cy="${n1(y + r * 0.6)}" r="${n1(r * 0.22)}" fill="#ffffff" opacity="0">` +
            `<animate attributeName="cy" values="${n1(y + r * 0.6)};${n1(y - r * 0.6)}" dur="${dur}s" begin="${k * 0.45}s" repeatCount="indefinite"/>` +
            `<animate attributeName="opacity" values="0;0.75;0" dur="${dur}s" begin="${k * 0.45}s" repeatCount="indefinite"/></circle>`
        }
      }
      // The front: a glowing orb for energy, a bright meniscus for a liquid.
      if (f < 0.999) {
        if (st.fill === 'energy') {
          const pulse = moving ? `<animate attributeName="r" values="${n1(r * 0.85)};${n1(r * 1.15)};${n1(r * 0.85)}" dur="1.4s" repeatCount="indefinite"/>` : ''
          s += `<circle cx="${n1(fx)}" cy="${n1(y)}" r="${n1(r * 0.9)}" fill="#ffffff" stroke="${c2}" stroke-width="${n1(r * 0.35)}"${glow ? ' filter="url(#gl)"' : ''}>${pulse}</circle>`
        } else if (st.fill === 'liquid') {
          s += `<ellipse cx="${n1(fx)}" cy="${n1(y)}" rx="${n1(r * 0.42)}" ry="${n1(r * 0.95)}" fill="${c2}" opacity="0.9"/>`
        } else {
          s += `<rect x="${n1(fx - 1)}" y="${n1(y - r)}" width="2" height="${n1(2 * r)}" fill="${c2}"/>`
        }
      }
    }
    s += `</g>`
  }

  // The tube's roundness: a highlight on top, a shade below, over whatever flows.
  s += `<rect x="${n1(x0)}" y="${n1(y - r)}" width="${n1(len)}" height="${n1(2 * r)}" rx="${n1(r)}" fill="url(#pp-shade)"/>`
  s += `<line x1="${n1(x0 + r)}" y1="${n1(y - r * 0.55)}" x2="${n1(x1 - r)}" y2="${n1(y - r * 0.55)}" stroke="#ffffff" stroke-opacity="0.38" stroke-width="${n1(Math.max(0.8, r * 0.28))}" stroke-linecap="round"/>`
  s += `<rect x="${n1(x0)}" y="${n1(y - r)}" width="${n1(len)}" height="${n1(2 * r)}" rx="${n1(r)}" fill="none" stroke="${st.metal}" stroke-opacity="0.7" stroke-width="0.9"/>`

  // Couplings where one step ends and the next begins.
  for (const jx of g.joints) {
    s += `<rect x="${n1(jx - r * 0.38)}" y="${n1(y - r * 1.3)}" width="${n1(r * 0.76)}" height="${n1(r * 2.6)}" rx="${n1(r * 0.2)}" fill="url(#pp-metal)" stroke="#000000" stroke-opacity="0.35" stroke-width="0.6"/>`
  }
  // End caps, the right one lit once the task is done.
  for (const [cx, done] of [[x0, false], [x1, f >= 0.999]] as const) {
    s += `<rect x="${n1(cx - r * 0.8)}" y="${n1(y - r * 1.45)}" width="${n1(r * 1.6)}" height="${n1(r * 2.9)}" rx="${n1(r * 0.4)}" fill="url(#pp-metal)" stroke="#000000" stroke-opacity="0.4" stroke-width="0.7"/>`
    s += `<circle cx="${n1(cx)}" cy="${n1(y)}" r="${n1(r * 0.32)}" fill="${done ? c2 : '#000000'}" fill-opacity="${done ? 1 : 0.35}"${done && glow ? ' filter="url(#gl)"' : ''}/>`
  }
  return s
}

/** The gradients and patterns the pipe uses. */
export function pipeDefs(g: PipeGeometry, skin: Skin, moving: boolean): string {
  const st = pipeStyle(skin)
  const [c0, c1, c2] = st.colors
  const { x0, x1, y, r } = g
  let d = ''
  d += `<clipPath id="pp-clip"><rect x="${n1(x0)}" y="${n1(y - r)}" width="${n1(x1 - x0)}" height="${n1(2 * r)}" rx="${n1(r)}"/></clipPath>`
  d += `<linearGradient id="pp-recess" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0.45"/><stop offset="0.35" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.06"/></linearGradient>`
  d += `<linearGradient id="pp-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="0.5" stop-color="#000000" stop-opacity="0.45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.1"/></linearGradient>`
  d += `<linearGradient id="pp-fill" gradientUnits="userSpaceOnUse" x1="${n1(x0)}" y1="0" x2="${n1(x1)}" y2="0"><stop offset="0" stop-color="${c0}"/><stop offset="0.6" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`
  d += `<linearGradient id="pp-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.35"/></linearGradient>`
  d += `<linearGradient id="pp-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.25" stop-color="${st.metal}"/><stop offset="1" stop-color="#000000" stop-opacity="0.6"/></linearGradient>`
  if (moving && st.fill === 'liquid') {
    const w = r * 3
    d += `<pattern id="pp-wave" patternUnits="userSpaceOnUse" width="${n1(w)}" height="${n1(2 * r)}" y="${n1(y - r)}">` +
      `<path d="M0 ${n1(2 * r)}L${n1(w / 2)} 0" stroke="#ffffff" stroke-opacity="0.22" stroke-width="${n1(r * 0.45)}"/>` +
      `<animateTransform attributeName="patternTransform" type="translate" values="0 0;${n1(w)} 0" dur="1.2s" repeatCount="indefinite"/></pattern>`
  }
  return d
}
