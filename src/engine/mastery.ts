import type { MasteryState, SkillId, SkillProgress } from '@/engine/types'
import { SKILLS_BY_ID } from '@/content/skill-map'

// ============================================================
// Moteur de maîtrise — fenêtre glissante + boîtes de Leitner.
// La logique est PURE (applyAttempt / computeState) et testée
// sans IndexedDB ; l'IO (recordAttempt / getSummary) vit en bas
// et charge le storage à la demande.
// ============================================================

/** Taille de la fenêtre glissante des premiers essais. */
const WINDOW_SIZE = 10
/** Seuil de réussite sur la fenêtre pour la maîtrise. */
const MASTERY_RATIO = 0.8
/** Minimum d'éléments dans la fenêtre pour prétendre à la maîtrise. */
const MASTERY_MIN_WINDOW = 5
/** En dessous de ce total de tentatives : découverte. */
const DISCOVERY_MAX_ATTEMPTS = 3

const DAY_MS = 24 * 60 * 60 * 1000
/** Délais de révision (jours) pour les boîtes 1, 2 et 3 : J+2, J+7, J+21. */
const REVIEW_DAYS = [2, 7, 21] as const

const FRESH: SkillProgress = {
  window: [],
  state: 'decouverte',
  box: 0,
  totalAttempts: 0,
}

function promoteBox(box: SkillProgress['box']): 1 | 2 | 3 {
  if (box === 0) return 1
  if (box === 1) return 2
  return 3
}

/**
 * État de maîtrise dérivé d'une progression. PURE.
 * - découverte : moins de 3 tentatives au total
 * - maîtrise : fenêtre ≥ 5 éléments ET ratio de réussite ≥ 0.8
 * - consolidé : maîtrise ET box ≥ 2
 * - en-cours : sinon
 */
export function computeState(p: SkillProgress): MasteryState {
  if (p.totalAttempts < DISCOVERY_MAX_ATTEMPTS) return 'decouverte'
  if (p.window.length >= MASTERY_MIN_WINDOW) {
    const okCount = p.window.reduce((n, a) => n + (a.ok ? 1 : 0), 0)
    if (okCount / p.window.length >= MASTERY_RATIO) {
      return p.box >= 2 ? 'consolide' : 'maitrise'
    }
  }
  return 'en-cours'
}

/**
 * Applique un premier essai (réussi ou non) à une progression. PURE.
 * - Fenêtre glissante des 10 derniers premiers essais, totalAttempts++.
 * - 2 échecs consécutifs en fin de fenêtre → box 0, révision immédiate.
 * - Passage à la maîtrise → box+1 (max 3), révision à J+2 / J+7 / J+21.
 */
export function applyAttempt(
  p: SkillProgress | undefined,
  ok: boolean,
  now: number,
): SkillProgress {
  const prev = p ?? FRESH
  const next: SkillProgress = {
    ...prev,
    window: [...prev.window, { ok, ts: now }].slice(-WINDOW_SIZE),
    totalAttempts: prev.totalAttempts + 1,
  }

  const lastTwo = next.window.slice(-2)
  const twoFailsInARow = lastTwo.length === 2 && lastTwo.every((a) => !a.ok)

  if (twoFailsInARow) {
    next.box = 0
    next.nextReview = now
  } else {
    const wasMastered = prev.state === 'maitrise' || prev.state === 'consolide'
    const reached = computeState(next)
    if (!wasMastered && (reached === 'maitrise' || reached === 'consolide')) {
      const box = promoteBox(prev.box)
      next.box = box
      next.nextReview = now + REVIEW_DAYS[box - 1] * DAY_MS
    }
  }

  next.state = computeState(next)
  return next
}

// ---------- IO (stocké sous pget/pset('mastery')) ----------

type MasteryStore = Record<SkillId, SkillProgress>

const STORAGE_KEY = 'mastery'

// Import dynamique du storage : la logique pure ci-dessus reste
// importable et testable sans jamais toucher IndexedDB.
async function loadStorage() {
  return import('@/engine/storage')
}

/** Enregistre un premier essai pour une compétence du SKILL_MAP. */
export async function recordAttempt(skillId: SkillId, firstTry: boolean): Promise<void> {
  if (!SKILLS_BY_ID.has(skillId)) {
    if (import.meta.env.DEV) {
      console.warn(`[mastery] skillId inconnu ignoré : « ${skillId} » (absent du SKILL_MAP)`)
    }
    return
  }
  const { pget, pset } = await loadStorage()
  const store = (await pget<MasteryStore>(STORAGE_KEY)) ?? {}
  store[skillId] = applyAttempt(store[skillId], firstTry, Date.now())
  await pset(STORAGE_KEY, store)
}

/** Progression par compétence du profil actif (dashboard parent). */
export async function getSummary(): Promise<MasteryStore> {
  const { pget } = await loadStorage()
  return (await pget<MasteryStore>(STORAGE_KEY)) ?? {}
}
