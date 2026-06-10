import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pick } from '@/engine/rng'
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
  closestFix,
  comboClipIds,
  comboOptions,
  FRESH_PROGRESS,
  generateItem,
  isValid,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  rotated,
  sentenceText,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { MfoItem, MfoProgress, RollerOption, TierId } from './logic'

// ============================================================
// La Machine Folle — machine à rouleaux bienveillante.
// L'enfant tourne chaque rouleau (et entend chaque mot), puis
// demande à la machine de lire : phrase valide → elle entre au
// livre ; phrase absurde → la machine tousse, et le rouleau en
// conflit clignote. Zéro QCM : l'enfant PRODUIT la phrase.
// ============================================================

const STORE_KEY = 'game:machine-folle'

const META: GameMeta = GAMES_BY_ID.get('machine-folle') ?? {
  id: 'machine-folle',
  title: 'La Machine Folle',
  tagline: 'Tourne les rouleaux, répare la phrase !',
  icon: '🎰',
  island: 'sons',
  accent: '#e65100',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const GAG_IDS = ['mfo.gag.0', 'mfo.gag.1', 'mfo.gag.2', 'mfo.gag.3'] as const

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🎰', name: 'Deux rouleaux', sub: 'Qui fait quoi ?' },
  { emoji: '📜', name: 'Trois rouleaux', sub: 'Des phrases entières' },
  { emoji: '📦', name: 'Les étiquettes', sub: 'le, la, les…' },
  { emoji: '🐾', name: 'Les accords', sub: 'Il dort, ils dorment' },
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

/** Entrée audio d'une option de rouleau (fallback TTS = le texte affiché). */
function wordEntry(opt: RollerOption): CorpusEntry {
  return ENTRIES.get(opt.clipId) ?? { id: opt.clipId, text: opt.text }
}

function consigneId(tier: TierId): string {
  if (tier === 2) return 'mfo.consigne.caisse'
  if (tier === 3) return 'mfo.consigne.scene'
  return 'mfo.consigne.tourne'
}

function instructionText(tier: TierId): string {
  if (tier === 0) return 'Fabrique une phrase qui existe !'
  if (tier === 1) return 'Fabrique une phrase entière !'
  if (tier === 2) return 'Fabrique l’étiquette de la caisse !'
  return 'Raconte ce que tu vois !'
}

// ---------- Mot affiché en gros, terminaison mise en évidence ----------

function WordFace({ opt, big = true }: { opt: RollerOption; big?: boolean }) {
  const hi = opt.hi && opt.text.endsWith(opt.hi) ? opt.hi : undefined
  const stem = hi ? opt.text.slice(0, opt.text.length - hi.length) : opt.text
  return (
    <span
      className={`text-center leading-tight font-extrabold break-words text-ink ${big ? 'text-xl sm:text-2xl' : 'text-base'}`}
    >
      {stem}
      {hi && (
        <span className="font-black text-coral-deep underline decoration-coral decoration-4 underline-offset-4">
          {hi}
        </span>
      )}
    </span>
  )
}

// ---------- Scène : la vérité terrain (T2/T3) ou la phrase (T0/T1) ----------

function Scene({
  item,
  combo,
  celebrating,
  bounceKey,
}: {
  item: MfoItem
  combo: readonly number[]
  celebrating: boolean
  bounceKey: number
}) {
  const scene = item.frame.scene
  if (scene) {
    const isCrate = scene.kind === 'caisse'
    return (
      <div
        className={`flex min-h-24 w-full items-center justify-center gap-2 rounded-card p-3 ${isCrate ? 'bg-sand' : 'bg-lagoon-50'}`}
        role="img"
        aria-label={
          isCrate
            ? `Une caisse avec ${scene.count} objet${scene.count > 1 ? 's' : ''}`
            : `${scene.count} ${scene.count > 1 ? 'animaux' : 'animal'} en action`
        }
      >
        {isCrate && (
          <span aria-hidden="true" className="text-5xl">
            📦
          </span>
        )}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: scene.count }, (_, i) => (
            <span
              key={`${bounceKey}-${i}`}
              aria-hidden="true"
              className={`text-5xl ${celebrating ? 'animate-bounce-in' : ''}`}
              style={celebrating ? { animationDelay: `${i * 0.1}s` } : undefined}
            >
              {scene.emoji}
            </span>
          ))}
        </div>
        {scene.action && (
          <span
            aria-hidden="true"
            className="ml-1 flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-card"
          >
            {scene.action}
          </span>
        )}
      </div>
    )
  }
  const emojis = comboOptions(item.frame, combo)
    .map((o) => o.emoji)
    .filter((e): e is string => e !== undefined)
  return (
    <div className="flex min-h-24 w-full items-center justify-center gap-3 rounded-card bg-white/60 p-3">
      {emojis.map((e, i) => (
        <span
          key={`${bounceKey}-${i}`}
          aria-hidden="true"
          className={`text-5xl ${celebrating ? 'animate-bounce-in' : ''}`}
          style={celebrating ? { animationDelay: `${i * 0.1}s` } : undefined}
        >
          {e}
        </span>
      ))}
    </div>
  )
}

// ---------- Le jeu ----------

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'reading' | 'success' | 'error'

interface BookSentence {
  text: string
  clipIds: string[]
  emojis: string[]
}

export default function MachineFolle() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<MfoProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<MfoItem | null>(null)
  const [combo, setCombo] = useState<number[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [readingIdx, setReadingIdx] = useState<number | null>(null)
  /** Rouleau qui clignote après une erreur (feedback élaboratif ponctuel) */
  const [blink, setBlink] = useState<number | null>(null)
  /** Indice persistant après 2 échecs : le rouleau fautif pulse en continu */
  const [hint, setHint] = useState(false)
  const [book, setBook] = useState<BookSentence[]>([])
  const [shakeKey, setShakeKey] = useState(0)
  const [bounceKey, setBounceKey] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  /** gag de la machine en cours — attendu EN ENTIER avant l'explication */
  const gagRef = useRef<Promise<void>>(Promise.resolve())
  /** timer de l'overlay succès, nettoyé au démontage */
  const successTimer = useRef<number | undefined>(undefined)

  // Chargement de la progression + préchargement des clips d'interface
  useEffect(() => {
    let alive = true
    void pget<MfoProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips(corpus.entries.filter((e) => !e.id.startsWith('mfo.w.')).map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(successTimer.current)
    }
  }, [])

  /** Précharge les clips du seul item courant (le cache Howler est petit). */
  const preloadItem = (it: MfoItem): void => {
    const ids = it.frame.rollers.flatMap((opts) => opts.map((o) => o.clipId))
    if (it.frame.tail) ids.push(it.frame.tail.clipId)
    preloadClips(ids)
  }

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: MfoItem): Promise<void> => {
    seqRef.current += 1
    await say(E(consigneId(it.tier)))
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // No-op hors phase 'idle' : réécouter ne doit jamais invalider une
      // séquence en cours qui doit encore restaurer l'état du jeu.
      if (item && phase === 'idle') void speakConsigne(item)
      return
    }
    void say(E('mfo.intro'))
  }, [screen, item, phase, speakConsigne])

  const sayBook = async (s: BookSentence): Promise<void> => {
    const seq = ++seqRef.current
    for (let i = 0; i < s.clipIds.length; i++) {
      if (seqRef.current !== seq) return
      await say(E(s.clipIds[i]), { interrupt: i === 0 })
    }
  }

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setCombo([...first.start])
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setReadingIdx(null)
    setBlink(null)
    setHint(false)
    setBook([])
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    preloadItem(first)
    void speakConsigne(first)
  }

  const rotateRoller = (i: number): void => {
    if (!item || phase !== 'idle') return
    sfx('slide')
    const next = rotated(item.frame, combo, i)
    setCombo(next)
    if (blink === i) setBlink(null)
    // Le nouveau mot est lu à voix haute (autonomie non-lecteur).
    seqRef.current += 1
    void say(wordEntry(item.frame.rollers[i][next[i]]))
  }

  /** « La machine lit ! » : lecture séquentielle des rouleaux, puis verdict. */
  const onRead = async (): Promise<void> => {
    if (!item || phase !== 'idle') return
    const seq = ++seqRef.current
    setPhase('reading')
    setBlink(null)
    sfx('whoosh')
    // Séquence interrompue : on restaure TOUJOURS un état jouable —
    // le jeton de séquence n'annule que la SUITE de l'audio.
    const aborted = (): boolean => {
      if (seqRef.current === seq) return false
      setReadingIdx(null)
      setPhase('idle')
      return true
    }
    await say(E('mfo.lit'))
    if (aborted()) return
    const opts = comboOptions(item.frame, combo)
    for (let i = 0; i < opts.length; i++) {
      setReadingIdx(i)
      await say(wordEntry(opts[i]), { interrupt: false })
      if (aborted()) return
    }
    if (item.frame.tail) {
      setReadingIdx(opts.length)
      await say(wordEntry(item.frame.tail), { interrupt: false })
      if (aborted()) return
    }
    setReadingIdx(null)

    if (isValid(item.frame, combo)) {
      // Phrase valide : maîtrise + Tuner, UNE seule fois par item résolu.
      const wasFirst = firstTryRef.current
      void recordAttempt(TIER_SKILLS[item.tier], wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('success')
      sfx('magic')
      setBounceKey((k) => k + 1)
      setBook((b) => [
        ...b,
        {
          text: sentenceText(item.frame, combo),
          clipIds: comboClipIds(item.frame, combo),
          emojis: [...comboOptions(item.frame, combo), ...(item.frame.tail ? [item.frame.tail] : [])]
            .map((o) => o.emoji)
            .filter((e): e is string => e !== undefined),
        },
      ])
      // La phrase entre au livre : le clip se joue EN ENTIER, puis
      // l'overlay succès arrive. Pendant la phase 'success', seul le
      // démontage peut invalider le jeton — on évite alors de poser
      // un timer orphelin.
      await say(E('mfo.livre'), { interrupt: false })
      if (seqRef.current !== seq) return
      successTimer.current = window.setTimeout(() => setOverlay('success'), 400)
      return
    }

    // Gag diégétique : la machine tousse, éternue, crache un boulon.
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setShakeKey((k) => k + 1)
    setOverlay('retry')
    gagRef.current = say(E(pick(GAG_IDS)))
  }

  /** Feedback élaboratif : le rouleau en conflit clignote, nouvel essai. */
  const runFeedback = (): void => {
    if (!item) return
    const seq = ++seqRef.current
    setBlink(closestFix(item.frame, combo))
    setPhase('idle')
    // Indice persistant posé de façon SYNCHRONE dès le 2e échec : jamais
    // conditionné au jeton de séquence (qui n'annule que la suite audio).
    const announceHint = failsRef.current >= 2 && !hint
    if (announceHint) setHint(true)
    void (async () => {
      // On laisse le gag de la machine se terminer avant l'explication.
      await gagRef.current
      if (seqRef.current !== seq) return
      await say(E('mfo.regarde'))
      if (seqRef.current !== seq) return
      if (announceHint) await say(E('mfo.indice'), { interrupt: false })
    })()
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun()
      return
    }
    const next = generateItem(item.tier, tunerRef.current.level, item.frame.id)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setBlink(null)
    setPhase('idle')
    setItem(next)
    setCombo([...next.start])
    preloadItem(next)
    void speakConsigne(next)
  }

  const finishRun = (): void => {
    if (!item) return
    const stars = starsFor(firstTryCorrect, ITEMS_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: ITEMS_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, item.tier, stars)
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
    else if (kind === 'retry') runFeedback()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🎰
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('mfo.intro')} autoPlay />
        </div>
        <div
          className="card flex items-center gap-3 px-6 py-3"
          style={{ border: `4px solid ${ACCENT}33` }}
        >
          <span aria-hidden="true" className="animate-floaty text-5xl">
            🎰
          </span>
          <div className="flex flex-col">
            <span className="text-lg font-extrabold text-ink">Tourne les rouleaux…</span>
            <span className="text-sm font-semibold text-ink-soft">et répare la phrase !</span>
          </div>
        </div>
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
                  void say(E(`mfo.niveau.${t}`))
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

  const renderPlay = (it: MfoItem): ReactNode => {
    const frame = it.frame
    const fixTarget = phase === 'idle' ? (hint ? closestFix(frame, combo) : blink) : null
    const face =
      phase === 'error' ? '😵' : phase === 'success' ? '🤩' : phase === 'reading' ? '😮' : '🙂'
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-3 px-3 pb-6 md:flex-row md:items-center md:justify-center md:gap-8">
        {/* Vérité terrain / scène de la phrase */}
        <div className="flex w-full max-w-md flex-col items-center gap-2 md:flex-1">
          <p className="text-center text-lg font-extrabold text-ink">{instructionText(it.tier)}</p>
          <Scene item={it} combo={combo} celebrating={phase === 'success'} bounceKey={bounceKey} />
        </div>

        {/* La machine : rouleaux + complément fixe + bouton de lecture */}
        <div className="flex w-full max-w-md flex-col items-center gap-3 md:flex-1">
          <div
            key={shakeKey}
            className={`card relative w-full p-3 ${phase === 'error' ? 'animate-shake-soft' : ''}`}
            style={{ border: `4px solid ${ACCENT}55` }}
          >
            {phase === 'error' && (
              <span aria-hidden="true" className="animate-pop absolute -top-3 right-8 text-3xl">
                🔩
              </span>
            )}
            <div className="mb-2 flex items-center justify-center gap-2 text-2xl">
              <span aria-hidden="true">🎰</span>
              <span key={phase} aria-hidden="true" className="animate-pop">
                {face}
              </span>
            </div>
            <div className="flex w-full items-stretch gap-2">
              {frame.rollers.map((opts, i) => {
                const opt = opts[combo[i]]
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={phase !== 'idle'}
                    onClick={() => rotateRoller(i)}
                    aria-label={`Tourner le rouleau : ${opt.text}`}
                    className={`tap-target flex min-h-32 flex-1 flex-col items-center justify-center gap-1 rounded-bubble border-2 border-ink-soft/15 bg-paper px-1.5 py-2 transition-transform active:scale-95 ${fixTarget === i ? 'animate-pulse-glow' : ''}`}
                    style={readingIdx === i ? { outline: '4px solid var(--color-sun)' } : undefined}
                  >
                    <span aria-hidden="true" className="text-base opacity-50">
                      🔃
                    </span>
                    <span key={`${i}-${combo[i]}`} className="animate-pop flex justify-center">
                      <WordFace opt={opt} />
                    </span>
                    {opt.emoji && (
                      <span aria-hidden="true" className="text-2xl leading-none">
                        {opt.emoji}
                      </span>
                    )}
                  </button>
                )
              })}
              {frame.tail && (
                <div
                  className="flex min-h-32 flex-1 flex-col items-center justify-center gap-1 rounded-bubble bg-sand px-1.5 py-2"
                  style={
                    readingIdx === frame.rollers.length
                      ? { outline: '4px solid var(--color-sun)' }
                      : undefined
                  }
                >
                  <WordFace opt={frame.tail} />
                  {frame.tail.emoji && (
                    <span aria-hidden="true" className="text-2xl leading-none">
                      {frame.tail.emoji}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <BigButton
            variant="accent"
            accent={ACCENT}
            className="w-full max-w-xs text-2xl"
            disabled={phase !== 'idle'}
            onClick={() => {
              void onRead()
            }}
          >
            La machine lit ! 📖
          </BigButton>

          {/* Le livre de la machine : phrases gagnées, relisables au tap */}
          {book.length > 0 && (
            <div className="w-full">
              <p className="mb-1.5 text-center text-sm font-extrabold text-ink-soft">
                📖 Le livre de la machine
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {book.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={phase !== 'idle'}
                    onClick={() => {
                      sfx('tap')
                      void sayBook(s)
                    }}
                    aria-label={`Réécouter : ${s.text}`}
                    className="tap-target animate-pop flex items-center gap-1.5 rounded-full bg-white px-4 py-1 text-sm font-bold text-ink shadow-card transition-transform active:scale-95"
                  >
                    <span aria-hidden="true">{s.emojis.join('')}</span>
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

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
              🔓 Nouveau rouleau débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
