import '@fontsource/sacramento/400.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
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
  DECORS,
  displayedLetter,
  FRESH_PROGRESS,
  GAME_SKILLS,
  generateItem,
  isItemSolved,
  isTargetToken,
  ITEMS_PER_RUN,
  LETTERS,
  MAX_TUNER_LEVEL,
  starsFor,
  TIER_COUNT,
  tokenById,
} from './logic'
import type { ChlDecor, ChlItem, ChlProgress, ChlToken, Graphie, Letter, TierId } from './logic'

// ============================================================
// La Chasse aux Lettres 🔎 — la lettre cible est NOMMÉE À LA
// VOIX, jamais affichée : l'enfant la traque dans une scène
// fouillis. Tap raté → la lettre tapée dit son nom (l'erreur
// enseigne). Tap juste → elle danse : « Bé, comme bateau ! »
// ============================================================

const STORE_KEY = 'game:chasse-aux-lettres'

const META: GameMeta = GAMES_BY_ID.get('chasse-aux-lettres') ?? {
  id: 'chasse-aux-lettres',
  title: 'La Chasse aux Lettres',
  tagline: 'Écoute la lettre, attrape-la dans la scène !',
  icon: '🔎',
  island: 'sons',
  accent: '#e74c3c',
  skills: [...GAME_SKILLS],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🅰️', name: 'Les capitales', sub: 'Les grandes lettres' },
  { emoji: '🔡', name: 'Les minuscules', sub: 'Les petites lettres' },
  { emoji: '✍️', name: 'Les trois écritures', sub: 'Capitale, script, cursive' },
  { emoji: '👂', name: 'Le premier son', sub: 'La première lettre du mot' },
]

/** Emplacements des emojis d'ambiance (derrière les lettres, non interactifs). */
const DECOR_SPOTS: readonly CSSProperties[] = [
  { left: '3%', top: '4%' },
  { right: '4%', top: '8%' },
  { left: '45%', top: '2%' },
  { left: '6%', bottom: '6%' },
  { right: '8%', bottom: '4%' },
  { right: '42%', bottom: '2%' },
  { left: '2%', top: '45%' },
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

/** Le NOM de la lettre (clip chl.lettre.<l>) — jamais affiché, toujours dit. */
function letterEntry(l: Letter): CorpusEntry {
  return E(`chl.lettre.${l}`)
}

// ---------- Rendu d'une lettre selon sa graphie ----------

function LetterFace({
  letter,
  graphie,
  small = false,
}: {
  letter: Letter
  graphie: Graphie
  small?: boolean
}) {
  if (graphie === 'cursive') {
    return (
      <span
        className="leading-none text-ink"
        style={{ fontFamily: "'Sacramento', cursive", fontSize: small ? '2rem' : '2.7rem' }}
      >
        {displayedLetter(letter, graphie)}
      </span>
    )
  }
  return (
    <span className={`leading-none font-extrabold text-ink ${small ? 'text-2xl' : 'text-4xl'}`}>
      {displayedLetter(letter, graphie)}
    </span>
  )
}

function instructionText(it: ChlItem): string {
  if (it.tier === 2) return 'Attrape les 3 écritures de la lettre !'
  if (it.tier === 3) return 'Quelle lettre commence ce mot ?'
  return 'Trouve la lettre que tu entends !'
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'error' | 'success'

export default function ChasseAuxLettres() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<ChlProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<ChlItem | null>(null)
  const [decor, setDecor] = useState<ChlDecor>(DECORS[0])
  const [foundIds, setFoundIds] = useState<number[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | null>(null)
  const [wrongId, setWrongId] = useState<number | null>(null)
  const [hint, setHint] = useState(false)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** Items confusables à reposer après une erreur sur une paire miroir */
  const pendingConfusableRef = useRef(0)
  /** Jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)

  // Chargement de la progression + préchargement des clips fréquents
  useEffect(() => {
    let alive = true
    void pget<ChlProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, TIER_COUNT - 1) as TierId)
    })
    preloadClips([
      'chl.intro',
      'chl.consigne.trouve',
      'chl.consigne.trouve-tous',
      'chl.consigne.trois',
      'chl.consigne.ecoute',
      'chl.consigne.commence',
      'chl.indice',
      'chl.bien-vu',
      'chl.verrouille',
      ...LETTERS.map((l) => `chl.lettre.${l}`),
    ])
    return () => {
      alive = false
      seqRef.current += 1
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: ChlItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.tier === 3 && it.word) {
      await say(E('chl.consigne.ecoute'))
      if (seqRef.current !== seq) return
      await say(E(it.word.clipId), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('chl.consigne.commence'), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E(it.word.clipId), { interrupt: false })
      return
    }
    if (it.tier === 2) {
      await say(E('chl.consigne.trouve-tous'))
      if (seqRef.current !== seq) return
      await say(letterEntry(it.target), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('chl.consigne.trois'), { interrupt: false })
      return
    }
    await say(E('chl.consigne.trouve'))
    if (seqRef.current !== seq) return
    await say(letterEntry(it.target), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // No-op pendant un feedback : rejouer la consigne bumpe seqRef et
      // interromprait une séquence en plein vol — on ne relit qu'au repos.
      if (phase === 'idle' && item) void speakConsigne(item)
      return
    }
    void say(E('chl.intro'))
  }, [screen, phase, item, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    pendingConfusableRef.current = 0
    const first = generateItem(t, 0)
    setDecor((d) => {
      const others = DECORS.filter((x) => x.id !== d.id)
      return others.length > 0 ? pick(others) : d
    })
    setTier(t)
    setItem(first)
    setFoundIds([])
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setWrongId(null)
    setHint(false)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakConsigne(first)
  }

  /** Tap juste : collecte (T2) ou résolution — la lettre danse et s'explique. */
  const onCorrect = (it: ChlItem, tok: ChlToken): void => {
    const nextFound = [...foundIds, tok.id]
    setFoundIds(nextFound)

    if (!isItemSolved(it, nextFound)) {
      // T2 : une écriture attrapée, il en manque — la lettre se nomme.
      sfx('coin')
      const seq = ++seqRef.current
      void say(letterEntry(it.target)).then(() => {
        if (seqRef.current === seq && nextFound.length === 1) {
          void say(E('chl.bien-vu'), { interrupt: false })
        }
      })
      return
    }

    // Résolution de l'item : maîtrise + Tuner, UNE seule fois.
    const wasFirst = firstTryRef.current
    void recordAttempt(it.skillId, wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    sfx('magic')
    // Le bump n'annule que la séquence audio en cours (consigne…) ;
    // l'overlay, lui, arrive INCONDITIONNELLEMENT à la fin du clip
    // (say() résout toujours, même interrompu) — sinon soft-lock.
    seqRef.current += 1
    void say(E(`chl.comme.${it.target}`)).then(() => {
      setOverlay('success')
    })
  }

  /** Tap raté : la lettre tapée se dandine et DIT SON NOM — l'erreur enseigne. */
  const onWrong = async (it: ChlItem, tok: ChlToken): Promise<void> => {
    firstTryRef.current = false
    failsRef.current += 1
    if (it.confusable) {
      pendingConfusableRef.current = Math.min(2, pendingConfusableRef.current + 1)
    }
    setPhase('error')
    setWrongId(tok.id)
    sfx('wrong')
    const seq = ++seqRef.current
    await say(E(`chl.cest.${tok.letter}`))
    // Restauration d'état INCONDITIONNELLE : le jeton seq n'annule que la
    // suite audio, jamais le retour en 'idle' (sinon jetons disabled à vie).
    setWrongId(null)
    setPhase('idle')
    if (failsRef.current >= 2) setHint(true)
    if (seqRef.current !== seq) return
    if (failsRef.current === 2) {
      await say(E('chl.indice'), { interrupt: false })
      if (seqRef.current !== seq) return
    }
    await speakConsigne(it)
  }

  const onTapToken = (it: ChlItem, tok: ChlToken): void => {
    if (phase !== 'idle' || foundIds.includes(tok.id)) return
    sfx('tap')
    if (isTargetToken(it, tok.id)) onCorrect(it, tok)
    else void onWrong(it, tok)
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun()
      return
    }
    const force = item.tier > 0 && pendingConfusableRef.current > 0
    const next = generateItem(item.tier, tunerRef.current.level, item.target, force)
    if (force && next.confusable) pendingConfusableRef.current -= 1
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setWrongId(null)
    setFoundIds([])
    setPhase('idle')
    setItem(next)
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
    setOverlay(null)
    advance()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🔎
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('chl.intro')} autoPlay />
        </div>
        <div className="flex items-center gap-2" aria-hidden="true">
          {(['capital', 'script', 'cursive'] as const).map((g, i) => (
            <span
              key={g}
              className="card flex h-14 w-14 items-center justify-center"
              style={{ transform: `rotate(${[-8, 4, 10][i]}deg)` }}
            >
              <LetterFace letter="b" graphie={g} small />
            </span>
          ))}
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Écoute la lettre… puis attrape-la !
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
                    void say(E('chl.verrouille'))
                    return
                  }
                  sfx('tap')
                  setTier(t)
                  void say(E(`chl.niveau.${t}`))
                }}
                className={`tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95 ${locked ? 'opacity-50' : ''}`}
                style={active ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl">
                  {locked ? '🔒' : info.emoji}
                </span>
                <span className="text-base leading-tight font-extrabold text-ink">{info.name}</span>
                <span className="text-xs leading-tight font-semibold text-ink-soft">{info.sub}</span>
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

  const renderToken = (it: ChlItem, t: ChlToken): ReactNode => {
    const caught = foundIds.includes(t.id)
    const isTarget = isTargetToken(it, t.id)
    const dancing = phase === 'success' && isTarget
    const wobbling = wrongId === t.id
    const dimmed = hint && !isTarget && !wobbling
    return (
      <button
        key={t.id}
        type="button"
        disabled={phase !== 'idle' || caught}
        onClick={() => onTapToken(it, t)}
        aria-label={`Lettre ${displayedLetter(t.letter, t.graphie)}`}
        className={[
          'tap-target card absolute flex h-[72px] w-[72px] items-center justify-center transition-opacity duration-300',
          dancing || caught ? 'animate-wiggle' : '',
          wobbling ? 'animate-shake-soft' : '',
          hint && isTarget && !caught ? 'animate-pulse-glow' : '',
          dimmed ? 'opacity-40' : '',
        ].join(' ')}
        style={{
          left: `${t.x}%`,
          top: `${t.y}%`,
          transform: `translate(-50%, -50%) rotate(${t.rotation}deg) scale(${t.scale})`,
          ...(caught ? { background: `${ACCENT}1f`, outline: `3px solid ${ACCENT}` } : {}),
        }}
      >
        <LetterFace letter={t.letter} graphie={t.graphie} />
        {caught && (
          <span aria-hidden="true" className="absolute -top-2 -right-2 text-xl">
            ✔️
          </span>
        )}
      </button>
    )
  }

  const renderPlay = (it: ChlItem): ReactNode => {
    const word = it.tier === 3 ? it.word : undefined
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-3 px-3 pb-6 md:flex-row md:items-center md:justify-center md:gap-6">
        {/* Panneau consigne : texte, image-mot (T3), compteur 3 cases (T2) */}
        <div className="flex w-full max-w-md flex-col items-center gap-3 md:w-72 md:shrink-0">
          <p className="text-center text-lg font-extrabold text-ink">{instructionText(it)}</p>
          {word && (
            <button
              type="button"
              onClick={() => {
                sfx('tap')
                void say(E(word.clipId))
              }}
              aria-label="Réécouter le mot"
              className="tap-target card flex items-center justify-center px-8 py-3 transition-transform active:scale-95"
            >
              <span className="text-7xl leading-none" aria-hidden="true">
                {word.emoji}
              </span>
              <span aria-hidden="true" className="ml-2 self-start text-xl">
                🔊
              </span>
            </button>
          )}
          {it.tier === 2 && (
            <div
              className="flex items-center gap-2"
              role="img"
              aria-label={`${foundIds.length} écriture${foundIds.length > 1 ? 's' : ''} attrapée${foundIds.length > 1 ? 's' : ''} sur 3`}
            >
              {[0, 1, 2].map((i) => {
                const id = i < foundIds.length ? foundIds[i] : undefined
                const tok = id === undefined ? undefined : tokenById(it, id)
                return (
                  <span
                    key={i}
                    className={`card flex h-16 w-16 items-center justify-center ${tok ? 'animate-pop' : ''}`}
                  >
                    {tok ? (
                      <LetterFace letter={tok.letter} graphie={tok.graphie} small />
                    ) : (
                      <span aria-hidden="true" className="text-2xl font-extrabold text-ink-soft/30">
                        ?
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Scène fouillis : décor + jetons-lettres dispersés */}
        <div
          className="relative w-full max-w-2xl overflow-hidden rounded-card shadow-card md:flex-1"
          style={{ background: decor.background, height: 'min(54dvh, 440px)', minHeight: 320 }}
        >
          {DECOR_SPOTS.map((spot, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute text-4xl opacity-35"
              style={spot}
            >
              {decor.emojis[i % decor.emojis.length]}
            </span>
          ))}
          {it.tokens.map((t) => renderToken(it, t))}
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
              🔓 Nouveau terrain de chasse débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
