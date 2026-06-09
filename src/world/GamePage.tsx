import { Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { GAMES_BY_ID, V2_COMPONENTS } from '@/games.manifest'

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const meta = gameId ? GAMES_BY_ID.get(gameId) : undefined
  const Game = meta && meta.status === 'v2' ? V2_COMPONENTS[meta.id] : undefined

  if (!Game) return <Navigate to="/" replace />

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="animate-floaty text-6xl" role="status" aria-label="Chargement">
            🦜
          </div>
        </div>
      }
    >
      <Game />
    </Suspense>
  )
}
