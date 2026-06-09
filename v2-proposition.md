# JayJay V2 — Proposition de refonte

> Document de référence de la V2, issu d'un audit complet des 29 jeux V1, d'une recherche
> marché/programmes officiels/UX enfants/stack (juin 2026), et de la synthèse de trois visions
> concurrentes (pédagogie, game design, produit). Statut : proposition à valider.

---

## 1. Le verdict de l'audit V1

29 jeux audités un par un. Note moyenne : ~2,8/5. Verdicts : 0 jeu à garder tel quel,
24 à refondre en mieux, 5 à fusionner, 0 à abandonner.

La lecture d'ensemble est claire : **la base pédagogique est excellente** (couverture complète du
programme CP, mapping BO, philosophie zéro pub/zéro compte/offline unique sur le marché), mais
**l'exécution ludique est le maillon faible**. Les trois quarts du catalogue sont des QCM habillés :
l'enfant choisit parmi 3 réponses au lieu de produire la réponse.

### Failles systémiques relevées

- **Progression factice sur ~10 jeux** : après une erreur, le bouton fautif se grise mais le point
  est quand même accordé au clic suivant. Par élimination, le 10/10 est garanti — les étoiles, les
  seuils de déblocage et le score du hub ne mesurent rien.
- **Bug bloquant — Le P'tit Marchand** : la palette de monnaie plafonne à 4,40 € ; tout article
  plus cher est impayable et le jeu se soft-lock (~4 questions sur 10 du niveau 2 insolubles).
  À corriger en V1 sans attendre la V2.
- **Bug — La Machine à Phrases niveau 4** : le verbe affiché est auto-accordé au sujet et la
  validation compare cette même formule → « Valider » est toujours correct, zéro apprentissage.
- **Fuite inter-profils** : `pixelArtFreeCreations` n'est pas dans le registre des clés → les
  créations fuient d'un profil à l'autre et survivent aux resets.
- **Le meilleur jeu V1 est Robot Quadrillage (4/5)** — et ce n'est pas un hasard : c'est le seul
  où la mécanique EST la compétence (on programme réellement le robot). Partout où la V1 brille
  (Fabrique de Nombres niveau 2, Bar à Schémas), c'est de la manipulation directe.

### Dette technique

- Moteur dupliqué ~29 fois : sons Web Audio, TTS, confettis, écrans, niveaux, localStorage —
  chaque fix transversal se répète 29 fois (le commit e7024db « corriger 16 jeux » en est la preuve).
- Triple registre à synchroniser à la main : `GAMES` (index.html), `ASSETS` (sw.js), tableaux du README.
- PWA cassée en production : chemins absolus (`/index.html`) incompatibles avec GitHub Pages en
  sous-chemin (le precache échoue silencieusement), pas d'icônes PNG 192/512 → non installable
  proprement sur Chrome/Android, icône ignorée sur iOS.
- Pools de contenu figés (24-40 items par jeu) : mémorisables, rejouabilité faible.

---

## 2. L'opportunité de marché (état juin 2026)

- **Khan Academy Kids** est le gold standard mondial (gratuit, sans pub, mascottes, adaptatif)
  mais n'existe **qu'en anglais** — confirmé par leur support, aucune VF prévue.
- **ANTON** est le seul gratuit complet en français, mais documenté comme froid : graphismes 2/5,
  voix robotisées, exercices QCM mécaniques. L'offline y est payant (9,99 €/an).
- **Lalilo est devenu payant** (fin du P2IA au 31/08/2025) : il n'existe **plus aucun outil
  adaptatif gratuit** en France.
- Le gratuit historique (logicieleducatif, ieducatif, Maxetom, tidou, Lulu la taupe) vit de la
  pub, avec une UX des années 2010 et zéro suivi de progression.
- **Nouveaux programmes 2025** (BO n°41 du 31/10/2024, en vigueur rentrée 2025, maternelle→CE2) :
  attendus annuels par niveau et repères par période P1-P5, approche graphémique stricte au CP,
  cibles de fluence chiffrées (30/50 mots-min fin CP, ~70 fin CE1), 10 problèmes/semaine avec
  modèle en barres (Singapour), nouveau domaine « motifs organisés » en maternelle (pré-algèbre),
  fractions précoces au CE1. **Aucun site gratuit n'est aligné sur ce découpage.**
- 80 % des apps utilisées par les 3-5 ans contiennent des dark patterns (étude JAMA 2022) ;
  les repères écrans officiels 2025 (sessions courtes, accompagnement) sont dans le carnet de santé.

**La case « Khan Academy Kids français » est vide.** Gratuit, sans pub, sans compte, voix
naturelle, aligné programmes 2025, offline, adaptatif local : personne n'occupe cette position,
et elle est structurellement inattaquable par les modèles publicitaires (qui veulent maximiser le
temps d'écran) comme par les payants (qui veulent des comptes).

---

## 3. La vision V2 : « L'Archipel »

Synthèse des trois visions étudiées : l'univers d'ARCHIPEL (game design), le moteur de BOUSSOLE
(carte de compétences), la discipline d'ARDOISE (architecture solo-dev).

**Pitch.** JayJay V2 transforme 29 quiz déguisés en un archipel d'îles-mondes où chaque compétence
des programmes 2025 est incarnée dans une mécanique de manipulation directe : on ne choisit plus
la bonne réponse, on casse des barres de dix, on fait dérailler des trains de syllabes, on règle
des aiguilles d'horloge. L'apprentissage est embarqué dans le geste, porté par une mascotte
narratrice, une vraie voix française et un feedback qui enseigne. Sous le capot, une carte de
compétences issue des BO pilote une adaptativité et une répétition espacée 100 % locales.
C'est le seul site français gratuit, sans pub, sans compte et hors ligne où l'enfant de 4-7 ans
redemande à jouer — et où le parent sait exactement quelle compétence officielle il vient de
travailler.

### Les 5 lois de game design (charte du repo, non négociables)

1. **Le doigt fait la compétence — zéro QCM.** L'enfant produit la réponse : il construit
   (barres/cubes, wagons-syllabes, perles), règle (aiguilles, thermomètre), tape au pavé
   numérique, place, trace. Le choix multiple n'est admis que quand choisir EST la compétence
   (comparaison), avec distracteurs intelligents (±1, inversion d'opération, voisins
   orthographiques) et coût réel de l'erreur.
2. **L'erreur enseigne — et c'est un spectacle, pas une sanction.** Conséquence diégétique
   comique (le train lit « CHO-LA-CO ? » et déraille en couinant), puis feedback élaboratif :
   montrer POURQUOI (blocs manquants grisés, conflit qui clignote), redonner un essai dans le
   même contexte, re-poser la notion plus tard avec de NOUVELLES valeurs. Jamais de « faux »,
   jamais de game over, indice automatique après 2 échecs.
3. **Audio-first.** Toute consigne existe en voix française naturelle pré-générée, jouée
   entièrement avant d'autoriser l'action, bouton réécouter permanent. Un non-lecteur de 4 ans
   est autonome de bout en bout. La phonologie redevient auditive (le mot n'est plus affiché
   dans un jeu de syllabes).
4. **Le score est honnête ou n'existe pas.** Seuls les premiers essais alimentent la maîtrise.
   Difficulté adaptative douce : 3 réussites consécutives → on élargit ; 2 échecs → indice puis
   simplification automatique. Pas de streaks, pas de classement, pas de « reviens demain »
   (l'effet d'overjustification détruit la motivation intrinsèque — et le contraire de 80 % du
   marché est un argument).
5. **Chaque île contient un jouet.** Un mode création sans objectif quelque part dans chaque
   univers (composer une musique, construire un labyrinthe pour faire jouer papa, peindre) avec
   galerie exportable — le moteur de rétention Toca Boca, et la fierté de montrer comme
   récompense la plus saine. Budget « juice » obligatoire : chaque tap rend un son + un
   mouvement ; un jeu sans juice ne ship pas.

Transversal : démarche concret → imagé → abstrait (Singapour, prescrite par le programme maths
2025) dans chaque jeu ; boucles de 3-5 min qui se terminent proprement ; rituel de fin de session
vers 15 min (le phare s'allume, la mascotte propose de conclure) conforme aux repères écrans ;
cibles tactiles ≥ 2×2 cm ; alternative tap-source/tap-destination à tout drag (motricité fine) ;
information jamais portée par la couleur seule (daltonisme) ; mode lisibilité renforcée optionnel.

### Le système de progression

- **`skill-map.json`** : la pièce centrale, versionnée. ~140 compétences GS→CE1 extraites des BO
  (libellé officiel exact, source, niveau d'âge selon la grille « dès 4 ans / dès 5 ans » du
  cycle 1 + attendus annuels CP/CE1, période P1-P5, prérequis, jeux qui l'exercent). Elle génère
  le hub, le dashboard parent, le parcours du jour et les futures pages SEO.
- **Maîtrise par compétence** : 4 états (découverte / en cours / maîtrisé / consolidé), fenêtre
  glissante des 10 dernières réponses au premier essai. Pas de BKT ni d'IA : simple et robuste.
- **Répétition espacée Leitner cross-jeux** : une compétence maîtrisée revient à J+2, J+7, J+21,
  servie par un jeu DIFFÉRENT à chaque fois (exposition variée, le mécanisme le mieux validé) ;
  un échec la renvoie en boîte 1.
- **Parcours du jour** : 3 activités de 3-5 min suggérées par la mascotte (1 notion fragile,
  1 nouvelle dont les prérequis sont validés, 1 révision). Une suggestion, jamais une contrainte :
  l'enfant reste libre de jouer à ce qu'il veut.
- **La progression se voit dans le monde** : chaque île s'éveille à mesure qu'on y joue (la
  boutique gagne des rayons, la gare des locomotives, le jardin fleurit) + Carnet de l'Explorateur
  (vignettes-souvenirs et créations, jamais conditionnées au score).
- **Multi-profils** (fratrie) namespacés en IndexedDB (`jayjay:<profil>:*`), migration automatique
  des données V1, export/import JSON pour changer de tablette sans cloud.
- **Dashboard parent** derrière parental gate (petit calcul) : carte de compétences coloriée avec
  les libellés officiels, « où en est-il par rapport à la période en cours à l'école »,
  fragilités détectées, recommandations de co-jeu. Aucune donnée ne quitte la tablette.

---

## 4. Stack technique

Consensus net des trois études (et ce malgré l'habitude Next.js du projet) :

- **Vite + React 19 + TypeScript + vite-plugin-pwa (Workbox)**. Pourquoi pas Next.js : app 100 %
  client, offline-first, zéro serveur — l'export statique Next n'apporte que du poids (runtime +
  hydratation) et un support PWA artisanal, sans bénéfice SSR/SEO au MVP. Le volet SEO se traite
  par des pages statiques pré-rendues au build depuis le manifest (ou un petit site Astro séparé
  en phase 4, consommant le même skill-map.json).
- **Rendu des jeux en DOM/CSS/SVG** par défaut : des jeux CP manipulent des dizaines d'éléments,
  pas des milliers — le DOM donne gratuitement le tactile, l'accessibilité et le responsive sur
  tablette d'entrée de gamme. PixiJS en lazy-load uniquement si un jeu exige une forte densité de
  sprites. Phaser écarté (~1,2 Mo injustifiables).
- **Audio : Howler.js** (sprites webm+mp3, déblocage autoplay iOS) + **voix française
  pré-générée** par TTS neuronal (corpus complet < 5 € one-shot, OpenAI TTS ou ElevenLabs),
  servie en statique, précachée, **validée à l'oreille clip par clip** (les graphèmes isolés —
  GN, É/È — sont le cœur pédagogique, pas un détail). Web Speech API reléguée en fallback
  (1 seule vraie voix sur Android, coupures Chrome à ~200 caractères, gesture obligatoire iOS).
  Plan B charmant : enregistrements maison (le père et le fils) sur les corpus critiques.
- **Persistance : IndexedDB via idb-keyval** (async, quota large, accessible du service worker),
  namespacée par profil — fin du copy-swap fragile de 60 clés. Persistent Storage API + rappel
  export/import (l'éviction iOS est un risque réel). Pas de sync cloud au lancement ; ajoutable
  plus tard derrière la même interface si le multi-device devient réel.
- **État de jeu hors React** (zustand + refs, React ne rend que l'UI), chaque jeu en chunk
  lazy-loadé ; transform/opacity uniquement dans les boucles d'animation.
- **Vitest** sur le moteur (maîtrise, scheduler, générateurs procéduraux) — la testabilité du
  moteur pédagogique est la raison n°1 de quitter le vanilla.
- **Hébergement : Cloudflare Pages** (bande passante illimitée en free tier, vs 100 Go soft-limit
  GitHub Pages). GitHub Pages en fallback open source. Zéro dépendance payante, zéro backend :
  le site doit pouvoir tourner 10 ans sans facture.

### Architecture du code

```
/content            packs JSON purs (corpus de mots par thème/période, graphèmes ordonnés
                    selon le tempo officiel P1-P5, gabarits de problèmes, vocabulaire anglais)
                    validés par schémas zod au build — une contribution = une PR de JSON
/skills             skill-map.json versionné (~140 compétences BO, la source unique)
/src/engine         ~10 modules écrits UNE fois : audio, speech (fallback), storage (profils),
                    progression, mastery, scheduler (Leitner), adaptive, feedback, juice,
                    input (drag + alternative tap-tap, cibles 2×2 cm), mascotte/narration
/src/templates      ~8 gabarits déclaratifs couvrant 60-70 % du catalogue : association,
                    construction-séquence, dictée-audio, peinture-de-grille, simulation-comptoir,
                    discrimination-auditive, programmation-de-chemin, ordre
/src/games          1 dossier par jeu : config JSON + composant custom seulement si la mécanique
                    est singulière ; générateurs procéduraux avec validateurs (BFS de solvabilité,
                    unicité sudoku, distracteurs intelligents)
/src/world          le hub-archipel, profils, dashboard parent, parental gate
games.manifest.ts   LA source unique : génère cartes du hub, routes, precache Workbox, pages SEO
                    statiques et carte de compétences — supprime le triple registre V1
/scripts            generate-audio (batch TTS → /public/audio), generate-seo, validate-content
```

**Migration progressive, jamais de big-bang** : le shell V2 sert les 29 jeux V1 tels quels dès le
jour 1 (copies statiques sous /v1/, clés migrées). Chaque jeu migre un par un ; le fils ne perd
jamais son catalogue, chaque refonte est co-testée avec lui avant retrait de l'ancienne.

---

## 5. Le catalogue V2 (~15 jeux profonds au lieu de 29 minces)

### Refontes phares (la compétence devient le geste)

- **Robo-Pilote** (refonte robot-quadrillage, vaisseau amiral) : puzzles procéduraux infinis
  validés par le BFS existant, bloc « répéter ×N » rendu obligatoire par budget de coups,
  rotation du robot, éditeur de labyrinthes pour faire jouer le parent.
- **La Fabrique de Nombres** : vraie usine base 10 — tapis roulant de commandes, machine à
  casser/souder (1 barre ↔ 10 cubes enfin manipulée), défis contraints (« fabrique 43 avec
  seulement 3 barres »), total masqué jusqu'à validation, plages calées P1-P5.
- **La Machine à Écrire Magique** (refonte dictée des sons) : encodage son → graphème suivant le
  tempo graphémique officiel, clavier de graphèmes persistant, audio validé clip par clip,
  répétition espacée des sons ratés. Le jeu le plus rentable du CP.
- **Le Bar à Schémas** : générateur procédural de problèmes en barres (10 problèmes/semaine =
  prescription officielle 2025), démarche en 4 phases, énoncés discordants exigés dès 5 ans.
- **Calcul Aventure** : fini le QCM — on glisse les objets dans le panier puis on tape le
  résultat au pavé ; carte de monde, plage adaptative en temps réel.
- **Le P'tit Marchand** : bug corrigé, file de clients qui commandent en voix, tiroir-caisse,
  rendu de monnaie de tête, bénéfices qui débloquent des rayons ; notation décimale CE1.
- **Mystères au Village** (refonte qui-parle) : anaphores et inférences en enquêtes — on DÉPLACE
  l'étiquette IL/ELLE sur le bon personnage, chaque indice révèle un morceau du mystère.
  La compétence la plus prédictive du CP, quasi absente du marché.
- **La Machine Folle** (refonte machine à phrases) : phrases cassées lues à voix haute en gag,
  l'enfant-mécanicien répare en tournant les rouleaux ; chaque phrase réparée devient une scène
  animée d'un livre à relire. (Corrige le bug du niveau 4.)
- **L'Orchestre des Animaux** : le Simon sonore conservé + l'enfant reçoit la baguette —
  séquenceur 8 cases où il compose (samples réels), musique collée au Carnet.
- **Le Laboratoire de l'Eau** : sandbox à missions (« transforme le lac en patinoire »), une
  goutte-mascotte voyage dans le cycle que l'enfant déclenche lui-même.

### Fusions (29 fichiers → des jeux profonds)

- **Le Train des Syllabes** (les-syllabes + le-train-des-mots) : phonologie 100 % auditive (le
  mot n'est jamais affiché), scansion au tambour, wagons assemblés LIBREMENT — le train lit ce
  qu'on a vraiment construit et déraille comiquement si c'est faux ; manipulations GS 2025
  (fusion, suppression, permutation type POIRIS).
- **La Chasse aux Lettres** (trouve-la-lettre + première-lettre) : la lettre est nommée à la voix
  sans être affichée, traquée dans des scènes fouillis en 3 graphies dont la cursive (exigence
  GS 2025) ; les paires confondues b/d/p/q reviennent adaptativement ; « B comme bateau ».
- **Le Grand Horloger** (le-temps-qui-passe + la-journée-de-léo + ma-semaine-en-ordre) : on FAIT
  GLISSER les aiguilles, journée simulée avec soleil qui traverse le ciel, roue des jours/mois,
  récit relu en voix avec connecteurs temporels. (Cible la fragilité temps/espace d'origine.)
- **L'Atelier Pixel** (le-miroir-pixel + pixel-art-géométrique) : 5 modes — copie, miroir
  (vertical → horizontal → mandala), mémoire (modèle caché après 5 s), dictée de coordonnées en
  voix (« B3 en rouge »), libre avec galerie et export PNG.
- **English Island** (hello-english + colour-catcher + simon-says) : imagier parlant explorable
  AVANT le quiz, arcade de ballons à 3 vies qui rend l'écoute obligatoire, Simon Says à chaînes
  accélérées + mode 2 joueurs.
- **Le Collier de Perles** (refonte suite-logique) : l'enfant POSE les perles (production, pas
  sélection), motifs AB/AAB/ABC procéduraux, transcription en symboles — le nouveau domaine
  officiel « motifs organisés » (pré-algèbre cycle 1 2025), quasi absent du marché.

### Nouveaux (océans bleus validés par la recherche)

- **Les Gloutons du Dix** : des créatures n'avalent que des paires/triplets qui font exactement
  leur nombre — compositions/décompositions et compléments à 10 (cœur du programme GS/CP 2025)
  en puzzle physique à combos, sans un chiffre imposé à l'écran au début. Le « DragonBox français ».
- **La Balance Magique** : équilibrer des plateaux pour découvrir l'égalité et les équivalences
  (2 pommes = 1 melon, 10 unités = 1 barre) — pré-algèbre introuvable en gratuit.
- **La Rivière aux Lucioles** : estimation sur droite numérique (« pose-toi vers 70 ! »), zoom
  progressif 0-10 → 0-100 — la number line estimation est LE prédicteur scientifique des maths.
- **Les Mots de la Semaine** : vocabulaire par corpus thématiques officiels (3 corpus/période GS,
  objectif 2 500 mots), imagier parlant exploré PUIS quiz uniquement sur les mots exposés,
  révision espacée cross-sessions.
- **Fluence Express** (phase CE1) : décodage chronométré doux, cibles officielles 30/50/70
  mots-min visibles côté parent, mode co-jeu lecture à voix haute chronométrée par le parent.
- **La Lettre Magique** (phase ultérieure) : tracé cursif au doigt avec guidage progressif
  (modèle → pointillés → seul) — compétence 100 % verrouillée par le payant (Kaligo).

---

## 6. MVP et roadmap

**MVP (~10-12 semaines de soirées/week-ends), sans jamais casser l'existant :**

- Le shell Archipel complet : hub généré par le manifest, multi-profils IndexedDB avec migration
  V1, PWA réparée (chemins relatifs, icônes PNG 192/512 maskable, installabilité réelle),
  mascotte, rituel de fin de session, Carnet v1, parental gate + dashboard parent v0
  (carte de compétences + temps par jeu).
- Le moteur v1 : audio + pipeline voix pré-générées validé à l'oreille, maîtrise premier-essai,
  adaptativité simple, feedback élaboratif, juice kit, input.
- La carte de compétences limitée aux 2 domaines prioritaires : lecture/encodage et
  nombres/calcul/problèmes (~40 compétences).
- **6 jeux V2 exemplaires**, choisis pour valider chaque brique du moteur ET les 5 lois :
  Robo-Pilote, Le Train des Syllabes, Les Gloutons du Dix, La Fabrique de Nombres,
  La Machine à Écrire Magique, Le P'tit Marchand.
- Les ~23 jeux V1 restants servis tels quels dans le shell (badge « classique »).
- Pages statiques SEO pour les 6 jeux + page « notre approche » (écrans, méthode, RGPD).

**Critère de sortie du MVP** : le fils joue 15 minutes en autonomie totale sans lire ni demander
d'aide, choisit spontanément un jeu V2 plutôt qu'un V1 deux sessions de suite, et le dashboard
parent reflète fidèlement ce qu'il sait faire.

**Roadmap :**

- **Phase 0 — Fondations (3 semaines)** : repo Vite+React+TS+PWA, manifest unique, modules engine
  v1, pipeline generate-audio, skill-map v1 (2 domaines), shell servant les 29 jeux V1,
  déploiement Cloudflare Pages. La V2 est en ligne dès la semaine 3 sans un seul jeu neuf,
  zéro régression.
- **Phase 1 — MVP (6-8 semaines)** : les 6 jeux phares, mascotte, Carnet, dashboard v0, pages SEO,
  charte parents. Playtests hebdomadaires avec l'enfant comme gate de release.
- **Phase 2 — Vague français/maths (3 mois)** : Chasse aux Lettres, Machine Folle, Bar à Schémas
  procédural, Calcul Aventure, Balance Magique, Rivière aux Lucioles, Boîtes à Nombres ;
  Leitner cross-jeux + parcours du jour ; calage P1-P5 sur le calendrier scolaire.
- **Phase 3 — Mondes (3 mois)** : Grand Horloger, Collier de Perles, Atelier Pixel, Mystères au
  Village, Mots de la Semaine, English Island, Laboratoire de l'Eau, Orchestre des Animaux ;
  retrait progressif des copies V1 remplacées ; dashboard parent complet.
- **Phase 4 — Ouverture et CE1 (continu)** : Fluence Express, Lettre Magique, fractions précoces,
  éditeur de niveaux enfant→parent, pages SEO par compétence/niveau, page méthode (programmes
  2025 + Graphogame/Dehaene), page orthophonistes, guide de contribution (PR = JSON).
  Rythme de croisière : un pack de contenu ou un jeu par mois, calé sur où en est le fils.

---

## 7. Risques et garde-fous

- **Tunnel de refonte solo-dev** (le risque n°1) → le shell sert les jeux V1 dès le jour 1,
  migration par familles de gabarits, chaque jeu migré est une release.
- **Sur-ingénierie du moteur** → règle « un module n'existe que s'il a 2 consommateurs » ;
  composant custom assumé pour les mécaniques singulières ; pas de BKT/IA.
- **Qualité TTS sur les unités courtes** (graphèmes isolés, É/È) → validation auditive humaine
  son par son AVANT de construire la Machine à Écrire ; plan B : enregistrements maison.
- **SEO : une SPA peut dégrader le référencement des 30 pages HTML actuelles** → pages statiques
  pré-rendues par jeu et par compétence générées du manifest au build, obligatoires dès le MVP.
- **Éviction du stockage par iOS** → Persistent Storage API + export/import JSON dès le MVP.
- **Dérive « couverture avant profondeur »** → la règle est 15 jeux profonds ; une compétence non
  couverte reste grise sur la carte sans honte.
- **Dérive « produit »** (comptes, sync, B2B écoles) → la règle « ça reste un site pour mes
  enfants » tranche chaque arbitrage ; le zéro-compte est l'avantage RGPD structurel.
- **L'enfant cible grandit plus vite que la roadmap** → prioriser CP/CE1 maintenant ; le niveau
  GS profite au petit frère/à la communauté.
- **Régression d'attachement** → co-tester chaque refonte avec lui avant de retirer l'ancienne
  version. L'utilisateur final vit à la maison : c'est le meilleur labo UX du marché.

---

## 8. Décisions ouvertes (à valider avant la phase 0)

1. **Le nom et le domaine.** « Mes Jeux Éducatifs » est générique ; l'univers archipel appelle un
   vrai nom de marque (et un domaine dédié plutôt que github.io, pour le SEO et le bouche-à-oreille).
2. **Vite + React plutôt que Next.js** : recommandation forte des trois études, mais c'est un
   écart à la stack habituelle du projet — à confirmer.
3. **La voix** : TTS neuronal validé à l'oreille, ou enregistrements maison (père/fils) sur les
   corpus critiques dès le départ ?
4. **Le choix des 6 jeux du MVP** (proposition ci-dessus ajustable selon les priorités de l'enfant).
5. **Nouveau repo ou refonte in-place** (le shell V2 servant /v1/ plaide pour le même repo,
   historique conservé).
