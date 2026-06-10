# Pipeline assets illustrés — recettes (pas d'API au build)

> La génération IA est un acte d'ATELIER, jamais une étape de build. Le build ne voit
> que des webp commités dans `public/art/` et déclarés dans `src/content/art.manifest.ts`.
> Le style est verrouillé par `art-direction.md` — le lire AVANT toute génération.

## La chaîne complète

```text
1. Prompt (bible §4)  →  2. Génération (OpenRouter)  →  3. Choix du candidat
→  4. Détourage si objet  →  5. art-to-webp.mjs  →  6. Contrôle visuel + vote enfant
→  7. art.manifest.ts  →  8. check-weight.mjs  →  9. commit
```

## 1-2. Générer (OpenRouter, clé `OPENROUTER_API_KEY`)

Via le script du skill `openrouter-imagegen` (ou tout client OpenRouter) :

```bash
node ~/.claude/skills/openrouter-imagegen/scripts/generate-image.mjs \
  --prompt "<bloc maître §4> <prompt de l'asset>" \
  --negative "text, letters, numbers, watermark, signature, photo, 3D, glossy, neon, harsh shadows, black outlines, cluttered, scary, dark" \
  --aspect 16:9 \
  --model nano-banana-pro \
  --output /tmp/art/<nom>.png
```

- Modèle par défaut : `nano-banana-pro` (provisoire — vote famille en cours sur
  `public/art/_palette/essais/`).
- Décor : `--aspect 16:9`. Objet : `--aspect 1:1`.
- Générer 2 à 4 candidats (relancer ; les seeds varient seules).
- Les png sources restent HORS du dépôt (dossier temporaire) : seul le webp final
  est commité.

## 3-4. Choisir et détourer

- Choix au regard de la bible : palette de l'île, rondeur, lumière haut-gauche,
  zéro texte, zone centrale calme. **Au moindre doute : rejet, régénération** —
  on ne retouche pas un asset hors-style.
- Objets : détourage du fond crème (rembg, ou la gomme magique de n'importe quel
  éditeur — le fond uni `#fdf6ec` demandé par le prompt rend l'opération triviale).
  Exporter en png avec alpha avant l'étape 5.

## 5. Convertir au gabarit

```bash
node scripts/art-to-webp.mjs --in /tmp/art/<nom>.png \
  --out public/art/<île>/<île>.<jeu>.<asset>.webp --type decor   # ou object | card
```

Le script redimensionne, encode en webp et ÉCHOUE si le budget du gabarit est
dépassé (décor 60 Ko, objet 15 Ko, vignette 25 Ko). En cas de dépassement :
simplifier l'image à la source, ne pas monter la compression.

## 6. Contrôle visuel + vote enfant

Afficher le webp final sur tablette, dans le contexte du jeu si possible
(flag visuel `artV3` de l'espace parents). Les finalistes passent au vote enfant ;
s'il préfère l'emoji actuel, on itère l'asset.

## 7. Déclarer dans le manifest

Ajouter l'entrée dans `src/content/art.manifest.ts` (chemin, type, île, jeu).
C'est le manifest qui type l'accès aux assets et alimentera le précache par île.

## 8-9. Vérifier les budgets et commiter

```bash
node scripts/check-weight.mjs   # budgets 250 Ko/jeu et 60 Mo précache
pnpm build                      # toujours vert avant commit
git add public/art src/content/art.manifest.ts && git commit
```
