import { Suspense, useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { gget } from '@/engine/storage'
import { GAMES_BY_ID, V2_COMPONENTS } from '@/games.manifest'
import { PlumeSvg } from '@/ui'

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const meta = gameId ? GAMES_BY_ID.get(gameId) : undefined
  const Game = meta && meta.status === 'v2' ? V2_COMPONENTS[meta.id] : undefined

  // Vol de Plume à l'arrivée sur un jeu (chantier V3, flag artV3).
  const [flight, setFlight] = useState(false)
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    void gget<boolean>('artV3').then((v) => {
      if (cancelled || !v) return
      setFlight(true)
      timer = window.setTimeout(() => setFlight(false), 1200)
    })
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [gameId])

  if (!Game) return <Navigate to="/" replace />

  return (
    <>
      {flight && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          <div className="animate-plume-flight absolute left-0 top-0 flex h-24 w-24 items-center justify-center">
            <PlumeSvg mood="cheer" />
          </div>
        </div>
      )}
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center">
            <div className="animate-floaty h-24 w-24" role="status" aria-label="Chargement">
              <PlumeSvg mood="idle" />
            </div>
          </div>
        }
      >
        <Game />
      </Suspense>
    </>
  )
}
