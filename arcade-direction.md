# Direction artistique « Arcade » — piste 3D de L'Archipel

Bible de la piste **arcade** (jeux 3D, React Three Fiber, 7-8 ans / CE1-CE2). Elle est **distincte** de
`art-direction.md`, qui reste la référence de tous les jeux V2/V3 (album jeunesse, DOM/CSS, zéro 3D).
Un jeu porte `tag: 'arcade'` dans le manifest : c'est lui, et lui seul, qui obéit à cette bible.

Premier jeu : « Le Food-Truck des Gloutons » — scénario dans `arcade/food-truck-gloutons/SCENARIO.md`.

## 1. Intention

Donner à l'enfant de 7-8 ans la sensation d'un **vrai jeu vidéo** (scène 3D, caméra, personnages animés,
progression par actes, boss, collection) sans rien lâcher de la rigueur pédagogique : les 5 lois d'ENGINE.md
s'appliquent intégralement (zéro QCM, l'erreur enseigne, audio-first, score honnête, juice).

Ce que l'enfant doit ressentir : « c'est un jeu de console », « je fais partie de l'histoire », « je progresse ».
Ce qu'on refuse : chrono punitif, game over, vies, classement, boutique, pub, texte à lire pour comprendre.

## 2. Style visuel

- **3D stylisée jouet** : low-poly doux, silhouettes rondes, arêtes adoucies, proportions « figurine ».
- **Matériaux mats** : `roughness ≥ 0.5`, `metalness 0`, jamais de reflets miroir ni de plastique brillant
  (référence : gouache de la bible V3, transposée en volume). Aucun photoréalisme.
- **Lumière** : une directionnelle chaude (fin de matinée), ombres douces bornées, hémisphérique ciel/sol.
  Une seule source de lumière lisible, comme sur les illustrations V3 (haut-gauche).
- **Composition** : le comptoir et les aliments au centre-bas (zone d'interaction), le glouton client au
  centre, le truck derrière, le décor de l'île en fond flou/fog. Trois plans maximum.
- **Fond** : le papier crème `#fdf6ec` reste visible (canvas alpha) ; le décor ne couvre jamais la zone du HUD.
- **Références** : Pikmin Bloom (rondeur, lisibilité), Animal Crossing (chaleur, personnages), Overcooked
  (lisibilité des commandes), Tearaway (matière papier / carton).

## 3. Palette

Celle de l'Archipel (tokens de `src/index.css`) — aucune couleur nouvelle hors dominante d'acte :

- papier `#fdf6ec` · sable `#f7e8d0` · encre `#1e3a4c` (jamais de noir pur) · encre douce `#4a6b80`
- lagon `#5fd3c8` / `#14a098` · corail `#ff7866` · soleil `#ffc94d` · feuille `#58c472`
- raisin `#9b7ede` (Gloup, gloutons) · ciel `#5ab8f5` · truck : orange `#ff8a3d` + crème

Dominante par acte : plage = ciel + sable · marché = corail · port = lagon · fête = soleil (soir) ·
volcan = raisin + nuit `#2b1b4d` (lave douce corail, jamais menaçante).

## 4. Personnages

- **Gloup** (mascotte-copilote) : même silhouette que le Glouton CSS de `src/games/gloutons-du-dix/Glouton.tsx`
  — patate violette `#9b7ede`, yeux blancs énormes à pupilles encre `#2b1b4d`, bouche ronde, ventre clair.
  Toque de chef blanche. Quatre états : `idle` (respiration), `eat` (mâche), `happy` (yeux ^ ^, saut),
  `oops` (hoquet, yeux plissés — déception douce, jamais de larmes).
- **Gloutons clients** : même famille (couleurs raisin / lagon / corail / soleil), tailles croissantes par
  acte (petits sur la plage, dockers au port, ancestral au volcan). Un accessoire régional par acte
  (lunettes de soleil, panier, casquette de docker, chapeau de fête, couronne de mousse).
- Exception à la règle V3 « zéro personnage IA » : la piste arcade **génère** les personnages par IA
  (image → 3D → rig), mais avec une fiche personnage validée par vote enfant et une seule version de
  référence. Si une génération diverge, on régénère l'image avec la référence en entrée ; on n'aligne
  jamais le jeu sur une image incohérente.

## 5. Nombres et texte

- **Aucun texte ni chiffre incrusté** dans les images ou modèles générés.
- Les nombres sont rendus par le moteur, en DOM (Nunito 800, ≥ 28 px, encre sur papier), jamais dans le canvas.
- La numération est **physique** : unité = brochette (1 à 9 boulettes), dizaine = caisse de 10, centaine =
  grande caisse de 100, paquet = boîte de n. On voit toujours ce qu'on a servi.

## 6. Pipeline d'assets (Higgsfield CLI `higgs`, jamais le MCP en production)

Génération = acte d'atelier, jamais une étape de build. Sources brutes dans `assets-src/` (gitignoré),
dérivés optimisés commités dans `public/arcade/<jeu>/`.

1. **Concept** : `gpt_image_2_5` (1k, quality medium), planches sans texte. Vote enfant.
2. **Fiche personnage** : turnaround 3 vues (face, 3/4, profil) sur fond uni, `medias` = concept validé.
3. **3D** : `tripo_h3_1_multiview_to_3d` (ou `_image_to_3d`), `pbr: true`, `quad: false`, `face_limit` bas ;
   `higgs generate cost` avant chaque appel.
4. **Rig + animations** : `3d_rigging` (`model_url`, `enable_animation`, actions idle / eat / happy / oops).
5. **Ingestion** : `scripts/arcade-ingest.mjs` (gltf-transform : dedup, prune, simplify, textures webp ≤ 1024²,
   meshopt — jamais Draco) ; renommage des clips vers `idle | eat | happy | oops`.
6. **Repli** : sprite PNG alpha (`image_background_remover`) en billboard, ou géométrie procédurale.

### Bloc de style maître (à préfixer à tout prompt concept)

```
Stylized 3D toy-like render for a children's video game (ages 7-8), soft low-poly shapes, rounded edges,
matte materials (no gloss, no metal, no photorealism), warm single key light from top-left with soft shadows,
gentle fog on the horizon, cream paper background tone #fdf6ec, palette: lagoon teal #5fd3c8, coral #ff7866,
sun yellow #ffc94d, leaf green #58c472, grape purple #9b7ede, sky blue #5ab8f5, ink #1e3a4c (never pure black).
No text, no letters, no numbers, no logos, no watermark.
```

Négatif : `photorealistic, glossy, metallic, dark, scary, sharp teeth, blood, text, letters, numbers, logo,
watermark, blurry, cluttered`.

## 7. Budgets

- Chunk JS arcade (three + R3F + drei sélectif + jeu) : ≤ 300 Ko gzip, chargé uniquement pour le jeu.
- Assets par jeu arcade : ≤ 6 Mo, ≤ 3 Mo par fichier (précache Workbox), GLB meshopt, textures webp ≤ 1024².
- Rendu tablette : dpr ≤ 1.5, < 50 draw calls, < 150 k triangles, pas de post-processing, 60 fps iPad /
  ≥ 30 fps Android milieu de gamme.
- Cibles tactiles ≥ 64 px à l'écran (hit-mesh invisible plus large que l'objet).
