import { BigButton } from '@/ui/BigButton'
import { Mascot } from '@/ui/Mascot'

export interface BreakRitualProps {
  open: boolean
  onContinue: () => void
  onLeave: () => void
}

/**
 * Rituel de pause — overlay doux affiché par GameShell quand l'enfant
 * joue depuis trop longtemps. Jamais culpabilisant, jamais bloquant.
 */
export function BreakRitual({ open, onContinue, onLeave }: BreakRitualProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="On fait une pause ?"
    >
      <div className="card animate-bounce-in flex w-full max-w-md flex-col items-center gap-5 p-8 text-center">
        <Mascot mood="happy" size={110} />
        <h2 className="text-2xl font-extrabold text-ink">On fait une pause ?</h2>
        <p className="text-lg font-semibold text-ink-soft">
          Quelle aventure, tu as super bien joué ! Tes yeux ont besoin de se reposer.
          L’archipel t’attendra. 🌴
        </p>
        <div className="flex w-full flex-col gap-3">
          <BigButton variant="primary" onClick={onLeave}>
            À bientôt ! 👋
          </BigButton>
          <BigButton variant="soft" onClick={onContinue}>
            Encore un peu
          </BigButton>
        </div>
      </div>
    </div>
  )
}
