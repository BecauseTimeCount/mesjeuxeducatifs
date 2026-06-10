import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sfx } from '@/engine/audio'
import { useProfiles } from '@/engine/profiles'
import { getDailyPath, markServed } from '@/engine/scheduler'
import type { DailyPick, PickKind } from '@/engine/scheduler'
import { GAMES_BY_ID } from '@/games.manifest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { Mascot, SpeakerButton, uiEntry } from '@/ui'

// ============================================================
// « Le parcours du jour » — 1 à 3 suggestions du scheduler sur
// le hub. C'est une invitation, jamais une contrainte : le reste
// de l'archipel reste entièrement libre.
// ============================================================

const KIND_BADGES: Record<PickKind, string> = {
  nouvelle: '✨ Découverte',
  fragile: '💪 Entraînement',
  revision: '🔁 On révise !',
}

function PickCard({ pick }: { pick: DailyPick }) {
  const game = GAMES_BY_ID.get(pick.gameId)
  if (!game) return null
  const skill = SKILLS_BY_ID.get(pick.skillId)

  return (
    <Link
      to={`/jeu/${game.id}`}
      onClick={() => {
        sfx('tap')
        markServed(pick).catch(() => undefined) // trace de rotation perdue : sans gravité
      }}
      className="tap-target group relative flex flex-1 items-center gap-3 rounded-2xl border-2 bg-white px-3 pb-3 pt-5 transition-transform duration-150 hover:scale-[1.02] active:scale-95"
      style={{ borderColor: game.accent }}
    >
      <span className="absolute -top-2.5 left-3 whitespace-nowrap rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-extrabold text-ink shadow-sm">
        {KIND_BADGES[pick.kind]}
      </span>
      <span
        aria-hidden
        className="text-4xl transition-transform duration-150 group-hover:-translate-y-1"
      >
        {game.icon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-extrabold leading-tight">{game.title}</span>
        {skill && (
          <span className="block text-xs leading-snug text-ink-soft">{skill.label}</span>
        )}
      </span>
    </Link>
  )
}

export default function DailyPath() {
  const activeId = useProfiles((s) => s.activeId)
  const [picks, setPicks] = useState<DailyPick[]>([])

  useEffect(() => {
    let cancelled = false
    setPicks([])
    getDailyPath()
      .then((p) => {
        if (!cancelled) setPicks(p)
      })
      .catch(() => undefined) // storage indisponible : pas de parcours, pas d'erreur
    return () => {
      cancelled = true
    }
  }, [activeId])

  if (picks.length === 0) return null

  return (
    <section
      aria-label="Le parcours du jour"
      className="card p-4 sm:p-5"
      style={{ backgroundImage: 'linear-gradient(120deg, #ffc94d2e, #ffffff00 65%)' }}
    >
      <div className="flex items-center gap-3">
        <Mascot mood="cheer" size={48} />
        <h2 className="min-w-0 flex-1 text-lg font-extrabold sm:text-xl">Le parcours du jour</h2>
        <SpeakerButton entry={uiEntry('ui.parcours')} />
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {picks.map((pick) => (
          <PickCard key={pick.skillId} pick={pick} />
        ))}
      </div>
    </section>
  )
}
