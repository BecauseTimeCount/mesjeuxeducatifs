// ============================================================
// Persistance locale (IndexedDB via idb-keyval).
// Toutes les clés sont préfixées 'jayjay:' :
//   - par profil : 'jayjay:<profileId>:<key>' ('anon' sans profil actif)
//   - globales   : 'jayjay:global:<key>' (registre des profils…)
// AUCUN import de profiles.ts ici : le store profils nous branche
// via setActiveProfileId() (pas de cycle de dépendances).
// ============================================================

import { del, get, getMany, keys, set, setMany } from 'idb-keyval'

const PREFIX = 'jayjay:'

let activeProfileId: string | null = null

export function setActiveProfileId(id: string | null): void {
  activeProfileId = id
}

export function getActiveProfileId(): string | null {
  return activeProfileId
}

function profileKey(key: string): string {
  return `${PREFIX}${activeProfileId ?? 'anon'}:${key}`
}

function globalKey(key: string): string {
  return `${PREFIX}global:${key}`
}

// Demande la persistance du stockage UNE fois, au premier écrit.
// Best effort : certains navigateurs refusent ou ne supportent pas.
let persistAsked = false
function askPersistence(): void {
  if (persistAsked) return
  persistAsked = true
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => undefined)
    }
  } catch {
    // best effort, on continue sans persistance garantie
  }
}

// ---------- Clés liées au profil actif ----------

export function pget<T>(key: string): Promise<T | undefined> {
  return get<T>(profileKey(key))
}

export function pset<T>(key: string, value: T): Promise<void> {
  askPersistence()
  return set(profileKey(key), value)
}

export function pdel(key: string): Promise<void> {
  return del(profileKey(key))
}

// ---------- Clés globales ----------

export function gget<T>(key: string): Promise<T | undefined> {
  return get<T>(globalKey(key))
}

export function gset<T>(key: string, value: T): Promise<void> {
  askPersistence()
  return set(globalKey(key), value)
}

// ---------- Export / import JSON (dashboard parent) ----------

/** Exporte toutes les clés 'jayjay:*' en un seul objet JSON (string). */
export async function exportAll(): Promise<string> {
  const allKeys = await keys()
  const ours = allKeys.filter(
    (k): k is string => typeof k === 'string' && k.startsWith(PREFIX),
  )
  const values = await getMany<unknown>(ours)
  const out: Record<string, unknown> = {}
  ours.forEach((k, i) => {
    out[k] = values[i]
  })
  return JSON.stringify(out)
}

/** Réinjecte une sauvegarde produite par exportAll(). Valide le format. */
export async function importAll(json: string): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Fichier illisible : ce n’est pas du JSON valide.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Sauvegarde invalide : un objet JSON est attendu.')
  }
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.some(([k]) => !k.startsWith(PREFIX))) {
    throw new Error('Sauvegarde invalide : clés inconnues (préfixe « jayjay: » attendu).')
  }
  askPersistence()
  await setMany(entries.map(([k, v]): [string, unknown] => [k, v]))
}
