# Mes Jeux Éducatifs — L'Archipel (V2)

**Des jeux éducatifs gratuits, sans pub, sans compte et sans tracking, pour les enfants français de 4 à 7 ans (GS, CP).**

> 100 % navigateur. Zéro installation. Zéro donnée qui quitte la tablette.
> PWA installable, fonctionne hors ligne. Alignés sur les programmes officiels 2025.

🎮 **Jouer : [becausetimecount.github.io/mesjeuxeducatifs](https://becausetimecount.github.io/mesjeuxeducatifs/)**

---

## Pourquoi ce projet ?

Les apps éducatives pour enfants sont souvent bourrées de pubs, de trackers et d'achats
intégrés — et depuis 2025, plus aucun outil **gratuit** n'ajuste la difficulté à l'enfant.
Ce projet prend le contre-pied : un site fait par un parent développeur, pour ses enfants
et tous les autres, où chaque jeu applique cinq lois simples :

1. **Zéro QCM** — l'enfant *produit* la réponse : il construit, assemble, règle, tape.
   Le hasard ne rapporte jamais de points.
2. **L'erreur enseigne** — pas de « faux », pas de game over : le jeu *montre* pourquoi
   (le train déraille en relisant ce que tu as construit, le glouton recompte les baies).
3. **Audio d'abord** — toutes les consignes sont dites par une vraie voix française :
   un enfant qui ne sait pas lire est autonome de bout en bout.
4. **Score honnête** — seuls les premiers essais comptent. Pas de streaks, pas de
   classement, pas de « reviens demain ».
5. **Et c'est un jeu, un vrai** — du rythme, des animations, des personnages, et un
   contenu généré à l'infini (jamais deux fois le même puzzle).

## Les jeux

### Nouveaux jeux V2 (l'Archipel)

- **🤖 Robo-Pilote** — programme un robot jusqu'au trésor : flèches, obstacles, et blocs
  « répéter ×3 » obligatoires au dernier palier (pré-code, repérage spatial). Avec un
  atelier où l'enfant construit ses propres labyrinthes pour faire jouer les parents.
- **🚂 Le Train des Syllabes** — phonologie 100 % auditive : écoute le mot, scande-le au
  tambour, assemble les wagons-syllabes… et tire le sifflet : le train lit *vraiment* ce
  que tu as construit (et déraille comiquement si c'est faux). Pseudo-mots et manipulation
  de syllabes du programme GS 2025.
- **🪄 Les Gloutons du Dix** — des créatures voraces n'avalent que le compte exact :
  décompositions des nombres, compléments à 10 et doubles deviennent un puzzle physique.
- **🏗️ La Fabrique de Nombres** — fabrique les commandes avec barres de dix et cubes, et
  surtout la *Machine* qui casse une barre en 10 cubes (et soude 10 cubes en barre) :
  l'équivalence d'échange enfin manipulée. Défis « fabrique 43 avec seulement 3 barres ».
- **⌨️ La Machine à Écrire Magique** — écoute un son, une syllabe, un mot… et écris-le
  sur un clavier de graphèmes (une touche = un son : « ch », « ou », « an »). La machine
  relit ce que tu as écrit. Suit le tempo graphémique officiel du CP.
- **🏪 Le P'tit Marchand** — des clients-animaux commandent à voix haute : paie le compte
  exact, rends la monnaie, additionne deux articles de tête. Chaque réussite agrandit la
  boutique.

### Les 28 jeux classiques (V1)

Toujours là, servis tels quels : Calcul Aventure, Trouve la Lettre, Les Syllabes,
La Dictée des Sons, Qui Parle ?, Sudoku des Petits, Le Plan de l'École, L'Eau Magique,
Hello English!… Ils seront refondus ou fusionnés vague après vague (voir
[v2-proposition.md](v2-proposition.md)).

## Pour les parents

- **Carte de compétences** : l'espace parents (derrière une petite multiplication) montre
  où en est l'enfant, compétence par compétence, avec les libellés officiels des
  programmes 2025 (BO du 31/10/2024).
- **Multi-profils** : chaque enfant de la fratrie a son profil et sa progression.
- **Vos données restent chez vous** : tout est stocké dans la tablette (IndexedDB).
  Export/import JSON pour changer d'appareil. Aucun compte, aucun serveur, aucun cookie.
- **Sessions courtes** : au bout d'un quart d'heure, la mascotte propose gentiment de
  conclure — conforme aux repères écrans officiels.

## Architecture technique

- **Vite + React 19 + TypeScript strict + Tailwind 4** — moteur commun (audio, profils,
  maîtrise par compétence, répétition espacée, difficulté adaptative) écrit une fois,
  testé (vitest), partagé par tous les jeux.
- **Voix pré-générées** : ~550 clips TTS neuronal (edge-tts, voix Denise et Eloise)
  servis en statique et précachés — fallback Web Speech si un clip manque.
  Régénération : `pnpm audio`. Revue à l'oreille : page `audio-check.html`.
- **Génération procédurale testée** : chaque jeu embarque ses générateurs et leurs
  validateurs (solvabilité prouvée par les tests — plus jamais d'item impossible).
- **PWA offline-first** : Workbox précache l'application entière, jeux V1 et audio
  compris. Installable sur tablette et téléphone.
- **Zéro backend, zéro coût** : GitHub Pages + Actions. Le site peut tourner dix ans
  sans facture.

## Développer

```bash
pnpm install
pnpm dev        # serveur de dev
pnpm test       # tests (moteur + logique des jeux)
pnpm build      # typecheck + build production
pnpm audio      # régénère les clips TTS depuis les corpus (Python + edge-tts)
```

Ajouter un jeu : un dossier `src/games/<id>/` (composant + `logic.ts` testé +
`corpus.json`) et une entrée dans `src/games.manifest.ts`. Les contrats d'API et les
lois de game design sont dans [ENGINE.md](ENGINE.md).

**Contribuer sans coder** : les corpus (listes de mots, problèmes, voix) sont des
fichiers JSON — une PR de contenu suffit.

## Philosophie

- **Zéro tracking** — aucun analytics, aucun cookie, aucune donnée envoyée nulle part
- **Zéro pub** — jamais de publicité, jamais d'achat intégré
- **Zéro compte** — rien à créer, rien à configurer
- **Open source** — MIT : utilisez, modifiez, partagez

---

*Fait avec amour par un parent développeur pour ses enfants — et tous les autres.*
