# ENGINE.md — Contrats du moteur V2 (la bible des contributions)

Ce document définit les API internes, les conventions et les lois de game design.
**Toute implémentation doit respecter exactement ces signatures.** Les types
de référence vivent dans `src/engine/types.ts`.

## Contexte

Plateforme de jeux éducatifs 4-7 ans (GS/CP), 100 % client, offline-first,
zéro compte, zéro tracking. Stack : Vite + React 19 + TypeScript strict +
Tailwind 4 + vite-plugin-pwa. Déployée sous `/mesjeuxeducatifs/` (GitHub Pages).
Routing : HashRouter (`#/`, `#/jeu/:id`, `#/parents`).

- Code en anglais, libellés UI en **français** (avec accents corrects).
- Aucun `any`. Aucune dépendance ajoutée sans nécessité absolue.
- Imports via alias `@/` → `src/`.
- Les jeux V1 sont des pages statiques sous `public/v1/` — ne pas y toucher.

## Les 5 lois de game design (non négociables)

1. **Zéro QCM** : l'enfant PRODUIT la réponse (construit, glisse, tape, règle).
   Si un choix est inévitable, distracteurs intelligents (±1, son proche) et
   l'erreur coûte (l'item est compté raté au premier essai).
2. **L'erreur enseigne** : feedback élaboratif — montrer POURQUOI visuellement,
   redonner UN essai dans le même contexte, puis re-poser la notion plus tard
   avec de NOUVELLES valeurs. Jamais le mot « faux », jamais de game over.
   Indice automatique après 2 échecs consécutifs.
3. **Audio-first** : chaque consigne passe par `say()` (clip pré-généré ou
   fallback TTS), bouton réécouter permanent (`SpeakerButton`). Un non-lecteur
   doit être autonome de bout en bout.
4. **Score honnête** : seuls les PREMIERS essais comptent (étoiles, maîtrise).
   `mastery.recordAttempt(skillId, firstTry)` à chaque item. Étoiles d'une
   partie : ≥90 % → 3, ≥70 % → 2, sinon 1. Pas de streaks ni de classement.
5. **Juice obligatoire** : chaque tap rend un son (`sfx('tap')`) + un mouvement
   (animations utilitaires de `index.css`). Célébration proportionnée
   (`FeedbackOverlay`, `ConfettiBurst`, `LevelEnd`).

Ergonomie : cibles tactiles ≥ 64 px (`tap-target`), **interaction principale =
tap-source-puis-tap-destination** (le drag est un bonus optionnel, jamais
requis), information jamais portée par la couleur seule, textes énormes,
classe `game-surface` sur la zone de jeu.

## Structure d'une partie (convention commune)

Un jeu = des « parties » de 8 à 10 items, avec `ProgressDots`, génération
**procédurale** des items (jamais de pool figé mémorisable), `Tuner` pour la
difficulté, `LevelEnd` à la fin. Persistance par jeu via
`pget/pset('game:<gameId>')` : `{ bestStars: number; runs: number; tier: number }`.

---

## src/engine/ — modules (signatures exactes)

### audio.ts

```ts
export function unlockAudio(): void
// Sons synthétisés Web Audio (recettes V1 : oscillateur + enveloppe), aucun fichier
export function sfx(name: SfxName): void
// Joue le clip public/audio/<id>.mp3 s'il est dans audio/manifest.json,
// sinon fallback speechSynthesis fr-FR (rate ~0.85) avec entry.text.
// Resout à la fin de la lecture. interrupt (défaut true) stoppe la lecture en cours.
export function say(entry: CorpusEntry, opts?: { interrupt?: boolean }): Promise<void>
export function stopSpeech(): void
export function preloadClips(ids: string[]): void
```

Le manifest audio est chargé une fois via
`fetch(import.meta.env.BASE_URL + 'audio/manifest.json')` (tolérant : absent
en dev → tout passe en fallback TTS). Clips joués avec Howler.

### storage.ts

```ts
// Clés namespacées au profil actif : 'jayjay:<profileId>:<key>'
export function pget<T>(key: string): Promise<T | undefined>
export function pset<T>(key: string, value: T): Promise<void>
export function pdel(key: string): Promise<void>
// Clés globales : 'jayjay:global:<key>' (registre des profils…)
export function gget<T>(key: string): Promise<T | undefined>
export function gset<T>(key: string, value: T): Promise<void>
// Branché par le store profils — PAS d'import de profiles.ts ici (pas de cycle)
export function setActiveProfileId(id: string | null): void
export function getActiveProfileId(): string | null
// Export/import JSON de toutes les clés jayjay:* (dashboard parent)
export function exportAll(): Promise<string>
export function importAll(json: string): Promise<void>
```

Implémentation : `idb-keyval`. Demander `navigator.storage.persist()` une fois.

### profiles.ts (store zustand)

```ts
export interface ProfileState {
  ready: boolean
  profiles: Profile[]
  activeId: string | null
  init(): Promise<void>          // charge le registre, appelle setActiveProfileId
  create(name: string, emoji: string, ageBand: Profile['ageBand']): Promise<Profile>
  select(id: string): Promise<void>
  remove(id: string): Promise<void>
}
export const useProfiles: UseBoundStore<StoreApi<ProfileState>>
export function activeProfile(): Profile | null   // accès hors React
```

### mastery.ts

```ts
// Logique PURE séparée de l'IO pour les tests :
export function applyAttempt(p: SkillProgress | undefined, ok: boolean, now: number): SkillProgress
export function computeState(p: SkillProgress): MasteryState
// IO (stocké sous pget/pset('mastery') : Record<SkillId, SkillProgress>) :
export function recordAttempt(skillId: SkillId, firstTry: boolean): Promise<void>
export function getSummary(): Promise<Record<SkillId, SkillProgress>>
```

Règles : fenêtre glissante 10 premiers-essais. `decouverte` < 3 tentatives ;
`maitrise` si ≥ 5 tentatives et ≥ 80 % de réussite sur la fenêtre ;
`consolide` si maîtrise et box ≥ 2 ; sinon `en-cours`.
Boîtes Leitner : box+1 quand on atteint maîtrise (révisions J+2, J+7, J+21
dans `nextReview`), box 0 si 2 échecs consécutifs. Révision réussie à
échéance (`now >= nextReview`) → box+1 (plafond 3, box 3 → J+21 à nouveau) ;
depuis la box 0, uniquement si la fenêtre est maîtrisée (anti-livelock après
une rétrogradation qui laisse la fenêtre ≥ 80 %). Une seule promotion par
tentative. **Tests vitest exigés**
sur `applyAttempt`/`computeState` (fichier `mastery.test.ts`, logique pure).

### periods.ts

```ts
export type Period = 1 | 2 | 3 | 4 | 5
export function currentPeriod(d?: Date): Period   // sans argument : date du jour
export const PERIOD_LABELS: Record<Period, string> // « Période 1 · septembre-octobre »…
```

Mapping par mois : sept-oct → P1, nov-déc → P2, janv-févr → P3,
mars-avril → P4, mai-août → P5. Tests vitest exigés (`periods.test.ts`).

### scheduler.ts — le parcours du jour (Leitner cross-jeux)

```ts
export type PickKind = 'revision' | 'fragile' | 'nouvelle'
export interface DailyPick { kind: PickKind; skillId: SkillId; gameId: string }
export interface SchedulerState { lastServed: Record<SkillId, { gameId: string; ts: number }> }
export interface DailyPathInput {
  summary: Record<SkillId, SkillProgress>
  skills: readonly SkillDef[]
  games: readonly GameMeta[]            // jeux v2 uniquement
  now: number
  period: Period
  state?: SchedulerState
  choose?: <T>(arr: readonly T[]) => T  // défaut : pick de rng (injecté en test)
}
export function buildDailyPath(input: DailyPathInput): DailyPick[]  // PURE
export async function getDailyPath(): Promise<DailyPick[]>          // IO
export async function markServed(pick: DailyPick): Promise<void>    // IO ('scheduler')
```

Retour `[fragile?, nouvelle?, revision?]` (max 3) : 1 notion fragile
(`en-cours` au pire ratio, fenêtre ≥ 3), 1 nouvelle (jamais tentée, prérequis
tous maîtrisés, préférence période courante puis gs→cp), 1 révision due
(`nextReview <= now`, la plus en retard). **Exposition variée** : la révision
est servie par un jeu DIFFÉRENT du dernier (`lastServed`). Jamais deux fois le
même skill ni le même jeu quand une alternative existe. Le hub l'affiche via
`src/world/DailyPath.tsx` — une suggestion, jamais une contrainte.
Tests vitest exigés sur `buildDailyPath` (`scheduler.test.ts`).

### adaptive.ts

```ts
export class Tuner {
  constructor(opts: { min: number; max: number; start?: number })
  get level(): number
  onResult(ok: boolean): 'up' | 'down' | 'same'  // 3 réussites consécutives → up, 2 échecs consécutifs → down
  reset(): void
}
```

Tests vitest exigés (`adaptive.test.ts`).

### session.ts

```ts
export function touchSession(): void          // appelé par GameShell au montage
export function sessionMinutes(): number      // minutes de jeu cumulées (sessionStorage)
export function shouldSuggestBreak(): boolean // true au-delà de ~15 min, une seule fois
export function markBreakSuggested(): void
```

### rng.ts

```ts
export function randInt(min: number, max: number): number  // bornes incluses
export function pick<T>(arr: readonly T[]): T
export function shuffle<T>(arr: readonly T[]): T[]
```

---

## src/ui/ — kit de composants

```tsx
// Chrome standard de TOUT jeu v2 : barre haute (retour #/, icône+titre,
// slot hud à droite), unlockAudio au premier pointerdown, touchSession(),
// rituel de pause (BreakRitual) quand shouldSuggestBreak() à la fin d'une partie.
<GameShell meta={GameMeta} hud={ReactNode?} onReplayInstruction={(() => void)?}>…</GameShell>

<BigButton onClick variant?='primary'|'soft'|'accent' accent?=string disabled? className?>…</BigButton>
<NumPad value={string} onChange={(v: string) => void} onValidate={() => void} maxLen?={number} />
<Mascot mood?='idle'|'happy'|'cheer'|'thinking' size?={number} />   // Plume 🦜
<SpeakerButton entry={CorpusEntry} autoPlay?={boolean} size?='md'|'lg' />
<FeedbackOverlay kind={'success'|'retry'|null} message?={string} onDone={() => void} />
<ConfettiBurst burst={number} />        // tire quand burst s'incrémente
<StarMeter value={number} max?={number} />
<ProgressDots total={number} done={number} />
<LevelEnd result={LevelResult} onReplay={() => void} onHome={() => void} />
<ParentGate onPass={() => void} onCancel={() => void} />  // « 7 × 3 ? » au NumPad
```

`FeedbackOverlay success` : sfx('correct') + mini-confettis + message positif
aléatoire (« Bravo ! », « Super ! »…) avec `say()` des clips `ui.*` du corpus
commun. `retry` : sfx('wrong') doux + shake-soft + « Presque ! Essaie encore. »
**Jamais le mot « faux ».**

## src/world/ — le shell Archipel

- `Hub.tsx` : en-tête (titre, Mascot, sélecteur de profil, lien ⚙️ Parents),
  sections par île (`ISLANDS` du manifest) : carte d'île (emoji, nom, tagline,
  accent) puis grille de `GameCard` — jeux v2 d'abord (badge « Nouveau ! »),
  classiques ensuite (badge « classique », lien direct `href`).
  Premier lancement sans profil → `ProfileSetup` (création : prénom + emoji +
  tranche d'âge 4-5/6-7, gros boutons, tout audio-guidé).
- `GamePage.tsx` : meta via `GAMES_BY_ID`, v2 → composant lazy de
  `V2_COMPONENTS` dans `<Suspense>`, inconnu → redirect `/`.
- `ParentsPage.tsx` : `ParentGate` puis dashboard : par domaine
  (`DOMAIN_LABELS`), chaque compétence du `SKILL_MAP` avec pastille d'état
  (gris=découverte, jaune=en cours, vert=maîtrisé, vert foncé=consolidé) via
  `getSummary()`, minutes de session, export/import JSON (storage), gestion
  des profils, charte (« zéro pub, zéro compte, données sur la tablette »),
  remise à zéro avec confirmation.
- `BreakRitual.tsx` : overlay plein écran doux — Mascot, clip `ui.fin-session`,
  boutons « Encore un peu » / « À bientôt ! 👋 » (retour hub).

## Corpus audio (voix pré-générées)

Chaque jeu déclare `src/games/<id>/corpus.json` :

```json
{
  "voice-default": "denise",
  "entries": [
    { "id": "<gameId-court>.consigne.intro", "text": "Écoute le mot…", "voice": "eloise" }
  ]
}
```

- ids : `^[a-z0-9][a-z0-9.-]*$`, préfixés par le jeu (`tds.`, `rp.`, `gdx.`,
  `fdn.`, `mae.`, `ptm.`, phase 2 : `chl.`, `mfo.`, `bsc.`, `cav.`, `bma.`,
  `rlu.`, `ban.`, phase 3 : `gho.`, `cdp.`, `apx.`, `mav.`, `mds.`, `eng.`,
  `lde.`, `oda.`, phase 4 : `flx.`, `lma.`, `pzf.`) ; clips communs :
  préfixe `ui.` (corpus-common.json),
  nombres : `nombre.0` à `nombre.100` (via `numberEntry()` de
  `src/content/numbers.ts`).
- Voix : `denise` (consignes, défaut), `eloise` (mascotte/enfant), `henri`
  (gags), `sonia` (en-GB — uniquement pour le contenu anglais d'English
  Island).
- `python scripts/generate-audio.py` génère `public/audio/<id>.mp3` + manifest.
- Dans le code, importer le JSON et passer l'entrée à `say()` :

```ts
import corpus from './corpus.json'
const C = Object.fromEntries(corpus.entries.map(e => [e.id, e])) // helper local
await say(C['tds.consigne.intro'])
```

## Enregistrer un jeu v2

1. Dossier `src/games/<id>/` : `index.tsx` (default export), `logic.ts`
   (génération procédurale + validation, PURE), `logic.test.ts` (vitest),
   `corpus.json`.
2. Entrée dans `GAMES` + `V2_COMPONENTS` de `src/games.manifest.ts` (déjà fait
   pour les 6 jeux du MVP, les 7 jeux de la phase 2, les 8 jeux de la
   phase 3 et les 3 jeux de la phase 4).
3. Les pages SEO statiques (`public/jeux/`, `public/competences/`) sont
   régénérées automatiquement au build (`scripts/generate-seo.mjs`, Node 24).
3. Compétences exercées : ids du `SKILL_MAP` (`src/content/skill-map.ts`).

## Design

Tokens dans `src/index.css` (`--color-paper`, `--color-ink`, `--color-lagoon-*`,
`--color-coral`, `--color-sun`, `--color-leaf`, `--color-grape`, `--color-sky`,
`card`, `tap-target`, animations `animate-pop|wiggle|floaty|bounce-in|shake-soft`).
Univers : archipel chaleureux, fond papier crème, cartes blanches arrondies,
emojis pour toute l'iconographie (zéro asset image). Typo Nunito (chargée).
Mobile-first 375 px, doit être superbe en tablette paysage ET portrait.
