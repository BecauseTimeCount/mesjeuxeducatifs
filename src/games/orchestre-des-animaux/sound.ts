// ============================================================
// Timbres Web Audio des 6 animaux-musiciens — module local au jeu.
// Un AudioContext PARESSEUX, créé au premier appel (le GameShell a
// déjà déverrouillé l'audio au premier pointerdown). Enveloppes
// courtes, attaque anti-clic, volumes doux (~0.3 max).
// ============================================================

import type { AnimalId } from './logic'

let ctx: AudioContext | null = null

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

/** Gain avec attaque 10 ms (anti-clic) puis décroissance exponentielle. */
function envelope(c: AudioContext, start: number, dur: number, vol: number): GainNode {
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  gain.connect(c.destination)
  return gain
}

/** 🐸 Grenouille : onde carrée grave et courte, petit « coâ » descendant. */
function frog(c: AudioContext, t: number): void {
  const osc = c.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(190, t)
  osc.frequency.exponentialRampToValueAtTime(130, t + 0.16)
  const gain = envelope(c, t, 0.2, 0.16)
  osc.connect(gain)
  osc.start(t)
  osc.stop(t + 0.25)
}

/** 🐦 Oiseau : sinus aigu avec glissando montant puis retombée — un pépiement. */
function bird(c: AudioContext, t: number): void {
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1250, t)
  osc.frequency.exponentialRampToValueAtTime(2100, t + 0.1)
  osc.frequency.exponentialRampToValueAtTime(1500, t + 0.24)
  const gain = envelope(c, t, 0.28, 0.16)
  osc.connect(gain)
  osc.start(t)
  osc.stop(t + 0.33)
}

/** 🐘 Éléphant : dent de scie TRÈS grave adoucie au passe-bas — un barrissement sourd. */
function elephant(c: AudioContext, t: number): void {
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(75, t)
  osc.frequency.exponentialRampToValueAtTime(58, t + 0.4)
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(380, t)
  const gain = envelope(c, t, 0.45, 0.3)
  osc.connect(filter)
  filter.connect(gain)
  osc.start(t)
  osc.stop(t + 0.5)
}

/** 🐱 Chat : sinus médium avec vibrato (LFO sur la fréquence) — un miaou chantant. */
function cat(c: AudioContext, t: number): void {
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(440, t)
  const lfo = c.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(7, t)
  const lfoGain = c.createGain()
  lfoGain.gain.setValueAtTime(22, t)
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  const gain = envelope(c, t, 0.38, 0.18)
  osc.connect(gain)
  osc.start(t)
  lfo.start(t)
  osc.stop(t + 0.43)
  lfo.stop(t + 0.43)
}

/** 🐒 Singe au tambour : bruit percussif (noise burst) filtré passe-bande grave. */
function monkeyDrum(c: AudioContext, t: number): void {
  const len = Math.floor(c.sampleRate * 0.15)
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const source = c.createBufferSource()
  source.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(180, t)
  filter.Q.setValueAtTime(0.9, t)
  const gain = envelope(c, t, 0.14, 0.32)
  source.connect(filter)
  filter.connect(gain)
  source.start(t)
  source.stop(t + 0.16)
}

/** 🦆 Canard : carrée nasillarde au passe-bande serré, petit « coin » descendant. */
function duck(c: AudioContext, t: number): void {
  const osc = c.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(310, t)
  osc.frequency.exponentialRampToValueAtTime(220, t + 0.18)
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(620, t)
  filter.Q.setValueAtTime(3.5, t)
  const gain = envelope(c, t, 0.22, 0.26)
  osc.connect(filter)
  filter.connect(gain)
  osc.start(t)
  osc.stop(t + 0.27)
}

const RECIPES: Readonly<Record<AnimalId, (c: AudioContext, t: number) => void>> = {
  grenouille: frog,
  oiseau: bird,
  elephant: elephant,
  chat: cat,
  singe: monkeyDrum,
  canard: duck,
}

/** Joue le timbre d'un animal. Sans coût si l'audio n'est pas disponible. */
export function playAnimal(id: AnimalId): void {
  const c = ensureCtx()
  if (!c) return
  if (c.state === 'suspended') {
    void c.resume().catch(() => undefined)
  }
  RECIPES[id](c, c.currentTime)
}
