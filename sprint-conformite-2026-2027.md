# JayJay — Sprint « Conformité Programmes 2026-2027 »

> Chantier de **contenu** (nouveaux jeux), distinct de la refonte visuelle V3.
> Dans la nomenclature du repo : fait suite aux phases 0-6.2 livrées ; se mène en
> parallèle de la phase 7 (son/sensoriel). Si tu raisonnes en « sprints », c'est le
> prochain sprint après le remplacement des V1 (#11).
>
> **But** : combler les écarts entre le catalogue actuel (28 jeux V2, 103 compétences)
> et les programmes officiels applicables à la **rentrée 2026-2027**, en particulier les
> **nouveaux Bulletins Officiels 2026** (sciences-technologie, histoire-géographie,
> langues vivantes) qui entrent en vigueur au CP dès septembre 2026.

---

## 1. Méthode et sources

Croisement réalisé entre :
- le code : `src/games.manifest.ts` (jeux + îles) et `src/content/skill-map.ts` (103 compétences mappées) ;
- l'officiel : page eduscol « Enseigner au cycle 2 », attendus de fin de CP, et le PDF
  officiel des attendus d'anglais CP (lu intégralement) ;
- les nouveaux BO 2026, vérifiés via eduscol + presse pédagogique (le texte intégral des
  arrêtés sur education.gouv.fr est derrière un CAPTCHA Cloudflare, non contourné).

Références BO applicables au CP en 2026-2027 :
- Français — BO n° 41 du 31/10/2024 (déjà couvert)
- Mathématiques — BO n° 41 du 31/10/2024 (déjà couvert, sauf géométrie/mesures, cf. lot D)
- Langues vivantes — BO n° 12 du 19/03/2026 (NOUVEAU) — niveau visé : Pré-A1 oral
- Histoire-géographie — BO n° 22 du 28/05/2026 (NOUVEAU, remplace « Questionner le monde »)
- Sciences et technologie — BO n° 24 du 11/06/2026 (NOUVEAU, remplace « Questionner le monde »)
- EMC — BO n° 24 du 13/06/2024 ; Vie affective et relationnelle (EVARS) — BO n° 6 du 06/02/2025

---

## 2. État des lieux — ce qui est DÉJÀ conforme (ne rien refaire)

- Français / Île aux Sons : phonologie, CGP, décodage, encodage, fluence, compréhension
  (anaphores, inférences), accords, vocabulaire, geste d'écriture. Couverture quasi
  complète du BO oct. 2024.
- Maths / Île aux Nombres : numération, calcul, problèmes (parties-tout / transformation /
  comparaison), monnaie, fractions. Le domaine « Nombres et calculs » est complet.
- Logique / Île des Robots : motifs, quadrillage, coordonnées, symétrie, déduction, code.
  Bonus hors-programme strict, déjà solide.

---

## 3. Les écarts → backlog priorisé

Cinq lots. Les lots A, B, C correspondent aux **nouveaux programmes 2026-2027** (priorité).
Les lots D et E comblent des trous des programmes déjà en vigueur.

### LOT A — Sciences et technologie (Île du Monde) — PRIORITÉ 1
*BO n° 24 du 11/06/2026. Trois blocs explicites du nouveau programme ne sont couverts par
aucun jeu : le corps humain, le cycle du vivant, les objets techniques.*

A1. Jeu « Le Corps Humain » — id `corps-humain` — île `monde` — icône 🧍
- Mécanique : tap-source → tap-destination. La consigne audio nomme une partie/un sens,
  l'enfant la pose au bon endroit sur le personnage. L'erreur enseigne : la zone se nomme
  d'elle-même quand on la touche (pas de « faux »).
- Compétences : `mo.gs.corps.parties`, `mo.cp.corps.sens`, `mo.cp.corps.hygiene`.
- Corpus : parties du corps (tête, bras, jambes, mains, pieds, ventre, dos, yeux, oreilles,
  nez, bouche), 5 sens ↔ organe, gestes d'hygiène (se laver les mains, se brosser les dents,
  dormir, manger équilibré).

A2. Jeu « La Petite Graine » — id `petite-graine` — île `monde` — icône 🌱
- Mécanique : remettre dans l'ordre les étapes (graine → germe → pousse → fleur → fruit) ;
  donner à la plante ses besoins (eau, lumière) pour la faire grandir. Boucle « l'erreur
  enseigne » : une plante privée d'eau/lumière fane doucement, puis on réessaie.
- Compétences : `mo.gs.vivant.besoins`, `mo.cp.vivant.cycle`.
- Corpus : besoins du vivant (eau, lumière, air, nourriture), étapes du cycle, 3-4 plantes.

A3. Jeu « L'Atelier des Objets » — id `atelier-objets` — île `monde` — icône 🔧
- **Point d'entrée explicite du nouveau programme CP** (« un objet répond à un besoin »,
  « transformer une matière première en objet »).
- Mécanique : associer un besoin à l'objet qui y répond (avoir froid → pull) ; relier une
  matière première à l'objet fabriqué (bois → table, laine → pull, blé → pain, sable → verre).
- Compétences : `mo.cp.objets.besoin`, `mo.cp.objets.matiere`.
- Corpus : 8-10 paires besoin↔objet et matière↔objet.

### LOT B — Histoire-géographie (Île du Monde) — PRIORITÉ 1
*BO n° 22 du 28/05/2026. L'horloger couvre le temps cyclique (heure, calendrier) ;
manquent le temps historique et la géographie.*

B1. Jeu « La Machine à Remonter le Temps » — id `machine-du-temps` — île `monde` — icône ⏳
- Mécanique : trier des objets/scènes « autrefois » vs « aujourd'hui » ; ranger les
  générations (bébé, enfant, parent, grand-parent) sur une frise simple.
- Compétences : `mo.cp.histoire.avant`, `mo.cp.histoire.generations`.
- Corpus : paires d'objets hier/aujourd'hui (bougie/lampe, plume/stylo, cheval/voiture…),
  4 générations.

B2. Jeu « Le Tour du Monde » — id `tour-du-monde` — île `monde` — icône 🌍
- Mécanique : reconnaître/nommer des paysages (mer, montagne, ville, campagne, forêt,
  désert) ; situer terres et océans sur un globe/planisphère simplifié.
- Compétences : `mo.gs.geo.paysages`, `mo.cp.geo.monde`.
- Corpus : 6 types de paysages, repères globe (terre/eau).

### LOT C — Anglais, expansion (Île d'Ailleurs) — PRIORITÉ 2
*BO n° 12 du 19/03/2026, niveau Pré-A1. English Island ne couvre aujourd'hui que couleurs,
nombres, animaux, consignes. Les attendus officiels CP demandent en plus : salutations,
se présenter, le corps, la nourriture, les goûts, les émotions. Les « exemples de réussite »
du BO sont quasi des specs de mini-jeux (Simon Says, In my school bag, I like / I don't like,
Head shoulders knees and toes).*

C1. Jeu « Hello Friends! » — id `hello-friends` — île `ailleurs` — icône 👋
- Mécanique : compréhension orale Pré-A1 (audio-first, anglais). Saluer/se présenter en
  reliant la bonne réponse à l'image/au geste.
- Compétences : `en.cp.greetings`, `en.cp.self`, `en.cp.feelings`.
- Corpus : hello/goodbye/thank you/please, my name is / I'm X years old / favourite colour,
  happy/sad/tired/I'm OK.

C2. Jeu « My Body & Food » — id `my-body-food` — île `ailleurs` — icône 🍎
- Mécanique : « Head, Shoulders, Knees and Toes » (toucher la bonne partie) ; nourriture +
  I like / I don't like (trier dans deux colonnes).
- Compétences : `en.cp.body`, `en.cp.food`, `en.cp.tastes`.
- Corpus : parties du corps (head/shoulders/knees/toes/eyes/ears/mouth/nose), 6-8 aliments.
- Variante d'implémentation : ces 3 compétences peuvent aussi étoffer le corpus d'`english-island`
  plutôt qu'un nouveau jeu — au choix du dev (un seul jeu « English Island » plus riche vs
  deux jeux courts). Recommandation : deux jeux courts, plus lisibles pour l'enfant.

### LOT D — Maths : géométrie et mesures (Île aux Nombres) — PRIORITÉ 2
*BO oct. 2024, déjà en vigueur mais non couvert : les domaines « Espace et géométrie »
(figures) et « Grandeurs et mesures » (longueurs).*

D1. Jeu « L'Atelier des Formes » — id `atelier-formes` — île `nombres` — icône 🔷
- Mécanique : reconnaître/nommer figures planes et solides ; trier par nombre de côtés.
- Compétences : `ma.gs.geo.formes`, `ma.cp.geo.solides`.
- Corpus : carré, rectangle, triangle, cercle ; cube, boule, pavé, pyramide.

D2. Jeu « Le Mètre Magique » — id `metre-magique` — île `nombres` — icône 📏
- Mécanique : comparer des longueurs (plus long / plus court) ; mesurer par report d'une
  unité (combien de cubes/règles).
- Compétences : `ma.gs.mesure.comparer`, `ma.cp.mesure.longueurs`.
- Corpus : objets de longueurs variées, unité de report.

### LOT E — EMC et vie affective (Île des Sentiments) — PRIORITÉ 3
*Le Jardin des Émotions couvre la sensibilité (émotions) et la régulation de conflit.
Manquent « le droit et la règle », « l'engagement », et l'EVARS (respect du corps).*

E1. Jeu « Les Règles du Village » — id `regles-du-village` — île `sentiments` — icône 🤝
- Mécanique : face à une situation (audio + image), choisir l'action qui respecte la règle
  / aide l'autre ; comprendre pourquoi. L'erreur enseigne, jamais de jugement « faux ».
- Compétences : `emc.cp.regles`, `emc.cp.entraide`.
- Corpus : situations de vie de classe/cour (attendre son tour, ranger, aider, dire bonjour).

E2. (Sensible, optionnel) Jeu « Mon Corps m'appartient » — id `mon-corps` — île `sentiments`
- EVARS BO 06/02/2025 : respect de soi et d'autrui, intimité, savoir dire non.
- **À concevoir avec prudence** : formulations douces, jamais anxiogènes, revue parent
  obligatoire avant merge. Peut être reporté hors de ce sprint si non prioritaire.
- Compétence : `emc.cp.corps.respect`.

---

## 4. Nouvelles entrées `SkillDef` à ajouter dans `src/content/skill-map.ts`

Respecter le format existant : `{ id, label, official, domain, level, period?, prereqs? }`.
Domaines réutilisés (pas de nouveau domaine sauf décision) : `monde`, `maths`, `anglais`, `emc`.

Sciences & technologie (domain `monde`) :
- `mo.gs.corps.parties` (gs) — « Nommer les parties du corps »
- `mo.cp.corps.sens` (cp) — « Associer chaque sens à son organe » — prereqs `mo.gs.corps.parties`
- `mo.cp.corps.hygiene` (cp) — « Les gestes pour rester en bonne santé »
- `mo.gs.vivant.besoins` (gs) — « Les besoins des êtres vivants »
- `mo.cp.vivant.cycle` (cp) — « Le cycle de vie d'une plante » — prereqs `mo.gs.vivant.besoins`
- `mo.cp.objets.besoin` (cp) — « Un objet pour un besoin »
- `mo.cp.objets.matiere` (cp) — « De la matière à l'objet » — prereqs `mo.cp.objets.besoin`

Histoire-géographie (domain `monde`) :
- `mo.cp.histoire.avant` (cp) — « Hier et aujourd'hui »
- `mo.cp.histoire.generations` (cp) — « Ranger les générations » — prereqs `mo.cp.histoire.avant`
- `mo.gs.geo.paysages` (gs) — « Reconnaître des paysages »
- `mo.cp.geo.monde` (cp) — « La Terre vue de loin » — prereqs `mo.gs.geo.paysages`

Anglais Pré-A1 (domain `anglais`) :
- `en.cp.greetings` (cp) — « Saluer et remercier »
- `en.cp.self` (cp) — « Se présenter » — prereqs `en.cp.greetings`
- `en.cp.body` (cp) — « Les parties du corps en anglais »
- `en.cp.feelings` (cp) — « Dire comment je me sens »
- `en.cp.food` (cp) — « La nourriture en anglais »
- `en.cp.tastes` (cp) — « Aimer / ne pas aimer » — prereqs `en.cp.food`

Maths géométrie & mesures (domain `maths`) :
- `ma.gs.geo.formes` (gs) — « Reconnaître les formes »
- `ma.cp.geo.solides` (cp) — « Reconnaître les solides » — prereqs `ma.gs.geo.formes`
- `ma.gs.mesure.comparer` (gs) — « Comparer des longueurs »
- `ma.cp.mesure.longueurs` (cp) — « Mesurer une longueur » — prereqs `ma.gs.mesure.comparer`

EMC / EVARS (domain `emc`) :
- `emc.cp.regles` (cp) — « Les règles de la vie en commun »
- `emc.cp.entraide` (cp) — « Aider et coopérer »
- `emc.cp.corps.respect` (cp, sensible) — « Mon corps m'appartient »

Libellé `official` : reprendre la formulation du BO (ex. pour `mo.cp.objets.besoin` :
« Technologie : identifier un objet technique comme réponse à un besoin »). 25 compétences
nouvelles au total → la couverture passerait de 103 à ~128.

Note : envisager de relabeliser `DOMAIN_LABELS.monde` (actuellement « Découvrir le monde —
temps et nature ») en « Explorer le monde — sciences, temps et espace » pour refléter les
nouveaux programmes. Décision ouverte.

---

## 5. Procédure d'implémentation (par jeu)

Chaque jeu suit le pattern V2 existant :
1. Créer `src/games/<id>/` avec `index.tsx` (UI via `GameShell`), `logic.ts` (pur, testé),
   `corpus.json`.
2. Déclarer le chunk lazy dans `V2_COMPONENTS` (`src/games.manifest.ts`).
3. Ajouter l'objet `GameMeta` dans `GAMES` (mêmes champs : `id, title, tagline, icon,
   island, accent, skills[], status: 'v2'`).
4. Ajouter les `SkillDef` dans `SKILL_MAP` (`src/content/skill-map.ts`).
5. Écrire les corpus de consignes, puis `pnpm audio` → commit des mp3 générés.
6. Tests obligatoires sur `logic.ts` (`pnpm test`), puis `pnpm build` (tsc + vite) vert.
7. Habillage V3 facultatif : assets `art-direction.md` sous flag `artV3` ; sinon le rendu
   emoji reste le fallback (non bloquant).

Definition of Done (par jeu) :
- Les 5 lois d'ENGINE.md respectées : zéro QCM, l'erreur enseigne, audio-first, score honnête
  au premier essai, juice.
- Jamais le mot « faux » face à l'enfant ; libellés FR accentués ; cibles tactiles ≥ 64 px ;
  interaction tap-source / tap-destination.
- Tests `logic.ts` verts, build OK, audio généré et commité, co-test enfant avant merge.

---

## 6. Découpage proposé (sous-vagues, une release chacune)

Comme la V2 : jamais de big-bang, une sous-vague = une PR co-testée.
1. Vague A — Sciences & techno (corps-humain, petite-graine, atelier-objets). Cœur du
   nouveau programme. Pilote recommandé : **atelier-objets** (mécanique tap-source/destination
   simple, point d'entrée CP explicite).
2. Vague B — Histoire-géo (machine-du-temps, tour-du-monde).
3. Vague C — Anglais (hello-friends, my-body-food).
4. Vague D — Maths géométrie & mesures (atelier-formes, metre-magique).
5. Vague E — EMC / EVARS (regles-du-village, puis mon-corps si retenu).

---

## 7. Risques et garde-fous

- **EVARS (E2) sensible** : sujet intime pour des 5-7 ans → formulations douces, revue parent,
  jamais anxiogène ; reportable hors sprint.
- **Production orale non jouable** : le BO français (langage oral) et l'anglais « parler »
  attendent de la production vocale ; sans reconnaissance vocale, ces jeux restent en
  **compréhension/reconnaissance** (pas de production vocale jugée). Limite assumée, à noter
  dans le dashboard parent.
- **Volume** : ~10 nouveaux jeux = sprint lourd → tenir le découpage en sous-vagues, ne jamais
  ouvrir deux îles en chantier en même temps (règle V3).
- **Budget poids PWA** : respecter les budgets art (≤ 250 Ko d'assets/jeu, < 60 Mo precache)
  si habillage V3 ; en emoji, impact négligeable.

---

## 8. Synthèse

- 5 lots, ~10-11 jeux, ~25 nouvelles compétences.
- Les 5 jeux des lots A et B couvrent à eux seuls les **nouveautés du programme 2026-2027**
  (sciences-technologie + histoire-géographie) — c'est le minimum pour être à jour à la rentrée.
- Aucun changement de moteur : tout réutilise GameShell, le mapping compétences, le moteur de
  maîtrise et le pipeline audio existants.
