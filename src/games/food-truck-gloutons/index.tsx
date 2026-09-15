import { Suspense, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArcadeErrorBoundary } from '@/arcade/ArcadeErrorBoundary'
import { GameCanvas } from '@/arcade/GameCanvas'
import { GAMES_BY_ID } from '@/games.manifest'
import type { GameMeta } from '@/engine/types'
import { FeedbackOverlay, GameShell, LevelEnd, ProgressDots } from '@/ui'
import { installDevHook } from './devHook'
import { HudLayer } from './hud/HudLayer'
import { MenuScreen } from './hud/MenuScreen'
import { itemsPerRun } from './logic'
import { TruckScene } from './scene/TruckScene'
import { GAME_ID, useFtg } from './store'

// ============================================================
// Le Food-Truck des Gloutons — piste arcade 3D (arcade-direction.md).
// Écrans : menu (plan de route, DOM) → play (Canvas R3F + HUD DOM) → end (LevelEnd).
// Le Canvas n'est monté qu'en jeu : GPU libéré entre les parties, état 3D remis à zéro.
// ============================================================

const META: GameMeta = GAMES_BY_ID.get(GAME_ID) ?? {
  id: GAME_ID,
  title: 'Le Food-Truck des Gloutons',
  tagline: 'Sers les gloutons à chaque arrêt du food-truck !',
  icon: '🚚',
  island: 'nombres',
  accent: '#ff8a3d',
  skills: [],
  status: 'v2',
  tag: 'arcade',
}

function PlayScreen() {
  const [attempt, setAttempt] = useState(0)
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden" data-testid="ftg-play">
      <ArcadeErrorBoundary key={attempt} onRetry={() => setAttempt((a) => a + 1)}>
        <GameCanvas>
          <Suspense fallback={null}>
            <TruckScene />
          </Suspense>
        </GameCanvas>
        <HudLayer />
      </ArcadeErrorBoundary>
    </div>
  )
}

export default function FoodTruckGloutons() {
  const navigate = useNavigate()
  const screen = useFtg((s) => s.screen)
  const resolved = useFtg((s) => s.resolved)
  const service = useFtg((s) => s.service)
  const overlay = useFtg((s) => s.overlay)
  const result = useFtg((s) => s.result)
  const newUnlock = useFtg((s) => s.newUnlock)
  const load = useFtg((s) => s.load)
  const startRun = useFtg((s) => s.startRun)
  const onOverlayDone = useFtg((s) => s.onOverlayDone)
  const replayInstruction = useFtg((s) => s.replayInstruction)

  useEffect(() => {
    void load()
    const cleanup = import.meta.env.DEV ? installDevHook() : undefined
    return () => {
      cleanup?.()
      useFtg.setState({ screen: 'menu', order: null, overlay: null })
    }
  }, [load])

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={itemsPerRun(service)} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      {screen === 'menu' && <MenuScreen />}
      {screen === 'play' && <PlayScreen />}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold" style={{ color: META.accent }}>
              🔓 Nouvel arrêt débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(service)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
