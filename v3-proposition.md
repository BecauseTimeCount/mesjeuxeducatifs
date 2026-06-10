# JayJay V3 — Proposition « Niveau supérieur » (phases 5-7)

> Suite de `v2-proposition.md`. Les phases 0-4 sont livrées : 24 jeux V2 en production,
> moteur pédagogique complet (maîtrise premier-essai, Leitner cross-jeux, parcours du jour,
> P1-P5), dashboard parent complet, 102 pages SEO statiques, pipeline audio 1 650 clips.
> Objectif V3 : porter l'exécution **visuelle et sensorielle** au niveau des références du
> secteur (Khan Academy Kids), sans rien céder sur les fondamentaux : 100 % gratuit, zéro
> pub, zéro compte, offline-first, solo-dev soutenable.

---

## Le constat

La V2 a gagné la bataille pédagogique (programmes 2025, manipulation directe, score
honnête) mais son habillage est resté utilitaire : emojis système pour toute
l'iconographie, pas d'identité graphique propre, pas d'univers visuel par île. Khan
Academy Kids démontre ce que produit une direction artistique cohérente : personnages
attachants, décors peints, animations organiques, transitions soignées. C'est le dernier
écart majeur — et il est comblable par un solo-dev grâce à deux leviers : la génération
d'assets par IA (style maîtrisé, coût en euros à un chiffre) et l'animation SVG/CSS
(légère, offline, nette sur tous écrans).

## La stratégie graphique retenue (décision utilisateur, 2026-06-10)

**Hybride IA + SVG, rendu DOM/CSS conservé.**

- **Décors et objets de jeu** : illustrations générées par IA dans UN style unique défini
  par une bible graphique (palette par île, traits ronds, lumière douce, zéro texte
  incrusté), exportées en webp optimisé (≤ 60 Ko le décor, ≤ 15 Ko l'objet), précachées
  par île. Chaque asset est versionné dans `public/art/<île>/`.
- **Personnages vivants** : les acteurs récurrents (Plume la mascotte, les gloutons, la
  fée, Goutte, les clients de la pizzeria…) en **SVG riggé** : groupes nommés (tête,
  yeux, paupières, bras, bouche) animés en CSS/JS — clignement, respiration, regard qui
  suit l'action, sursaut de joie, déception douce. Un composant `<Character>` commun
  pilote les états (`idle | happy | cheer | thinking | oops`).
- **PixiJS écarté** (confirmé) : +1,2 Mo et une réécriture du rendu pour un gain marginal
  en DOM/CSS bien fait. Réévaluable jeu par jeu si une mécanique exige des centaines de
  sprites simultanés.
- **Contrainte budget poids** : un jeu = décor + 6-10 objets ≤ 250 Ko de nouveaux assets.
  Le precache PWA total doit rester < 60 Mo audio compris.

---

## Phase 5 — Vitrine et fondations graphiques

*Livrable session courante : landing + README. Le reste : prochaine session.*

1. **Landing page `/decouvrir.html`** *(fait en session courante)* : page statique
   premium pour parents/enseignants/orthophonistes — manifeste (gratuit, zéro pub, zéro
   compte, RGPD), les 5 lois, catalogue par île, recherche et programmes 2025, captures
   réelles, CTA « Jouer ». Liée depuis le README, les pages SEO et le futur domaine.
2. **README refondu** *(fait en session courante)* : qualité du produit, fondements
   scientifiques (BO n°41 2025, approche graphémique, Dehaene/Graphogame, fluence
   30/50/70, problèmes en barres, motifs organisés), captures, architecture, liens
   landing/méthode/orthophonistes/CONTRIBUTING.
3. **La bible graphique** (`art-direction.md` + `public/art/_palette/`) : style guide
   complet — palette maîtresse + déclinaison par île, règles de forme (rondeur, épaisseur
   de trait, ombres), prompts de référence validés pour la génération IA, gabarits
   d'export (tailles, webp, naming `<île>.<jeu>.<asset>.webp`).
4. **Le pipeline assets** (`scripts/generate-art.md` — recettes, pas d'API au build) :
   génération IA → détourage/recadrage → squoosh/cwebp → contrôle visuel → commit.
   Un manifest `src/content/art.manifest.ts` type les assets disponibles par jeu.
5. **Plume 2.0, preuve de concept** : la mascotte redessinée en SVG riggé avec 5 états
   animés, intégrée au composant `Mascot` existant (même API). C'est le gabarit du
   composant `<Character>` et le test de la chaîne complète avant d'industrialiser.

**Critère de sortie** : la bible graphique est écrite, Plume 2.0 vit dans le hub, un
premier décor IA (l'Île aux Nombres) est en production derrière un feature-flag visuel.

## Phase 6 — La refonte visuelle, île par île

Migration **progressive comme la V2** (jamais de big-bang, chaque île est une release) :

1. **Le hub-archipel** : carte du monde illustrée (mer animée, îles peintes qui
   s'éveillent avec la progression — remplace les cartes blanches), transitions de
   navigation (vol de Plume entre les îles).
2. **Île aux Nombres** (la plus jouée) : décors + personnages des 8 jeux (gloutons
   redessinés, marchand et clients, balance du magicien, lucioles…).
3. **Île aux Sons** : 8 jeux (train, machine à écrire, village des mystères…).
4. **Îles Robots, Monde, Ailleurs** : 8 jeux restants.
5. **Le juice 2.0** transversal, au fil des îles : courbes d'easing communes (springs),
   particules CSS réutilisables (étincelles, miettes, bulles), écrans de victoire
   illustrés, micro-réactions des personnages à CHAQUE interaction (loi n°5 renforcée).

Règle de qualité : un jeu re-skinné est co-testé avec l'enfant avant merge (le labo UX
vit à la maison) ; l'ancien rendu reste accessible par flag pendant la vague.

## Phase 7 — L'oreille et la peau (polish sensoriel + ouverture)

1. **Sound design 2.0** : remplacer les SFX oscillateur par une banque de sons organiques
   (CC0 : freesound/kenney) — vrais « pop », bois, papier, clochettes ; thèmes musicaux
   doux par île (boucles 30 s, coupables après 2 répétitions) ; mixage des voix existantes.
2. **Écrans et transitions** : splash screen illustré, écran de fin de session (le phare
   s'allume), Carnet de l'Explorateur illustré (vignettes-souvenirs par jeu).
3. **Accessibilité niveau pro** : mode lisibilité renforcée (déjà prévu V2), réglage de
   vitesse des voix, retours haptiques (vibration douce) sur tablettes compatibles.
4. **Ouverture** : domaine dédié + bascule de la landing en racine du domaine,
   Cloudflare Pages (bande passante), packs de contenu mensuels calés sur le fils
   (rythme de croisière de v2-proposition).

---

## Risques et garde-fous V3

- **Incohérence de style IA** (le risque n°1) → la bible graphique verrouille prompts,
  palette et post-traitement AVANT toute génération de masse ; tout asset hors-style est
  rejeté, pas « retouché ».
- **Inflation de poids** → budget par jeu (250 Ko) + budget global (60 Mo precache) tenus
  dans un test CI (`scripts/check-weight.mjs`).
- **Tunnel de re-skin** → une île = une release co-testée ; jamais plus d'une île en
  chantier ; les jeux non migrés restent parfaitement jouables (le style emoji actuel
  est le fallback, pas une dette bloquante).
- **Régression d'attachement** → l'enfant tranche : si le nouveau glouton plaît moins que
  l'emoji, on itère l'asset, pas l'enfant.
- **Dérive « moteur »** → pas de PixiJS, pas de runtime d'animation tiers tant que
  DOM/CSS suffit ; le composant `<Character>` reste < 300 lignes.

## Décisions actées / ouvertes

- ✅ Stratégie graphique : hybride IA + SVG (2026-06-10).
- ✅ Landing : `/decouvrir.html`, racine inchangée pour les enfants (2026-06-10).
- ⏳ Choix du générateur d'images et du style précis : à trancher en phase 5 sur 3-4
  planches d'essai (même prompt, générateurs différents, vote famille).
- ⏳ Domaine dédié et hébergement Cloudflare : phase 7 (avec redirections GitHub Pages).
- ⏳ Musiques par île : générer (IA), assembler (CC0) ou composer (Orchestre des
  Animaux propose déjà la matière sonore maison ?) — à explorer en phase 7.
