import type { GameMeta, SkillDef, SkillId, SkillProgress } from '@/engine/types'
import { currentPeriod, type Period } from '@/engine/periods'
import { getSummary } from '@/engine/mastery'
import { pick } from '@/engine/rng'
import { SKILL_MAP } from '@/content/skill-map'

// ============================================================
// Parcours du jour — répétition espacée Leitner CROSS-JEUX.
// Au plus 3 étapes : 1 notion fragile, 1 nouvelle, 1 révision due.
// La logique est PURE (buildDailyPath) et testée sans IndexedDB ;
// l'IO (getDailyPath / markServed) vit en bas et charge storage et
// manifest à la demande (aucun cycle statique).
// ============================================================

export type PickKind = 'revision' | 'fragile' | 'nouvelle'

export interface DailyPick {
  kind: PickKind
  skillId: SkillId
  gameId: string
}

/** Mémoire du scheduler : dernier jeu servi par compétence (rotation). */
export interface SchedulerState {
  lastServed: Record<SkillId, { gameId: string; ts: number }>
}

export interface DailyPathInput {
  summary: Record<SkillId, SkillProgress>
  skills: readonly SkillDef[]
  /** Jeux v2 uniquement (status === 'v2'). */
  games: readonly GameMeta[]
  now: number
  period: Period
  state?: SchedulerState
  /** Défaut : pick de @/engine/rng ; injecté dans les tests pour le déterminisme. */
  choose?: <T>(arr: readonly T[]) => T
}

/** Ordre de préférence des niveaux pour les nouvelles notions. */
const LEVEL_RANK: Record<SkillDef['level'], number> = { gs: 0, cp: 1, ce1: 2 }

/** Ratio de réussite sur la fenêtre glissante (fenêtre non vide). */
function successRatio(p: SkillProgress): number {
  const okCount = p.window.reduce((n, a) => n + (a.ok ? 1 : 0), 0)
  return okCount / p.window.length
}

/** Timestamp de la dernière tentative (la fenêtre est chronologique). */
function lastAttemptTs(p: SkillProgress): number {
  return p.window.length > 0 ? p.window[p.window.length - 1].ts : 0
}

/** 0 = période courante, 1 = période antérieure, 2 = le reste (sans période, future). */
function periodTier(skillPeriod: SkillDef['period'], current: Period): 0 | 1 | 2 {
  if (skillPeriod === current) return 0
  if (skillPeriod !== undefined && skillPeriod < current) return 1
  return 2
}

/**
 * Construit le parcours du jour. PURE.
 * - revision : nextReview ≤ now, la plus en retard d'abord, avec rotation
 *   de jeu (un jeu différent du dernier servi pour cette compétence).
 * - fragile : 'en-cours' avec fenêtre ≥ 3, pire ratio de réussite
 *   (égalité → tentative la plus ancienne) ; jamais le skill de révision.
 * - nouvelle : aucune tentative ET prereqs directs maîtrisés/consolidés ;
 *   préférence à la période courante, puis antérieures, puis gs < cp < ce1.
 * Retour ordonné [fragile?, nouvelle?, revision?] — jamais deux fois le
 * même skill, jamais deux fois le même jeu quand une alternative existe.
 */
export function buildDailyPath(input: DailyPathInput): DailyPick[] {
  const { summary, skills, games, now, period, state } = input
  const choose = input.choose ?? pick

  // Compétence → jeux v2 qui l'exercent. Les skills sans jeu v2 sont ignorés.
  const gamesBySkill = new Map<SkillId, string[]>()
  for (const g of games) {
    if (g.status !== 'v2') continue
    for (const skillId of g.skills) {
      const list = gamesBySkill.get(skillId)
      if (list) list.push(g.id)
      else gamesBySkill.set(skillId, [g.id])
    }
  }
  const playable = skills.filter((s) => gamesBySkill.has(s.id))

  // --- révision : échéance dépassée, la plus en retard d'abord ---
  const due = playable
    .map((def) => ({ def, prog: summary[def.id] as SkillProgress | undefined }))
    .filter(
      (c): c is { def: SkillDef; prog: SkillProgress } =>
        c.prog?.nextReview !== undefined && c.prog.nextReview <= now,
    )
    .sort((a, b) => (a.prog.nextReview ?? 0) - (b.prog.nextReview ?? 0))
  const revisionSkill: SkillDef | undefined = due[0]?.def

  // --- fragile : pire ratio, égalité départagée par l'ancienneté ---
  const fragiles = playable
    .filter((def) => def.id !== revisionSkill?.id)
    .map((def) => ({ def, prog: summary[def.id] as SkillProgress | undefined }))
    .filter(
      (c): c is { def: SkillDef; prog: SkillProgress } =>
        c.prog !== undefined && c.prog.state === 'en-cours' && c.prog.window.length >= 3,
    )
    .sort((a, b) => {
      const byRatio = successRatio(a.prog) - successRatio(b.prog)
      if (byRatio !== 0) return byRatio
      return lastAttemptTs(a.prog) - lastAttemptTs(b.prog)
    })
  const fragileSkill: SkillDef | undefined = fragiles[0]?.def

  // --- nouvelle : jamais tentée, prereqs directs acquis ---
  const isAcquired = (id: SkillId): boolean => {
    const st = summary[id]?.state
    return st === 'maitrise' || st === 'consolide'
  }
  const fresh = playable.filter((def) => {
    if (def.id === revisionSkill?.id || def.id === fragileSkill?.id) return false
    const prog = summary[def.id] as SkillProgress | undefined
    if (prog !== undefined && prog.totalAttempts > 0) return false
    // Un prérequis qu'aucun jeu v2 n'exerce ne peut jamais être validé :
    // il ne doit pas verrouiller la découverte de toute sa descendance.
    return (def.prereqs ?? []).every((id) => !gamesBySkill.has(id) || isAcquired(id))
  })
  let nouvelleSkill: SkillDef | undefined
  if (fresh.length > 0) {
    const rank = (d: SkillDef): number => periodTier(d.period, period) * 10 + LEVEL_RANK[d.level]
    const best = Math.min(...fresh.map(rank))
    nouvelleSkill = choose(fresh.filter((d) => rank(d) === best))
  }

  // --- affectation des jeux : variété d'exposition ---
  // La révision d'abord (la plus contrainte : rotation), puis les autres ;
  // on évite un jeu déjà pris seulement quand une alternative existe.
  const usedGames = new Set<string>()
  const assignGame = (skillId: SkillId, avoid?: string): string => {
    let candidates = gamesBySkill.get(skillId) ?? []
    if (avoid !== undefined) {
      const rotated = candidates.filter((id) => id !== avoid)
      if (rotated.length > 0) candidates = rotated
    }
    const unused = candidates.filter((id) => !usedGames.has(id))
    if (unused.length > 0) candidates = unused
    const gameId = choose(candidates)
    usedGames.add(gameId)
    return gameId
  }

  const revisionPick: DailyPick | undefined = revisionSkill && {
    kind: 'revision',
    skillId: revisionSkill.id,
    gameId: assignGame(revisionSkill.id, state?.lastServed[revisionSkill.id]?.gameId),
  }
  const fragilePick: DailyPick | undefined = fragileSkill && {
    kind: 'fragile',
    skillId: fragileSkill.id,
    gameId: assignGame(fragileSkill.id),
  }
  const nouvellePick: DailyPick | undefined = nouvelleSkill && {
    kind: 'nouvelle',
    skillId: nouvelleSkill.id,
    gameId: assignGame(nouvelleSkill.id),
  }

  const path: DailyPick[] = []
  if (fragilePick) path.push(fragilePick)
  if (nouvellePick) path.push(nouvellePick)
  if (revisionPick) path.push(revisionPick)
  return path
}

// ---------- IO (stocké sous pget/pset('scheduler')) ----------

const STORAGE_KEY = 'scheduler'

// Imports dynamiques : la logique pure ci-dessus reste importable et
// testable sans IndexedDB ni chargement des chunks React du manifest.
async function loadStorage() {
  return import('@/engine/storage')
}

async function loadManifest() {
  return import('@/games.manifest')
}

/** Parcours du jour du profil actif (maîtrise + manifest + période courante). */
export async function getDailyPath(): Promise<DailyPick[]> {
  const [{ pget }, { V2_GAMES }] = await Promise.all([loadStorage(), loadManifest()])
  const [summary, state] = await Promise.all([getSummary(), pget<SchedulerState>(STORAGE_KEY)])
  return buildDailyPath({
    summary,
    skills: SKILL_MAP,
    games: V2_GAMES,
    now: Date.now(),
    period: currentPeriod(),
    state,
  })
}

/** Mémorise le jeu servi pour une étape du parcours (rotation future). */
export async function markServed(pick: DailyPick): Promise<void> {
  const { pget, pset } = await loadStorage()
  const state = (await pget<SchedulerState>(STORAGE_KEY)) ?? { lastServed: {} }
  state.lastServed[pick.skillId] = { gameId: pick.gameId, ts: Date.now() }
  await pset(STORAGE_KEY, state)
}
