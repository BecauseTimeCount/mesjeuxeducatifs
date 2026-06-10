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
  ATTRIBUTES,
  badgeFor,
  compatibleAfter,
  ENQUETES_PER_RUN,
  FRESH_PROGRESS,
  generateEnquete,
  generateStory,
  itemsPerRun,
  matchesPronoun,
  MAX_TUNER_LEVEL,
  modeFor,
  pronounSpec,
  protestClipId,
  starsFor,
  STORIES_PER_RUN,
  suspectCountFor,
  TIER_SKILLS,
} from './logic'
import type { EnqueteItem, MavProgress, Personnage, StoryItem, TierId } from './logic'

// ============================================================
// Mystères au Village — compréhension orale (anaphores, inférences).
// L'enfant détective pose l'étiquette-pronom sur le bon personnage,
// puis mène l'enquête en écartant les suspects un indice à la fois.
// ============================================================

const STORE_KEY = 'game:mysteres-au-village'

const META: GameMeta = GAMES_BY_ID.get('mysteres-au-village') ?? {
  id: 'mysteres-au-village',
  title: 'Mystères au Village',
  tagline: 'Écoute l’histoire, démasque le personnage !',
  icon: '🕵️',
  island: 'sons',
  accent: '#1b5e20',
  skills: ['fr.cp.comp.anaphores', 'fr.cp.comp.inferences'],
  status: 'v2',
}
const ACCENT = META.accent
const GOLD = '#f4b942'

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🏷️', name: 'L’étiquette mystère', sub: 'Il ou elle ?' },
  { emoji: '✨', name: 'Étiquettes malines', sub: 'Ils ou elles ?' },
  { emoji: '🕵️', name: 'L’enquête', sub: 'Trouve le coupable !' },
  { emoji: '🔍', name: 'La grande enquête', sub: 'Indices de détective' },
]

/** Clips de chrome préchargés au montage (les briques d'item le sont par item). */
const CORE_CLIPS = [
  'mav.intro',
  'mav.qui',
  'mav.prends',
  'mav.trouve',
  'mav.hint.etiquette',
  'mav.hint.enquete',
  'mav.oups.genre.m',
  'mav.oups.genre.f',
  'mav.oups.nombre.sg',
  'mav.oups.nombre.pl',
  'mav.oups.sens',
  'mav.enquete.intro',
  'mav.enquete.ecarte',
  'mav.enquete.designe',
  'mav.indice.1',
  'mav.indice.2',
  'mav.indice.3',
  'mav.pardon',
  'mav.pas-lui',
  'mav.coupable',
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

// ---------- Keyframes locales du jeu ----------

function MavStyles() {
  return (
    <style>{`
@keyframes mav-glow {
  0%, 100% { box-shadow: 0 2px 0 rgba(0,0,0,0.12), 0 0 6px rgba(244, 185, 66, 0.5); }
  50% { box-shadow: 0 2px 0 rgba(0,0,0,0.12), 0 0 18px rgba(244, 185, 66, 0.95); }
}
.mav-glow { animation: mav-glow 1.4s ease-in-out infinite; }
@keyframes mav-bye {
  0% { opacity: 1; transform: rotate(0deg) scale(1); }
  40% { transform: rotate(10deg) scale(0.95); }
  100% { opacity: 0.35; transform: rotate(8deg) scale(0.82); }
}
.mav-bye { animation: mav-bye 0.5s ease-out both; }
`}</style>
  )
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'aim' | 'error' | 'teach' | 'done'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Pastilles pédagogiques ♀/♂ et 1/2 — jamais la couleur seule. */
function GenreNombreBadges({ p }: { p: { genre: 'm' | 'f'; nombre: 'sg' | 'pl' } }) {
  const b = badgeFor(p)
  return (
    <span className="flex items-center gap-1" aria-label={`${b.genre === '♀' ? 'fille' : 'garçon'}, ${b.nombre === '1' ? 'un seul' : 'plusieurs'}`}>
      <span className="animate-pop rounded-full bg-white px-2 py-0.5 text-sm font-extrabold text-ink shadow-card">
        {b.genre}
      </span>
      <span className="animate-pop rounded-full bg-white px-2 py-0.5 text-sm font-extrabold text-ink shadow-card">
        {b.nombre === '1' ? '1' : '2+'}
      </span>
    </span>
  )
}

export default function MysteresAuVillage() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<MavProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [result, setResult] = useState<LevelResult | null>(null)
  const [newUnlock, setNewUnlock] = useState(false)

  // État commun d'une partie
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [phase, setPhase] = useState<Phase>('aim')
  const [hint, setHint] = useState(false)
  const [shakeId, setShakeId] = useState<string | null>(null)

  // Mode étiquette
  const [story, setStory] = useState<StoryItem | null>(null)
  const [armed, setArmed] = useState(false)
  const [placedOnId, setPlacedOnId] = useState<string | null>(null)
  const [badgesOn, setBadgesOn] = useState(false)

  // Mode enquête
  const [enquete, setEnquete] = useState<EnqueteItem | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [eliminatedIds, setEliminatedIds] = useState<string[]>([])
  const [whyBadgeId, setWhyBadgeId] = useState<string | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  /** référents (étiquette) ou coupables (enquête) déjà servis dans la partie */
  const usedRef = useRef<string[]>([])

  useEffect(() => {
    let alive = true
    void pget<MavProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips(CORE_CLIPS)
    return () => {
      alive = false
      seqRef.current += 1
      stopSpeech()
    }
  }, [])

  // ---------- Audio : enchaînement de briques (pattern seqRef) ----------

  const sayIds = useCallback(async (ids: readonly string[], seq: number): Promise<void> => {
    for (let i = 0; i < ids.length; i++) {
      if (seqRef.current !== seq) return
      await say(E(ids[i]), { interrupt: i === 0 })
    }
  }, [])

  const speakStory = useCallback(
    async (item: StoryItem, withHelp: boolean): Promise<void> => {
      const seq = ++seqRef.current
      await sayIds([...item.phrase1.clips, ...item.phrase2.clips], seq)
      if (seqRef.current !== seq) return
      if (withHelp) await say(E('mav.qui'), { interrupt: false })
    },
    [sayIds],
  )

  const speakEnqueteStart = useCallback(
    async (item: EnqueteItem, withHelp: boolean): Promise<void> => {
      const seq = ++seqRef.current
      const ids = [
        ...(withHelp ? ['mav.enquete.intro'] : []),
        item.mefait.clip,
        'mav.indice.1',
        item.clueClips[0],
        ...(withHelp ? ['mav.enquete.ecarte'] : []),
      ]
      await sayIds(ids, seq)
    },
    [sayIds],
  )

  const replayInstruction = useCallback((): void => {
    if (screen !== 'play') {
      void say(E('mav.intro'))
      return
    }
    // Verrou anti soft-lock : réécouter n'est possible qu'en phase active.
    if (phase !== 'aim') return
    if (story) {
      void speakStory(story, false)
      return
    }
    if (enquete && revealed >= 1) {
      const seq = ++seqRef.current
      void sayIds([`mav.indice.${revealed}`, enquete.clueClips[revealed - 1]], seq)
    }
  }, [screen, phase, story, enquete, revealed, speakStory, sayIds])

  // ---------- Déroulé d'une partie ----------

  const resetItemState = (): void => {
    firstTryRef.current = true
    failsRef.current = 0
    setPhase('aim')
    setHint(false)
    setShakeId(null)
    setArmed(false)
    setPlacedOnId(null)
    setBadgesOn(false)
    setRevealed(0)
    setEliminatedIds([])
    setWhyBadgeId(null)
  }

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    usedRef.current = []
    setTier(t)
    setResolved(0)
    setFirstTryCorrect(0)
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    resetItemState()
    if (modeFor(t) === 'etiquette') {
      const item = generateStory(t as 0 | 1, suspectCountFor(t, tunerRef.current.level))
      usedRef.current.push(item.referentId)
      preloadClips([...item.phrase1.clips, ...item.phrase2.clips])
      setStory(item)
      setEnquete(null)
      setScreen('play')
      void speakStory(item, true)
    } else {
      const item = generateEnquete(t as 2 | 3)
      usedRef.current.push(item.culpritId)
      preloadClips([item.mefait.clip, ...item.clueClips])
      setEnquete(item)
      setStory(null)
      setRevealed(1)
      setScreen('play')
      void speakEnqueteStart(item, true)
    }
  }

  const finishRun = (doneCount: number): void => {
    const total = itemsPerRun(tier)
    const stars = starsFor(doneCount, total)
    setResult({ gameId: META.id, stars, firstTryCorrect: doneCount, total })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, tier, stars)
    const unlockedNow = updated.unlockedTier > base.unlockedTier
    if (unlockedNow) sfx('levelup')
    setNewUnlock(unlockedNow)
    setProgress(updated)
    void pset(STORE_KEY, updated)
    setScreen('end')
  }

  /** Résolution d'un item : maîtrise + Tuner, UNE seule fois par item. */
  const resolveItem = (wasFirst: boolean): number => {
    void recordAttempt(TIER_SKILLS[tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    const total = wasFirst ? firstTryCorrect + 1 : firstTryCorrect
    if (wasFirst) setFirstTryCorrect(total)
    return total
  }

  // ---------- Mode étiquette ----------

  const onEtiquetteTap = (): void => {
    if (!story || phase !== 'aim' || placedOnId) return
    sfx('pop')
    setArmed(true)
  }

  const onStorySuspectTap = (s: Personnage): void => {
    if (!story || phase !== 'aim' || overlay) return
    if (!armed) {
      sfx('pop')
      seqRef.current += 1
      void say(E('mav.prends'))
      return
    }
    if (s.id === story.referentId) {
      seqRef.current += 1
      const wasFirst = firstTryRef.current
      resolveItem(wasFirst)
      setPlacedOnId(s.id)
      setPhase('done')
      sfx('magic')
      void say(E('mav.trouve')).then(() => setOverlay('success'))
      return
    }
    // L'erreur enseigne : le personnage désigné à tort proteste et
    // montre POURQUOI (genre/nombre en badge), puis on réécoute.
    firstTryRef.current = false
    failsRef.current += 1
    setShakeId(s.id)
    setBadgesOn(true)
    setPhase('error')
    const seq = ++seqRef.current
    void say(E(protestClipId(s, story.pronoun))).then(() => {
      if (seqRef.current === seq) setOverlay('retry')
    })
  }

  /** Ré-écoute de la phrase, pronom appuyé, indice après 2 échecs. */
  const teachStory = async (): Promise<void> => {
    if (!story) return
    const seq = ++seqRef.current
    setShakeId(null)
    setPhase('teach')
    try {
      await sayIds(story.phrase2.clips, seq)
      if (seqRef.current === seq && failsRef.current >= 2 && !hint) {
        setHint(true)
        await say(E('mav.hint.etiquette'), { interrupt: false })
      }
    } finally {
      // Restauration INCONDITIONNELLE (anti soft-lock).
      setPhase('aim')
    }
  }

  const advanceStory = (): void => {
    if (!story) return
    const done = resolved + 1
    setResolved(done)
    if (done >= STORIES_PER_RUN) {
      finishRun(firstTryCorrect)
      return
    }
    const next = generateStory(
      story.tier,
      suspectCountFor(story.tier, tunerRef.current.level),
      usedRef.current,
    )
    usedRef.current.push(next.referentId)
    preloadClips([...next.phrase1.clips, ...next.phrase2.clips])
    resetItemState()
    setStory(next)
    void speakStory(next, false)
  }

  // ---------- Mode enquête ----------

  const onNextClue = (): void => {
    if (!enquete || phase !== 'aim' || revealed >= 3) return
    sfx('tap')
    const n = revealed + 1
    setRevealed(n)
    const seq = ++seqRef.current
    void (async () => {
      await sayIds([`mav.indice.${n}`, enquete.clueClips[n - 1]], seq)
      if (seqRef.current === seq && n === 3) {
        await say(E('mav.enquete.designe'), { interrupt: false })
      }
    })()
  }

  const onEnqueteSuspectTap = (s: Personnage): void => {
    if (!enquete || phase !== 'aim' || overlay) return
    if (eliminatedIds.includes(s.id)) {
      sfx('slide')
      return
    }
    if (!compatibleAfter(s, enquete.clueAttrs, revealed)) {
      // Geste actif d'élimination : le suspect s'incline et s'excuse.
      sfx('whoosh')
      seqRef.current += 1
      setEliminatedIds((ids) => [...ids, s.id])
      void say(E('mav.pardon'))
      return
    }
    if (revealed >= 3 && s.id === enquete.culpritId) {
      seqRef.current += 1
      const wasFirst = firstTryRef.current
      resolveItem(wasFirst)
      setPhase('done')
      sfx('magic')
      void say(E('mav.coupable')).then(() => setOverlay('success'))
      return
    }
    // Ce suspect correspond encore aux indices : on montre POURQUOI.
    firstTryRef.current = false
    failsRef.current += 1
    setShakeId(s.id)
    setWhyBadgeId(s.id)
    setPhase('error')
    const seq = ++seqRef.current
    void say(E('mav.pas-lui')).then(() => {
      if (seqRef.current === seq) setOverlay('retry')
    })
  }

  /** Ré-écoute du dernier indice, indice visuel après 2 erreurs. */
  const teachEnquete = async (): Promise<void> => {
    if (!enquete || revealed < 1) return
    const seq = ++seqRef.current
    setShakeId(null)
    setPhase('teach')
    try {
      await sayIds([`mav.indice.${revealed}`, enquete.clueClips[revealed - 1]], seq)
      if (seqRef.current === seq && failsRef.current >= 2 && !hint) {
        setHint(true)
        await say(E('mav.hint.enquete'), { interrupt: false })
      }
    } finally {
      setWhyBadgeId(null)
      setPhase('aim')
    }
  }

  const advanceEnquete = (): void => {
    if (!enquete) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ENQUETES_PER_RUN) {
      finishRun(firstTryCorrect)
      return
    }
    const next = generateEnquete(enquete.tier, usedRef.current)
    usedRef.current.push(next.culpritId)
    preloadClips([next.mefait.clip, ...next.clueClips])
    resetItemState()
    setRevealed(1)
    setEnquete(next)
    void speakEnqueteStart(next, false)
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') {
      if (story) advanceStory()
      else advanceEnquete()
    } else if (kind === 'retry') {
      if (story) void teachStory()
      else void teachEnquete()
    }
  }

  // ---------- Rendus ----------

  const renderVillageBanner = (): ReactNode => (
    <div
      className="relative flex h-24 w-full max-w-sm items-end justify-center gap-1 overflow-hidden rounded-card pb-2 shadow-card"
      style={{ background: 'linear-gradient(180deg, #bfe3c0 0%, #dff0d8 60%, #cde8c5 100%)' }}
      aria-hidden="true"
    >
      <span className="absolute top-1 left-3 text-xl">☀️</span>
      <span className="text-3xl">🏠</span>
      <span className="text-2xl">🌳</span>
      <span className="animate-floaty text-4xl">🕵️</span>
      <span className="text-2xl">🌼</span>
      <span className="text-3xl">🏡</span>
    </div>
  )

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🕵️
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('mav.intro')} autoPlay />
        </div>
        {renderVillageBanner()}
        <p className="text-center text-lg font-extrabold text-ink">
          Écoute l’histoire et démasque le bon personnage !
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
                  void say(E(`mav.niveau.${t}`))
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

  const renderSuspectCard = (
    s: Personnage,
    opts: {
      onTap: (p: Personnage) => void
      grayed: boolean
      eliminated?: boolean
      withBadges: boolean
      placed?: boolean
      whyAttrs?: string[]
    },
  ): ReactNode => (
    <button
      key={s.id}
      type="button"
      onClick={() => opts.onTap(s)}
      aria-label={s.label}
      className={`tap-target card relative flex min-h-32 flex-col items-center justify-center gap-1 p-3 transition-transform active:scale-95 ${
        shakeId === s.id ? 'animate-shake-soft' : ''
      } ${opts.eliminated ? 'mav-bye' : ''} ${opts.grayed && !opts.eliminated ? 'opacity-40 grayscale' : ''}`}
      style={opts.placed ? { outline: `4px solid ${GOLD}` } : undefined}
    >
      <span aria-hidden="true" className="text-6xl leading-none">
        {s.emoji}
      </span>
      <span className="text-sm leading-tight font-extrabold text-ink">{capitalize(s.label)}</span>
      {opts.withBadges && <GenreNombreBadges p={s} />}
      {opts.placed && (
        <span
          className="animate-bounce-in absolute -top-3 rounded-full px-3 py-0.5 text-base font-extrabold text-ink shadow-card"
          style={{ background: GOLD }}
        >
          {story?.pronoun.toUpperCase()} ✓
        </span>
      )}
      {opts.eliminated && (
        <span aria-hidden="true" className="absolute top-1 right-1 text-xl">
          🙏
        </span>
      )}
      {opts.whyAttrs && opts.whyAttrs.length > 0 && (
        <span className="absolute -bottom-2 flex flex-wrap justify-center gap-1">
          {opts.whyAttrs.map((a) => (
            <span
              key={a}
              className="animate-pop rounded-full px-2 py-0.5 text-xs font-extrabold text-white shadow-card"
              style={{ background: ACCENT }}
            >
              {ATTRIBUTES[a]} ✓
            </span>
          ))}
        </span>
      )}
    </button>
  )

  const renderStory = (item: StoryItem): ReactNode => {
    const pronounUpper = item.pronoun.toUpperCase()
    const restOfPhrase2 = item.phrase2.text.slice(capitalize(item.pronoun).length)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-3 pb-6">
        {/* L'histoire, affichée ET lue (double codage) */}
        <div className="card w-full p-4 text-center">
          <p className="text-lg leading-snug font-extrabold text-ink sm:text-xl">{item.phrase1.text}</p>
          <p className="mt-1 text-lg leading-snug font-extrabold text-ink sm:text-xl">
            <span
              className={`rounded-lg px-1.5 ${phase === 'teach' ? 'animate-wiggle inline-block' : ''}`}
              style={{ background: GOLD }}
            >
              {capitalize(item.pronoun)}
            </span>
            {restOfPhrase2}
          </p>
        </div>

        {/* L'étiquette dorée à saisir */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onEtiquetteTap}
            disabled={phase !== 'aim' || placedOnId !== null}
            aria-pressed={armed}
            aria-label={`Étiquette ${pronounUpper}`}
            className={`tap-target mav-glow rounded-2xl px-8 py-3 text-3xl font-extrabold text-ink transition-transform active:scale-95 ${
              placedOnId ? 'opacity-30' : armed ? 'scale-110' : 'animate-floaty'
            }`}
            style={{
              background: GOLD,
              border: '4px dashed rgba(0,0,0,0.25)',
              outline: armed ? `4px solid ${ACCENT}` : undefined,
            }}
          >
            {pronounUpper}
          </button>
          {badgesOn && <GenreNombreBadges p={pronounSpec(item.pronoun)} />}
          <p className="text-sm font-bold text-ink-soft">
            {armed && !placedOnId ? 'Pose-la sur le bon personnage !' : placedOnId ? 'Bien joué !' : 'Tape l’étiquette, puis le personnage !'}
          </p>
        </div>

        {/* La scène du village */}
        <div
          className={`grid w-full gap-3 rounded-card p-3 shadow-card ${item.suspects.length >= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}
          style={{ background: 'linear-gradient(180deg, #dff0d8 0%, #cde8c5 100%)' }}
        >
          {item.suspects.map((s) =>
            renderSuspectCard(s, {
              onTap: onStorySuspectTap,
              grayed: hint && !matchesPronoun(s, item.pronoun),
              withBadges: badgesOn,
              placed: placedOnId === s.id,
            }),
          )}
        </div>
      </div>
    )
  }

  const renderEnquete = (item: EnqueteItem): ReactNode => {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-3 pb-6">
        {/* Le méfait + les indices révélés un à un */}
        <div className="card w-full p-4">
          <p className="flex items-center gap-2 text-base font-extrabold text-ink sm:text-lg">
            <span aria-hidden="true" className="text-2xl">🕵️</span>
            {E(item.mefait.clip).text}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {item.clueClips.slice(0, revealed).map((clip, i) => (
              <li
                key={clip}
                className={`animate-pop flex items-start gap-2 rounded-xl px-2 py-1 text-sm font-bold sm:text-base ${
                  i === revealed - 1 ? 'text-ink' : 'text-ink-soft'
                }`}
                style={i === revealed - 1 ? { background: 'rgba(244, 185, 66, 0.3)' } : undefined}
              >
                <span aria-hidden="true">🔎</span>
                {E(clip).text}
              </li>
            ))}
          </ul>
        </div>

        {/* La scène des suspects */}
        <div
          className={`grid w-full gap-3 rounded-card p-3 pb-5 shadow-card ${item.suspects.length >= 5 ? 'grid-cols-3' : 'grid-cols-2'}`}
          style={{ background: 'linear-gradient(180deg, #dff0d8 0%, #cde8c5 100%)' }}
        >
          {item.suspects.map((s) =>
            renderSuspectCard(s, {
              onTap: onEnqueteSuspectTap,
              eliminated: eliminatedIds.includes(s.id),
              grayed: hint && !compatibleAfter(s, item.clueAttrs, revealed),
              withBadges: false,
              whyAttrs:
                whyBadgeId === s.id
                  ? item.clueAttrs.slice(0, revealed).filter((a) => s.attributs.includes(a))
                  : undefined,
            }),
          )}
        </div>

        {revealed < 3 ? (
          <BigButton
            variant="accent"
            accent={ACCENT}
            className="w-full max-w-xs text-2xl"
            disabled={phase !== 'aim'}
            onClick={onNextClue}
          >
            Indice suivant ! 🔎
          </BigButton>
        ) : (
          <p className="text-center text-lg font-extrabold" style={{ color: ACCENT }}>
            Tape sur le coupable ! 🕵️
          </p>
        )}
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={
        screen === 'play' ? <ProgressDots total={itemsPerRun(tier)} done={resolved} /> : undefined
      }
      onReplayInstruction={replayInstruction}
    >
      <MavStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && story && renderStory(story)}
      {screen === 'play' && enquete && renderEnquete(enquete)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouveau mystère débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
