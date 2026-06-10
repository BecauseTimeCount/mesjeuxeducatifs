import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { artUrl, decorFor } from '@/content/art.manifest'
import { unlockAudio } from '@/engine/audio'
import { gget, pget } from '@/engine/storage'
import { GAMES, ISLANDS } from '@/games.manifest'
import { Mascot, SpeakerButton } from '@/ui'
import DailyPath from '@/world/DailyPath'
import GameCard from '@/world/GameCard'
import ProfileSwitcher from '@/world/ProfileSwitcher'
import type { CorpusEntry, GameMeta, IslandDef, IslandId } from '@/engine/types'

const BIENVENUE: CorpusEntry = {
  id: 'ui.bienvenue',
  text: 'Bienvenue dans l’archipel ! Choisis une île et un jeu.',
  voice: 'eloise',
}

/** Jeux groupés par île, v2 d'abord — calculé une fois au chargement du module. */
const GAMES_BY_ISLAND: ReadonlyMap<IslandId, GameMeta[]> = new Map(
  ISLANDS.map((island) => {
    const games = GAMES.filter((g) => g.island === island.id)
    return [
      island.id,
      [...games.filter((g) => g.status === 'v2'), ...games.filter((g) => g.status === 'classique')],
    ]
  }),
)

function IslandSection({
  island,
  artV3,
  awake,
}: {
  island: IslandDef
  artV3: boolean
  /** L'île « s'éveille » (décor en couleurs) dès qu'une partie y a été jouée. */
  awake: boolean
}) {
  const games = GAMES_BY_ISLAND.get(island.id) ?? []
  if (games.length === 0) return null

  // Décor illustré (chantier V3) derrière le flag visuel — voile crème pour la lisibilité.
  const decor = artV3 ? decorFor(island.id) : undefined

  return (
    <section aria-label={island.name}>
      <div className="relative overflow-hidden rounded-3xl">
        <div
          aria-hidden
          className="absolute inset-0"
          style={
            decor
              ? {
                  backgroundImage: `linear-gradient(120deg, rgba(253, 246, 236, 0.88), rgba(253, 246, 236, 0.45)), url(${artUrl(decor)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center 65%',
                  filter: awake ? undefined : 'grayscale(0.75) brightness(1.04)',
                  transition: 'filter 1.2s ease-out',
                }
              : {
                  backgroundImage: `linear-gradient(120deg, ${island.accent}2e, ${island.accent}10)`,
                }
          }
        />
        <div className="relative flex items-center gap-4 px-4 py-3 sm:px-5">
          <span aria-hidden className="text-5xl sm:text-6xl">
            {island.emoji}
          </span>
          <div>
            <h2 className="text-xl font-extrabold sm:text-2xl">{island.name}</h2>
            <p className="text-sm font-semibold text-ink-soft sm:text-base">{island.tagline}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {games.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>
    </section>
  )
}

export default function Hub() {
  const [artV3, setArtV3] = useState(false)
  const [awake, setAwake] = useState<ReadonlySet<IslandId>>(new Set())

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    void gget<boolean>('artV3').then((v) => setArtV3(v ?? false))
    return () => window.removeEventListener('pointerdown', unlockAudio)
  }, [])

  // Une île s'éveille dès qu'une partie y a été jouée (sauvegarde par jeu).
  useEffect(() => {
    if (!artV3) return
    let cancelled = false
    void Promise.all(
      ISLANDS.map(async (island) => {
        const games = (GAMES_BY_ISLAND.get(island.id) ?? []).filter((g) => g.status === 'v2')
        const saves = await Promise.all(games.map((g) => pget<{ runs?: number }>(`game:${g.id}`)))
        return saves.some((s) => (s?.runs ?? 0) > 0) ? island.id : null
      }),
    ).then((ids) => {
      if (!cancelled) setAwake(new Set(ids.filter((id): id is IslandId => id !== null)))
    })
    return () => {
      cancelled = true
    }
  }, [artV3])

  return (
    <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6">
      {artV3 && <div aria-hidden className="archipel-sea fixed inset-0 -z-10" />}
      <Link
        to="/parents"
        className="absolute right-3 top-2 rounded-lg p-2 text-xs font-semibold text-ink-soft underline-offset-2 hover:underline"
      >
        ⚙️ Parents
      </Link>

      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Mascot mood="idle" size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold leading-tight sm:text-4xl">Mes Jeux Éducatifs</h1>
          <p className="mt-0.5 text-sm text-ink-soft sm:text-base">
            Bienvenue dans l’archipel&nbsp;! Choisis une île et un jeu.
          </p>
        </div>
        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
          <SpeakerButton entry={BIENVENUE} size="lg" />
          <ProfileSwitcher />
        </div>
      </header>

      <main className="mt-6 space-y-8">
        <DailyPath />
        {ISLANDS.map((island) => (
          <IslandSection
            key={island.id}
            island={island}
            artV3={artV3}
            awake={awake.has(island.id)}
          />
        ))}
      </main>

      <footer className="mt-12 space-y-2 pb-4 text-center text-sm text-ink-soft">
        <p>100&nbsp;% gratuit · zéro pub · zéro compte · vos données restent sur la tablette</p>
        <Link to="/parents" className="inline-block p-2 font-semibold underline underline-offset-2">
          Espace parents
        </Link>
      </footer>
    </div>
  )
}
