# Contribuer à Mes Jeux Éducatifs

Merci ! Ce site est un projet personnel offert à tous : 100 % gratuit, zéro pub,
zéro compte, zéro tracking. Les contributions les plus utiles ne demandent
**aucune compétence en programmation** : ce sont des fichiers de contenu.

## La règle d'or : une contribution = une PR de JSON

L'essentiel du contenu pédagogique vit dans des fichiers de données :

- `src/games/<jeu>/corpus.json` — les textes dits à voix haute (consignes,
  feedbacks). Chaque entrée : `{ "id": "prefixe.nom", "text": "…", "voice": "denise" }`.
- `src/games/mots-de-la-semaine/words.ts` — les imagiers thématiques GS
  (mot avec article + emoji), 10 mots par thème.
- `src/games/fluence-express/words.ts` — mots déchiffrables, gabarits de
  phrases et textes de lecture chronométrée.
- `src/games/train-des-syllabes/words.ts` — mots découpés en syllabes pour la
  phonologie auditive.
- `src/content/skill-map.ts` — la carte des compétences (libellés officiels
  des programmes 2025, BO n°41 du 31/10/2024).

Corriger un mot, enrichir un imagier, proposer un meilleur gabarit de problème :
ouvrez une PR qui ne touche que ces fichiers, elle sera relue rapidement.

## Ce qui est non négociable (les 5 lois)

Toute contribution respecte la charte d'`ENGINE.md` :

1. **Zéro QCM** : l'enfant produit la réponse (construit, règle, trace, tape).
2. **L'erreur enseigne** : jamais le mot « faux », jamais de game over ;
   montrer pourquoi, redonner un essai, re-poser plus tard.
3. **Audio d'abord** : toute consigne passe par `say()` — un non-lecteur de
   4 ans doit être autonome.
4. **Score honnête** : seuls les premiers essais comptent. Pas de streaks,
   pas de classement.
5. **Juice obligatoire** : chaque interaction rend un son et un mouvement.

Libellés en français **avec accents**. Cibles tactiles ≥ 64 px.

## Contribuer du contenu pas à pas

1. Forkez le dépôt, créez une branche (`contenu/imagier-la-mer` par exemple).
2. Modifiez le fichier de contenu concerné.
3. Si vous avez touché un `corpus.json` : les ids sont en
   `prefixe.kebab-case` (`^[a-z0-9][a-z0-9.-]*$`), préfixés par le jeu.
   Inutile de générer les mp3 — le mainteneur lance `pnpm audio` au merge
   (en attendant, le texte sert de secours vocal automatique).
4. Vérifiez : `pnpm test` (les corpus et banques de mots sont couverts par
   des tests d'intégrité).
5. Ouvrez la PR en décrivant la source pédagogique si pertinent (programme
   officiel, manuel, usage en classe ou en cabinet).

## Contribuer du code

- Lisez `ENGINE.md` (contrats du moteur) et `CLAUDE.md` (conventions).
- Un jeu = un dossier `src/games/<id>/` : `index.tsx`, `logic.ts` **pur et
  testé** (`logic.test.ts`, vitest), `corpus.json` — plus une entrée dans
  `src/games.manifest.ts` (la source unique).
- `pnpm build` et `pnpm test` doivent passer. TypeScript strict, zéro `any`.
- La génération de contenu est **procédurale** (jamais de pool figé
  mémorisable) et validée (solvabilité, unicité).

## Signaler un problème

Une issue claire avec le jeu, le niveau, et ce qui s'est passé suffit.
Les retours d'enseignants, d'orthophonistes et de parents sont précieux —
dites-nous ce que l'enfant a compris de travers, c'est la meilleure
information pédagogique qui existe.
