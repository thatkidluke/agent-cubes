import { circle, line, n1, poly } from '../svg'
import type { CubeCtx, SceneCtx, Skin } from './types'

/**
 * A one-shot burst when a cube has just been finished: the faces flash white,
 * a ring spreads out from the cube's middle and sparks fly off. Everything ends
 * invisible (`fill="freeze"`), so a redraw that keeps the cube done shows nothing.
 */
export function completionBurst(ctx: SceneCtx, c: CubeCtx, color: string, spark = '#ffffff'): string {
  if (!c.justDone || ctx.detail === 0) return ''
  const S = ctx.S
  const [cx, cy] = ctx.P(c.u0 + 0.5, 0.5, 0.5)
  const once = (attr: string, values: string, dur: string, extra = '') =>
    `<animate attributeName="${attr}" values="${values}" dur="${dur}" fill="freeze"${extra}/>`
  let s = `<g>`
  // Flash on the visible faces.
  for (const face of [c.box.front, c.box.top, c.box.right]) {
    s += poly(face, `fill="#ffffff" opacity="0"`).replace('/>', `>${once('opacity', '0;0.85;0', '0.9s')}</polygon>`)
  }
  // Two rings spreading out, the second a beat later.
  for (const [delay, w] of [[0, 2.2], [0.25, 1.4]] as const) {
    s +=
      `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(S * 0.3)}" ry="${n1(S * 0.12)}" fill="none" stroke="${color}" stroke-width="${w}" opacity="0">` +
      once('rx', `${n1(S * 0.3)};${n1(S * 1.25)}`, '1.1s', ` begin="${delay}s"`) +
      once('ry', `${n1(S * 0.12)};${n1(S * 0.5)}`, '1.1s', ` begin="${delay}s"`) +
      once('opacity', '0;0.95;0', '1.1s', ` begin="${delay}s"`) +
      `</ellipse>`
  }
  // Sparks flying off in eight directions.
  if (ctx.detail > 1) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3
      const d = S * (0.75 + (k % 3) * 0.15)
      const tx = Math.cos(a) * d
      const ty = Math.sin(a) * d * 0.7
      s +=
        circle([cx, cy], Math.max(1.2, S * 0.045), `fill="${k % 2 ? spark : color}" opacity="0"`,
          `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(tx)} ${n1(ty)}" dur="0.9s" fill="freeze"/>` +
            once('opacity', '0;1;0', '0.9s'),
        )
    }
    // A short burst of light rays.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      s += line([cx, cy], [cx + Math.cos(a) * S * 0.9, cy + Math.sin(a) * S * 0.55], `stroke="${spark}" stroke-width="1.2" stroke-linecap="round" opacity="0"`).replace(
        '/>',
        `>${once('opacity', '0;0.8;0', '0.6s', ' begin="0.05s"')}</line>`,
      )
    }
  }
  return s + `</g>`
}

/**
 * The caption colour when the pane is dark. The renderer turns classic's
 * `.cap` texts (captions, diff lines, the context label) to this colour, with a
 * dark halo, under `@media (prefers-color-scheme: dark)`.
 */
export const CLASSIC_CAPTION_DARK = '#e2e8f0'

/** The original look: grey stone pedestal, glass cubes, silver mini cubes. */
export const classic: Skin = {
  id: 'classic',
  name: 'Classic',
  description: 'Stone pedestal, glass cubes and silver mini cubes',
  status: {
    pending: ['#cbd5e1', '#94a3b8', '#64748b'],
    running: ['#93c5fd', '#3b82f6', '#1d4ed8'],
    done: ['#86efac', '#22c55e', '#15803d'],
    error: ['#fca5a5', '#ef4444', '#b91c1c'],
    waiting: ['#fcd34d', '#f59e0b', '#b45309'],
  },
  glass: { top: 0.34, bottom: 0.06, ghost: 0.5 },
  edge: { color: '#0f172a', opacity: 0.22 },
  mini: {
    top: ['#ffffff', '#d4dae2'],
    front: ['#dfe3ea', '#a7afbb'],
    side: ['#a3abb8', '#6b7484'],
    highlight: '#ffffff',
    glint: '#ffffff',
  },
  tint: {
    read: ['#3b82f6', 0.32],
    write: ['#f59e0b', 0.38],
    run: ['#8b5cf6', 0.34],
    agent: ['#14b8a6', 0.34],
    other: ['#94a3b8', 0],
    err: ['#ef4444', 0.78],
  },
  pedestal: {
    front: ['#a8b3c2', '#8794a6', '#6b7789'],
    top: ['#cfd6e0', '#b3bdca'],
    side: ['#748196', '#56627a'],
    footTop: '#9aa6b6',
    footSide: '#4b566b',
    light: '#ffffff',
    shadow: '#0f172a',
  },
  plaque: {
    frame: ['#e2e7ee', '#9aa5b5'],
    inner: ['#3b4454', '#232a36'],
    text: { pending: '#cbd5e1', running: '#93c5fd', done: '#86efac', error: '#fca5a5', waiting: '#fcd34d' },
    caption: '#1e293b',
  },
  track: { groove: '#334155', from: '#3b82f6', to: '#22c55e', head: '#3b82f6' },
  font: 'system-ui,-apple-system,sans-serif',
  cubeOverlay: (ctx, c) => completionBurst(ctx, c, '#22c55e'),
}
