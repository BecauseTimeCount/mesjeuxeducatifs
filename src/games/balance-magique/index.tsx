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
import { Balance, BmaStyles, TokenFace } from './Balance'
import corpus from './corpus.json'
import {
  applyRun,
  FRESH_PROGRESS,
  generateItem,
  groupKey,
  hintDeltas,
  isBalanced,
  ITEMS_PER_RUN,
  itemSignature,
  lastPlacedId,
  leftWeight,
  MAX_TUNER_LEVEL,
  nextStockId,
  rightWeight,
  starsFor,
  TIER_SKILLS,
  tiltDirection,
  weightOf,
} from './logic'
import type { BmaItem, BmaProgress, BmaToken, TierId } from './logic'

// ============================================================
// La Balance Magique — l'égalité comme équivalence : l'enfant
// charge le plateau droit pour égaler le gauche. La balance est
// bloquée par le sortilège : on ne SAIT qu'en appuyant sur
// « Pèse ! » — l'erreur montre physiquement le côté trop lourd.
// ============================================================

const STORE_KEY = 'game:balance-magique'

const META: GameMeta = GAMES_BY_ID.get('balance-magique') ?? {
  id: 'balance-magique',
  title: 'La Balance Magique',
  tagline: 'Équilibre les plateaux du magicien !',
  icon: '⚖️',
  island: 'nombres',
  accent: '#8e44ad',
  skills: [...TIER_SKILLS],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🍎', name: 'Pareil !', sub: 'Le même nombre' },
  { emoji: '🪨', name: 'Complète !', sub: 'Jusqu’à 10' },
  { emoji: '🍈', name: 'Les échanges', sub: '1 melon = 2 pommes' },
  { emoji: '🟦', name: 'Barres et cubes', sub: '1 barre = 10 cubes' },
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

// ---------- Groupes d'affichage (les jetons d'une sorte vont ensemble) ----------

interface TokenGroup {
  key: string
  token: BmaToken
  count: number
}

function groupTokens(tokens: readonly BmaToken[]): TokenGroup[] {
  const groups = new Map<string, TokenGroup>()
  for (const t of tokens) {
    const key = groupKey(t)
    const g = groups.get(key)
    if (g) g.count += 1
    else groups.set(key, { key, token: t, count: 1 })
  }
  return [...groups.values()]
}

/** Accord en nombre d'un libellé : « grappe de raisin » → « grappes de raisin ». */
function pluralizeLabel(label: string, count: number): string {
  if (count <= 1) return label
  const [head, ...rest] = label.split(' ')
  const pluralHead = head.endsWith('s') ? head : `${head}s`
  return [pluralHead, ...rest].join(' ')
}

function instructionText(it: BmaItem): string {
  if (it.tier === 0) return 'Mets le même poids de l’autre côté !'
  if (it.tier === 1) return `Complète pour faire ${leftWeight(it)} !`
  if (it.tier === 2) return 'Équilibre la balance !'
  return it.challenge === 'no-bars' ? 'Plus de barres : que des cubes !' : 'Utilise les barres !'
}

function faceScale(t: BmaToken): number {
  return t.kind === 'bar' ? 0.95 : 1
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'tilted' | 'success'

const MAGE_ANIM: Record<Phase, string> = {
  idle: 'animate-floaty',
  tilted: 'animate-shake-soft',
  success: 'animate-bounce-in',
}

export default function BalanceMagique() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<BmaProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<BmaItem | null>(null)
  const [placed, setPlaced] = useState<number[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [burst, setBurst] = useState(0)
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
    void pget<BmaProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips([
      ...corpus.entries.map((e) => e.id),
      ...Array.from({ length: 31 }, (_, n) => `nombre.${n}`),
    ])
    return () => {
      alive = false
      seqRef.current += 1
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: BmaItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.tier === 0) {
      await say(E('bma.consigne.pareil'))
      return
    }
    if (it.tier === 1) {
      await say(E('bma.consigne.poids'))
      if (seqRef.current !== seq) return
      await say(numberEntry(leftWeight(it)), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('bma.consigne.deja'), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(numberEntry(weightOf(it.rightPrefilled)), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('bma.consigne.complete'), { interrupt: false })
      return
    }
    if (it.tier === 2 && it.rule) {
      await say(E(`bma.regle.${it.rule.pairId}.${it.rule.rate}`))
      if (seqRef.current !== seq) return
      await say(E('bma.consigne.equilibre'), { interrupt: false })
      return
    }
    await say(E('bma.rappel-barre'))
    if (seqRef.current !== seq) return
    await say(
      E(it.challenge === 'no-bars' ? 'bma.magicien.sans-barres' : 'bma.magicien.avec-barres'),
      { interrupt: false },
    )
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Verrou anti soft-lock : pas de relance pendant un verdict ou une
      // explication — la consigne ne se rejoue que quand le jeu attend l'enfant.
      if (item && phase === 'idle') void speakConsigne(item)
      return
    }
    void say(E('bma.intro'))
  }, [screen, item, phase, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setPlaced([])
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setHint(false)
    setBurst(0)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakConsigne(first)
  }

  const addToken = (key: string): void => {
    if (!item || phase !== 'idle') return
    const id = nextStockId(item, placed, key)
    if (id === undefined) return
    sfx('pop')
    setPlaced([...placed, id])
  }

  const removeToken = (key: string): void => {
    if (!item || phase !== 'idle') return
    const id = lastPlacedId(item, placed, key)
    if (id === undefined) return
    sfx('slide')
    setPlaced(placed.filter((p) => p !== id))
  }

  const onWeigh = (): void => {
    if (!item || phase !== 'idle' || placed.length === 0) return
    // Invalide la séquence de consigne en cours : le verdict ne doit
    // jamais être chevauché par la suite de la consigne.
    seqRef.current += 1
    sfx('whoosh')

    if (isBalanced(item, placed)) {
      // Équilibre ! Résolution de l'item : maîtrise + Tuner, UNE seule fois.
      const wasFirst = firstTryRef.current
      void recordAttempt(TIER_SKILLS[item.tier], wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('success')
      setBurst((b) => b + 1)
      sfx('magic')
      // Le verdict se dit en entier (say() résout toujours, même interrompu),
      // puis l'overlay arrive INCONDITIONNELLEMENT — sinon clip tronqué.
      void say(E('bma.equilibre')).then(() => {
        window.setTimeout(() => setOverlay('success'), 250)
      })
      return
    }

    // Le fléau penche physiquement du côté lourd : l'erreur MONTRE la direction.
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('tilted')
    void say(
      E(tiltDirection(item, placed) === 'right' ? 'bma.trop-lourd' : 'bma.trop-leger'),
    ).then(() => {
      window.setTimeout(() => setOverlay('retry'), 250)
    })
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun()
      return
    }
    const next = generateItem(item.tier, tunerRef.current.level, itemSignature(item))
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setPhase('idle')
    setPlaced([])
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

  /** Feedback élaboratif : la balance reste penchée pendant qu'on dit les deux poids. */
  const runExplain = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    await say(E('bma.plateau-magicien'))
    if (seqRef.current === seq) {
      await say(numberEntry(leftWeight(item)), { interrupt: false })
    }
    if (seqRef.current === seq) {
      await say(E('bma.plateau-toi'), { interrupt: false })
    }
    if (seqRef.current === seq) {
      await say(numberEntry(rightWeight(item, placed)), { interrupt: false })
    }
    // Le sortilège rebloque le fléau : la balance revient à plat — TOUJOURS,
    // même séquence audio interrompue (le jeton n'annule que l'audio, sinon
    // phase resterait « tilted » et la partie serait figée).
    setPhase('idle')
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      if (seqRef.current === seq) void say(E('bma.indice'), { interrupt: false })
    }
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') advance()
    else if (kind === 'retry') void runExplain()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            ⚖️
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('bma.intro')} autoPlay />
        </div>
        <div className="h-[160px]" aria-hidden="true">
          <div className="origin-top scale-[0.72]">
            <div className="relative">
              <Balance
                tilt="level"
                locked
                burst={0}
                left={<TokenFace kind="fruit" value={1} emoji="🍈" />}
                right={
                  <span className="flex gap-1">
                    <TokenFace kind="fruit" value={1} emoji="🍎" />
                    <TokenFace kind="fruit" value={1} emoji="🍎" />
                  </span>
                }
              />
              <span className="animate-floaty absolute bottom-2 left-3 text-5xl">🧙‍♂️</span>
            </div>
          </div>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          La balance ne bouge que si tu appuies sur « Pèse ! »
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
                  void say(E(`bma.niveau.${t}`))
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

  const renderRuleCard = (it: BmaItem): ReactNode => {
    if (it.tier === 2 && it.rule) {
      return (
        <div
          className="card flex items-center gap-2 px-4 py-1.5"
          role="img"
          aria-label={`Règle : 1 ${it.rule.big.label} pèse comme ${it.rule.rate} ${it.rule.small.label}s`}
        >
          <span aria-hidden="true" className="text-3xl">{it.rule.big.emoji}</span>
          <span aria-hidden="true" className="text-2xl font-extrabold text-ink">=</span>
          <span aria-hidden="true" className="flex gap-0.5 text-2xl">
            {Array.from({ length: it.rule.rate }, (_, i) => (
              <span key={i}>{it.rule?.small.emoji}</span>
            ))}
          </span>
        </div>
      )
    }
    if (it.tier === 3) {
      return (
        <div
          className="card flex items-center gap-2 px-4 py-2"
          role="img"
          aria-label="Règle : 1 barre pèse comme 10 cubes"
        >
          <TokenFace kind="bar" value={10} emoji="🟦" scale={0.95} />
          <span aria-hidden="true" className="text-xl font-extrabold text-ink">=</span>
          <span aria-hidden="true" className="flex gap-[2px]">
            {Array.from({ length: 10 }, (_, i) => (
              <TokenFace key={i} kind="cube" value={1} emoji="🟧" scale={0.7} />
            ))}
          </span>
        </div>
      )
    }
    return null
  }

  const renderLeftPlate = (it: BmaItem): ReactNode => (
    <div key={`left-${resolved}`} className="flex flex-wrap items-end justify-center gap-[3px]">
      {it.left.map((t, i) => (
        <span key={t.id} className="animate-pop" style={{ animationDelay: `${i * 90}ms` }}>
          <TokenFace kind={t.kind} value={t.value} emoji={t.emoji} scale={faceScale(t)} />
        </span>
      ))}
    </div>
  )

  const renderRightPlate = (it: BmaItem): ReactNode => {
    const deltas = hint && phase === 'idle' ? hintDeltas(it, placed) : []
    const placedSet = new Set(placed)
    const groups = groupTokens(it.stock.filter((t) => placedSet.has(t.id)))
    return (
      <>
        {it.rightPrefilled.length > 0 && (
          <div
            className="relative flex flex-wrap items-end justify-center gap-[3px] rounded-bubble bg-white/35 px-1.5 py-1"
            role="img"
            aria-label={`Déjà sur le plateau (impossible à retirer) : ${it.rightPrefilled.length} ${pluralizeLabel(it.rightPrefilled[0].label, it.rightPrefilled.length)}`}
          >
            {it.rightPrefilled.map((t) => (
              <TokenFace key={t.id} kind={t.kind} value={t.value} emoji={t.emoji} />
            ))}
            <span aria-hidden="true" className="absolute -top-2 -left-1 text-sm">🔒</span>
          </div>
        )}
        {groups.map((g) => {
          const glowRemove = deltas.some((d) => d.key === g.key && d.delta < 0)
          return (
            <button
              key={g.key}
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => removeToken(g.key)}
              aria-label={`Retirer : ${g.token.label} (${g.count} ${g.count > 1 ? 'posés' : 'posé'})`}
              className={`tap-target relative flex flex-wrap items-end justify-center gap-[3px] rounded-bubble bg-white/45 px-1.5 py-1 transition-transform active:scale-95 ${glowRemove ? 'animate-pulse-glow' : ''}`}
            >
              {Array.from({ length: g.count }, (_, i) => (
                <span key={i} className={i === g.count - 1 ? 'animate-pop' : ''}>
                  <TokenFace
                    kind={g.token.kind}
                    value={g.token.value}
                    emoji={g.token.emoji}
                    scale={faceScale(g.token)}
                  />
                </span>
              ))}
              {it.tier > 0 && (
                <span className="absolute -top-2 -right-2 rounded-full bg-white px-1.5 text-xs font-extrabold text-ink shadow-card">
                  × {g.count}
                </span>
              )}
            </button>
          )
        })}
      </>
    )
  }

  const renderStock = (it: BmaItem): ReactNode => {
    const deltas = hint && phase === 'idle' ? hintDeltas(it, placed) : []
    const placedSet = new Set(placed)
    const groups = groupTokens(it.stock).map((g) => ({
      ...g,
      remaining: it.stock.filter((t) => groupKey(t) === g.key && !placedSet.has(t.id)).length,
    }))
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <p className="text-base font-extrabold text-ink-soft">🧺 Ta réserve</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {groups.map((g) => {
            const glow = deltas.some((d) => d.key === g.key && d.delta > 0)
            return (
              <button
                key={g.key}
                type="button"
                disabled={phase !== 'idle' || g.remaining === 0}
                onClick={() => addToken(g.key)}
                aria-label={`Poser : ${g.token.label} (${g.remaining} dans la réserve)`}
                className={`tap-target card relative flex items-center justify-center px-6 py-2 transition-transform active:scale-90 disabled:opacity-40 ${glow ? 'animate-pulse-glow' : ''}`}
              >
                <TokenFace kind={g.token.kind} value={g.token.value} emoji={g.token.emoji} scale={1.5} />
                {it.tier > 0 && (
                  <span className="absolute -top-2 -right-2 rounded-full bg-sun px-2 py-0.5 text-sm font-extrabold text-ink shadow-card">
                    × {g.remaining}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderPlay = (it: BmaItem): ReactNode => {
    const tilt = phase === 'tilted' ? tiltDirection(it, placed) : 'level'
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-3 px-3 pb-6 md:flex-row md:gap-10">
        {/* Scène : consigne, règle, balance et magicien */}
        <div className="flex w-full max-w-md flex-col items-center gap-2 md:flex-1">
          <p className="text-center text-lg font-extrabold text-ink">{instructionText(it)}</p>
          {renderRuleCard(it)}
          <div className="relative">
            <Balance
              tilt={tilt}
              locked={phase === 'idle'}
              burst={burst}
              left={renderLeftPlate(it)}
              right={renderRightPlate(it)}
            />
            <span
              key={`mage-${phase}`}
              role="img"
              aria-label="Le magicien"
              className={`absolute bottom-2 left-2 text-5xl ${MAGE_ANIM[phase]}`}
            >
              🧙‍♂️
            </span>
          </div>
        </div>

        {/* Réserve + Pèse ! */}
        <div className="flex w-full max-w-md flex-col items-center gap-3 md:flex-1">
          {renderStock(it)}
          <BigButton
            variant="accent"
            accent={ACCENT}
            className="w-full max-w-xs text-2xl"
            disabled={placed.length === 0 || phase !== 'idle'}
            onClick={onWeigh}
          >
            Pèse ! ⚖️
          </BigButton>
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
      <BmaStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && renderPlay(item)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouveau défi du magicien débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
