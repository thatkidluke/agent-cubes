import type { CallKind, CubeStatus, WorkKind } from '../../types'
import type { Box, Pt } from '../svg'

/** A mini cube's look: the kind of work of the call it stands for, or a failed call. */
export type MiniKind = WorkKind | 'err'

/** Everything about the scene a skin's decoration may need. */
export type SceneCtx = {
  width: number
  height: number
  /** Pixels per world unit (one cube edge). */
  S: number
  /** 2 full ornament, 1 reduced, 0 bare: lowered when the markup grows too big. */
  detail: 0 | 1 | 2
  /** Is any cube being worked on right now. */
  hasLive: boolean
  /** Number of cubes. */
  n: number
  /** World (u along the timeline, v into depth, w up) → screen. */
  P: (u: number, v: number, w: number) => Pt
  /** The pedestal block's faces; its top is at w = 0, the cubes stand on it. */
  pedestal: Box
  /** Left edge of cube i in u; the cube spans u..u+1, v 0..1, w 0..1. */
  cubeU: (i: number) => number
  /** Overall progress 0..1 as drawn on the timeline. */
  overall: number
  /** How full the session's context window is, 0..1; null when unknown. Drawn as a tank on the pedestal's right side. */
  context: number | null
}

/** One cube, as a skin's cube decoration sees it. */
export type CubeCtx = {
  index: number
  status: CubeStatus
  /** `glass` while open or in work (fills with mini cubes), `solid` once done or failed. */
  kind: 'glass' | 'solid'
  /** Being worked on right now: animate. */
  isLive: boolean
  /** Not started yet: drawn faint. */
  isGhost: boolean
  /**
   * Finished within the last few seconds: play a one-shot completion effect
   * (SMIL with `begin="0s"`, no repeat, `fill="freeze"` ending invisible). It
   * stays true for about 4 s, so the effect plays when the cube turns done.
   */
  justDone: boolean
  /** Why the step looks stuck (failures in a row, the same call over and over, silence, far too slow); '' when it is fine. */
  stuck: string
  /** Indices of unfinished steps this one waits for. */
  blockedBy: number[]
  /** Lines this step added / removed. */
  added: number
  removed: number
  /** The step's last test run: passed, failed, or none. */
  test: '' | 'pass' | 'fail'
  /** Mini cubes showing, 0..slots. */
  fill: number
  slots: number
  /** The cube's faces (front, top, right visible; back, left, bottom hidden behind). */
  box: Box
  u0: number
  u1: number
  /** Centre of the front face, and of the top face, on screen. */
  front: Pt
  top: Pt
}

/**
 * A skin: colours for every part, plus optional decoration hooks that return
 * SVG markup. Ids a skin defines in `defs` must start with the skin's id and a
 * dash (`cyber-…`), so skins never clash with the renderer's own ids.
 */
export type Skin = {
  id: string
  /** Shown on the picker button. */
  name: string
  /** One line for the picker's tooltip. */
  description: string
  /** Solid-cube faces per status: top, front, side. */
  status: Record<CubeStatus, [string, string, string]>
  /** Glass cubes: fill opacity at the gradient's top and bottom, and how faint a cube not started is. */
  glass: { top: number; bottom: number; ghost: number }
  /** Edges of cubes and mini cubes. */
  edge: { color: string; opacity: number }
  /** The mini cubes' base faces, each a gradient [from, to], a highlight line, and the glint that runs over them. */
  mini: { top: [string, string]; front: [string, string]; side: [string, string]; highlight: string; glint: string }
  /** Tint mixed into a mini cube per kind of work: [colour, amount 0..1]. */
  tint: Record<CallKind | 'err', [string, number]> & Partial<Record<MiniKind, [string, number]>>
  pedestal: {
    /** Gradients, top to bottom. */
    front: [string, string, string]
    top: [string, string]
    side: [string, string]
    footTop: string
    footSide: string
    /** The light chamfer on the top front edge. */
    light: string
    /** Drop shadow under the pedestal. */
    shadow: string
  }
  plaque: {
    frame: [string, string]
    inner: [string, string]
    /** The number's colour per status. */
    text: Record<CubeStatus, string>
    /** The duration / percentage under each plaque. */
    caption: string
  }
  /** The channel the progress pipe lies in. */
  track: { groove: string }
  /**
   * The progress pipe in its own band at the pedestal's foot: what flows in it
   * (glowing energy, a liquid with bubbles, pixel blocks, or a flat fill), its
   * colours from start to front, and the metal of its fittings.
   */
  pipe: { fill: 'energy' | 'liquid' | 'pixel' | 'flat'; colors: [string, string, string]; metal: string }
  /** Font family for numbers and captions. */
  font: string
  /**
   * The renderer's own effects a skin may switch off (all on when left out):
   * the glint running over mini cubes, sparks rising from live cubes, the glow
   * and pulse on live edges, the glossy sweep over live glass, and the
   * plaques' drop shadow.
   */
  effects?: {
    glint?: boolean
    sparks?: boolean
    glow?: boolean
    pulse?: boolean
    sweep?: boolean
    plaqueShadow?: boolean
    /** Reflections of the cubes on the polished pedestal top. */
    reflection?: boolean
    /** Mood lights: a warm spot on a waiting step, a red glow on a stuck one, a calm wash when all is done. */
    mood?: boolean
  }
  /** Extra <defs> content: gradients, filters, patterns, symbols. */
  defs?: (ctx: SceneCtx) => string
  /** Drawn over the pedestal's faces, before the plaques and cubes. */
  pedestalDecor?: (ctx: SceneCtx) => string
  /** Drawn inside a glass cube, after its mini cubes and before its front glass. */
  cubeInner?: (ctx: SceneCtx, cube: CubeCtx) => string
  /** Drawn over a cube (glows, rings, labels). */
  cubeOverlay?: (ctx: SceneCtx, cube: CubeCtx) => string
  /** Drawn last, over everything. */
  overlay?: (ctx: SceneCtx) => string
}
