import { useCallback, useEffect, useRef, useState } from 'react'
import { say } from '@/engine/audio'
import type { CorpusEntry } from '@/engine/types'

export interface SpeakerButtonProps {
  entry: CorpusEntry
  /** Joue l'entrée au montage (après un court délai, échec autoplay toléré). */
  autoPlay?: boolean
  size?: 'md' | 'lg'
}

const SIZE_CLASSES: Record<NonNullable<SpeakerButtonProps['size']>, string> = {
  md: 'h-16 w-16 text-3xl',
  lg: 'h-[88px] w-[88px] text-4xl',
}

/** Bouton rond 🔊 : rejoue la consigne, pulse pendant la lecture. */
export function SpeakerButton({ entry, autoPlay = false, size = 'md' }: SpeakerButtonProps) {
  const [playing, setPlaying] = useState(false)
  const alive = useRef(true)
  const entryRef = useRef(entry)

  useEffect(() => {
    entryRef.current = entry
  })

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const speak = useCallback((e: CorpusEntry): void => {
    setPlaying(true)
    say(e)
      .catch(() => undefined) // autoplay bloqué ou clip absent : on reste silencieux
      .finally(() => {
        if (alive.current) setPlaying(false)
      })
  }, [])

  useEffect(() => {
    if (!autoPlay) return
    const t = window.setTimeout(() => speak(entryRef.current), 450)
    return () => window.clearTimeout(t)
  }, [autoPlay, speak])

  return (
    <button
      type="button"
      onClick={() => speak(entry)}
      aria-label="Écouter la consigne"
      className={`tap-target flex items-center justify-center rounded-full bg-white shadow-card transition-transform active:scale-95 ${playing ? 'animate-pulse-glow' : ''} ${SIZE_CLASSES[size]}`}
    >
      <span aria-hidden="true" className={playing ? 'animate-wiggle' : ''}>
        🔊
      </span>
    </button>
  )
}
