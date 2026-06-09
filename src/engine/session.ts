// ============================================================
// Temps de jeu de la session courante (sessionStorage, par onglet).
// touchSession() est appelé par GameShell au montage : l'écart entre
// deux battements espacés de moins de 2 minutes est cumulé ; au-delà,
// la tablette était posée — on n'ajoute rien.
// ============================================================

const LAST_BEAT_KEY = 'jayjay:session:lastBeat'
const ELAPSED_KEY = 'jayjay:session:elapsedMs'
const BREAK_KEY = 'jayjay:session:breakSuggested'

/** Au-delà de cet écart entre deux battements, le temps n'est pas compté. */
const MAX_GAP_MS = 2 * 60_000
/** Minutes de jeu avant de proposer le rituel de pause. */
const BREAK_AFTER_MINUTES = 15

function readNumber(key: string): number {
  const raw = sessionStorage.getItem(key)
  const n = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** Enregistre un battement de coeur et cumule le temps écoulé. */
export function touchSession(): void {
  const now = Date.now()
  const last = readNumber(LAST_BEAT_KEY)
  if (last > 0) {
    const gap = now - last
    if (gap > 0 && gap < MAX_GAP_MS) {
      sessionStorage.setItem(ELAPSED_KEY, String(readNumber(ELAPSED_KEY) + gap))
    }
  }
  sessionStorage.setItem(LAST_BEAT_KEY, String(now))
}

/** Minutes de jeu cumulées sur la session courante. */
export function sessionMinutes(): number {
  return Math.floor(readNumber(ELAPSED_KEY) / 60_000)
}

/** Vrai au-delà de ~15 minutes de jeu, une seule fois par session. */
export function shouldSuggestBreak(): boolean {
  return sessionMinutes() >= BREAK_AFTER_MINUTES && sessionStorage.getItem(BREAK_KEY) === null
}

export function markBreakSuggested(): void {
  sessionStorage.setItem(BREAK_KEY, '1')
}
