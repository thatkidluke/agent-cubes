import { cave } from './cave'
import { classic } from './classic'
import { cyber } from './cyber'
import { factory } from './factory'
import { minimal } from './minimal'
import { quest } from './quest'
import { retro } from './retro'
import { stellar } from './stellar'
import { steampunk } from './steampunk'
import type { Skin } from './types'

export type { CubeCtx, MiniKind, SceneCtx, Skin } from './types'

/** Every skin, in the picker's order. */
export const SKINS: Skin[] = [classic, cyber, stellar, retro, steampunk, minimal, cave, factory, quest]

export function skinById(id: string | undefined): Skin {
  return SKINS.find(s => s.id === id) ?? classic
}
