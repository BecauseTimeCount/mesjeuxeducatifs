import { say } from '@/engine/audio'
import { numberEntry } from '@/content/numbers'
import { BigButton, NumPad } from '@/ui'
import { bellyTotal, targetOf } from '../logic'
import { E, useFtg } from '../store'

const ACCENT = '#ff8a3d'

/** Ticket de commande : ce que veut le client, ce qu'il a déjà — nombres en DOM, jamais dans le canvas. */
function Ticket() {
  const order = useFtg((s) => s.order)
  const hint = useFtg((s) => s.hint)
  const replay = useFtg((s) => s.replayInstruction)
  if (!order) return null
  const q = order.question
  let line1 = ''
  let line2 = ''
  switch (q.type) {
    case 'complement':
      line1 = order.factor === 2 ? `Les jumeaux veulent ${q.target}` : `Il veut ${q.target}`
      line2 = q.given > 0 ? `Il a déjà ${q.given}` : ''
      break
    case 'exact':
      line1 = `Il veut ${q.target}`
      break
    case 'times':
      line1 = `Il veut ${q.n} paquets de ${q.k}`
      break
    case 'howmany':
      line1 = `Il veut ${q.total}, en paquets de ${q.k}`
      line2 = 'Combien de paquets ?'
      break
    case 'double':
      line1 = `Il veut le double de ${q.n}`
      break
    case 'half':
      line1 = `Il veut la moitié de ${q.n}`
      break
  }
  return (
    <div className="pointer-events-auto card flex items-center gap-3 px-4 py-2" data-testid="ftg-ticket">
      <button
        type="button"
        onClick={() => replay()}
        aria-label="Écouter la commande"
        className="tap-target flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-2xl shadow-card active:scale-95"
      >
        <span aria-hidden>🔊</span>
      </button>
      <div className="flex flex-col leading-tight">
        <span className="text-xl font-extrabold text-ink sm:text-2xl">{line1}</span>
        {line2 && <span className="text-base font-bold text-ink-soft sm:text-lg">{line2}</span>}
        {hint && order.input === 'numpad' && (
          <span className="animate-pulse-glow text-2xl font-extrabold" style={{ color: ACCENT }} data-testid="ftg-hint">
            → {order.answer}
          </span>
        )}
      </div>
    </div>
  )
}

/** Jauge du ventre (mode tap) : déjà mangé + plateau, sur la cible. */
function BellyGauge() {
  const order = useFtg((s) => s.order)
  const selected = useFtg((s) => s.selected)
  if (!order || order.input !== 'tap') return null
  const total = bellyTotal(order, selected)
  const target = targetOf(order)
  const given = order.question.type === 'complement' ? order.question.given : 0
  const ratio = Math.min(1, total / target)
  const over = total > target
  return (
    <div className="flex w-full max-w-md flex-col gap-1" aria-live="polite">
      <div className="flex items-baseline justify-between text-lg font-extrabold text-ink">
        <span>
          {given > 0 ? `${given} + ` : ''}
          {order.factor === 2 ? '2 × ' : ''}
          {order.factor === 2 ? `${(total - given) / 2}` : `${total - given}`}
        </span>
        <span className={over ? 'text-coral' : ''}>
          {total} / {target}
        </span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-white/80 ring-1 ring-ink/10">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${ratio * 100}%`, background: over ? '#ff7866' : ACCENT }}
        />
      </div>
    </div>
  )
}

/**
 * Calque HUD au-dessus du canvas : pointer-events none, auto sur les contrôles.
 * Haut : ticket. Bas : jauge + « Servir ! » (tap) ou pavé numérique (numpad). Texte du feedback.
 */
export function HudLayer() {
  const order = useFtg((s) => s.order)
  const phase = useFtg((s) => s.phase)
  const selected = useFtg((s) => s.selected)
  const typed = useFtg((s) => s.typed)
  const explainText = useFtg((s) => s.explainText)
  const setTyped = useFtg((s) => s.setTyped)
  const serve = useFtg((s) => s.serve)
  if (!order) return null
  const canServe = phase === 'idle' && (order.input === 'tap' ? selected.length > 0 : typed.length > 0)

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
      <div className="flex justify-start">
        <Ticket />
      </div>

      <div className="flex min-h-8 justify-center">
        {explainText && (
          <p
            className="pointer-events-none rounded-full bg-white/90 px-5 py-2 text-xl font-extrabold text-ink shadow-card"
            aria-live="polite"
            data-testid="ftg-explain"
          >
            {explainText}
          </p>
        )}
      </div>

      <div className="pointer-events-auto flex flex-col items-center gap-3">
        {order.input === 'tap' ? (
          <>
            <BellyGauge />
            <BigButton
              variant="accent"
              accent={ACCENT}
              className="w-full max-w-xs text-2xl"
              disabled={!canServe}
              onClick={() => {
                void say(E('ftg.servir'), { interrupt: true })
                serve()
              }}
            >
              Servir ! 🍢
            </BigButton>
          </>
        ) : (
          /* pavé compact, à droite en paysage pour laisser le plateau et les caisses visibles */
          <div className="w-full max-w-[300px] self-center rounded-card bg-white/85 p-2 shadow-card sm:self-end" data-testid="ftg-numpad">
            <NumPad value={typed} onChange={setTyped} onValidate={serve} maxLen={5} />
          </div>
        )}
        {import.meta.env.DEV && (
          <button
            type="button"
            data-testid="ftg-solve"
            onClick={() => useFtg.getState().applySolution()}
            className="pointer-events-auto rounded-full bg-ink/70 px-3 py-1 text-xs font-bold text-white"
          >
            DEV · solution
          </button>
        )}
      </div>
      {/* précharge des clips nombres de cette commande */}
      {order.prompt.map((p) => ('number' in p ? <span key={p.number} hidden>{numberEntry(p.number).text}</span> : null))}
    </div>
  )
}
