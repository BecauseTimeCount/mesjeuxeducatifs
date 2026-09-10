import { say } from '@/engine/audio'
import { Mascot } from '@/ui'
import { ACTS, hasSticker, isActUnlocked, isUnlocked, SERVICES } from '../logic'
import { E, useFtg } from '../store'

/** Plan de route (DOM) : 5 arrêts, services en cartes (cadenas, étoiles, boss), stickers gagnés. */
export function MenuScreen() {
  const progress = useFtg((s) => s.progress)
  const startRun = useFtg((s) => s.startRun)
  const stickers = ACTS.filter((a) => hasSticker(progress, a.id))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-8">
      <div className="card flex items-center gap-3 px-4 py-3">
        <Mascot mood="happy" size={72} />
        <div className="flex flex-col">
          <p className="text-lg font-extrabold text-ink">Le tour de l’Archipel en food-truck</p>
          <p className="text-sm text-ink-soft">
            Stickers sur le truck :{' '}
            {stickers.length > 0 ? stickers.map((a) => <span key={a.id}>{a.sticker} </span>) : 'aucun pour l’instant'}
          </p>
        </div>
      </div>
      {ACTS.map((act) => {
        const open = isActUnlocked(progress, act.id)
        return (
          <section key={act.id} className={`card flex flex-col gap-2 p-4 ${open ? '' : 'opacity-60'}`}>
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-ink">
              <span aria-hidden>{act.emoji}</span>
              {act.name}
              {hasSticker(progress, act.id) && <span aria-label="sticker gagné">{act.sticker}</span>}
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SERVICES.filter((s) => s.act === act.id).map((s) => {
                const unlocked = isUnlocked(progress, s.id)
                const stars = progress.bestStars[s.id] ?? 0
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      data-testid={`ftg-service-${s.id}`}
                      onClick={() => (unlocked ? startRun(s.id) : void say(E('ftg.niveau.verrouille'), { interrupt: true }))}
                      aria-label={`${s.name}${unlocked ? '' : ' (verrouillé)'}`}
                      aria-disabled={!unlocked}
                      className={`tap-target flex w-full flex-col items-start rounded-2xl bg-white px-4 py-3 text-left shadow-card transition-transform active:scale-95 ${unlocked ? '' : 'opacity-50'}`}
                    >
                      <span className="font-extrabold text-ink">
                        {unlocked ? (s.boss ? '👑 ' : '') : '🔒 '}
                        {s.name}
                      </span>
                      <span className="text-sm text-ink-soft">{s.sub}</span>
                      <span aria-label={`${stars} étoile sur 3`} className="text-sm text-sun">
                        {'★'.repeat(stars)}
                        <span className="text-ink-soft/40">{'☆'.repeat(3 - stars)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
