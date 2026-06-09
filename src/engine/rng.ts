// ============================================================
// Petits utilitaires aléatoires — génération procédurale des jeux.
// ============================================================

/** Entier aléatoire entre min et max, BORNES INCLUSES. */
export function randInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max))
  const hi = Math.floor(Math.max(min, max))
  return Math.floor(Math.random() * (hi - lo + 1)) + lo
}

/** Un élément au hasard du tableau (le tableau ne doit pas être vide). */
export function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]
}

/** Mélange Fisher-Yates — retourne une COPIE, ne mute jamais l'original. */
export function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}
