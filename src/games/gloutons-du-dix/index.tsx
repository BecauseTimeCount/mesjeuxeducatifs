import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { numberEntry } from '@/content/numbers'
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
import { GdxStyles, Glouton } from './Glouton'
import type { GloutonMood } from './Glouton'
import {
  applyRun,
  bellyTotal,
  FRESH_PROGRESS,
  generateItem,
  isExact,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  numberStyle,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { GdxItem, GdxProgress, NumberStyle, TierId } from './logic'

// ============================================================
// Les Gloutons du Dix — décompositions, compléments à 10 et
// doubles : l'enfant COMPOSE le nombre en nourrissant un
// glouton qui n'avale que le compte exact. Zéro QCM.
// ============================================================

const STORE_KEY = 'game:gloutons-du-dix'

const META: GameMeta = GAMES_BY_ID.get('gloutons-du-dix') ?? {
  id: 'gloutons-du-dix',
  title: 'Les Gloutons du Dix',
  tagline: 'Nourris les gloutons avec le bon compte !',
  icon: '🪄',
  island: 'nombres',
  accent: '#7e57c2',
  skills: [...TIER_SKILLS],
  status: 'v2',
}
const ACCENT = META.accent

const BERRIES = ['🫐', '🍓', '🍊', '🍇', '🍒', '🍐', '🍑', '🥝'] as const

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🍓', name: 'Petit glouton', sub: 'Jusqu’à 5' },
  { emoji: '🫐', name: 'Grand gourmand', sub: 'Jusqu’à 10' },
  { emoji: '🍯', name: 'Le glouton du dix', sub: 'Complète jusqu’à 10' },
  { emoji: '👯', name: 'Les jumeaux', sub: 'Les doubles' },
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

// ---------- Représentation des nombres (points / chiffre) ----------

const DICE_POS: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function DiceDots({ n, dot }: { n: number; dot: number }) {
  const on = new Set(DICE_POS[n] ?? [])
  return (
    <div className="grid grid-cols-3" style={{ gap: Math.max(2, dot * 0.4) }} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{ width: dot, height: dot, background: on.has(i) ? 'currentColor' : 'transparent' }}
        />
      ))}
    </div>
  )
}

function TenFrame({ n, dot }: { n: number; dot: number }) {
  return (
    <div className="grid grid-cols-5" style={{ gap: Math.max(2, dot * 0.35) }} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{
            width: dot,
            height: dot,
            background: i < n ? 'currentColor' : 'rgba(30, 58, 76, 0.12)',
          }}
        />
      ))}
    </div>
  )
}

function NumberFace({
  value,
  style,
  dot = 8,
  digitClass = 'text-3xl',
}: {
  value: number
  style: NumberStyle
  dot?: number
  digitClass?: string
}) {
  if (style === 'digit') {
    return <span className={`font-extrabold leading-none ${digitClass}`}>{value}</span>
  }
  const dots = value <= 6 ? <DiceDots n={value} dot={dot} /> : <TenFrame n={value} dot={dot} />
  if (style === 'dots') {
    return (
      <span role="img" aria-label={`${value}`}>
        {dots}
      </span>
    )
  }
  return (
    <span className="flex flex-col items-center gap-0.5" role="img" aria-label={`${value}`}>
      {dots}
      <span className="text-base leading-none font-extrabold">{value}</span>
    </span>
  )
}

// ---------- Petits helpers d'affichage ----------

function instructionText(it: GdxItem): string {
  if (it.tier === 0) return 'Donne-lui le compte exact de baies !'
  if (it.tier === 1) return `Donne-lui exactement ${it.target} baies !`
  if (it.tier === 2) return `Il a déjà ${it.prefilled}… complète jusqu’à 10 !`
  return `À eux deux, ils veulent ${it.target} !`
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error' | 'counting'

interface CountingState {
  /** valeurs recrachées, doublées pour les jumeaux (un groupe par glouton) */
  values: number[]
  prefilled: number
  total: number
  target: number
  counted: number
}

export default function GloutonsDuDix() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<GdxProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<GdxItem | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [mood, setMood] = useState<GloutonMood>('idle')
  const [hint, setHint] = useState(false)
  const [counting, setCounting] = useState<CountingState | null>(null)
  const [heartBurst, setHeartBurst] = useState(0)
  const [gulpKey, setGulpKey] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const chewTimer = useRef<number | undefined>(undefined)

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<GdxProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips([
      ...corpus.entries.map((e) => e.id),
      ...Array.from({ length: 21 }, (_, n) => `nombre.${n}`),
    ])
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(chewTimer.current)
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: GdxItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.tier === 2) {
      await say(E('gdx.consigne.deja'))
      if (seqRef.current !== seq) return
      await say(numberEntry(it.prefilled), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('gdx.consigne.complete'), { interrupt: false })
      return
    }
    await say(E(it.tier === 3 ? 'gdx.consigne.jumeaux' : 'gdx.consigne.donne'))
    if (seqRef.current !== seq) return
    await say(numberEntry(it.target), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item) void speakConsigne(item)
    else void say(E('gdx.intro'))
  }, [screen, item, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setSelected([])
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setMood('idle')
    setHint(false)
    setCounting(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakConsigne(first)
  }

  const toggleToken = (id: number): void => {
    if (!item || phase !== 'idle') return
    if (selected.includes(id)) {
      // Le glouton recrache gentiment le jeton
      sfx('slide')
      setSelected(selected.filter((s) => s !== id))
      return
    }
    sfx('pop')
    setSelected([...selected, id])
    setMood('chew')
    window.clearTimeout(chewTimer.current)
    chewTimer.current = window.setTimeout(() => setMood('idle'), 700)
  }

  const onMiam = (): void => {
    if (!item || phase !== 'idle' || selected.length === 0) return
    window.clearTimeout(chewTimer.current)

    if (isExact(item, selected)) {
      // GLOUP ! Résolution de l'item : maîtrise + Tuner, UNE seule fois.
      const wasFirst = firstTryRef.current
      void recordAttempt(TIER_SKILLS[item.tier], wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('success')
      setMood('happy')
      setSelected([])
      sfx('magic')
      setGulpKey((k) => k + 1)
      setHeartBurst((h) => h + 1)
      void say(E('gdx.gloup'))
      window.setTimeout(() => setOverlay('success'), 800)
      return
    }

    // Grimace comique + feedback élaboratif après l'overlay
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setMood('grimace')
    setOverlay('retry')
    void say(E('gdx.beurk'))
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun()
      return
    }
    const avoid = item.tier === 2 ? item.prefilled : item.target
    const next = generateItem(item.tier, tunerRef.current.level, avoid)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setMood('idle')
    setPhase('idle')
    setSelected([])
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

  /** Feedback élaboratif : recrache tout, aligne les points, compte à voix haute. */
  const runCounting = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    const values = selected.map((id) => item.tokens.find((t) => t.id === id)?.value ?? 0)
    const doubled = item.gloutons === 2 ? [...values, ...values] : values
    const total = bellyTotal(item, selected)
    sfx('slide')
    setSelected([])
    setPhase('counting')
    const base: CountingState = {
      values: doubled,
      prefilled: item.prefilled,
      total,
      target: item.target,
      counted: 0,
    }
    setCounting(base)
    if (total <= 12) {
      for (let i = 1; i <= total; i++) {
        if (seqRef.current !== seq) return
        setCounting({ ...base, counted: i })
        sfx('tap')
        await say(numberEntry(i), { interrupt: i === 1 })
      }
    } else {
      setCounting({ ...base, counted: total })
    }
    if (seqRef.current !== seq) return
    await say(E('gdx.ca-fait'), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(numberEntry(total), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(E(item.gloutons === 2 ? 'gdx.ils-voulaient' : 'gdx.il-voulait'), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(numberEntry(item.target), { interrupt: false })
    if (seqRef.current !== seq) return
    setCounting(null)
    setMood('idle')
    setPhase('idle')
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      void say(E('gdx.indice'), { interrupt: false })
    }
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') advance()
    else if (kind === 'retry') void runCounting()
  }

  // ---------- Rendus ----------

  const tokenValue = (id: number): number =>
    item?.tokens.find((t) => t.id === id)?.value ?? 0

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🫐
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('gdx.intro')} autoPlay />
        </div>
        <Glouton
          mood="idle"
          size={140}
          belly={<NumberFace value={10} style="digit" digitClass="text-4xl" />}
        />
        <p className="text-center text-lg font-extrabold text-ink">
          Ils ne mangent que le compte exact !
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
                  void say(E(`gdx.niveau.${t}`))
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

  const renderScene = (it: GdxItem): ReactNode => {
    const style = numberStyle(it.tier)
    if (it.gloutons === 2) {
      const twinBelly =
        selected.length === 0 ? (
          <span className="text-xl" aria-hidden="true">
            🤤
          </span>
        ) : (
          <span className="flex flex-wrap items-center justify-center gap-1 p-1">
            {selected.map((id) => (
              <span key={id} className="animate-pop text-sm leading-none font-extrabold">
                {BERRIES[id % BERRIES.length]}
                {tokenValue(id)}
              </span>
            ))}
          </span>
        )
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="card flex items-center gap-2 px-4 py-1.5 text-lg font-extrabold text-ink">
            À eux deux :
            <NumberFace value={it.target} style="digit" digitClass="text-3xl" />
          </div>
          <div className="flex items-end gap-4">
            <Glouton mood={mood} size={122} heartBurst={heartBurst} gulpKey={gulpKey} belly={twinBelly} />
            <Glouton mood={mood} size={122} heartBurst={0} gulpKey={gulpKey} belly={twinBelly} />
          </div>
        </div>
      )
    }
    return (
      <Glouton
        mood={mood}
        size={172}
        heartBurst={heartBurst}
        gulpKey={gulpKey}
        belly={
          <span className="flex flex-col items-center justify-center gap-0.5 p-1">
            <NumberFace value={it.target} style={style} dot={9} digitClass="text-4xl" />
            {it.tier === 2 && (
              <span className="text-xs leading-none font-extrabold text-ink-soft">
                déjà {it.prefilled} 🍯
              </span>
            )}
          </span>
        }
      />
    )
  }

  const renderPlay = (it: GdxItem): ReactNode => {
    const style = numberStyle(it.tier)
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-3 px-3 pb-6 md:flex-row md:items-center md:justify-center md:gap-8">
        {/* Scène : glouton(s), bouche, comptage */}
        <div className="flex w-full max-w-md flex-col items-center gap-2 md:flex-1">
          <p className="text-center text-lg font-extrabold text-ink">{instructionText(it)}</p>
          {renderScene(it)}

          {/* Dans la bouche : jetons croqués (tap → recracher) */}
          <div className="flex min-h-[76px] w-full flex-wrap items-center justify-center gap-2 rounded-2xl bg-white/50 p-2">
            {it.tier === 2 && (
              <span
                className="flex h-16 items-center gap-1 rounded-full px-4 text-xl font-extrabold text-ink"
                style={{ background: 'rgba(255, 201, 77, 0.35)' }}
              >
                🍯 {it.prefilled}
              </span>
            )}
            {selected.map((id) => (
              <button
                key={id}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => toggleToken(id)}
                aria-label={`Recracher le jeton de ${tokenValue(id)}`}
                className="tap-target card animate-pop flex items-center justify-center gap-1.5 px-3 transition-transform active:scale-90"
              >
                <span className="text-2xl" aria-hidden="true">
                  {BERRIES[id % BERRIES.length]}
                </span>
                <NumberFace value={tokenValue(id)} style={style} dot={5} digitClass="text-xl" />
              </button>
            ))}
            {selected.length === 0 && it.tier !== 2 && (
              <span className="text-sm font-semibold text-ink-soft">
                Tape des baies pour le nourrir !
              </span>
            )}
          </div>

          {/* Feedback élaboratif : on aligne les points et on compte */}
          {counting && (
            <div className="card flex w-full flex-col items-center gap-2 p-3">
              <div className="flex max-w-sm flex-wrap items-center justify-center gap-1.5">
                {Array.from({ length: counting.prefilled }, (_, i) => i).map((i) => (
                  <span
                    key={`p-${i}`}
                    className={`block rounded-full ${i < counting.counted ? 'animate-pop' : ''}`}
                    style={{
                      width: 16,
                      height: 16,
                      background: 'var(--color-sun-deep)',
                      opacity: i < counting.counted ? 1 : 0.25,
                    }}
                  />
                ))}
                {counting.values
                  .flatMap((v, vi) => Array.from({ length: v }, (_, k) => ({ vi, k })))
                  .map(({ vi, k }, idx) => {
                    const globalIdx = counting.prefilled + idx
                    return (
                      <span
                        key={`v-${vi}-${k}`}
                        className={`block rounded-full ${globalIdx < counting.counted ? 'animate-pop' : ''}`}
                        style={{
                          width: 16,
                          height: 16,
                          background: ACCENT,
                          opacity: globalIdx < counting.counted ? 1 : 0.25,
                        }}
                      />
                    )
                  })}
              </div>
              <p className="text-center text-base font-extrabold text-ink" aria-live="polite">
                {counting.counted >= counting.total
                  ? `Ça fait ${counting.total}… ${it.gloutons === 2 ? 'ils en voulaient' : 'il en voulait'} ${counting.target} !`
                  : counting.counted > 0
                    ? `${counting.counted}…`
                    : ' '}
              </p>
            </div>
          )}
        </div>

        {/* Jetons-baies + Miam ! */}
        <div className="flex w-full max-w-md flex-col items-center gap-3 md:flex-1">
          <div className={`grid w-full gap-2.5 ${it.tokens.length > 6 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {it.tokens.map((t) => {
              const eaten = selected.includes(t.id)
              if (eaten) {
                return (
                  <div
                    key={t.id}
                    aria-hidden="true"
                    className="flex min-h-16 items-center justify-center rounded-card border-2 border-dashed border-ink-soft/25"
                  />
                )
              }
              const glow = hint && it.solutionIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={phase !== 'idle'}
                  onClick={() => toggleToken(t.id)}
                  aria-label={`Jeton de ${t.value}`}
                  className={`tap-target card flex flex-col items-center justify-center gap-0.5 py-2 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''}`}
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {BERRIES[t.id % BERRIES.length]}
                  </span>
                  <NumberFace value={t.value} style={style} dot={6} digitClass="text-2xl" />
                </button>
              )
            })}
          </div>
          <BigButton
            variant="accent"
            accent={ACCENT}
            className="w-full max-w-xs text-2xl"
            disabled={selected.length === 0 || phase !== 'idle'}
            onClick={onMiam}
          >
            Miam ! 😋
          </BigButton>
        </div>
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={
        screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={resolved} /> : undefined
      }
      onReplayInstruction={replayInstruction}
    >
      <GdxStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && renderPlay(item)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouveau glouton débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
