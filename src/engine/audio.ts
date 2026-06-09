// ============================================================
// Moteur audio : SFX synthétisés (Web Audio), voix pré-générées
// (Howler + public/audio/manifest.json) et fallback TTS fr-FR.
// Robustesse mobile : unlockAudio() au premier geste (iOS/Android),
// reprise de contexte suspendu, amorce speechSynthesis dans le geste.
// ============================================================

import { Howl } from 'howler'
import type { CorpusEntry, SfxName } from '@/engine/types'

declare global {
  interface Window {
    /** Vieux Safari/WebKit : AudioContext préfixé */
    webkitAudioContext?: typeof AudioContext
  }
}

// ------------------------------------------------------------
// Contexte Web Audio (SFX)
// ------------------------------------------------------------

let ctx: AudioContext | null = null
let unlocked = false

function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? window.webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

/**
 * À appeler au premier pointerdown (GameShell s'en charge).
 * Idempotent : crée/reprend l'AudioContext, joue un buffer silencieux
 * (déverrouille la sortie iOS) et amorce speechSynthesis dans le geste.
 */
export function unlockAudio(): void {
  const c = ensureContext()
  if (c && c.state === 'suspended') {
    void c.resume().catch(() => undefined)
  }
  if (unlocked) return
  unlocked = true
  if (c) {
    try {
      // Buffer silencieux d'1 échantillon : déverrouille la sortie audio iOS.
      const buffer = c.createBuffer(1, 1, 22050)
      const source = c.createBufferSource()
      source.buffer = buffer
      source.connect(c.destination)
      source.start(0)
    } catch {
      // tant pis, resume() suffira sur la plupart des appareils
    }
  }
  if (hasTts()) {
    try {
      // Amorce le TTS pendant le geste utilisateur (exigence iOS).
      const primer = new SpeechSynthesisUtterance(' ')
      primer.volume = 0
      window.speechSynthesis.speak(primer)
    } catch {
      // best effort
    }
    ensureVoices()
  }
}

// ------------------------------------------------------------
// SFX synthétisés — recettes oscillateur + enveloppe exponentielle
// ------------------------------------------------------------

/** Note simple : attaque 15 ms (anti-clic) puis décroissance exponentielle. */
function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  vol: number,
  type: OscillatorType = 'sine',
): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

/** Glissando de fréquence (pop montant, slide descendant…). */
function glide(
  c: AudioContext,
  from: number,
  to: number,
  start: number,
  dur: number,
  vol: number,
): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(from, start)
  osc.frequency.exponentialRampToValueAtTime(to, start + dur)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.03)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(start)
  osc.stop(start + dur + 0.08)
}

/** Souffle filtré (recette V1) : dent de scie + passe-bas qui s'ouvrent. */
function whoosh(c: AudioContext, start: number): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  const filter = c.createBiquadFilter()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(200, start)
  osc.frequency.exponentialRampToValueAtTime(800, start + 0.3)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(500, start)
  filter.frequency.exponentialRampToValueAtTime(2000, start + 0.3)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4)
  osc.connect(filter)
  filter.connect(gain)
  gain.connect(c.destination)
  osc.start(start)
  osc.stop(start + 0.45)
}

/** Joue un effet sonore court. Sans coût si l'audio n'est pas disponible. */
export function sfx(name: SfxName): void {
  const c = ensureContext()
  if (!c) return
  if (c.state === 'suspended') {
    void c.resume().catch(() => undefined)
  }
  const t = c.currentTime
  switch (name) {
    case 'tap':
      // Petit toc doux et neutre
      tone(c, 620, t, 0.07, 0.18)
      break
    case 'correct':
      // Arpège majeur montant, joyeux : do5 mi5 sol5 do6
      tone(c, 523.25, t, 0.16, 0.28, 'triangle')
      tone(c, 659.25, t + 0.09, 0.16, 0.28, 'triangle')
      tone(c, 783.99, t + 0.18, 0.18, 0.28, 'triangle')
      tone(c, 1046.5, t + 0.27, 0.32, 0.24, 'triangle')
      break
    case 'wrong':
      // Double note descendante DOUCE (sol4 → mib4) — jamais punitive
      tone(c, 392.0, t, 0.2, 0.12)
      tone(c, 311.13, t + 0.16, 0.32, 0.1)
      break
    case 'levelup':
      // Montée éclatante : do5 mi5 sol5 puis do6 tenu
      tone(c, 523.25, t, 0.12, 0.3, 'triangle')
      tone(c, 659.25, t + 0.1, 0.12, 0.3, 'triangle')
      tone(c, 783.99, t + 0.2, 0.12, 0.3, 'triangle')
      tone(c, 1046.5, t + 0.3, 0.42, 0.34, 'triangle')
      break
    case 'whoosh':
      whoosh(c, t)
      break
    case 'coin':
      // Ding métallique bref : si5 puis mi6 qui résonne + harmonique
      tone(c, 987.77, t, 0.09, 0.12, 'square')
      tone(c, 1318.51, t + 0.08, 0.32, 0.1, 'square')
      tone(c, 2637.02, t + 0.08, 0.18, 0.05)
      break
    case 'pop':
      // Bulle qui éclate : mini-glissando montant
      glide(c, 420, 900, t, 0.09, 0.26)
      break
    case 'slide':
      // Glissement doux descendant
      glide(c, 540, 320, t, 0.22, 0.14)
      break
    case 'fanfare':
      // Petite fanfare 5 notes : sol4 do5 mi5 sol5, do6 final en accord
      tone(c, 392.0, t, 0.12, 0.26, 'triangle')
      tone(c, 523.25, t + 0.13, 0.12, 0.26, 'triangle')
      tone(c, 659.25, t + 0.26, 0.12, 0.26, 'triangle')
      tone(c, 783.99, t + 0.39, 0.16, 0.28, 'triangle')
      tone(c, 1046.5, t + 0.56, 0.5, 0.3, 'triangle')
      tone(c, 659.25, t + 0.56, 0.5, 0.16, 'triangle')
      break
    case 'magic':
      // Scintillement montant (pentatonique) + étincelle finale
      tone(c, 783.99, t, 0.16, 0.14)
      tone(c, 987.77, t + 0.055, 0.16, 0.14)
      tone(c, 1174.66, t + 0.11, 0.16, 0.14)
      tone(c, 1567.98, t + 0.165, 0.16, 0.14)
      tone(c, 1975.53, t + 0.22, 0.16, 0.14)
      tone(c, 2637.02, t + 0.3, 0.4, 0.08)
      break
  }
}

// ------------------------------------------------------------
// Manifest des clips pré-générés (public/audio/manifest.json)
// ------------------------------------------------------------

function parseManifest(data: unknown): Set<string> {
  let raw: unknown[] = []
  if (Array.isArray(data)) {
    raw = data
  } else if (data !== null && typeof data === 'object' && 'ids' in data && Array.isArray(data.ids)) {
    raw = data.ids
  }
  return new Set(raw.filter((x): x is string => typeof x === 'string'))
}

let manifestPromise: Promise<Set<string>> | null = null

/** Charge le manifest UNE fois. Tolérant : absent/invalide → Set vide (tout en TTS). */
function loadManifest(): Promise<Set<string>> {
  manifestPromise ??= fetch(`${import.meta.env.BASE_URL}audio/manifest.json`)
    .then(async (res) => {
      if (!res.ok) return new Set<string>()
      const data: unknown = await res.json()
      return parseManifest(data)
    })
    .catch(() => new Set<string>())
  return manifestPromise
}

// ------------------------------------------------------------
// Clips Howler — cache LRU (max ~30 instances décodées)
// ------------------------------------------------------------

const MAX_HOWLS = 30
const howlCache = new Map<string, Howl>()
let currentHowl: Howl | null = null

function clipUrl(id: string): string {
  return `${import.meta.env.BASE_URL}audio/${id}.mp3`
}

function getHowl(id: string): Howl {
  const cached = howlCache.get(id)
  if (cached) {
    // Rafraîchit l'ordre LRU (Map ordonnée par insertion)
    howlCache.delete(id)
    howlCache.set(id, cached)
    return cached
  }
  const howl = new Howl({ src: [clipUrl(id)] })
  howlCache.set(id, howl)
  if (howlCache.size > MAX_HOWLS) {
    for (const [oldId, old] of howlCache) {
      if (old !== currentHowl) {
        howlCache.delete(oldId)
        old.unload()
        break
      }
    }
  }
  return howl
}

/** Joue un clip ; résout à la fin (ou à l'interruption). false = échec → fallback TTS. */
function playClip(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    const howl = getHowl(id)
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      howl.off('end', onEnd)
      howl.off('stop', onStop)
      howl.off('loaderror', onError)
      howl.off('playerror', onError)
      if (currentHowl === howl) currentHowl = null
      resolve(ok)
    }
    const onEnd = (): void => finish(true)
    // stop() = interruption volontaire : la lecture est finie, pas de fallback
    const onStop = (): void => finish(true)
    const onError = (): void => {
      // Clip cassé/introuvable : on l'évince pour permettre un nouvel essai plus tard
      howlCache.delete(id)
      finish(false)
      howl.unload()
    }
    howl.on('end', onEnd)
    howl.on('stop', onStop)
    howl.on('loaderror', onError)
    howl.on('playerror', onError)
    currentHowl = howl
    howl.play()
  })
}

// ------------------------------------------------------------
// Fallback TTS (speechSynthesis fr-FR)
// ------------------------------------------------------------

function hasTts(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

let ttsVoice: SpeechSynthesisVoice | null = null
let voicesHooked = false

function normalizeLang(lang: string): string {
  return lang.toLowerCase().replace('_', '-')
}

function refreshVoice(): void {
  const voices = window.speechSynthesis.getVoices()
  const french = voices.filter((v) => normalizeLang(v.lang).startsWith('fr'))
  if (french.length === 0) return
  const score = (v: SpeechSynthesisVoice): number =>
    (normalizeLang(v.lang).startsWith('fr-fr') ? 4 : 0) +
    (v.localService ? 2 : 0) +
    (/natural|neural|premium|enhanced|google|am[ée]lie|thomas|audrey|denise/i.test(v.name) ? 1 : 0)
  ttsVoice = [...french].sort((a, b) => score(b) - score(a))[0] ?? null
}

/** Sélectionne une voix fr de qualité ; getVoices() est asynchrone sur Chrome/Android. */
function ensureVoices(): void {
  if (voicesHooked || !hasTts()) return
  voicesHooked = true
  refreshVoice()
  try {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoice)
  } catch {
    // vieux navigateurs sans EventTarget sur speechSynthesis
  }
}

function speakText(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!hasTts() || text.trim() === '') {
      resolve()
      return
    }
    ensureVoices()
    const synth = window.speechSynthesis
    try {
      // Chrome peut rester bloqué en "paused" après une mise en veille
      synth.resume()
    } catch {
      // best effort
    }
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'fr-FR'
    utter.rate = 0.85
    if (ttsVoice) utter.voice = ttsVoice
    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      resolve()
    }
    utter.onend = done
    utter.onerror = done
    // Filet de sécurité : certains moteurs TTS restent muets sans événement
    window.setTimeout(done, 2000 + text.length * 200)
    synth.speak(utter)
  })
}

// ------------------------------------------------------------
// API voix
// ------------------------------------------------------------

/**
 * Joue le clip pré-généré `<entry.id>.mp3` s'il figure dans le manifest,
 * sinon lit `entry.text` en TTS fr-FR (rate 0.85).
 * Résout à la FIN de la lecture. `interrupt` (défaut true) stoppe
 * d'abord toute lecture en cours (clip ET TTS).
 */
export async function say(entry: CorpusEntry, opts?: { interrupt?: boolean }): Promise<void> {
  const interrupt = opts?.interrupt ?? true
  if (interrupt) stopSpeech()
  const manifest = await loadManifest()
  if (manifest.has(entry.id)) {
    const ok = await playClip(entry.id)
    if (ok) return
  }
  await speakText(entry.text)
}

/** Stoppe immédiatement clip Howler et TTS en cours. */
export function stopSpeech(): void {
  if (currentHowl) {
    const playing = currentHowl
    currentHowl = null
    playing.stop() // déclenche 'stop' → résout la promesse de say() en cours
  }
  if (hasTts()) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // best effort
    }
  }
}

/** Précharge (fetch + décodage) les clips listés, s'ils existent dans le manifest. */
export function preloadClips(ids: string[]): void {
  void loadManifest().then((manifest) => {
    for (const id of ids) {
      if (manifest.has(id)) getHowl(id)
    }
  })
}
