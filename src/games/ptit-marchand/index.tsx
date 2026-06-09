// ============================================================
// Le P'tit Marchand — refonte V2.
// Une vraie petite boutique : des clients-animaux commandent à
// voix haute, l'enfant encaisse en manipulant pièces et billets
// dans un tiroir-caisse. Les bénéfices font grandir la boutique
// (nouveaux rayons = récompense-monde).
// Toute la génération/validation vit dans logic.ts (pure, testée).
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { say, sfx, stopSpeech } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pick, randInt } from '@/engine/rng'
import { pget, pset } from '@/engine/storage'
import type { CorpusEntry, GameMeta, LevelResult } from '@/engine/types'
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
import { MoneyView } from './Money'
import type { Denom, Item, Shelf, Tier, Wallet } from './logic'
import {
  DENOMS,
  SHELVES,
  TIER_SKILLS,
  coinsTotal,
  denomLabel,
  formatPrice,
  genItem,
  minCoinsFor,
  paletteForTier,
} from './logic'
import { itemEntries, priceEntries, ptm } from './speech'

// Méta locale (même valeurs que games.manifest.ts — copie volontaire :
// le manifest importe ce module en lazy, on évite le cycle statique).
const META: GameMeta = {
  id: 'ptit-marchand',
  title: 'Le P’tit Marchand',
  tagline: 'Sers les clients et rends la monnaie !',
  icon: '🏪',
  island: 'nombres',
  accent: '#f9a825',
  skills: [...TIER_SKILLS],
  status: 'v2',
}

const ITEMS_PER_RUN = 8
const SAVE_KEY = 'game:ptit-marchand'

const CLIENTS = ['🐻', '🦊', '🐰', '🐷', '🐸', '🐱', '🐶', '🐭', '🐨', '🦁'] as const

const TIER_META: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: '🪙', label: 'Les pièces' },
  { emoji: '💰', label: 'Payer' },
  { emoji: '💶', label: 'Rendre la monnaie' },
  { emoji: '🛒', label: 'Deux articles' },
]

interface Save {
  bestStars: Record<string, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
  /** Rayons de la boutique débloqués (récompense-monde), 1..SHELVES.length. */
  shelves: number
}

const DEFAULT_SAVE: Save = { bestStars: {}, unlockedTier: 0, runs: 0, shelves: 1 }

function normalizeSave(s: Partial<Save> | undefined): Save {
  return {
    bestStars: s?.bestStars ?? {},
    unlockedTier: Math.min(Math.max(s?.unlockedTier ?? 0, 0), 3),
    runs: s?.runs ?? 0,
    shelves: Math.min(Math.max(s?.shelves ?? 1, 1), SHELVES.length),
  }
}

// ------------------------------------------------------------
// La boutique qui grandit : rayons débloqués + tirelire
// ------------------------------------------------------------

function Boutique({ shelves, piggy }: { shelves: number; piggy?: number }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-card bg-white/70 px-3 py-2">
      {SHELVES.slice(0, shelves).map((s) => (
        <div
          key={s.id}
          className="flex shrink-0 flex-col items-center rounded-bubble bg-white px-2.5 py-1 shadow-card"
        >
          <span className="text-[10px] font-bold text-ink-soft">{s.name}</span>
          <span aria-hidden="true" className="text-xl leading-tight">
            {s.articles.map((a) => a.emoji).join('')}
          </span>
        </div>
      ))}
      {shelves < SHELVES.length && (
        <div
          aria-hidden="true"
          className="flex shrink-0 flex-col items-center rounded-bubble border-2 border-dashed border-ink-soft/30 px-2.5 py-1 opacity-60"
        >
          <span className="text-[10px] font-bold text-ink-soft">Bientôt…</span>
          <span className="text-xl leading-tight">🔒</span>
        </div>
      )}
      {piggy !== undefined && (
        <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-sun px-3 py-1 text-lg font-extrabold text-ink">
          <span aria-hidden="true">💰</span>
          <span key={piggy} className="animate-pop inline-block">{piggy}</span>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Le client du moment et sa commande
// ------------------------------------------------------------

function ClientCard({ item, client, sold }: { item: Item; client: string; sold: boolean }) {
  const articles = item.kind === 'change' ? [item.article] : item.articles
  const prices = item.kind === 'change' ? [item.price] : item.prices
  return (
    <div className="card flex items-center gap-3 p-3 sm:p-4">
      <div key={client} aria-hidden="true" className="animate-bounce-in shrink-0 text-6xl sm:text-7xl">
        {client}
      </div>
      <div className="flex-1 rounded-bubble bg-sand/60 p-3">
        <div className="flex items-end justify-center gap-5">
          {articles.map((a, i) => (
            <div
              key={a.id}
              className={`flex flex-col items-center transition-all duration-700 ${
                sold ? '-translate-y-8 scale-75 opacity-0' : ''
              }`}
            >
              <span role="img" aria-label={a.name} className="text-5xl sm:text-6xl">
                {a.emoji}
              </span>
              <span className="mt-1 rounded-full bg-sun px-3 py-0.5 text-2xl font-extrabold text-ink shadow-card sm:text-3xl">
                {formatPrice(prices[i])}
              </span>
            </div>
          ))}
        </div>
        {item.kind === 'change' && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="text-base font-extrabold text-ink-soft">Il te donne :</span>
            <MoneyView denom={item.bill} scale={0.9} />
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Plateau de paiement
// ------------------------------------------------------------

interface PlateauProps {
  plateau: readonly Denom[]
  isChange: boolean
  showTotal: boolean
  countIdx: number
  onTap: (index: number) => void
}

function PlateauCard({ plateau, isChange, showTotal, countIdx, onTap }: PlateauProps) {
  const total = coinsTotal(plateau)
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-extrabold text-ink-soft">
          {isChange ? '↩️ La monnaie à rendre' : '🫳 Sur le plateau'}
        </span>
        <span
          className={`rounded-full px-4 py-1 text-2xl font-extrabold ${
            showTotal ? 'bg-lagoon-100 text-lagoon-900' : 'bg-ink-soft/10 text-ink-soft'
          }`}
          aria-label={showTotal ? `Total : ${formatPrice(total)}` : 'Total caché'}
        >
          {showTotal ? (plateau.length === 0 ? '…' : `= ${formatPrice(total)}`) : '?'}
        </span>
      </div>
      <div className="mt-2 flex min-h-[88px] flex-wrap items-center justify-center gap-1.5 rounded-bubble bg-sand/50 p-2">
        {plateau.length === 0 ? (
          <span className="text-base font-semibold text-ink-soft/60">
            Tape les pièces du tiroir !
          </span>
        ) : (
          plateau.map((d, i) => (
            <button
              key={`${i}-${d}`}
              type="button"
              onClick={() => onTap(i)}
              aria-label={`Reprendre ${denomLabel(d)}`}
              className={`tap-target animate-pop flex items-center justify-center rounded-full transition-transform active:scale-90 ${
                countIdx === i ? 'scale-110 ring-4 ring-coral' : ''
              }`}
            >
              <MoneyView denom={d} scale={0.85} />
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Tiroir-caisse (palette de monnaie)
// ------------------------------------------------------------

interface DrawerProps {
  palette: Wallet
  remaining: Wallet
  hint: ReadonlyMap<Denom, number> | null
  onTap: (d: Denom) => void
}

function DrawerCard({ palette, remaining, hint, onTap }: DrawerProps) {
  return (
    <div className="card p-3">
      <div className="text-base font-extrabold text-ink-soft">🧰 Le tiroir-caisse</div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {DENOMS.filter((d) => palette[d] > 0).map((d) => {
          const left = remaining[d]
          const hinted = hint?.get(d)
          return (
            <button
              key={d}
              type="button"
              disabled={left <= 0}
              onClick={() => onTap(d)}
              aria-label={`${denomLabel(d)}, il en reste ${left}`}
              className={`tap-target relative flex items-center justify-center rounded-2xl p-1 transition-transform active:scale-90 disabled:opacity-30 ${
                hinted !== undefined ? 'animate-pulse-glow rounded-full' : ''
              }`}
            >
              <MoneyView denom={d} />
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 rounded-full bg-ink px-1.5 text-xs font-extrabold text-white"
              >
                ×{left}
              </span>
              {hinted !== undefined && (
                <span
                  aria-hidden="true"
                  className="animate-pop absolute -bottom-1 rounded-full bg-coral px-2 text-sm font-extrabold text-white"
                >
                  {hinted}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Une partie de 8 clients
// ------------------------------------------------------------

interface RunProps {
  tier: Tier
  shelves: number
  onFinish: (result: LevelResult) => void
}

function Run({ tier, shelves, onFinish }: RunProps) {
  const palette = useMemo(() => paletteForTier(tier), [tier])
  const tunerRef = useRef<Tuner | null>(null)
  tunerRef.current ??= new Tuner({ min: 1, max: 3, start: 1 })

  const [index, setIndex] = useState(0)
  const [item, setItem] = useState<Item>(() => genItem(tier, 1, shelves))
  const [client, setClient] = useState<string>(() => pick(CLIENTS))
  const [plateau, setPlateau] = useState<readonly Denom[]>([])
  const [feedback, setFeedback] = useState<'success' | 'retry' | null>(null)
  const [countIdx, setCountIdx] = useState(-1)
  const [hint, setHint] = useState<ReadonlyMap<Denom, number> | null>(null)
  const [sold, setSold] = useState(false)
  const [busy, setBusy] = useState(false)
  const [piggy, setPiggy] = useState(0)

  const firstTry = useRef(true)
  const failsOnItem = useRef(0)
  const firstTryOk = useRef(0)
  const seq = useRef(0)

  // Lecture séquentielle annulable : un nouvel appel (ou l'unmount) coupe la précédente.
  async function speakSeq(entries: readonly CorpusEntry[]): Promise<void> {
    const id = ++seq.current
    for (let i = 0; i < entries.length; i++) {
      if (seq.current !== id) return
      await say(entries[i], { interrupt: i === 0 })
    }
  }

  function announce(it: Item, withIntro: boolean): void {
    const entries = withIntro ? [ptm(`intro.t${tier}`), ...itemEntries(it)] : itemEntries(it)
    void speakSeq(entries)
  }

  useEffect(() => {
    announce(item, true)
    return () => {
      seq.current += 1
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consigne d'ouverture, une fois
  }, [])

  const remaining = useMemo(() => {
    const w: Wallet = { ...palette }
    for (const d of plateau) w[d] -= 1
    return w
  }, [palette, plateau])

  function tapPalette(d: Denom): void {
    if (busy || feedback !== null || remaining[d] <= 0) return
    sfx('coin')
    setPlateau((p) => [...p, d])
  }

  function tapPlateau(i: number): void {
    if (busy || feedback !== null) return
    sfx('tap')
    setPlateau((p) => p.filter((_, j) => j !== i))
  }

  function encaisser(): void {
    if (busy || feedback !== null) return
    if (plateau.length === 0) {
      void speakSeq([ptm('plateau-vide')])
      return
    }
    if (coinsTotal(plateau) === item.target) {
      // Résolution de l'item : le point premier-essai se joue ici, une seule fois.
      void recordAttempt(TIER_SKILLS[tier], firstTry.current)
      if (firstTry.current) firstTryOk.current += 1
      tunerRef.current?.onResult(firstTry.current)
      sfx('coin')
      setPiggy((p) => p + 1)
      setSold(true)
      setFeedback('success')
    } else {
      firstTry.current = false
      failsOnItem.current += 1
      setFeedback('retry')
    }
  }

  /** Client suivant (ou fin de partie). L'item suivant est TOUJOURS nouveau. */
  async function advance(): Promise<void> {
    await speakSeq([ptm(`merci.${randInt(1, 5)}`)])
    const done = index + 1
    if (done >= ITEMS_PER_RUN) {
      const ratio = firstTryOk.current / ITEMS_PER_RUN
      const stars: LevelResult['stars'] = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : 1
      onFinish({
        gameId: META.id,
        stars,
        firstTryCorrect: firstTryOk.current,
        total: ITEMS_PER_RUN,
      })
      return
    }
    const next = genItem(tier, tunerRef.current?.level ?? 1, shelves)
    setIndex(done)
    setItem(next)
    setPlateau([])
    setSold(false)
    setClient(pick(CLIENTS))
    firstTry.current = true
    failsOnItem.current = 0
    announce(next, false)
  }

  /** L'erreur enseigne : comptage animé et SONORE du plateau, pièce par pièce, en cumul. */
  async function recount(): Promise<void> {
    setBusy(true)
    const id = ++seq.current
    try {
      await say(ptm('compte'))
      let cumul = 0
      for (let i = 0; i < plateau.length; i++) {
        if (seq.current !== id) return
        setCountIdx(i)
        sfx('coin')
        cumul += plateau[i]
        for (const e of priceEntries(cumul)) {
          if (seq.current !== id) return
          await say(e, { interrupt: false })
        }
      }
      setCountIdx(-1)
      if (seq.current !== id) return
      await say(ptm('il-fallait'), { interrupt: false })
      for (const e of priceEntries(item.target)) {
        if (seq.current !== id) return
        await say(e, { interrupt: false })
      }
      // Indice automatique après 2 échecs : la solution optimale brille.
      if (failsOnItem.current >= 2) {
        const solution = minCoinsFor(item.target, palette)
        if (solution !== null) {
          const counts = new Map<Denom, number>()
          for (const d of solution) counts.set(d, (counts.get(d) ?? 0) + 1)
          setPlateau([])
          setHint(counts)
          sfx('magic')
          window.setTimeout(() => setHint(null), 2000)
        }
      }
    } finally {
      setCountIdx(-1)
      setBusy(false)
    }
  }

  function onFeedbackDone(): void {
    const kind = feedback
    setFeedback(null)
    if (kind === 'success') void advance()
    else if (kind === 'retry') void recount()
  }

  const isChange = item.kind === 'change'
  const showTotal = item.kind === 'pay' && item.showTotal

  return (
    <GameShell
      meta={META}
      hud={<ProgressDots total={ITEMS_PER_RUN} done={index} />}
      onReplayInstruction={() => announce(item, false)}
    >
      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 content-start gap-3 px-3 pb-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <Boutique shelves={shelves} piggy={piggy} />
          <ClientCard item={item} client={client} sold={sold} />
          <PlateauCard
            plateau={plateau}
            isChange={isChange}
            showTotal={showTotal}
            countIdx={countIdx}
            onTap={tapPlateau}
          />
          <BigButton
            variant="accent"
            accent={META.accent}
            onClick={encaisser}
            disabled={busy}
            className="mx-auto w-full max-w-xs text-2xl"
          >
            🛎️ Encaisser !
          </BigButton>
        </div>
        <DrawerCard palette={palette} remaining={remaining} hint={hint} onTap={tapPalette} />
      </div>
      <FeedbackOverlay kind={feedback} onDone={onFeedbackDone} />
    </GameShell>
  )
}

// ------------------------------------------------------------
// Écran d'accueil : sélection du palier
// ------------------------------------------------------------

interface HomeProps {
  save: Save
  tier: Tier
  onTier: (t: Tier) => void
  onPlay: () => void
}

function Home({ save, tier, onTier, onPlay }: HomeProps) {
  return (
    <GameShell meta={META}>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-4 px-4 pb-6 text-center">
        <div aria-hidden="true" className="animate-floaty text-7xl">🏪</div>
        <h2 className="text-2xl font-extrabold text-ink">Bienvenue dans ta boutique !</h2>
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={ptm('intro.accueil')} autoPlay />
        </div>

        <div className="w-full">
          <Boutique shelves={save.shelves} />
        </div>

        <div className="grid w-full grid-cols-2 gap-3">
          {TIER_META.map((tm, i) => {
            const t = i as Tier
            const locked = t > save.unlockedTier
            const best = save.bestStars[String(t)] ?? 0
            const selected = t === tier
            return (
              <button
                key={tm.label}
                type="button"
                disabled={locked}
                onClick={() => {
                  sfx('tap')
                  onTier(t)
                }}
                className={`tap-target card flex flex-col items-center gap-1 p-3 transition-transform active:scale-95 disabled:opacity-45 ${
                  selected ? 'ring-4' : ''
                }`}
                style={selected ? { ['--tw-ring-color' as string]: META.accent } : undefined}
                aria-pressed={selected}
              >
                <span aria-hidden="true" className="text-3xl">{locked ? '🔒' : tm.emoji}</span>
                <span className="text-base leading-tight font-extrabold text-ink">{tm.label}</span>
                <span
                  aria-label={`${best} étoile${best > 1 ? 's' : ''} sur 3`}
                  className="text-sm tracking-wider"
                >
                  {Array.from({ length: 3 }, (_, s) => (s < best ? '⭐' : '☆')).join('')}
                </span>
              </button>
            )
          })}
        </div>

        <BigButton
          variant="accent"
          accent={META.accent}
          onClick={onPlay}
          className="w-full max-w-xs text-2xl"
        >
          🛒 Jouer !
        </BigButton>
      </div>
    </GameShell>
  )
}

// ------------------------------------------------------------
// Fin de partie : étoiles + éventuel nouveau rayon
// ------------------------------------------------------------

interface EndProps {
  result: LevelResult
  newShelf: Shelf | null
  onReplay: () => void
  onHome: () => void
}

function EndScreen({ result, newShelf, onReplay, onHome }: EndProps) {
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    if (newShelf === null) return
    const t = window.setTimeout(() => {
      setBurst(1)
      sfx('levelup')
      void say(ptm('rayon'))
    }, 2200)
    return () => window.clearTimeout(t)
  }, [newShelf])

  return (
    <GameShell meta={META}>
      <div className="flex flex-1 flex-col">
        {newShelf !== null && (
          <div className="animate-bounce-in mx-auto mt-3 rounded-card bg-white px-6 py-3 text-center shadow-card">
            <div className="text-lg font-extrabold text-ink">
              {newShelf.emoji} Nouveau rayon : {newShelf.name} !
            </div>
            <div aria-hidden="true" className="mt-1 text-3xl">
              {newShelf.articles.map((a) => a.emoji).join(' ')}
            </div>
          </div>
        )}
        <LevelEnd result={result} onReplay={onReplay} onHome={onHome} />
      </div>
      <ConfettiBurst burst={burst} />
    </GameShell>
  )
}

// ------------------------------------------------------------
// Composant racine du jeu
// ------------------------------------------------------------

type Screen = 'home' | 'play' | 'end'

export default function PtitMarchand() {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)
  const [screen, setScreen] = useState<Screen>('home')
  const [save, setSave] = useState<Save>(DEFAULT_SAVE)
  const [tier, setTier] = useState<Tier>(0)
  const [runId, setRunId] = useState(0)
  const [result, setResult] = useState<LevelResult | null>(null)
  const [newShelf, setNewShelf] = useState<Shelf | null>(null)

  useEffect(() => {
    void pget<Partial<Save>>(SAVE_KEY).then((s) => {
      const norm = normalizeSave(s)
      setSave(norm)
      setTier(Math.min(norm.unlockedTier, 3) as Tier)
      setLoaded(true)
    })
  }, [])

  function handleFinish(res: LevelResult): void {
    const key = String(tier)
    const prevBest = save.bestStars[key] ?? 0
    const gotShelf = res.stars >= 2 && save.shelves < SHELVES.length
    const next: Save = {
      bestStars: { ...save.bestStars, [key]: res.stars > prevBest ? res.stars : prevBest },
      unlockedTier:
        res.stars >= 2 ? Math.max(save.unlockedTier, Math.min(tier + 1, 3)) : save.unlockedTier,
      runs: save.runs + 1,
      shelves: gotShelf ? save.shelves + 1 : save.shelves,
    }
    setSave(next)
    void pset(SAVE_KEY, next)
    setNewShelf(gotShelf ? SHELVES[save.shelves] : null)
    setResult(res)
    setScreen('end')
  }

  if (!loaded) {
    return (
      <GameShell meta={META}>
        <div className="flex flex-1 items-center justify-center">
          <Mascot mood="thinking" size={96} />
        </div>
      </GameShell>
    )
  }

  if (screen === 'play') {
    return <Run key={runId} tier={tier} shelves={save.shelves} onFinish={handleFinish} />
  }

  if (screen === 'end' && result !== null) {
    return (
      <EndScreen
        result={result}
        newShelf={newShelf}
        onReplay={() => {
          setResult(null)
          setNewShelf(null)
          setRunId((r) => r + 1)
          setScreen('play')
        }}
        onHome={() => void navigate('/')}
      />
    )
  }

  return (
    <Home
      save={save}
      tier={tier}
      onTier={setTier}
      onPlay={() => {
        setRunId((r) => r + 1)
        setScreen('play')
      }}
    />
  )
}
