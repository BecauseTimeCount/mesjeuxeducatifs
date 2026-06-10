import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { unlockAudio } from '@/engine/audio'
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

function IslandSection({ island }: { island: IslandDef }) {
  const games = GAMES_BY_ISLAND.get(island.id) ?? []
  if (games.length === 0) return null

  return (
    <section aria-label={island.name}>
      <div
        className="flex items-center gap-4 rounded-3xl px-4 py-3 sm:px-5"
        style={{ backgroundImage: `linear-gradient(120deg, ${island.accent}2e, ${island.accent}10)` }}
      >
        <span aria-hidden className="text-5xl sm:text-6xl">
          {island.emoji}
        </span>
        <div>
          <h2 className="text-xl font-extrabold sm:text-2xl">{island.name}</h2>
          <p className="text-sm font-semibold text-ink-soft sm:text-base">{island.tagline}</p>
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
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    return () => window.removeEventListener('pointerdown', unlockAudio)
  }, [])

  return (
    <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6">
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
          <IslandSection key={island.id} island={island} />
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
