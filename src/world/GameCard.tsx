import { Link } from 'react-router-dom'
import { sfx } from '@/engine/audio'
import type { GameMeta } from '@/engine/types'

interface GameCardProps {
  game: GameMeta
}

const CARD_CLASS =
  'card group relative tap-target flex flex-col items-center gap-1 border-2 px-3 pb-4 pt-6 text-center transition-transform duration-150 hover:scale-[1.03] active:scale-95'

function CardContent({ game }: GameCardProps) {
  return (
    <>
      {game.status === 'v2' ? (
        <span className="absolute -top-2.5 right-3 rounded-full bg-sun px-2.5 py-0.5 text-xs font-extrabold text-ink shadow-sm">
          Nouveau&nbsp;!
        </span>
      ) : (
        <span className="absolute -top-2.5 right-3 rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft">
          classique
        </span>
      )}
      <span
        aria-hidden
        className="text-5xl transition-transform duration-150 group-hover:-translate-y-1 sm:text-6xl"
      >
        {game.icon}
      </span>
      <span className="text-base font-extrabold leading-tight sm:text-lg">{game.title}</span>
      <span className="text-xs leading-snug text-ink-soft sm:text-sm">{game.tagline}</span>
    </>
  )
}

export default function GameCard({ game }: GameCardProps) {
  const style = { borderColor: game.accent }

  if (game.status === 'v2') {
    return (
      <Link to={`/jeu/${game.id}`} className={CARD_CLASS} style={style} onClick={() => sfx('tap')}>
        <CardContent game={game} />
      </Link>
    )
  }

  return (
    <a
      href={import.meta.env.BASE_URL + (game.href ?? '')}
      className={CARD_CLASS}
      style={style}
      onClick={() => sfx('tap')}
    >
      <CardContent game={game} />
    </a>
  )
}
