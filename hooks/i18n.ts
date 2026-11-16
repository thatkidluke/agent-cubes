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
