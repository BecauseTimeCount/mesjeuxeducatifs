import type { CorpusEntry } from '@/engine/types'

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
] as const

const TENS: Record<number, string> = {
  20: 'vingt',
  30: 'trente',
  40: 'quarante',
  50: 'cinquante',
  60: 'soixante',
}

/** Nombre en toutes lettres (0..100), orthographe rectifiée avec tirets. */
export function numberToFrench(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new Error(`numberToFrench: ${n} hors de [0..100]`)
  }
  if (n < 20) return UNITS[n]
  if (n === 100) return 'cent'
  if (n === 70) return 'soixante-dix'
  if (n === 71) return 'soixante-et-onze'
  if (n > 71 && n < 80) return `soixante-${UNITS[n - 60]}`
  if (n === 80) return 'quatre-vingts'
  if (n > 80) return `quatre-vingt-${UNITS[n - 80]}`
  const t = Math.floor(n / 10) * 10
  const u = n % 10
  if (u === 0) return TENS[t]
  if (u === 1) return `${TENS[t]}-et-un`
  return `${TENS[t]}-${UNITS[u]}`
}

/** Entrée de corpus pour un nombre : clip pré-généré 'nombre.<n>' + fallback texte. */
export function numberEntry(n: number): CorpusEntry {
  return { id: `nombre.${n}`, text: numberToFrench(n) }
}
