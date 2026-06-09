import { useState } from 'react'
import { sfx } from '@/engine/audio'
import { useProfiles } from '@/engine/profiles'
import { BigButton, Mascot, SpeakerButton } from '@/ui'
import type { CorpusEntry, Profile } from '@/engine/types'

const AVATARS = ['🦊', '🐱', '🐶', '🐰', '🐼', '🐨', '🦁', '🐸', '🐧', '🦉', '🐢', '🦄']

const AGE_BANDS: Profile['ageBand'][] = ['4-5', '6-7']

const GUIDE: CorpusEntry = {
  id: 'ui.profil.guide',
  text: 'Choisis ton animal préféré, écris ton prénom avec un adulte, puis appuie sur le grand bouton : c’est parti !',
  voice: 'eloise',
}

interface ProfileSetupProps {
  /** Appelé après création + sélection du profil (fermeture côté parent). */
  onDone?: () => void
  /** Si fourni, affiche un bouton fermer (absent au tout premier lancement). */
  onCancel?: () => void
}

export default function ProfileSetup({ onDone, onCancel }: ProfileSetupProps) {
  const create = useProfiles((s) => s.create)
  const select = useProfiles((s) => s.select)
  const [emoji, setEmoji] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [ageBand, setAgeBand] = useState<Profile['ageBand'] | null>(null)
  const [busy, setBusy] = useState(false)

  const canSubmit = emoji !== null && ageBand !== null && name.trim().length > 0 && !busy

  async function handleSubmit() {
    if (emoji === null || ageBand === null || name.trim().length === 0 || busy) return
    setBusy(true)
    try {
      const profile = await create(name.trim(), emoji, ageBand)
      await select(profile.id)
      sfx('fanfare')
      onDone?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-5 py-6">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer"
            className="tap-target self-end rounded-full text-2xl font-bold text-ink-soft transition-transform active:scale-90"
          >
            ✕
          </button>
        )}

        <header className="flex items-center gap-3">
          <Mascot mood="happy" size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold">Qui va jouer&nbsp;?</h1>
            <p className="text-sm text-ink-soft">Un adulte peut t’aider&nbsp;!</p>
          </div>
          <SpeakerButton entry={GUIDE} size="lg" />
        </header>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">1. Choisis ton animal</h2>
          <div className="grid grid-cols-4 gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={emoji === a}
                onClick={() => {
                  sfx('pop')
                  setEmoji(a)
                }}
                className={`tap-target card flex items-center justify-center py-2 text-4xl transition-transform active:scale-90 ${
                  emoji === a ? 'ring-4 ring-lagoon-500' : ''
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">2. Ton prénom</h2>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Écris ton prénom…"
            aria-label="Ton prénom"
            className="card tap-target w-full px-5 py-4 text-2xl font-bold outline-none focus:ring-4 focus:ring-lagoon-300"
          />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">3. Ton âge</h2>
          <div className="grid grid-cols-2 gap-3">
            {AGE_BANDS.map((band) => (
              <button
                key={band}
                type="button"
                aria-pressed={ageBand === band}
                onClick={() => {
                  sfx('pop')
                  setAgeBand(band)
                }}
                className={`tap-target card px-4 py-5 text-xl font-extrabold transition-transform active:scale-95 ${
                  ageBand === band ? 'ring-4 ring-lagoon-500' : ''
                }`}
              >
                {band} ans
              </button>
            ))}
          </div>
        </section>

        <BigButton
          onClick={() => void handleSubmit()}
          variant="accent"
          accent="#58c472"
          disabled={!canSubmit}
          className="mt-2"
        >
          C’est parti&nbsp;!
        </BigButton>
      </div>
    </div>
  )
}
