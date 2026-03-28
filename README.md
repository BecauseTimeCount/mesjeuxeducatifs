# Mes Jeux Educatifs

**29 mini-jeux gratuits, sans pub et sans tracking, couvrant l'integralite du programme CP francais.**

> 100% navigateur. Zero installation. Zero compte. PWA installable sur tablette et telephone.

---

## Pourquoi ce projet ?

Les apps educatives pour enfants sont souvent bourrées de pubs, de trackers et d'achats in-app. Ce projet prend le contre-pied : des jeux **simples, legers et respectueux** — juste du HTML, du CSS et du JavaScript.

Pas de serveur, pas de base de données, pas de cookies. Les scores sont sauvegardés localement dans le navigateur. **Aucune donnée ne quitte jamais l'appareil.**

## Les 29 jeux par matiere

### Francais (7 jeux)

| Jeu | Description | Competences |
|-----|-------------|-------------|
| **Trouve la Lettre** | Retrouve la bonne lettre parmi les propositions | Reconnaissance des lettres, alphabet |
| **Premiere Lettre** | Trouve par quelle lettre commence le mot | Conscience phonologique |
| **Les Syllabes** | Decompose et recompose des mots en syllabes | Conscience syllabique, pre-lecture |
| **Mots et Images** | Associe les mots a leurs images | Lecture, vocabulaire |
| **Le Train des Mots** | Assemble les syllabes en wagons pour former des mots | Decodage, fluence |
| **La Dictee des Sons** | Ecoute un son et trouve le bon grapheme | Encodage, correspondances phonemes-graphemes |
| **Qui Parle ?** | Comprends les textes et identifie les personnages | Comprehension, inferences, chaine anaphorique |
| **La Machine a Phrases** | Construis des phrases et trie les mots | Grammaire, classes de mots, accords |

### Mathematiques (7 jeux)

| Jeu | Description | Competences |
|-----|-------------|-------------|
| **Calcul Aventure** | Additions, soustractions et multiplications | Calcul mental, numeration |
| **La Fabrique de Nombres** | Construis et decompose les dizaines et unites | Valeur positionnelle, decomposition |
| **Le P'tit Marchand** | Reconnais les pieces, paye et rends la monnaie | Monnaie, euros |
| **Le Bar a Schemas** | Resous des problemes avec des diagrammes en barres | Modelisation, problemes parties-tout |
| **Robot Quadrillage** | Programme un robot pour atteindre le tresor | Codage de deplacement, reperage spatial |
| **Le Miroir Pixel** | Complete le symetrique et reproduis des motifs | Symetrie axiale, reproduction sur quadrillage |
| **Pixel Art Geometrique** | Reproduis des figures geometriques en pixels | Reproduction, geometrie, observation |

### Explorer le Monde (7 jeux)

| Jeu | Description | Competences |
|-----|-------------|-------------|
| **Le Temps qui Passe** | Decouvre les heures et les moments de la journee | Lecture de l'heure, reperage temporel |
| **Ma Semaine en Ordre** | Apprends les jours, mois et saisons | Reperage temporel, chronologie |
| **La Journee de Leo** | Associe heures et activites quotidiennes | Frise chronologique, heures |
| **Le Plan de l'Ecole** | Repere-toi dans l'ecole avec gauche et droite | Reperage spatial, lecture de plan |
| **Le Restaurant des Animaux** | Sers le bon repas a chaque animal | Regimes alimentaires, classification |
| **L'Eau Magique** | Decouvre les 3 etats de l'eau | Matiere, transformations, cycle de l'eau |
| **Le Jardin des Emotions** | Reconnais les emotions et leurs reactions | EMC, emotions, vivre ensemble |

### Logique (2 jeux)

| Jeu | Description | Competences |
|-----|-------------|-------------|
| **Suite Logique** | Complete des sequences de formes et couleurs | Logique, observation, patterns |
| **Sudoku des Petits** | Grilles de sudoku adaptees aux enfants | Raisonnement, logique spatiale |

### Anglais & Arts (5 jeux)

| Jeu | Description | Competences |
|-----|-------------|-------------|
| **Hello English!** | Couleurs, nombres, animaux en anglais | Anglais pre-A1, vocabulaire oral |
| **Colour Catcher** | Attrape les ballons de la bonne couleur en anglais | Anglais, couleurs, nombres, action |
| **Simon Says** | Jacques a dit en anglais avec les parties du corps | Anglais, body parts, ecoute |
| **Le Chef d'Orchestre** | Rythme, instruments et volumes avec des animaux musiciens | Education musicale, rythme, timbres |
| **L'Atelier des Couleurs** | Melange les couleurs primaires et peins | Arts plastiques, theorie des couleurs |

## Comment utiliser ?

### Option 1 — En ligne (recommande)
Rendez-vous sur **[mesjeuxeducatifs](https://becausetimecount.github.io/mesjeuxeducatifs/)** et c'est parti.

Sur tablette ou telephone, ajoutez la page a l'ecran d'accueil pour une experience d'application native (PWA installable).

### Option 2 — Hors-ligne
1. Telechargez le projet (bouton vert **Code** > **Download ZIP**)
2. Decompressez le dossier
3. Ouvrez `index.html` dans un navigateur

Ca marche aussi sans internet.

## Fonctionnalites

- **29 jeux** couvrant 7 matieres du programme CP
- **PWA installable** — fonctionne comme une application sur tablette et telephone
- **Multi-profils** — plusieurs enfants peuvent jouer chacun avec leur profil
- **Progression sauvegardee** — scores et niveaux debloques conserves automatiquement
- **Hub par categories** — filtrez les jeux par matiere (Francais, Maths, Explorer le Monde, Logique, Anglais & Arts)
- **4 niveaux par jeu** — difficulte progressive avec deblocage
- **100% offline** — fonctionne sans connexion apres le premier chargement
- **Responsive** — teste sur iPhone SE, Galaxy Fold, iPad, desktop
- **Feedback positif** — jamais de "faux", encouragements et animations bienveillantes
- **Consignes audio** — TTS pour les jeux de lecture et de langues

## Architecture technique

- **Zero dependance** — pas de framework, pas de build, pas de node_modules
- **1 fichier = 1 jeu** — chaque jeu est un fichier HTML autonome (~40-60 Ko)
- **CSS inline** — tout est embarque, aucun fichier externe sauf Google Fonts
- **Web Audio API** — sons synthetises, aucun fichier audio
- **localStorage** — persistence locale, aucune donnee en ligne
- **PWA** — manifest.json + service worker avec cache-first

## Philosophie

- **Zero tracking** — aucun analytics, aucun cookie, aucune donnee envoyee nulle part
- **Zero pub** — jamais de publicite, jamais d'achat in-app
- **Zero compte** — pas d'inscription, pas de mail, rien a configurer
- **Open source** — le code est lisible, modifiable et reutilisable

## Couverture du programme CP

Ce projet couvre les 7 matieres du programme officiel du CP francais (BO 2024 pour le francais et les maths, BO 2020 pour les autres matieres) :

- **Francais** : lecture, phonologie, ecriture, grammaire, comprehension
- **Mathematiques** : calcul, numeration, geometrie, grandeurs et mesures, resolution de problemes
- **Questionner le monde** : temps, espace, vivant, matiere
- **EMC** : emotions, vivre ensemble
- **Education musicale** : rythme, timbres, intensite
- **Arts plastiques** : couleurs, creation
- **Langues vivantes** : anglais pre-A1

## Contribuer

Les contributions sont les bienvenues ! Que ce soit pour :
- Proposer de nouveaux jeux ou niveaux
- Ameliorer l'accessibilite
- Corriger des bugs
- Ajouter du contenu pedagogique

Ouvrez une issue ou une pull request.

## Licence

MIT — Utilisez, modifiez et partagez librement.

---

*Fait avec amour par un parent developpeur pour son enfant et tous les autres.*
