# Mes Jeux Éducatifs — V2 « L'Archipel »

workspace_slug: jayjay

Plateforme de jeux éducatifs pour enfants français de 4 à 7 ans (GS/CP).
100 % gratuit, zéro pub, zéro compte, zéro tracking, offline-first.
Vision produit et catalogue : voir `v2-proposition.md`. Contrats d'API : `ENGINE.md`.

## Stack

- Vite 6 + React 19 + TypeScript strict + Tailwind 4 (`@tailwindcss/vite`)
- PWA : `vite-plugin-pwa` (Workbox, autoUpdate) — PAS de sw.js manuel
- Persistance : IndexedDB via `idb-keyval`, clés `jayjay:<profileId>:<key>`
- Audio : clips mp3 pré-générés (edge-tts) + fallback Web Speech ; SFX synthétisés Web Audio
- Routing : HashRouter (`#/`, `#/jeu/:id`, `#/parents`) — robuste sur GitHub Pages
- Déployé sous `/mesjeuxeducatifs/` (GitHub Pages, workflow Actions sur main)
- Package manager : **pnpm**

## Commandes

- `pnpm dev` — serveur de dev
- `pnpm build` — tsc -b + vite build (à vérifier avant tout commit)
- `pnpm test` — vitest (moteur + logique des jeux)
- `pnpm audio` — régénère les clips TTS depuis les corpus (`scripts/generate-audio.py`)
- `pnpm icons` — régénère les icônes PWA depuis `public/icons/icon.svg`

## Structure

- `src/engine/` — moteur : audio, storage, profils, maîtrise, adaptatif, session
- `src/ui/` — kit de composants (GameShell, NumPad, Mascot, FeedbackOverlay…)
- `src/world/` — hub Archipel, pages, profils, dashboard parents
- `src/games/<id>/` — un dossier par jeu v2 : `index.tsx`, `logic.ts` (pur, testé), `corpus.json`
- `src/games.manifest.ts` — LA source unique (jeux, îles) ; ajouter un jeu = une entrée ici
- `src/content/` — skill-map (compétences BO 2025), corpus commun, helpers nombres
- `public/v1/` — les 28 jeux V1 servis tels quels (NE PAS modifier, retrait progressif)
- `public/audio/` — clips mp3 générés + manifest.json (commités)

## Règles spécifiques au projet

- Les 5 lois de game design d'ENGINE.md sont non négociables (zéro QCM,
  l'erreur enseigne, audio-first, score honnête au premier essai, juice).
- Libellés UI en français AVEC accents ; jamais le mot « faux » face à l'enfant.
- Cibles tactiles ≥ 64 px ; interaction principale tap-source/tap-destination.
- Toute consigne passe par `say()` (clip ou fallback TTS) — autonomie non-lecteur.
- Après modification d'un corpus : `pnpm audio` puis commit des mp3.
- Tests obligatoires sur la logique pure (`logic.ts`) de chaque jeu.
- Ne jamais réintroduire de scoring « garanti » (pas de point après erreur).
