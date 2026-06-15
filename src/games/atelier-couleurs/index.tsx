import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pget, pset } from '@/engine/storage'
import type { CorpusEntry, GameMeta, LevelResult } from '@/engine/types'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  BigButton,
  FeedbackOverlay,
  GameShell,
  LevelEnd,
  Mascot,
  ProgressDots,
  SpeakerButton,
} from '@/ui'
import corpus from './corpus.json'
import {
  applyRun,
  FRESH_PROGRESS,
  generateItem,
  hexOf,
  isSourceOf,
  isWrongPour,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  mixResult,
  nameOf,
  starsFor,
  success,
  TIER_SKILLS,
} from './logic'
import type { ColItem, ColProgress, TierId } from './logic'

// ============================================================
// L'Atelier des Couleurs — « le pot magique ». L'enfant verse des
// peintures (sources) dans un grand pot central qui se teinte du
// VRAI mélange courant. Quand le mélange == la cible, le peintre
// signe sa toile. Un versement qui éloigne de la cible ENSEIGNE
// (rendu + feedback élaboratif). Zéro QCM : l'enfant PRODUIT la
// couleur. « Arts plastiques : couleurs primaires, mélanges, nuances. »
// ============================================================

const STORE_KEY = 'game:atelier-couleurs'

const META: GameMeta = GAMES_BY_ID.get('atelier-couleurs') ?? {
  id: 'atelier-couleurs',
  title: 'L’Atelier des Couleurs',
  tagline: 'Mélange les peintures et trouve la bonne couleur !',
  icon: '🎨',
  island: 'ailleurs',
  accent: '#d81b60',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🔴', name: 'Les primaires', sub: 'Rouge, bleu, jaune' },
  { emoji: '🟣', name: 'Les mélanges', sub: 'Deux peintures' },
  { emoji: '🎨', name: 'Obtenir', sub: 'Trouve la recette' },
  { emoji: '🟤', name: 'Les malines', sub: 'Rose, gris, marron' },
]

// ---------- Corpus local typé ----------

function toVoice(v: string): CorpusEntry['voice'] {
  return v === 'denise' || v === 'eloise' || v === 'henri' ? v : undefined
}

const ENTRIES: ReadonlyMap<string, CorpusEntry> = new Map(
  corpus.entries.map((e): [string, CorpusEntry] => [
    e.id,
    { id: e.id, text: e.text, voice: toVoice(e.voice) },
  ]),
)

function E(id: string): CorpusEntry {
  return ENTRIES.get(id) ?? { id, text: '' }
}

// ---------- Helpers d'affichage ----------

function isMelangeTier(tier: TierId): boolean {
  return tier >= 1
}

function instructionText(it: ColItem): string {
  return `Le peintre veut du ${nameOf(it.targetId)} !`
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function AtelierCouleurs() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<ColProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<ColItem | null>(null)
  const [poured, setPoured] = useState<string[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [mood, setMood] = useState<'idle' | 'happy' | 'shake'>('idle')
  const [animKey, setAnimKey] = useState(0)
  const [hint, setHint] = useState(false)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<ColProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: ColItem): Promise<void> => {
    const seq = ++seqRef.current
    await say(E('col.veut'))
    if (seqRef.current !== seq) return
    await say(E(`col.c.${it.targetId}`), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(E(isMelangeTier(it.tier) ? 'col.consigne.melange' : 'col.consigne.verse'), {
      interrupt: false,
    })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item) void speakConsigne(item)
    else void say(E('col.intro'))
  }, [screen, item, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setPoured([])
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setMood('idle')
    setHint(false)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakConsigne(first)
  }

  /** Résolution réussie d'un item : maîtrise + Tuner, UNE seule fois. */
  const resolveSuccess = (it: ColItem): void => {
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setMood('happy')
    setAnimKey((k) => k + 1)
    sfx('magic')
    void say(E('col.bravo'))
    window.setTimeout(() => setOverlay('success'), 700)
  }

  /** Un essai raté : firstTry tombe, le compteur d'erreurs monte, on vide le pot. */
  const registerFail = (it: ColItem): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setMood('shake')
    setAnimKey((k) => k + 1)
    sfx('wrong')
    setOverlay('retry')
    void say(E(`col.wrong.${it.targetId}`))
  }

  // ---------- Verser une peinture ----------

  const onTapPaint = (sourceId: string): void => {
    if (!item || phase !== 'idle') return

    // Versement qui éloigne de la cible : l'erreur enseigne, le pot se vide.
    if (isWrongPour(item.recipe, [...poured, sourceId])) {
      registerFail(item)
      return
    }

    sfx('pop')
    const next = [...poured, sourceId]
    setPoured(next)
    setMood('happy')
    setAnimKey((k) => k + 1)
    if (success(item.recipe, next)) resolveSuccess(item)
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on explique le mélange visé, puis indice si besoin. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    setMood('idle')
    setPoured([]) // on vide le pot : on repart d'une toile propre
    if (isMelangeTier(item.tier)) {
      await say(E(`col.mix.${item.targetId}`))
    } else {
      await say(E('col.encore'))
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      await say(E(isMelangeTier(item.tier) ? 'col.indice.melange' : 'col.indice.verse'), {
        interrupt: false,
      })
    }
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun(item.tier)
      return
    }
    const next = generateItem(item.tier, tunerRef.current.level, item.targetId)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setMood('idle')
    setPhase('idle')
    setPoured([])
    setItem(next)
    void speakConsigne(next)
  }

  const finishRun = (t: TierId): void => {
    const stars = starsFor(firstTryCorrect, ITEMS_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: ITEMS_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, t, stars)
    const unlockedNow = updated.unlockedTier > base.unlockedTier
    if (unlockedNow) sfx('levelup')
    setNewUnlock(unlockedNow)
    setProgress(updated)
    void pset(STORE_KEY, updated)
    setScreen('end')
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') advance()
    else if (kind === 'retry') void runTeaching()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🎨
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('col.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🔴🟡🔵
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Verse les bonnes peintures pour obtenir la couleur !
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          {TIER_INFO.map((info, i) => {
            const t = i as TierId
            const locked = t > progress.unlockedTier
            const stars = progress.bestStars[t] ?? 0
            const active = tier === t && !locked
            return (
              <button
                key={info.name}
                type="button"
                aria-pressed={active}
                aria-label={locked ? `${info.name} (verrouillé)` : info.name}
                onClick={() => {
                  if (locked) {
                    sfx('slide')
                    return
                  }
                  sfx('tap')
                  setTier(t)
                  void say(E(`col.niveau.${t}`))
                }}
                className={`tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95 ${locked ? 'opacity-50' : ''}`}
                style={active ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl">
                  {locked ? '🔒' : info.emoji}
                </span>
                <span className="text-base leading-tight font-extrabold text-ink">{info.name}</span>
                <span className="text-xs font-semibold text-ink-soft">{info.sub}</span>
                <span
                  className="text-sm"
                  aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur 3`}
                >
                  {'⭐'.repeat(stars)}
                  <span className="opacity-30">{'☆'.repeat(3 - stars)}</span>
                </span>
              </button>
            )
          })}
        </div>
        <BigButton
          variant="accent"
          accent={ACCENT}
          className="w-full max-w-xs text-2xl"
          onClick={() => startRun(tier)}
        >
          Jouer !
        </BigButton>
      </div>
    )
  }

  /** Le grand pot central, teinté du mélange courant. */
  const renderPot = (it: ColItem): ReactNode => {
    const current = mixResult(poured)
    const fill = current === 'inconnu' ? 'transparent' : hexOf(current)
    const anim =
      mood === 'happy' ? 'animate-pop' : mood === 'shake' ? 'animate-wiggle' : 'animate-floaty'
    return (
      <div className="flex flex-col items-center gap-2">
        {/* pastille-modèle de la couleur cible */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink-soft">À obtenir :</span>
          <span
            className="inline-block h-8 w-8 rounded-full border-2 border-ink/20"
            style={{ backgroundColor: hexOf(it.targetId) }}
            role="img"
            aria-label={`Couleur à obtenir : ${nameOf(it.targetId)}`}
          />
          <span className="text-base font-extrabold text-ink">{nameOf(it.targetId)}</span>
        </div>
        {/* le pot */}
        <div
          key={animKey}
          className={`relative flex h-32 w-28 items-end justify-center overflow-hidden rounded-b-3xl rounded-t-lg border-4 border-ink/25 bg-white/70 ${anim} sm:h-36 sm:w-32`}
          role="img"
          aria-label={
            current === 'inconnu'
              ? 'Pot vide'
              : `Le pot contient du ${nameOf(current)}`
          }
        >
          <div
            className="w-full transition-all duration-300"
            style={{
              height: poured.length === 0 ? '0%' : `${Math.min(100, 35 + poured.length * 28)}%`,
              backgroundColor: fill,
            }}
          />
          <span className="absolute top-1 text-2xl" aria-hidden="true">
            🪣
          </span>
        </div>
        {/* gouttes déjà versées */}
        {poured.length > 0 && (
          <div className="flex min-h-8 flex-wrap items-center justify-center gap-1">
            {poured.map((id, idx) => (
              <span
                key={`${id}-${idx}`}
                className="animate-pop inline-block h-5 w-5 rounded-full border border-ink/20"
                style={{ backgroundColor: hexOf(id) }}
                aria-hidden="true"
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  /** La rangée des pots de peinture (sources). */
  const renderPalette = (it: ColItem): ReactNode => (
    <div
      className={`grid w-full max-w-md gap-2.5 ${it.palette.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}
    >
      {it.palette.map((id) => {
        const needed = it.recipe.includes(id)
        const glow = hint && needed && isSourceOf(it.recipe, poured, id)
        return (
          <button
            key={id}
            type="button"
            disabled={phase !== 'idle'}
            onClick={() => onTapPaint(id)}
            aria-label={`Peinture ${nameOf(id)}`}
            className={`tap-target card flex flex-col items-center justify-center gap-1 py-3 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''}`}
          >
            <span
              className="inline-block h-10 w-10 rounded-full border-2 border-ink/20"
              style={{ backgroundColor: hexOf(id) }}
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-ink-soft">{nameOf(id)}</span>
          </button>
        )
      })}
    </div>
  )

  const renderPlay = (it: ColItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 px-3 pb-6">
      <p className="text-center text-lg font-extrabold text-ink">{instructionText(it)}</p>
      {renderPot(it)}
      {renderPalette(it)}
    </div>
  )

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && renderPlay(item)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouvel atelier débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
