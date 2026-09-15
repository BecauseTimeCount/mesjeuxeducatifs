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

/** Nombre en toutes lettres (0..10 000), orthographe rectifiée avec tirets. */
export function numberToFrench(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 10_000) {
    throw new Error(`numberToFrench: ${n} hors de [0..10000]`)
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000)
    const rest = n % 1000
    const thousands = k === 1 ? 'mille' : `${UNITS[k]}-mille`
    return rest === 0 ? thousands : `${thousands}-${numberToFrench(rest)}`
  }
  if (n >= 100) {
    const h = Math.floor(n / 100)
    const rest = n % 100
    const hundreds = h === 1 ? 'cent' : `${UNITS[h]}-cent`
    if (rest === 0) return h === 1 ? 'cent' : `${hundreds}s`
    return `${hundreds}-${numberToFrench(rest)}`
  }
  if (n < 20) return UNITS[n]
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
