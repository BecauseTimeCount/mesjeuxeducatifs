import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { say, sfx, unlockAudio } from '@/engine/audio'
import { markBreakSuggested, shouldSuggestBreak, touchSession } from '@/engine/session'
import type { GameMeta } from '@/engine/types'
import { BreakRitual } from '@/ui/BreakRitual'
import { uiEntry } from '@/ui/corpus'

export interface GameShellProps {
  meta: GameMeta
  /** Slot libre à droite de la barre (étoiles, score, ProgressDots…) */
  hud?: ReactNode
  /** Si fourni : bouton 🔊🔁 « réécouter la consigne » dans la barre */
  onReplayInstruction?: () => void
  children: ReactNode
}

const BREAK_CHECK_MS = 60_000

/**
 * Chrome standard de TOUT jeu v2 : barre haute compacte (retour #/,
 * icône + titre, hud, réécoute), déblocage audio au premier pointerdown,
 * touchSession() au montage, et rituel de pause au-delà de ~15 min.
 */
export function GameShell({ meta, hud, onReplayInstruction, children }: GameShellProps) {
  const [breakOpen, setBreakOpen] = useState(false)

  useEffect(() => {
    touchSession()
    const unlock = (): void => unlockAudio()
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => document.removeEventListener('pointerdown', unlock)
  }, [])

  useEffect(() => {
    const check = (): void => {
      if (shouldSuggestBreak()) {
        markBreakSuggested()
        setBreakOpen(true)
        void say(uiEntry('ui.fin-session'))
      }
    }
    check()
    const id = window.setInterval(check, BREAK_CHECK_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="game-surface flex min-h-dvh flex-col">
      <header className="flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-3">
        <a
          href="#/"
          onClick={() => sfx('tap')}
          aria-label="Retour à mes jeux"
          className="tap-target flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-base font-extrabold text-ink shadow-card transition-transform active:scale-95"
        >
          <span aria-hidden="true" className="text-2xl">⬅️</span>
          <span>Mes jeux</span>
        </a>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl sm:h-11 sm:w-11 sm:text-2xl"
            style={{ background: `${meta.accent}22` }}
          >
            {meta.icon}
          </span>
          <h1 className="truncate text-lg font-extrabold text-ink sm:text-xl">{meta.title}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hud}
          {onReplayInstruction && (
            <button
              type="button"
              onClick={() => {
                sfx('tap')
                onReplayInstruction()
              }}
              aria-label="Réécouter la consigne"
              className="tap-target relative flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl shadow-card transition-transform active:scale-95"
            >
              <span aria-hidden="true">🔊</span>
              <span aria-hidden="true" className="absolute -top-1 -right-1 text-sm">🔁</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>

      <BreakRitual
        open={breakOpen}
        onContinue={() => setBreakOpen(false)}
        onLeave={() => {
          window.location.hash = '#/'
        }}
      />
    </div>
  )
}
