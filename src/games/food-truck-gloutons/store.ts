import { create } from 'zustand'
import { preloadClips, say, sfx } from '@/engine/audio'
import { Tuner } from '@/engine/adaptive'
import { recordAttempt } from '@/engine/mastery'
import { pget, pset } from '@/engine/storage'
import type { CorpusEntry, LevelResult } from '@/engine/types'
import { numberEntry } from '@/content/numbers'
import corpus from './corpus.json'
import {
  applyRun,
  bellyTotal,
  FRESH_PROGRESS,
  generateOrder,
  isExactTap,
  isExactTyped,
  isUnlocked,
  itemsPerRun,
  MAX_TUNER_LEVEL,
  orderKey,
  SERVICES,
  starsFor,
  targetOf,
} from './logic'
import type { FtgProgress, Order } from './logic'

// ============================================================
// Store de partie (zustand) : découple le HUD DOM et la scène 3D
// (deux racines React) sans bridge de contexte. Toute l'orchestration
// IO (audio, maîtrise, persistance, Tuner) vit ici ; logic.ts reste pur.
// ============================================================

export const GAME_ID = 'food-truck-gloutons'
const STORAGE_KEY = `game:${GAME_ID}`

const ENTRIES: Record<string, CorpusEntry> = Object.fromEntries(
  (corpus.entries as CorpusEntry[]).map((e) => [e.id, e]),
)
export const E = (id: string): CorpusEntry => ENTRIES[id] ?? { id, text: id }

export type GloutonClip = 'idle' | 'eat' | 'happy' | 'oops'
export type Screen = 'menu' | 'play' | 'end'
export type Phase = 'idle' | 'success' | 'error' | 'explain'

export interface FtgState {
  screen: Screen
  progress: FtgProgress
  service: number
  order: Order | null
  /** rang de la commande dans la partie (0..n-1) */
  index: number
  selected: number[]
  typed: string
  phase: Phase
  resolved: number
  firstTryCorrect: number
  mood: GloutonClip
  hint: boolean
  overlay: 'success' | 'retry' | null
  /** texte du feedback élaboratif (aria-live) */
  explainText: string
  result: LevelResult | null
  newUnlock: boolean

  load(): Promise<void>
  goMenu(): void
  /** `force` (DEV / e2e uniquement) : ignore le verrou de progression. */
  startRun(service: number, force?: boolean): void
  replayInstruction(): void
  tapItem(id: number): void
  setTyped(v: string): void
  serve(): void
  onOverlayDone(): void
  /** DEV / e2e : applique la solution puis sert. */
  applySolution(): void
}

// Refs hors état (jamais rendues) : Tuner, premier essai, échecs, jeton de séquence audio.
let tuner = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
let firstTry = true
let fails = 0
let seq = 0
let moodTimer: number | undefined
let overlayTimer: number | undefined

function newSeq(): number {
  seq += 1
  return seq
}
const alive = (s: number): boolean => s === seq

async function speakParts(order: Order, s: number): Promise<void> {
  let first = true
  for (const part of order.prompt) {
    if (!alive(s)) return
    await say('clip' in part ? E(part.clip) : numberEntry(part.number), { interrupt: first })
    first = false
  }
}

export const useFtg = create<FtgState>((set, get) => ({
  screen: 'menu',
  progress: FRESH_PROGRESS,
  service: 0,
  order: null,
  index: 0,
  selected: [],
  typed: '',
  phase: 'idle',
  resolved: 0,
  firstTryCorrect: 0,
  mood: 'idle',
  hint: false,
  overlay: null,
  explainText: '',
  result: null,
  newUnlock: false,

  async load() {
    preloadClips(corpus.entries.map((e) => e.id))
    set({ screen: 'menu', order: null, overlay: null, phase: 'idle', mood: 'idle' })
    void say(E('ftg.intro'))
    // Ne touche jamais à `screen` après l'attente : l'enfant a pu déjà lancer un service.
    const stored = await pget<FtgProgress>(STORAGE_KEY)
    if (stored) set({ progress: stored })
  },

  goMenu() {
    newSeq()
    window.clearTimeout(moodTimer)
    window.clearTimeout(overlayTimer)
    set({ screen: 'menu', order: null, overlay: null, phase: 'idle', mood: 'idle' })
    void say(E('ftg.intro'))
  },

  startRun(service, force = false) {
    const spec = SERVICES[service]
    if (!spec || (!force && !isUnlocked(get().progress, service))) {
      void say(E('ftg.niveau.verrouille'), { interrupt: true })
      return
    }
    tuner = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTry = true
    fails = 0
    const order = generateOrder(service, 0, 0)
    set({
      screen: 'play',
      service,
      order,
      index: 0,
      selected: [],
      typed: '',
      phase: 'idle',
      resolved: 0,
      firstTryCorrect: 0,
      mood: 'idle',
      hint: false,
      overlay: null,
      explainText: '',
      result: null,
      newUnlock: false,
    })
    const s = newSeq()
    void (async () => {
      const firstOfAct = SERVICES.find((x) => x.act === spec.act)?.id === service
      if (firstOfAct) await say(E(`ftg.acte.${spec.act}`), { interrupt: true })
      else if (spec.boss) await say(E('ftg.boss'), { interrupt: true })
      if (!alive(s)) return
      await speakParts(order, s)
    })()
  },

  replayInstruction() {
    const { screen, order } = get()
    if (screen === 'play' && order) void speakParts(order, newSeq())
    else void say(E('ftg.intro'), { interrupt: true })
  },

  tapItem(id) {
    const { order, phase, selected } = get()
    if (!order || phase !== 'idle' || order.input !== 'tap') return
    const eaten = selected.includes(id)
    sfx(eaten ? 'slide' : 'pop')
    window.clearTimeout(moodTimer)
    set({
      selected: eaten ? selected.filter((x) => x !== id) : [...selected, id],
      mood: eaten ? 'idle' : 'eat',
    })
    if (!eaten) moodTimer = window.setTimeout(() => get().phase === 'idle' && set({ mood: 'idle' }), 650)
  },

  setTyped(v) {
    if (get().phase !== 'idle') return
    set({ typed: v.replace(/\D/g, '').slice(0, 5) })
  },

  serve() {
    const { order, phase, selected, typed } = get()
    if (!order || phase !== 'idle') return
    const ok = order.input === 'tap' ? isExactTap(order, selected) : isExactTyped(order, typed)
    if (order.input === 'tap' && selected.length === 0) return
    if (order.input === 'numpad' && typed.length === 0) return
    window.clearTimeout(moodTimer)

    if (ok) {
      const wasFirst = firstTry
      void recordAttempt(order.skill, wasFirst)
      tuner.onResult(wasFirst)
      set((st) => ({
        phase: 'success',
        mood: 'happy',
        firstTryCorrect: st.firstTryCorrect + (wasFirst ? 1 : 0),
      }))
      sfx('magic')
      void say(E('ftg.gloup'), { interrupt: true })
      overlayTimer = window.setTimeout(() => set({ overlay: 'success' }), 700)
      return
    }

    firstTry = false
    fails += 1
    const total = order.input === 'tap' ? bellyTotal(order, selected) : Number(typed)
    const expected = order.input === 'tap' ? targetOf(order) : order.answer
    set({ phase: 'error', mood: 'oops', overlay: 'retry' })
    void say(E(total > expected ? 'ftg.trop' : 'ftg.pas-assez'), { interrupt: true })
  },

  onOverlayDone() {
    const kind = get().overlay
    set({ overlay: null })
    if (kind === 'success') advance(set, get)
    else if (kind === 'retry') void runExplain(set, get)
  },

  applySolution() {
    const { order, phase } = get()
    if (!order || phase !== 'idle') return
    if (order.input === 'tap') set({ selected: [...order.solutionIds] })
    else set({ typed: String(order.answer) })
    get().serve()
  },
}))

type Set = (partial: Partial<FtgState> | ((s: FtgState) => Partial<FtgState>)) => void
type Get = () => FtgState

function advance(set: Set, get: Get): void {
  const { order, resolved, service } = get()
  if (!order) return
  const done = resolved + 1
  if (done >= itemsPerRun(service)) {
    set({ resolved: done })
    finishRun(set, get)
    return
  }
  const index = get().index + 1
  const next = generateOrder(service, tuner.level, index, orderKey(order))
  firstTry = true
  fails = 0
  set({
    order: next,
    index,
    resolved: done,
    selected: [],
    typed: '',
    phase: 'idle',
    mood: 'idle',
    hint: false,
    explainText: '',
  })
  void speakParts(next, newSeq())
}

function finishRun(set: Set, get: Get): void {
  const { service, firstTryCorrect, progress } = get()
  const total = itemsPerRun(service)
  const stars = starsFor(firstTryCorrect, total)
  const updated = applyRun(progress, service, stars)
  const newUnlock = !isUnlocked(progress, service + 1) && isUnlocked(updated, service + 1)
  if (newUnlock) sfx('levelup')
  void pset(STORAGE_KEY, updated)
  set({
    screen: 'end',
    progress: updated,
    newUnlock,
    result: { gameId: GAME_ID, stars, firstTryCorrect, total },
  })
}

/** Feedback élaboratif : recompte ce qu'il y a, puis montre le chemin par la dizaine / centaine. */
async function runExplain(set: Set, get: Get): Promise<void> {
  const { order, selected, typed } = get()
  if (!order) return
  const s = newSeq()
  const total = order.input === 'tap' ? bellyTotal(order, selected) : Number(typed)
  const expected = order.input === 'tap' ? targetOf(order) : order.answer
  sfx('slide')
  set({ phase: 'explain', selected: [], typed: '', mood: 'idle', explainText: `Ça fait ${total}…` })

  await say(E('ftg.ca-fait'), { interrupt: true })
  if (!alive(s)) return
  await say(numberEntry(total), { interrupt: false })
  if (!alive(s)) return
  set({ explainText: `Ça fait ${total}… il en voulait ${expected} !` })
  await say(E('ftg.il-voulait'), { interrupt: false })
  if (!alive(s)) return
  await say(numberEntry(expected), { interrupt: false })

  const q = order.question
  if (q.type === 'complement' && order.explain.length > 0) {
    for (const step of order.explain) {
      if (!alive(s)) return
      set({ explainText: `${step.from} + ${step.add} = ${step.to}` })
      await say(numberEntry(step.from), { interrupt: false })
      if (!alive(s)) return
      await say(E('ftg.plus'), { interrupt: false })
      if (!alive(s)) return
      await say(numberEntry(step.add), { interrupt: false })
      if (!alive(s)) return
      await say(E('ftg.egale'), { interrupt: false })
      if (!alive(s)) return
      await say(numberEntry(step.to), { interrupt: false })
    }
  } else if (order.countBy !== undefined && (q.type === 'times' || q.type === 'howmany')) {
    const k = order.countBy
    const n = q.type === 'times' ? q.n : order.answer
    const parts: number[] = []
    for (let i = 1; i <= n; i++) {
      if (!alive(s)) return
      parts.push(i * k)
      set({ explainText: parts.join(', ') })
      await say(numberEntry(i * k), { interrupt: false })
    }
  }
  if (!alive(s)) return
  set({ phase: 'idle', explainText: '' })
  if (fails >= 2 && !get().hint) {
    set({ hint: true })
    void say(E(order.input === 'tap' ? 'ftg.indice' : 'ftg.indice-pave'), { interrupt: false })
  }
}
