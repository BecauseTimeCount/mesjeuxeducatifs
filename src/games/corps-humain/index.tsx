import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx, stopSpeech } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pget, pset } from '@/engine/storage'
import type { CorpusEntry, GameMeta, LevelResult } from '@/engine/types'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  BigButton,
  ConfettiBurst,
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
  BODY_PARTS_BY_ID,
  FRESH_PROGRESS,
  generateItem,
  habitCorrect,
  HABITS_BY_ID,
  isTrapHabit,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  ORGANS_BY_ID,
  partCorrect,
  SENSES_BY_ID,
  senseCorrect,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { CorpsItem, CorpsProgress, TierId } from './logic'

// ============================================================
// Le Corps Humain — « écoute, trouve la bonne carte » sur 4 paliers.
// T0/T1 : montrer la bonne partie du corps (grille 4 puis 6 cartes).
// T2 : les cinq sens (« avec quoi voit-on ? » → taper le bon organe).
// T3 : l'hygiène (une situation lue → taper le bon geste parmi des
// pièges). À l'erreur, la carte touchée se NOMME et on explique.
// « Questionner le monde » : le corps, les sens, la santé. Zéro QCM
// pur : distracteurs intelligents de même catégorie, l'erreur coûte.
// ============================================================

const STORE_KEY = 'game:corps-humain'

const META: GameMeta = GAMES_BY_ID.get('corps-humain') ?? {
  id: 'corps-humain',
  title: 'Le Corps Humain',
  tagline: 'Écoute et trouve la bonne partie du corps !',
  icon: '🧍',
  island: 'monde',
  accent: '#e8743b',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🧍', name: 'Le corps', sub: 'Les parties (4 cartes)' },
  { emoji: '🙆', name: 'Le corps', sub: 'Les parties (6 cartes)' },
  { emoji: '👁️', name: 'Les cinq sens', sub: 'Voir, entendre, sentir…' },
  { emoji: '🧼', name: 'En bonne santé', sub: 'Les bons gestes' },
]

// ---------- Corpus local typé ----------

function toVoice(v: string): CorpusEntry['voice'] {
  return v === 'denise' || v === 'eloise' || v === 'henri' || v === 'sonia' ? v : undefined
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

// ---------- Helpers d'affichage : une carte = emoji + libellé ----------

interface Card {
  /** Libellé toujours affiché (jamais d'info portée par la couleur seule). */
  label: string
  emoji: string
  /** Clip-nom de la carte (nommée à voix haute en cas d'erreur). */
  nameClip: string
}

function partCard(id: string): Card {
  const p = BODY_PARTS_BY_ID.get(id)
  return { label: p?.label ?? id, emoji: p?.emoji ?? '❓', nameClip: `cor.partie.${id}` }
}

function organCard(id: string): Card {
  const o = ORGANS_BY_ID.get(id)
  return { label: o?.label ?? id, emoji: o?.emoji ?? '❓', nameClip: `cor.organe.${id}` }
}

function habitCard(id: string): Card {
  const h = HABITS_BY_ID.get(id)
  return { label: h?.label ?? id, emoji: h?.emoji ?? '❓', nameClip: `cor.geste.${id}` }
}

/** La carte affichée pour un id donné, selon le mode de l'item. */
function cardFor(item: CorpsItem, id: string): Card {
  if (item.kind === 'part') return partCard(id)
  if (item.kind === 'sense') return organCard(id)
  return habitCard(id)
}

/** Texte de consigne lisible à l'écran. */
function instructionText(it: CorpsItem): string {
  if (it.kind === 'part') {
    const p = BODY_PARTS_BY_ID.get(it.targetId)
    return `Montre ${p?.label ?? ''} !`
  }
  if (it.kind === 'sense') {
    const s = SENSES_BY_ID.get(it.senseId)
    return `Avec quoi est-ce qu'on ${s?.verb ?? ''} ?`
  }
  // Hygiène : la situation est lue ; à l'écran un libellé court.
  return 'Quel est le bon geste ?'
}

/**
 * Identité de l'item, pour éviter de reproposer le même deux fois de
 * suite (clé filtrée par generateItem : partie / sens / situation).
 */
function avoidKey(it: CorpsItem): string {
  if (it.kind === 'part') return it.targetId
  if (it.kind === 'sense') return it.senseId
  return it.situationId
}

/** Id de la carte qui est la bonne réponse (pour le glow d'indice). */
function correctCardId(it: CorpsItem): string {
  if (it.kind === 'part') return it.targetId
  if (it.kind === 'sense') return it.targetOrganId
  return it.answerId
}

/** La carte tapée est-elle la bonne réponse de l'item ? */
function isCorrect(it: CorpsItem, id: string): boolean {
  if (it.kind === 'part') return partCorrect(it, id)
  if (it.kind === 'sense') return senseCorrect(it, id)
  return habitCorrect(it, id)
}

/** Clip de consigne audio pour un item (lu après le clip d'amorce). */
function promptClip(it: CorpsItem): string {
  if (it.kind === 'part') return `cor.partie.${it.targetId}`
  if (it.kind === 'sense') return `cor.sens.${it.senseId}`
  return `cor.situation.${it.situationId}`
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function CorpsHumain() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<CorpsProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<CorpsItem | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [mood, setMood] = useState<'idle' | 'happy' | 'shake'>('idle')
  const [animKey, setAnimKey] = useState(0)
  const [hint, setHint] = useState(false)
  const [wrongId, setWrongId] = useState<string | null>(null)
  const [foundId, setFoundId] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const wrongTimerRef = useRef(0)

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<CorpsProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(wrongTimerRef.current)
      stopSpeech()
    }
  }, [])

  // ---------- Audio ----------

  /** Consigne d'un item : amorce du palier puis l'énoncé propre. */
  const speakConsigne = useCallback(async (it: CorpsItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.kind === 'part') {
      await say(E('cor.montre'))
      if (seqRef.current !== seq) return
      await say(E(promptClip(it)), { interrupt: false })
      return
    }
    // Sens & hygiène : la consigne énonce déjà la question complète.
    await say(E(promptClip(it)))
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item && phase !== 'success') void speakConsigne(item)
    else if (screen !== 'play') void say(E('cor.intro'))
  }, [screen, item, phase, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setMood('idle')
    setHint(false)
    setWrongId(null)
    setFoundId(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakConsigne(first)
  }

  /** Résolution réussie d'un item : maîtrise + Tuner, UNE seule fois. */
  const resolveSuccess = (it: CorpsItem, id: string): void => {
    seqRef.current += 1
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setFoundId(id)
    setPhase('success')
    setMood('happy')
    setAnimKey((k) => k + 1)
    sfx(it.kind === 'sense' ? 'magic' : 'pop')
    setBurst((b) => b + 1)
    void say(E('cor.bravo')).then(() => setOverlay('success'))
  }

  /**
   * Un essai raté : firstTry tombe, le compteur d'erreurs monte, et la
   * carte touchée se NOMME tout de suite à voix haute (feedback
   * élaboratif). L'item reste dans le même contexte. Un piège d'hygiène
   * touché est expliqué gentiment. L'overlay « Presque ! » s'affiche en
   * parallèle ; l'indice suit après 2 échecs (runTeaching).
   */
  const registerFail = (it: CorpsItem, id: string): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setMood('shake')
    setAnimKey((k) => k + 1)
    sfx('wrong')
    setWrongId(id)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    setOverlay('retry')

    const seq = ++seqRef.current
    if (it.kind === 'habit' && isTrapHabit(id)) {
      // Piège touché : on explique gentiment pourquoi ce n'est pas idéal.
      void say(E(habitCard(id).nameClip))
    } else {
      // Autre carte : on la nomme (« Ça, c'est … »).
      void say(E('cor.thatone')).then(() => {
        if (seqRef.current !== seq) return
        return say(E(cardFor(it, id).nameClip), { interrupt: false })
      })
    }
  }

  const onTapCard = (id: string): void => {
    if (!item || phase !== 'idle') return
    if (isCorrect(item, id)) {
      resolveSuccess(item, id)
      return
    }
    registerFail(item, id)
  }

  // ---------- Reprise après une erreur + suite ----------

  /**
   * Après l'overlay « Presque ! » : on redonne la main dans le MÊME
   * contexte, et on illumine le bon élément (indice) si l'enfant peine
   * (≥ 2 échecs consécutifs).
   */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    setMood('idle')
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      const hintClip =
        item.kind === 'part'
          ? 'cor.indice.part'
          : item.kind === 'sense'
            ? 'cor.indice.sense'
            : 'cor.indice.habit'
      await say(E(hintClip), { interrupt: false })
      if (seqRef.current !== seq) return
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
    const next = generateItem(item.tier, tunerRef.current.level, avoidKey(item))
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setWrongId(null)
    setFoundId(null)
    setMood('idle')
    setPhase('idle')
    setAnimKey((k) => k + 1)
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
            🧍
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('cor.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          👁️👂👃
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Écoute, puis touche la bonne carte !
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          {TIER_INFO.map((info, i) => {
            const t = i as TierId
            const locked = t > progress.unlockedTier
            const stars = progress.bestStars[t] ?? 0
            const active = tier === t && !locked
            return (
              <button
                key={`${info.name}-${info.sub}`}
                type="button"
                aria-pressed={active}
                aria-label={locked ? `${info.name}, ${info.sub} (verrouillé)` : `${info.name}, ${info.sub}`}
                onClick={() => {
                  if (locked) {
                    sfx('slide')
                    return
                  }
                  sfx('tap')
                  setTier(t)
                  void say(E(`cor.niveau.${t}`))
                }}
                className={`tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95 ${locked ? 'opacity-50' : ''}`}
                style={active ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl">
                  {locked ? '🔒' : info.emoji}
                </span>
                <span className="text-base leading-tight font-extrabold text-ink">{info.name}</span>
                <span className="text-xs font-semibold text-ink-soft">{info.sub}</span>
                <span className="text-sm" aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur 3`}>
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

  /** En-tête de la zone de jeu : un personnage qui pointe la consigne. */
  const renderHero = (it: CorpsItem): ReactNode => {
    const anim = mood === 'happy' ? 'animate-bounce-in' : mood === 'shake' ? 'animate-wiggle' : 'animate-floaty'
    const heroEmoji = it.kind === 'sense' ? '🧒' : it.kind === 'habit' ? '🧼' : '🧍'
    return (
      <span
        key={animKey}
        className={`text-6xl leading-none sm:text-7xl ${anim}`}
        role="img"
        aria-label="Mon corps"
      >
        {heroEmoji}
      </span>
    )
  }

  const renderCards = (it: CorpsItem): ReactNode => {
    const answer = correctCardId(it)
    const cols = it.choices.length <= 2 ? 'grid-cols-2' : it.choices.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
    return (
      <div className={`grid w-full max-w-md gap-2.5 ${cols}`}>
        {it.choices.map((id) => {
          const card = cardFor(it, id)
          const glow = hint && id === answer
          const found = foundId === id
          const isWrong = wrongId === id
          return (
            <button
              key={id}
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => onTapCard(id)}
              aria-label={card.label}
              className={`tap-target card flex flex-col items-center justify-center gap-0.5 py-3 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''} ${isWrong ? 'animate-shake-soft' : ''} ${found ? 'animate-pop' : ''}`}
              style={found ? { outline: `4px solid ${ACCENT}` } : undefined}
            >
              <span className={`leading-none ${found ? 'text-5xl' : 'text-4xl'}`} aria-hidden="true">
                {card.emoji}
              </span>
              <span className="text-xs font-semibold text-ink-soft">{card.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const renderPlay = (it: CorpsItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 px-3 pb-6">
      <div className="flex items-center justify-center gap-3">
        <p className="text-center text-lg font-extrabold text-ink sm:text-xl">{instructionText(it)}</p>
        <Mascot mood={phase === 'success' ? 'cheer' : 'idle'} size={44} />
      </div>
      {renderHero(it)}
      <div className="game-surface flex w-full flex-col items-center rounded-card p-3">
        {renderCards(it)}
      </div>
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
              🔓 Nouveau niveau débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <ConfettiBurst burst={burst} />
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
