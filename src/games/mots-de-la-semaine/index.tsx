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
  applyExplored,
  applyRun,
  ATTRAPE_REQUESTS,
  ATTRAPE_SKILL,
  attrapeKey,
  buildChoices,
  choicesFor,
  exploredCount,
  exploredThemes,
  FAMILLES_ITEMS,
  FAMILLES_KEY,
  FAMILLES_SKILL,
  famillesUnlocked,
  FRESH_PROGRESS,
  generateFamillesRun,
  isThemeExplored,
  MAX_TUNER_LEVEL,
  pickPartnerTheme,
  pickTargets,
  starsFor,
} from './logic'
import type { FamillesItem, MdsProgress } from './logic'
import { THEMES, THEMES_BY_ID, themeClipId, wordClipId, WORDS_PER_THEME } from './words'
import type { ThemeDef, ThemeId, WordDef } from './words'

// ============================================================
// Les Mots de la Semaine — l'imagier d'abord, le jeu ensuite.
// 1. « L'imagier » : exploration libre, chaque image écoutée brille.
// 2. « Attrape les mots » : la voix demande, l'enfant attrape l'image.
// 3. « Range les familles » : deux paniers, l'enfant trie les mots.
// On ne quiz QUE les mots exposés dans l'imagier.
// ============================================================

const STORE_KEY = 'game:mots-de-la-semaine'

const META: GameMeta = GAMES_BY_ID.get('mots-de-la-semaine') ?? {
  id: 'mots-de-la-semaine',
  title: 'Les Mots de la Semaine',
  tagline: 'Explore l’imagier, attrape les mots !',
  icon: '📖',
  island: 'sons',
  accent: '#00bcd4',
  skills: [ATTRAPE_SKILL, FAMILLES_SKILL],
  status: 'v2',
}
const ACCENT = META.accent

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

/** Clip d'un mot — secours TTS sur le label si le clip manquait. */
function wordE(w: WordDef): CorpusEntry {
  return ENTRIES.get(wordClipId(w.slug)) ?? { id: wordClipId(w.slug), text: `${w.label} !` }
}

type Screen = 'menu' | 'explore' | 'attrape' | 'familles' | 'end'
type Phase = 'aim' | 'teach' | 'success'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function MotsDeLaSemaine() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<MdsProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [themeId, setThemeId] = useState<ThemeId>('cuisine')
  // L'imagier
  const [zoomSlug, setZoomSlug] = useState<string | null>(null)
  // Attrape les mots
  const [choices, setChoices] = useState<WordDef[]>([])
  const [greyed, setGreyed] = useState<ReadonlySet<string>>(new Set())
  // Range les familles
  const [famItems, setFamItems] = useState<FamillesItem[]>([])
  const [famPair, setFamPair] = useState<readonly [ThemeDef, ThemeDef] | null>(null)
  // Commun aux deux modes
  const [idx, setIdx] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('aim')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [lastMode, setLastMode] = useState<'attrape' | 'familles'>('attrape')
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL, start: 1 }))
  const targetsRef = useRef<WordDef[]>([])
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  const hintRef = useRef(false)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)

  // Chargement de la progression + préchargement des clips de consigne
  // (PAS les 80 mots d'un coup : le cache LRU Howler ~30 entrées déborderait —
  // les mots d'un thème sont préchargés à l'entrée dans l'imagier ou le jeu).
  useEffect(() => {
    let alive = true
    void pget<MdsProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      setProgress(stored ?? { ...FRESH_PROGRESS })
    })
    preloadClips(corpus.entries.filter((e) => !e.id.startsWith('mds.mot.')).map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      stopSpeech()
    }
  }, [])

  const persist = (next: MdsProgress): void => {
    setProgress(next)
    void pset(STORE_KEY, next)
  }

  // ---------- Audio (pattern seqRef : la consigne se compose) ----------

  const speakConsigne = useCallback(async (target: WordDef): Promise<void> => {
    const seq = ++seqRef.current
    await say(E('mds.trouve'))
    if (seqRef.current !== seq) return
    await say(wordE(target), { interrupt: false })
  }, [])

  const speakFamItem = useCallback(async (item: FamillesItem, intro: boolean): Promise<void> => {
    const seq = ++seqRef.current
    if (intro) {
      await say(E('mds.familles.intro'))
      if (seqRef.current !== seq) return
    }
    await say(wordE(item.word), { interrupt: !intro })
  }, [])

  const replayInstruction = (): void => {
    // Verrou anti soft-lock : réécouter n'est possible qu'en phase de visée —
    // il ne doit jamais pouvoir invalider une séquence d'enseignement en cours.
    if (screen === 'attrape') {
      const target = targetsRef.current[idx]
      if (target && phase === 'aim') void speakConsigne(target)
      return
    }
    if (screen === 'familles') {
      const item = famItems[idx]
      if (item && phase === 'aim') void speakFamItem(item, false)
      return
    }
    if (screen === 'explore') {
      void say(E('mds.imagier'))
      return
    }
    void say(E('mds.intro'))
  }

  // ---------- L'imagier (exploration libre, pas de score) ----------

  const startExplore = (t: ThemeId): void => {
    const theme = THEMES_BY_ID.get(t)
    if (!theme) return
    preloadClips(theme.words.map((w) => wordClipId(w.slug)))
    seqRef.current += 1
    setThemeId(t)
    setZoomSlug(null)
    setScreen('explore')
    void say(E('mds.imagier'))
  }

  const onExploreTap = (w: WordDef): void => {
    sfx('pop')
    setZoomSlug(w.slug)
    const seq = ++seqRef.current
    const justCompleted =
      progress !== null &&
      !isThemeExplored(progress, themeId) &&
      isThemeExplored(applyExplored(progress, w.slug), themeId)
    if (progress) {
      const next = applyExplored(progress, w.slug)
      if (next !== progress) persist(next)
    }
    void say(wordE(w)).then(() => {
      if (seqRef.current !== seq) return
      setZoomSlug((s) => (s === w.slug ? null : s))
      if (justCompleted) {
        sfx('fanfare')
        void say(E('mds.pret'), { interrupt: false })
      }
    })
  }

  // ---------- « Attrape les mots » ----------

  const startAttrape = (t: ThemeId): void => {
    const theme = THEMES_BY_ID.get(t)
    if (!theme) return
    preloadClips(theme.words.map((w) => wordClipId(w.slug)))
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL, start: 1 })
    const targets = pickTargets(theme.words, ATTRAPE_REQUESTS)
    const first = targets[0]
    if (!first) return
    targetsRef.current = targets
    firstTryRef.current = true
    failsRef.current = 0
    hintRef.current = false
    setThemeId(t)
    setChoices(buildChoices(theme.words, first, choicesFor(tunerRef.current.level)))
    setGreyed(new Set())
    setIdx(0)
    setFirstTryCorrect(0)
    setPhase('aim')
    setOverlay(null)
    setHint(false)
    setResult(null)
    setLastMode('attrape')
    setScreen('attrape')
    void speakConsigne(first)
  }

  /** L'erreur enseigne : la voix nomme ce que l'enfant a tapé, l'image
   *  fautive se grise, puis le mot cible est redemandé (même item). */
  const runTeachingAttrape = async (tapped: WordDef, target: WordDef): Promise<void> => {
    const seq = ++seqRef.current
    setPhase('teach')
    try {
      await say(E('mds.ca-cest'))
      if (seqRef.current !== seq) return
      await say(wordE(tapped), { interrupt: false })
      if (seqRef.current !== seq) return
      await wait(350)
    } finally {
      // Restauration INCONDITIONNELLE (anti soft-lock) : le jeton seq
      // n'annule que la suite audio, jamais le retour en phase de visée.
      setPhase('aim')
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hintRef.current) {
      hintRef.current = true
      setHint(true)
      await say(E('mds.indice'))
      if (seqRef.current !== seq) return
    }
    void speakConsigne(target)
  }

  const onPickAttrape = (w: WordDef): void => {
    const target = targetsRef.current[idx]
    if (!target || phase !== 'aim') return
    if (greyed.has(w.slug)) {
      sfx('slide')
      return
    }
    if (w.slug === target.slug) {
      // Résolution de la demande : maîtrise + Tuner, UNE seule fois.
      seqRef.current += 1
      const wasFirst = firstTryRef.current
      void recordAttempt(ATTRAPE_SKILL, wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('success')
      sfx('magic')
      void say(E('mds.bien-joue')).then(() => setOverlay('success'))
      return
    }
    sfx('wrong')
    firstTryRef.current = false
    failsRef.current += 1
    setGreyed((prev) => new Set(prev).add(w.slug))
    void runTeachingAttrape(w, target)
  }

  const advanceAttrape = (): void => {
    const next = idx + 1
    if (next >= targetsRef.current.length) {
      finishRun(attrapeKey(themeId), targetsRef.current.length)
      return
    }
    const theme = THEMES_BY_ID.get(themeId)
    const target = targetsRef.current[next]
    if (!theme || !target) return
    firstTryRef.current = true
    failsRef.current = 0
    hintRef.current = false
    setHint(false)
    setGreyed(new Set())
    setChoices(buildChoices(theme.words, target, choicesFor(tunerRef.current.level)))
    setIdx(next)
    setPhase('aim')
    void speakConsigne(target)
  }

  // ---------- « Range les familles » ----------

  const startFamilles = (t: ThemeId): void => {
    if (!progress) return
    const partnerId = pickPartnerTheme(progress, t)
    const a = THEMES_BY_ID.get(t)
    const b = partnerId ? THEMES_BY_ID.get(partnerId) : undefined
    if (!a || !b) return
    const items = generateFamillesRun(a, b, FAMILLES_ITEMS)
    const first = items[0]
    if (!first) return
    preloadClips(items.map((i) => wordClipId(i.word.slug)))
    const pair: readonly [ThemeDef, ThemeDef] = Math.random() < 0.5 ? [a, b] : [b, a]
    firstTryRef.current = true
    failsRef.current = 0
    hintRef.current = false
    setThemeId(t)
    setFamPair(pair)
    setFamItems(items)
    setIdx(0)
    setFirstTryCorrect(0)
    setPhase('aim')
    setOverlay(null)
    setHint(false)
    setResult(null)
    setLastMode('familles')
    setScreen('familles')
    void speakFamItem(first, true)
  }

  /** L'erreur enseigne : la voix nomme la BONNE famille, le panier correct
   *  se balance, puis le mot est redit pour un nouvel essai (même item). */
  const runTeachingFamilles = async (item: FamillesItem): Promise<void> => {
    const seq = ++seqRef.current
    setPhase('teach')
    try {
      await say(E('mds.va-dans'))
      if (seqRef.current !== seq) return
      await say(E(themeClipId(item.themeId)), { interrupt: false })
      if (seqRef.current !== seq) return
      await wait(350)
    } finally {
      setPhase('aim')
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hintRef.current) {
      hintRef.current = true
      setHint(true)
      await say(E('mds.panier-indice'))
      if (seqRef.current !== seq) return
    }
    void speakFamItem(item, false)
  }

  const onPickBasket = (t: ThemeId): void => {
    const item = famItems[idx]
    if (!item || phase !== 'aim') return
    if (t === item.themeId) {
      seqRef.current += 1
      const wasFirst = firstTryRef.current
      void recordAttempt(FAMILLES_SKILL, wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('success')
      sfx('magic')
      void say(E('mds.bien-range')).then(() => setOverlay('success'))
      return
    }
    sfx('wrong')
    firstTryRef.current = false
    failsRef.current += 1
    void runTeachingFamilles(item)
  }

  const advanceFamilles = (): void => {
    const next = idx + 1
    if (next >= famItems.length) {
      finishRun(FAMILLES_KEY, famItems.length)
      return
    }
    const item = famItems[next]
    if (!item) return
    firstTryRef.current = true
    failsRef.current = 0
    hintRef.current = false
    setHint(false)
    setIdx(next)
    setPhase('aim')
    void speakFamItem(item, false)
  }

  // ---------- Fin de partie ----------

  const finishRun = (key: string, total: number): void => {
    const stars = starsFor(firstTryCorrect, total)
    setResult({ gameId: META.id, stars, firstTryCorrect, total })
    const base = progress ?? { ...FRESH_PROGRESS }
    persist(applyRun(base, key, stars))
    setScreen('end')
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind !== 'success') return
    if (screen === 'attrape') advanceAttrape()
    else if (screen === 'familles') advanceFamilles()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            📖
          </div>
        </div>
      )
    }
    const selectedExplored = isThemeExplored(progress, themeId)
    const canFamilles =
      famillesUnlocked(progress) &&
      selectedExplored &&
      exploredThemes(progress).some((t) => t !== themeId)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={64} />
          <SpeakerButton entry={E('mds.intro')} autoPlay />
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Choisis une famille de mots !
        </p>
        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          {THEMES.map((t) => {
            const count = exploredCount(progress, t.id)
            const full = count >= t.words.length
            const stars = progress.bestStars[attrapeKey(t.id)] ?? 0
            const active = themeId === t.id
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  sfx('tap')
                  setThemeId(t.id)
                  void say(E(themeClipId(t.id)))
                }}
                className="tap-target card flex flex-col items-center gap-0.5 p-2 transition-transform active:scale-95"
                style={active ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl">
                  {t.emoji}
                </span>
                <span className="text-center text-xs leading-tight font-extrabold text-ink">
                  {t.name}
                </span>
                <span className="text-[11px] font-semibold text-ink-soft">
                  {full ? '✨ 10 mots écoutés' : `${count}/${WORDS_PER_THEME} mots`}
                </span>
                <span className="text-xs" aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur 3`}>
                  {'⭐'.repeat(stars)}
                  <span className="opacity-30">{'☆'.repeat(3 - stars)}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <BigButton variant="accent" accent={ACCENT} onClick={() => startExplore(themeId)}>
            📖 L’imagier
          </BigButton>
          <BigButton
            variant="accent"
            accent={ACCENT}
            disabled={!selectedExplored}
            onClick={() => startAttrape(themeId)}
          >
            🎯 Attrape les mots !
          </BigButton>
          <BigButton variant="soft" disabled={!canFamilles} onClick={() => startFamilles(themeId)}>
            🧺 Range les familles !
          </BigButton>
          {!selectedExplored && (
            <p className="text-center text-xs font-semibold text-ink-soft">
              Écoute d’abord les 10 mots de l’imagier pour jouer !
            </p>
          )}
          {selectedExplored && !canFamilles && (
            <p className="text-center text-xs font-semibold text-ink-soft">
              Explore une deuxième famille et gagne 2 étoiles pour ranger les familles !
            </p>
          )}
        </div>
      </div>
    )
  }

  const renderExplore = (theme: ThemeDef): ReactNode => {
    const count = progress ? exploredCount(progress, theme.id) : 0
    const all = count >= theme.words.length
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-3 px-3 pt-2 pb-6">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-3xl">
            {theme.emoji}
          </span>
          <h2 className="text-xl font-extrabold text-ink">{theme.name}</h2>
          <SpeakerButton entry={E(themeClipId(theme.id))} />
        </div>
        <p className="text-center text-sm font-bold text-ink-soft" aria-live="polite">
          {all
            ? '✨ Tu as écouté tous les mots !'
            : `Tape sur chaque image pour écouter son mot — ${count} sur ${WORDS_PER_THEME}`}
        </p>
        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {theme.words.map((w) => {
            const explored = progress?.explored[w.slug] === true
            const zoomed = zoomSlug === w.slug
            return (
              <button
                key={w.slug}
                type="button"
                onClick={() => onExploreTap(w)}
                aria-label={w.label}
                className={`tap-target card flex flex-col items-center gap-1 p-3 transition-transform duration-200 ${
                  zoomed ? 'z-10 scale-110' : 'active:scale-95'
                } ${explored ? '' : 'opacity-90'}`}
                style={
                  explored
                    ? { boxShadow: `0 0 0 3px ${ACCENT}, 0 0 16px ${ACCENT}66` }
                    : undefined
                }
              >
                <span aria-hidden="true" className={`text-5xl ${zoomed ? 'animate-pop' : ''}`}>
                  {w.emoji}
                </span>
                <span className="text-sm font-extrabold text-ink">{w.label}</span>
                <span className="h-4 text-xs" aria-hidden="true">
                  {explored ? '✨' : ''}
                </span>
              </button>
            )
          })}
        </div>
        <BigButton
          variant="accent"
          accent={ACCENT}
          className="w-full max-w-xs text-xl"
          disabled={!all}
          onClick={() => startAttrape(theme.id)}
        >
          Je suis prêt à jouer !
        </BigButton>
        <BigButton
          variant="soft"
          className="w-full max-w-xs"
          onClick={() => {
            sfx('tap')
            seqRef.current += 1
            stopSpeech()
            setScreen('menu')
          }}
        >
          ← Choisir une autre famille
        </BigButton>
      </div>
    )
  }

  const renderAttrape = (): ReactNode => {
    const target = targetsRef.current[idx]
    if (!target) return null
    const cols = choices.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-3 pb-6">
        <div className="flex items-center gap-3">
          <Mascot mood={phase === 'teach' ? 'thinking' : 'idle'} size={56} />
          <p className="text-lg font-extrabold text-ink">Écoute… et attrape le bon mot !</p>
        </div>
        <div className={`grid w-full gap-2 ${cols}`}>
          {choices.map((w) => {
            const isGrey = greyed.has(w.slug)
            const sway = hint && phase === 'aim' && w.slug === target.slug
            return (
              <button
                key={w.slug}
                type="button"
                disabled={phase !== 'aim'}
                onClick={() => onPickAttrape(w)}
                aria-label={w.label}
                className={`tap-target card flex min-h-24 flex-col items-center justify-center gap-1 p-3 transition-transform active:scale-95 ${
                  isGrey ? 'opacity-40 grayscale' : ''
                } ${sway ? 'animate-wiggle' : ''}`}
              >
                <span aria-hidden="true" className="text-5xl">
                  {w.emoji}
                </span>
                <span className="text-sm font-extrabold text-ink">{w.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderFamilles = (): ReactNode => {
    const item = famItems[idx]
    if (!item || !famPair) return null
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-3 pb-6">
        <p className="text-lg font-extrabold text-ink">Dans quelle famille va ce mot ?</p>
        <div
          key={item.word.slug}
          className={`card flex flex-col items-center gap-1 px-8 py-4 ${
            phase === 'teach' ? 'animate-shake-soft' : 'animate-bounce-in'
          }`}
        >
          <span aria-hidden="true" className="text-6xl">
            {item.word.emoji}
          </span>
          <span className="text-lg font-extrabold text-ink">{item.word.label}</span>
        </div>
        <div className="grid w-full grid-cols-2 gap-3">
          {famPair.map((t) => {
            const sway = (hint || phase === 'teach') && t.id === item.themeId
            return (
              <button
                key={t.id}
                type="button"
                disabled={phase !== 'aim'}
                onClick={() => onPickBasket(t.id)}
                aria-label={`Le panier : ${t.name}`}
                className={`tap-target card flex min-h-28 flex-col items-center justify-center gap-1 p-4 transition-transform active:scale-95 ${
                  sway ? 'animate-wiggle' : ''
                }`}
                style={{ borderBottom: `6px solid ${ACCENT}` }}
              >
                <span aria-hidden="true" className="text-4xl">
                  🧺
                </span>
                <span aria-hidden="true" className="text-2xl">
                  {t.emoji}
                </span>
                <span className="text-center text-sm leading-tight font-extrabold text-ink">
                  {t.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const exploreTheme = THEMES_BY_ID.get(themeId)
  const hudTotal = screen === 'attrape' ? ATTRAPE_REQUESTS : famItems.length || FAMILLES_ITEMS

  return (
    <GameShell
      meta={META}
      hud={
        screen === 'attrape' || screen === 'familles' ? (
          <ProgressDots total={hudTotal} done={idx} />
        ) : undefined
      }
      onReplayInstruction={replayInstruction}
    >
      {screen === 'menu' && renderMenu()}
      {screen === 'explore' && exploreTheme && renderExplore(exploreTheme)}
      {screen === 'attrape' && renderAttrape()}
      {screen === 'familles' && renderFamilles()}
      {screen === 'end' && result && (
        <LevelEnd
          result={result}
          onReplay={() => (lastMode === 'attrape' ? startAttrape(themeId) : startFamilles(themeId))}
          onHome={() => navigate('/')}
        />
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
