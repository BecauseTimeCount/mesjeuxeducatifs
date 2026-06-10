# Bible graphique — L'Archipel (V3)

> Document de référence pour TOUT asset visuel généré ou dessiné à partir de la phase 5.
> Règle d'or : **un asset hors-style est rejeté, jamais « retouché »**. On régénère.
> Stratégie actée (2026-06-10) : hybride IA + SVG — décors et objets illustrés par IA,
> personnages récurrents en SVG riggé. Rendu DOM/CSS conservé, PixiJS écarté.

---

## 1. L'intention

Un archipel dessiné comme un **album jeunesse** : gouache numérique douce, formes rondes,
lumière chaude de fin d'après-midi, papier crème qui respire. Référence de niveau
d'exécution : Khan Academy Kids. Référence d'atmosphère : les albums de Marianne Dubuc
(« Le lion et l'oiseau ») et le jeu *Tearaway* pour le côté papier.

Trois interdits absolus, quel que soit l'asset :

- **Zéro texte incrusté** dans l'image (lettres, chiffres, panneaux écrits) — tout texte
  est porté par l'UI, jamais par l'asset.
- **Zéro personnage récurrent généré par IA** — Plume, les gloutons, la fée, Goutte, le
  marchand… sont des SVG riggés maison (cohérence d'une frame à l'autre impossible en IA).
- **Zéro photoréalisme, zéro 3D brillante** — on est dans l'illustration peinte, mate.

## 2. La palette maîtresse

C'est la palette des tokens CSS (`src/index.css`). Toute image générée doit vivre dedans.

- Papier (fond universel) : `#fdf6ec`
- Sable : `#f7e8d0`
- Encre (traits, valeurs sombres) : `#1e3a4c` — JAMAIS de noir pur
- Encre douce : `#4a6b80`
- Lagon : `#5fd3c8` / `#14a098` / `#0e7490`
- Corail : `#ff7866` / `#e85d4a`
- Soleil : `#ffc94d` / `#f0a818`
- Feuille : `#58c472` / `#3a9e54`
- Raisin : `#9b7ede`
- Ciel : `#5ab8f5`

### Déclinaison par île

Chaque île a UNE dominante (l'accent du manifest), UNE couleur de soutien, et la lumière
commune. Le reste de la palette n'apparaît qu'en touches.

- **Île aux Sons** (`sons`) — dominante corail `#ff7866`, soutien sable `#f7e8d0`,
  ambiance : village musical chaleureux, guirlandes, bois peint.
- **Île aux Nombres** (`nombres`) — dominante ciel `#5ab8f5`, soutien lagon `#5fd3c8`,
  ambiance : port de marché en bord de lagon, étals, caisses, balances.
- **Île des Robots** (`robots`) — dominante feuille `#58c472`, soutien encre douce
  `#4a6b80`, ambiance : jungle d'inventeurs, rouages en bois, lianes câblées.
- **Île du Monde** (`monde`) — dominante soleil `#ffc94d`, soutien feuille `#3a9e54`,
  ambiance : volcan paisible, prairies, ciel changeant (heures, saisons, eau).
- **Île d'Ailleurs** (`ailleurs`) — dominante raisin `#9b7ede`, soutien corail `#ff7866`,
  ambiance : crépuscule doux, lampions, ponton de départ vers le large.

## 3. Les règles de forme

- **Rondeur** : aucun angle vif. Collines, toits, rochers, nuages : tout est galet.
  Les objets ont des coins très arrondis (l'équivalent visuel de `border-radius: 1.5rem`).
- **Trait** : pas de contour noir « cartoon ». Soit aucun contour (aplats qui se touchent),
  soit un contour du même ton plus foncé (ex. corail bordé de `#e85d4a`).
- **Ombres** : une seule source de lumière, chaude, venant du haut-gauche. Ombres douces,
  colorées (encre `#1e3a4c` à ~15 % d'opacité), jamais grises ni dures.
- **Texture** : un léger grain de papier/gouache est bienvenu, uniforme sur tout l'asset.
- **Profondeur** : 3 plans max (avant-plan / sujet / lointain), le lointain désaturé
  vers le papier `#fdf6ec` (brume claire, pas de noir).
- **Densité** : un décor doit rester un FOND : zone centrale calme et peu contrastée pour
  que les objets de jeu et le texte UI restent lisibles dessus.

## 4. Les prompts de référence (génération IA)

### Le bloc de style maître (à préfixer à TOUT prompt de décor)

```text
Children's picture-book illustration, soft matte digital gouache, rounded gentle
shapes with no sharp angles, no outlines or same-hue darker outlines only, single
warm light from upper left, soft colored shadows, subtle paper grain, background
fading to warm cream #fdf6ec, calm uncluttered central area, flat perspective
slightly from above, cozy and warm, for young children aged 4 to 7.
No text, no letters, no numbers, no watermark, no humans, no photorealism, no 3D render.
```

### Le négatif (modèles qui le supportent : `--negative`)

```text
text, letters, numbers, watermark, signature, photo, 3D, glossy, neon, harsh shadows,
black outlines, cluttered, scary, dark
```

### Prompts décors de hub (un par île — validés sur planches d'essai)

- `nombres` : bloc maître + `A small harbour market on a turquoise lagoon island,
  wooden stalls with awnings in sky blue #5ab8f5 and lagoon teal #5fd3c8, crates,
  rope, a brass balance scale, distant sailboat, wide open sky.`
- `sons` : bloc maître + `A cheerful seaside village of painted wooden houses in
  coral #ff7866 and cream, paper garlands between rooftops, a small bandstand,
  hanging bells and wind chimes, sandy paths.`
- `robots` : bloc maître + `A friendly inventors' jungle workshop, leaf green #58c472
  foliage, big wooden gears and pulleys woven into trees, soft glowing lanterns,
  winding plank walkways.`
- `monde` : bloc maître + `A peaceful round volcano island with golden meadows
  #ffc94d, terraced fields, a small lighthouse, drifting clouds, a winding river
  to the sea.`
- `ailleurs` : bloc maître + `A gentle twilight pier with paper lanterns in soft
  purple #9b7ede and coral, a small wooden canoe ready to sail, first stars,
  calm sea reflecting warm lights.`

### Prompts objets de jeu (fond transparent ou détourable)

Bloc maître + description de l'objet seul + :

```text
single object centered on plain warm cream #fdf6ec background, no scene, no floor
shadow beyond a soft oval, generous margins.
```

(Le détourage se fait au post-traitement — voir `scripts/generate-art.md`.)

### Règles d'usage des prompts

- On ne modifie JAMAIS le bloc maître pour un asset isolé. S'il faut le faire évoluer,
  on met à jour CE document et on régénère les planches d'essai.
- Un prompt validé est figé ici avec son modèle. Régénérer un asset = même prompt,
  même modèle.
- Générateur par défaut : `nano-banana-pro` (`google/gemini-3-pro-image-preview` via
  OpenRouter) — provisoire jusqu'au vote famille sur les planches d'essai
  (`public/art/_palette/essais/`).

## 5. Les personnages (SVG riggé, jamais IA)

Acteurs récurrents : Plume (mascotte), les gloutons, la fée de la balance, Goutte,
le marchand et ses clients, les animaux de l'orchestre.

- Construits en SVG avec **groupes nommés** : `head`, `eyes`, `eyelids`, `beak`/`mouth`,
  `body`, `wings`/`arms`, `tail`. Animés en CSS (transform-origin posés sur chaque groupe).
- États communs pilotés par le composant : `idle | happy | cheer | thinking | oops`
  (l'état `oops` est une déception DOUCE — jamais de larmes, jamais d'effroi).
- Anatomie commune : têtes rondes et grosses (~40 % de la hauteur), yeux énormes
  (blanc + pupille encre), aplats de la palette maîtresse, aucun contour noir.
- Gabarit de référence : **Plume 2.0** (`src/ui/Mascot.tsx`) — palette : corps lagon
  `#14a098`, ventre crème `#fdf6ec`, aile corail `#ff7866`, bec soleil `#ffc94d`,
  plumes de queue corail/soleil/raisin (Plume porte les couleurs de l'archipel).
- Budget : un personnage = un composant < 300 lignes, zéro dépendance.

## 6. Gabarits d'export

- **Décor de jeu ou d'île** : 1600×900 (16:9), webp qualité ~75, **≤ 60 Ko**.
  Si > 60 Ko à q75 : simplifier l'image (moins de détails), pas monter la compression.
- **Objet de jeu** : 512×512, webp avec alpha (détouré), qualité ~80, **≤ 15 Ko**.
- **Vignette / carte** : 640×360, webp q75, ≤ 25 Ko.
- **Naming** : `<île>.<jeu>.<asset>.webp` — ex. `nombres.gloutons-du-dix.fond.webp`,
  `nombres.hub.decor.webp` (le « jeu » `hub` désigne l'écran d'archipel).
- **Emplacement** : `public/art/<île>/` (versionné). Les sources brutes (png générés)
  ne sont PAS commitées : seul le webp final l'est.
- **Manifest** : tout asset livré est déclaré dans `src/content/art.manifest.ts` —
  c'est lui qui type l'accès aux assets et alimente le précache par île.

## 7. Budgets de poids (garde-fous CI)

- Un jeu re-skinné = décor + 6-10 objets ≤ **250 Ko** de nouveaux assets.
- Précache PWA total < **60 Mo**, audio compris.
- Vérification : `node scripts/check-weight.mjs` (lancé à la main et en CI).

## 8. Procédure de validation d'un asset

1. Générer 2-4 candidats (même prompt, même modèle, seeds différentes).
2. Post-traiter le meilleur (recadrage, webp — voir `scripts/generate-art.md`).
3. Contrôle bible : palette de l'île ? rondeur ? zéro texte ? zone centrale calme ?
   Au moindre doute → rejet et régénération.
4. **Vote enfant** : c'est lui qui tranche entre les finalistes (le labo UX vit à la
   maison). Un asset qui plaît moins que l'emoji actuel → on itère l'asset.
5. Commit du webp + entrée dans `art.manifest.ts`.

## 9. Décisions ouvertes

- ⏳ Choix définitif du générateur : vote famille sur les planches de
  `public/art/_palette/essais/` (même prompt `nombres`, modèles différents).
- ⏳ Grain de papier : appliqué à la génération (dans le prompt) ou en overlay CSS
  commun ? À trancher au moment du hub illustré (phase 6).
