// ============================================================
// Store des profils enfants (zustand).
// Registre persistant en clés globales :
//   gget/gset('profiles')        -> Profile[]
//   gget/gset('activeProfileId') -> string | null
// C'est CE store qui branche storage.setActiveProfileId().
// ============================================================

import { create as createStore } from 'zustand'
import type { StoreApi, UseBoundStore } from 'zustand'
import { delMany, keys } from 'idb-keyval'
import type { Profile } from '@/engine/types'
import { gget, gset, setActiveProfileId } from '@/engine/storage'

export interface ProfileState {
  ready: boolean
  profiles: Profile[]
  activeId: string | null
  init(): Promise<void>
  create(name: string, emoji: string, ageBand: Profile['ageBand']): Promise<Profile>
  select(id: string): Promise<void>
  remove(id: string): Promise<void>
}

const REGISTRY_KEY = 'profiles'
const ACTIVE_KEY = 'activeProfileId'

/** Id court url-safe, ex: 'k3f9q2'. Collision quasi impossible (< 10 profils). */
function shortId(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-2)
}

/** Supprime toutes les clés 'jayjay:<profileId>:*' (progrès, scores…). */
async function wipeProfileData(profileId: string): Promise<void> {
  const prefix = `jayjay:${profileId}:`
  const allKeys = await keys()
  const doomed = allKeys.filter(
    (k): k is string => typeof k === 'string' && k.startsWith(prefix),
  )
  if (doomed.length > 0) await delMany(doomed)
}

export const useProfiles: UseBoundStore<StoreApi<ProfileState>> = createStore<ProfileState>()(
  (set, get) => ({
    ready: false,
    profiles: [],
    activeId: null,

    async init() {
      const profiles = (await gget<Profile[]>(REGISTRY_KEY)) ?? []
      const savedId = (await gget<string | null>(ACTIVE_KEY)) ?? null
      const activeId =
        savedId !== null && profiles.some((p) => p.id === savedId)
          ? savedId
          : (profiles[0]?.id ?? null)
      setActiveProfileId(activeId)
      set({ ready: true, profiles, activeId })
    },

    async create(name, emoji, ageBand) {
      const profile: Profile = {
        id: shortId(),
        name: name.trim(),
        emoji,
        ageBand,
        createdAt: Date.now(),
      }
      const profiles = [...get().profiles, profile]
      await gset(REGISTRY_KEY, profiles)
      await gset(ACTIVE_KEY, profile.id)
      setActiveProfileId(profile.id)
      set({ profiles, activeId: profile.id })
      return profile
    },

    async select(id) {
      if (!get().profiles.some((p) => p.id === id)) return
      await gset(ACTIVE_KEY, id)
      setActiveProfileId(id)
      set({ activeId: id })
    },

    async remove(id) {
      const profiles = get().profiles.filter((p) => p.id !== id)
      const activeId =
        get().activeId === id ? (profiles[0]?.id ?? null) : get().activeId
      await gset(REGISTRY_KEY, profiles)
      await gset(ACTIVE_KEY, activeId)
      await wipeProfileData(id)
      setActiveProfileId(activeId)
      set({ profiles, activeId })
    },
  }),
)

/** Profil actif, accessible HORS React (moteur, storage helpers…). */
export function activeProfile(): Profile | null {
  const { profiles, activeId } = useProfiles.getState()
  return profiles.find((p) => p.id === activeId) ?? null
}
