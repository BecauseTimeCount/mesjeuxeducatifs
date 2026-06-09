import { Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { useProfiles } from '@/engine/profiles'
import GamePage from '@/world/GamePage'
import Hub from '@/world/Hub'
import ParentsPage from '@/world/ParentsPage'
import ProfileSetup from '@/world/ProfileSetup'

function LoadingMascot() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="animate-floaty text-6xl" role="status" aria-label="Chargement">
        🦜
      </div>
    </div>
  )
}

export default function App() {
  const ready = useProfiles((s) => s.ready)
  const hasProfile = useProfiles((s) => s.profiles.length > 0)
  const init = useProfiles((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) return <LoadingMascot />

  return (
    <HashRouter>
      <Suspense fallback={<LoadingMascot />}>
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/jeu/:gameId" element={<GamePage />} />
          <Route path="/parents" element={<ParentsPage />} />
          <Route path="*" element={<Hub />} />
        </Routes>
      </Suspense>
      {!hasProfile && <ProfileSetup />}
    </HashRouter>
  )
}
