import { Color, MeshStandardMaterial } from 'three'

// Matériaux mats partagés par couleur (arcade-direction.md §2) : jamais mutés, un par teinte.
const cache = new Map<string, MeshStandardMaterial>()

export function mat(hex: string, opts: { roughness?: number; emissive?: string } = {}): MeshStandardMaterial {
  const key = `${hex}|${opts.roughness ?? 0.6}|${opts.emissive ?? ''}`
  let m = cache.get(key)
  if (!m) {
    m = new MeshStandardMaterial({
      color: new Color(hex),
      roughness: opts.roughness ?? 0.6,
      metalness: 0,
      ...(opts.emissive ? { emissive: new Color(opts.emissive), emissiveIntensity: 0.55 } : {}),
    })
    cache.set(key, m)
  }
  return m
}

export const PALETTE = {
  paper: '#fdf6ec',
  sand: '#f7e8d0',
  ink: '#1e3a4c',
  inkDeep: '#2b1b4d',
  lagoon: '#5fd3c8',
  lagoonDeep: '#14a098',
  coral: '#ff7866',
  sun: '#ffc94d',
  leaf: '#58c472',
  grape: '#9b7ede',
  sky: '#5ab8f5',
  truck: '#ff8a3d',
  cream: '#f5efe3',
  wood: '#d9a066',
  woodDark: '#b5763f',
  meatball: '#a35a2a',
  white: '#ffffff',
  cheek: '#f0a0b8',
} as const
