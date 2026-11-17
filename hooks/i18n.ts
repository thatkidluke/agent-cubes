/**
 * The panel's language. Every visible text is written once as a German/English
 * pair at the place it is used: `tr('Laufzeit', 'Elapsed')`. The language comes
 * from the `language` setting; a change there reloads the module, so a module
 * variable is enough.
 */
export type Lang = 'de' | 'en'

let lang: Lang = 'en'

export function setLang(next: Lang): void {
  lang = next
}

export function currentLang(): Lang {
  return lang
}

/** The text in the current language. */
export const tr = (de: string, en: string): string => (lang === 'en' ? en : de)

/** What a step is drawn as: a cube, or a chip on the circuit board. The panel's wording follows the view. */
export type Unit = 'cube' | 'chip'

let unit: Unit = 'cube'

export function setUnit(next: Unit): void {
  unit = next
}

/** "Cube" or "Chip", in the current language. */
export const unitWord = (): string => (unit === 'chip' ? 'Chip' : tr('Würfel', 'Cube'))

/** Its plural, as it stands inside a sentence: "cubes", "chips", "Würfel", "Chips". */
export const unitWords = (): string => (unit === 'chip' ? tr('Chips', 'chips') : tr('Würfel', 'cubes'))
