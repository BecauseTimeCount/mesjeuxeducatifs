import { useEffect, useState } from 'react'
import { GAMES_BY_ID } from '@/games.manifest'
import { say, preloadClips } from '@/engine/audio'
import { pget } from '@/engine/storage'
import type { CorpusEntry, GameMeta } from '@/engine/types'
import { GameShell, Mascot } from '@/ui'
import { ACTS, FRESH_PROGRESS, SERVICES, hasSticker, isUnlocked } from './logic'
import type { FtgProgress } from './logic'
import corpus from './corpus.json'

// ============================================================
// Le Food-Truck des Gloutons — piste arcade 3D (arcade-direction.md).
// Phase B : plan de route en DOM (actes, services, cadenas, étoiles).
// La scène 3D et les services jouables arrivent en phase C.
// ============================================================

const META: GameMeta = GAMES_BY_ID.get('food-truck-gloutons') ?? {
  id: 'food-truck-gloutons',
  title: 'Le Food-Truck des Gloutons',
  tagline: 'Sers les gloutons à chaque arrêt du food-truck !',
  icon: '🚚',
  island: 'nombres',
  accent: '#ff8a3d',
  skills: [],
  status: 'v2',
  tag: 'arcade',
}

const ENTRIES: Record<string, CorpusEntry> = Object.fromEntries(
  (corpus.entries as CorpusEntry[]).map((e) => [e.id, e]),
)
const E = (id: string): CorpusEntry => ENTRIES[id] ?? { id, text: id }

const STORAGE_KEY = 'game:food-truck-gloutons'

export default function FoodTruckGloutons() {
  const [progress, setProgress] = useState<FtgProgress>(FRESH_PROGRESS)

  useEffect(() => {
    let cancelled = false
    preloadClips(['ftg.intro', 'ftg.niveau.verrouille'])
    void pget<FtgProgress>(STORAGE_KEY).then((p) => {
      if (!cancelled && p) setProgress(p)
    })
    void say(E('ftg.intro'))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <GameShell meta={META} onReplayInstruction={() => void say(E('ftg.intro'), { interrupt: true })}>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-8">
        <div className="flex items-center gap-3">
          <Mascot mood="happy" size={72} />
          <p className="text-lg font-extrabold text-ink">Le tour de l’Archipel en food-truck — bientôt en 3D !</p>
        </div>
        {ACTS.map((act) => (
          <section key={act.id} className="card flex flex-col gap-2 p-4">
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-ink">
              <span aria-hidden>{act.emoji}</span>
              {act.name}
              {hasSticker(progress, act.id) && <span aria-label="sticker gagné">{act.sticker}</span>}
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SERVICES.filter((s) => s.act === act.id).map((s) => {
                const unlocked = isUnlocked(progress, s.id)
                const stars = progress.bestStars[s.id] ?? 0
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!unlocked}
                      onClick={() => void say(E(unlocked ? 'ftg.intro' : 'ftg.niveau.verrouille'), { interrupt: true })}
                      aria-label={`${s.name}${unlocked ? '' : ' (verrouillé)'}`}
                      className="tap-target flex w-full flex-col items-start rounded-2xl bg-white px-4 py-3 text-left shadow-card transition-transform active:scale-95 disabled:opacity-50"
                    >
                      <span className="font-extrabold text-ink">
                        {unlocked ? (s.boss ? '👑 ' : '') : '🔒 '}
                        {s.name}
                      </span>
                      <span className="text-sm text-ink-soft">{s.sub}</span>
                      <span aria-label={`${stars} étoile sur 3`} className="text-sm">
                        {'★'.repeat(stars)}
                        {'☆'.repeat(3 - stars)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </GameShell>
  )
}
