import { useState } from 'react'
import { sfx } from '@/engine/audio'
import { useProfiles } from '@/engine/profiles'
import ProfileSetup from '@/world/ProfileSetup'

export default function ProfileSwitcher() {
  const profiles = useProfiles((s) => s.profiles)
  const activeId = useProfiles((s) => s.activeId)
  const select = useProfiles((s) => s.select)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const active = profiles.find((p) => p.id === activeId) ?? null

  function handleSelect(id: string) {
    sfx('pop')
    void select(id)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          sfx('tap')
          setOpen(true)
        }}
        aria-label="Changer de joueur"
        className="tap-target card flex items-center gap-2 px-4 transition-transform active:scale-95"
      >
        <span aria-hidden className="text-3xl">
          {active?.emoji ?? '👤'}
        </span>
        <span className="max-w-28 truncate text-lg font-extrabold">{active?.name ?? 'Joueur'}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choisir un joueur"
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="card w-full max-w-sm animate-pop p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-center text-xl font-extrabold">Qui joue&nbsp;?</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(p.id)}
                    className={`tap-target flex w-full items-center gap-3 rounded-2xl px-4 py-2 text-left transition-transform active:scale-[0.98] ${
                      p.id === activeId ? 'bg-lagoon-100' : 'bg-paper'
                    }`}
                  >
                    <span aria-hidden className="text-3xl">
                      {p.emoji}
                    </span>
                    <span className="flex-1 truncate text-lg font-bold">{p.name}</span>
                    {p.id === activeId && (
                      <span aria-label="Joueur actuel" className="text-xl font-extrabold text-leaf-deep">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                sfx('tap')
                setCreating(true)
              }}
              className="tap-target mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-lagoon-500 px-4 py-2 text-lg font-extrabold text-lagoon-700 transition-transform active:scale-[0.98]"
            >
              + Nouveau profil
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tap-target mt-2 w-full rounded-2xl px-4 py-2 text-base font-semibold text-ink-soft"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {creating && (
        <ProfileSetup
          onDone={() => {
            setCreating(false)
            setOpen(false)
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  )
}
