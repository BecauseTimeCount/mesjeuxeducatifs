import type { SkillDef } from '@/engine/types'

// ============================================================
// Carte de compétences v1 — MVP : lecture/encodage + nombres/calcul + pré-code.
// Libellés officiels : programmes 2025 (BO n°41 du 31/10/2024) pour
// français/maths, grille cycle 1 « dès 4 ans / dès 5 ans ».
// Source de vérité du dashboard parent et du moteur de maîtrise.
// ============================================================

export const SKILL_MAP: SkillDef[] = [
  // ---------------- FRANÇAIS — phonologie (GS) ----------------
  {
    id: 'fr.gs.phono.scander',
    label: 'Découper un mot en syllabes',
    official: 'Scander et dénombrer les syllabes orales d’un mot',
    domain: 'francais',
    level: 'gs',
  },
  {
    id: 'fr.gs.phono.fusion',
    label: 'Assembler des syllabes',
    official: 'Fusionner des syllabes pour produire un mot ou un pseudo-mot',
    domain: 'francais',
    level: 'gs',
    prereqs: ['fr.gs.phono.scander'],
  },
  {
    id: 'fr.gs.phono.suppression',
    label: 'Enlever une syllabe d’un mot',
    official: 'Manipuler les syllabes : suppression de la syllabe initiale ou finale',
    domain: 'francais',
    level: 'gs',
    prereqs: ['fr.gs.phono.fusion'],
  },
  {
    id: 'fr.gs.phono.attaque',
    label: 'Reconnaître le premier son d’un mot',
    official: 'Discriminer et localiser un phonème dans un mot (position initiale)',
    domain: 'francais',
    level: 'gs',
  },
  // ---------------- FRANÇAIS — lettres (GS) ----------------
  {
    id: 'fr.gs.lettres.nom',
    label: 'Connaître le nom des lettres',
    official: 'Connaître le nom de toutes les lettres de l’alphabet',
    domain: 'francais',
    level: 'gs',
  },
  {
    id: 'fr.gs.lettres.valeur',
    label: 'Connaître le son des lettres',
    official: 'Connaître la valeur sonore des lettres (le son qu’elles produisent)',
    domain: 'francais',
    level: 'gs',
    prereqs: ['fr.gs.lettres.nom'],
  },
  {
    id: 'fr.gs.lettres.graphies',
    label: 'Reconnaître une lettre dans les 3 écritures',
    official: 'Reconnaître une lettre dans les trois graphies : capitale, script, cursive',
    domain: 'francais',
    level: 'gs',
    prereqs: ['fr.gs.lettres.nom'],
  },
  // ---------------- FRANÇAIS — CGP / décodage / encodage (CP) ----------------
  {
    id: 'fr.cp.cgp.voyelles',
    label: 'Sons des voyelles (a, e, i, o, u, é)',
    official: 'Correspondances graphèmes-phonèmes : voyelles simples (période 1)',
    domain: 'francais',
    level: 'cp',
    period: 1,
    prereqs: ['fr.gs.lettres.valeur'],
  },
  {
    id: 'fr.cp.cgp.consonnes1',
    label: 'Sons des consonnes simples (l, r, s, m, t, p…)',
    official: 'Correspondances graphèmes-phonèmes : consonnes fréquentes (période 1-2)',
    domain: 'francais',
    level: 'cp',
    period: 1,
    prereqs: ['fr.cp.cgp.voyelles'],
  },
  {
    id: 'fr.cp.cgp.digraphes1',
    label: 'Sons à deux lettres (ou, on, an, in, ch)',
    official: 'Correspondances graphèmes-phonèmes : digraphes fréquents (période 2-3)',
    domain: 'francais',
    level: 'cp',
    period: 2,
    prereqs: ['fr.cp.cgp.consonnes1'],
  },
  {
    id: 'fr.cp.cgp.complexes',
    label: 'Sons complexes (oi, gn, eu, ain, ill…)',
    official: 'Correspondances graphèmes-phonèmes : graphèmes complexes (période 3-5)',
    domain: 'francais',
    level: 'cp',
    period: 3,
    prereqs: ['fr.cp.cgp.digraphes1'],
  },
  {
    id: 'fr.cp.decodage.syllabes',
    label: 'Lire des syllabes',
    official: 'Fusionner les graphèmes pour lire des syllabes',
    domain: 'francais',
    level: 'cp',
    period: 1,
    prereqs: ['fr.cp.cgp.voyelles'],
  },
  {
    id: 'fr.cp.decodage.mots',
    label: 'Lire des mots',
    official: 'Décoder des mots réguliers en autonomie',
    domain: 'francais',
    level: 'cp',
    period: 2,
    prereqs: ['fr.cp.decodage.syllabes'],
  },
  {
    id: 'fr.cp.encodage.syllabes',
    label: 'Écrire des syllabes entendues',
    official: 'Encoder des syllabes sous la dictée (correspondances phonèmes-graphèmes)',
    domain: 'francais',
    level: 'cp',
    period: 1,
    prereqs: ['fr.cp.cgp.voyelles'],
  },
  {
    id: 'fr.cp.encodage.mots',
    label: 'Écrire des mots entendus',
    official: 'Encoder des mots réguliers sous la dictée',
    domain: 'francais',
    level: 'cp',
    period: 2,
    prereqs: ['fr.cp.encodage.syllabes'],
  },
  {
    id: 'fr.cp.lettres.confusables',
    label: 'Ne plus confondre b/d, p/q',
    official: 'Distinguer les lettres proches visuellement (b/d, p/q, m/n)',
    domain: 'francais',
    level: 'cp',
    period: 3,
    prereqs: ['fr.gs.lettres.graphies'],
  },
  // ---------------- FRANÇAIS — phrase / syntaxe (CP) ----------------
  {
    id: 'fr.cp.phrase.sens',
    label: 'Construire une phrase qui a du sens',
    official: 'Produire une phrase orale syntaxiquement correcte et sémantiquement cohérente',
    domain: 'francais',
    level: 'cp',
    period: 2,
  },
  {
    id: 'fr.cp.phrase.accord-gn',
    label: 'Accorder l’article et le nom (le, la, les)',
    official: 'Réaliser l’accord en nombre dans le groupe nominal (déterminant-nom)',
    domain: 'francais',
    level: 'cp',
    period: 3,
    prereqs: ['fr.cp.phrase.sens'],
  },
  {
    id: 'fr.cp.phrase.accord-sv',
    label: 'Accorder le verbe avec le sujet',
    official: 'Réaliser l’accord sujet-verbe en nombre dans des cas simples',
    domain: 'francais',
    level: 'cp',
    period: 4,
    prereqs: ['fr.cp.phrase.accord-gn'],
  },

  // ---------------- MATHS — nombres (GS) ----------------
  {
    id: 'ma.gs.subitizing',
    label: 'Reconnaître une petite quantité d’un coup d’œil',
    official: 'Reconnaître immédiatement de petites quantités et des configurations connues (dés, doigts)',
    domain: 'maths',
    level: 'gs',
  },
  {
    id: 'ma.gs.denombrer10',
    label: 'Compter une collection jusqu’à 10',
    official: 'Dénombrer des quantités jusqu’à 10 (dès 5 ans)',
    domain: 'maths',
    level: 'gs',
  },
  {
    id: 'ma.gs.droite10',
    label: 'Placer les nombres jusqu’à 10 sur une piste',
    official: 'Associer un nombre à une position sur une piste graduée jusqu’à 10',
    domain: 'maths',
    level: 'gs',
    prereqs: ['ma.gs.denombrer10'],
  },
  {
    id: 'ma.gs.decompo5',
    label: 'Décomposer les nombres jusqu’à 5',
    official: 'Compositions et décompositions verbalisées des nombres jusqu’à 5 (« trois c’est deux et un »)',
    domain: 'maths',
    level: 'gs',
    prereqs: ['ma.gs.denombrer10'],
  },
  {
    id: 'ma.gs.decompo10',
    label: 'Décomposer les nombres jusqu’à 10',
    official: 'Compositions et décompositions des nombres de 2 à 10 (y compris 10 = 5+5)',
    domain: 'maths',
    level: 'gs',
    prereqs: ['ma.gs.decompo5'],
  },
  {
    id: 'ma.gs.comparer',
    label: 'Comparer des quantités',
    official: 'Comparer des collections et utiliser le surcomptage à partir du plus grand',
    domain: 'maths',
    level: 'gs',
    prereqs: ['ma.gs.denombrer10'],
  },
  // ---------------- MATHS — numération (CP) ----------------
  {
    id: 'ma.cp.complements10',
    label: 'Les compléments à 10',
    official: 'Mémoriser les compléments à 10',
    domain: 'maths',
    level: 'cp',
    period: 2,
    prereqs: ['ma.gs.decompo10'],
  },
  {
    id: 'ma.cp.doubles',
    label: 'Les doubles jusqu’à 10',
    official: 'Mémoriser les doubles des nombres de 1 à 10',
    domain: 'maths',
    level: 'cp',
    period: 2,
    prereqs: ['ma.gs.decompo10'],
  },
  {
    id: 'ma.cp.num.lire59',
    label: 'Lire les nombres jusqu’à 59',
    official: 'Lire, écrire et représenter les nombres jusqu’à 59 (période 2)',
    domain: 'maths',
    level: 'cp',
    period: 2,
    prereqs: ['ma.gs.denombrer10'],
  },
  {
    id: 'ma.cp.num.dizaines',
    label: 'Comprendre dizaines et unités',
    official: 'Comprendre la valeur positionnelle : groupements par 10, dizaines et unités',
    domain: 'maths',
    level: 'cp',
    period: 2,
    prereqs: ['ma.cp.num.lire59'],
  },
  {
    id: 'ma.cp.num.echange',
    label: 'Échanger 1 dizaine contre 10 unités',
    official: 'Comprendre l’équivalence d’échange : une dizaine vaut dix unités',
    domain: 'maths',
    level: 'cp',
    period: 3,
    prereqs: ['ma.cp.num.dizaines'],
  },
  {
    id: 'ma.cp.num.decompo100',
    label: 'Décomposer les nombres jusqu’à 100',
    official: 'Décompositions additives et non canoniques des nombres jusqu’à 100 (période 3)',
    domain: 'maths',
    level: 'cp',
    period: 3,
    prereqs: ['ma.cp.num.echange'],
  },
  {
    id: 'ma.cp.num.droite',
    label: 'Estimer la position d’un nombre jusqu’à 100',
    official: 'Situer des nombres sur une droite graduée : placement et estimation (période 3)',
    domain: 'maths',
    level: 'cp',
    period: 3,
    prereqs: ['ma.cp.num.lire59', 'ma.gs.droite10'],
  },
  // ---------------- MATHS — calcul (CP) ----------------
  {
    id: 'ma.cp.add10',
    label: 'Additionner jusqu’à 10',
    official: 'Calculer des sommes de deux nombres inférieures ou égales à 10',
    domain: 'maths',
    level: 'cp',
    period: 1,
    prereqs: ['ma.gs.decompo10'],
  },
  {
    id: 'ma.cp.add20',
    label: 'Additionner jusqu’à 20',
    official: 'Calculer des sommes jusqu’à 20, passage de la dizaine',
    domain: 'maths',
    level: 'cp',
    period: 3,
    prereqs: ['ma.cp.add10', 'ma.cp.complements10'],
  },
  {
    id: 'ma.cp.sous10',
    label: 'Soustraire jusqu’à 10',
    official: 'Calculer des différences, comprendre la soustraction comme opération inverse',
    domain: 'maths',
    level: 'cp',
    period: 2,
    prereqs: ['ma.cp.add10'],
  },
  {
    id: 'ma.cp.sous20',
    label: 'Soustraire jusqu’à 20',
    official: 'Calculer des différences jusqu’à 20, passage de la dizaine',
    domain: 'maths',
    level: 'cp',
    period: 4,
    prereqs: ['ma.cp.sous10', 'ma.cp.add20'],
  },
  {
    id: 'ma.cp.egalite',
    label: 'Comprendre le signe égal',
    official: 'Comprendre l’égalité comme équivalence entre deux quantités ou deux expressions',
    domain: 'maths',
    level: 'cp',
    period: 2,
    prereqs: ['ma.gs.comparer'],
  },
  // ---------------- MATHS — fractions précoces (CE1, programme 2025) ----------------
  {
    id: 'ma.ce1.fractions.parts',
    label: 'Partager en parts égales',
    official: 'Partager une grandeur en parts égales : moitié, tiers, quart',
    domain: 'maths',
    level: 'ce1',
    prereqs: ['ma.cp.egalite'],
  },
  {
    id: 'ma.ce1.fractions.lire',
    label: 'Lire un demi, un tiers, un quart',
    official: 'Associer les écritures 1/2, 1/3, 1/4 à un partage de l’unité',
    domain: 'maths',
    level: 'ce1',
    prereqs: ['ma.ce1.fractions.parts'],
  },
  // ---------------- MATHS — monnaie (CP) ----------------
  {
    id: 'ma.cp.monnaie.pieces',
    label: 'Reconnaître pièces et billets',
    official: 'Connaître les pièces et billets en euros',
    domain: 'maths',
    level: 'cp',
    period: 3,
  },
  {
    id: 'ma.cp.monnaie.payer',
    label: 'Payer un montant exact',
    official: 'Constituer une somme en euros avec pièces et billets',
    domain: 'maths',
    level: 'cp',
    period: 4,
    prereqs: ['ma.cp.monnaie.pieces', 'ma.cp.add10'],
  },
  {
    id: 'ma.cp.monnaie.rendre',
    label: 'Rendre la monnaie',
    official: 'Rendre la monnaie sur un montant simple (complément)',
    domain: 'maths',
    level: 'cp',
    period: 5,
    prereqs: ['ma.cp.monnaie.payer', 'ma.cp.complements10'],
  },
  // ---------------- MATHS — problèmes (CP) ----------------
  {
    id: 'ma.cp.pb.partiestout',
    label: 'Résoudre des problèmes parties-tout',
    official: 'Résoudre des problèmes additifs en une étape (parties-tout), modéliser par un schéma',
    domain: 'maths',
    level: 'cp',
    period: 2,
    prereqs: ['ma.cp.add10'],
  },
  {
    id: 'ma.cp.pb.transfo',
    label: 'Problèmes : gagner ou perdre',
    official: 'Résoudre des problèmes de transformation (augmentation ou diminution d’une quantité)',
    domain: 'maths',
    level: 'cp',
    period: 2,
    prereqs: ['ma.cp.pb.partiestout'],
  },
  {
    id: 'ma.cp.pb.partie',
    label: 'Trouver une partie manquante',
    official: 'Résoudre des problèmes de recherche d’une partie (schéma parties-tout)',
    domain: 'maths',
    level: 'cp',
    period: 3,
    prereqs: ['ma.cp.pb.partiestout', 'ma.cp.sous10'],
  },
  {
    id: 'ma.cp.pb.compare',
    label: 'Problèmes : combien de plus ?',
    official: 'Résoudre des problèmes de comparaison (recherche de la différence)',
    domain: 'maths',
    level: 'cp',
    period: 4,
    prereqs: ['ma.cp.pb.partie'],
  },

  // ---------------- FRANÇAIS — fluence (CP/CE1) ----------------
  {
    id: 'fr.cp.fluence',
    label: 'Lire de plus en plus vite',
    official: 'Lire un texte déchiffrable avec une fluence de 30 à 50 mots par minute (fin CP)',
    domain: 'francais',
    level: 'cp',
    period: 5,
    prereqs: ['fr.cp.decodage.mots'],
  },
  {
    id: 'fr.ce1.fluence',
    label: 'Lire avec aisance',
    official: 'Lire à voix haute avec une fluence d’environ 70 mots par minute (fin CE1)',
    domain: 'francais',
    level: 'ce1',
    prereqs: ['fr.cp.fluence'],
  },
  // ---------------- FRANÇAIS — geste d'écriture ----------------
  {
    id: 'fr.gs.graphisme.formes',
    label: 'Tracer boucles, ponts et vagues',
    official: 'Réaliser les tracés de base de l’écriture : boucles, ponts, vagues, ronds',
    domain: 'francais',
    level: 'gs',
  },
  {
    id: 'fr.cp.ecriture.cursive',
    label: 'Tracer les lettres en attaché',
    official: 'Tracer les lettres cursives minuscules avec un geste fluide et normé',
    domain: 'francais',
    level: 'cp',
    period: 1,
    prereqs: ['fr.gs.graphisme.formes'],
  },
  // ---------------- FRANÇAIS — vocabulaire (GS) ----------------
  {
    id: 'fr.gs.vocab.mots',
    label: 'Comprendre les mots des imagiers',
    official: 'Acquérir et comprendre le vocabulaire des corpus thématiques (objectif 2 500 mots)',
    domain: 'francais',
    level: 'gs',
  },
  {
    id: 'fr.gs.vocab.categories',
    label: 'Ranger les mots par famille',
    official: 'Catégoriser le lexique : regrouper des mots selon leur thème',
    domain: 'francais',
    level: 'gs',
    prereqs: ['fr.gs.vocab.mots'],
  },
  // ---------------- FRANÇAIS — compréhension (CP) ----------------
  {
    id: 'fr.cp.comp.anaphores',
    label: 'Comprendre il, elle, ils, elles',
    official: 'Comprendre les reprises anaphoriques (pronoms) dans un texte entendu',
    domain: 'francais',
    level: 'cp',
    period: 3,
  },
  {
    id: 'fr.cp.comp.inferences',
    label: 'Deviner ce que le texte ne dit pas',
    official: 'Produire des inférences simples à partir d’un texte entendu',
    domain: 'francais',
    level: 'cp',
    period: 4,
    prereqs: ['fr.cp.comp.anaphores'],
  },

  // ---------------- LOGIQUE / pré-code ----------------
  {
    id: 'lo.gs.directions',
    label: 'Gauche, droite, haut, bas',
    official: 'Se repérer dans l’espace : vocabulaire des directions et déplacements',
    domain: 'logique',
    level: 'gs',
  },
  {
    id: 'lo.cp.code.sequence',
    label: 'Programmer un déplacement',
    official: 'Coder et décoder un déplacement sur un quadrillage',
    domain: 'logique',
    level: 'cp',
    period: 2,
    prereqs: ['lo.gs.directions'],
  },
  {
    id: 'lo.cp.code.boucles',
    label: 'Utiliser une boucle « répéter »',
    official: 'Anticiper et optimiser une suite d’instructions (initiation à la répétition)',
    domain: 'logique',
    level: 'cp',
    period: 4,
    prereqs: ['lo.cp.code.sequence'],
  },
  // ---------------- LOGIQUE — motifs organisés (GS, programme 2025) ----------------
  {
    id: 'lo.gs.motifs.suite',
    label: 'Continuer un motif (AB, AAB…)',
    official: 'Motifs organisés : identifier la régularité et poursuivre un algorithme simple',
    domain: 'logique',
    level: 'gs',
  },
  {
    id: 'lo.gs.motifs.creer',
    label: 'Créer et coder un motif',
    official: 'Motifs organisés : produire un motif régulier et le transcrire en symboles',
    domain: 'logique',
    level: 'gs',
    prereqs: ['lo.gs.motifs.suite'],
  },
  // ---------------- LOGIQUE — espace / quadrillage ----------------
  {
    id: 'lo.gs.quadrillage',
    label: 'Se repérer sur un quadrillage',
    official: 'Se repérer dans un quadrillage : cases, lignes et colonnes',
    domain: 'logique',
    level: 'gs',
    prereqs: ['lo.gs.directions'],
  },
  {
    id: 'lo.cp.coordonnees',
    label: 'Utiliser des coordonnées (B3)',
    official: 'Coder la position d’une case par un couple lettre-nombre',
    domain: 'logique',
    level: 'cp',
    period: 3,
    prereqs: ['lo.gs.quadrillage'],
  },
  {
    id: 'lo.cp.symetrie',
    label: 'Compléter une figure symétrique',
    official: 'Compléter une figure par symétrie axiale sur quadrillage',
    domain: 'logique',
    level: 'cp',
    period: 4,
    prereqs: ['lo.gs.quadrillage'],
  },

  // ---------------- DÉCOUVRIR LE MONDE — le temps ----------------
  {
    id: 'mo.gs.temps.journee',
    label: 'Se repérer dans la journée',
    official: 'Situer les événements de la journée les uns par rapport aux autres (matin, midi, soir)',
    domain: 'monde',
    level: 'gs',
  },
  {
    id: 'mo.gs.temps.semaine',
    label: 'Connaître les jours de la semaine',
    official: 'Nommer et ordonner les jours de la semaine',
    domain: 'monde',
    level: 'gs',
    prereqs: ['mo.gs.temps.journee'],
  },
  {
    id: 'mo.cp.temps.heures',
    label: 'Lire les heures sur l’horloge',
    official: 'Lire l’heure sur une horloge à aiguilles : heures piles puis demi-heures',
    domain: 'monde',
    level: 'cp',
    period: 3,
    prereqs: ['mo.gs.temps.semaine'],
  },
  {
    id: 'mo.cp.temps.calendrier',
    label: 'Se repérer dans l’année',
    official: 'Utiliser le calendrier : jours, mois et saisons',
    domain: 'monde',
    level: 'cp',
    period: 4,
    prereqs: ['mo.gs.temps.semaine'],
  },
  // ---------------- DÉCOUVRIR LE MONDE — la matière ----------------
  {
    id: 'mo.gs.eau.etats',
    label: 'Connaître les états de l’eau',
    official: 'Identifier les trois états de l’eau : liquide, glace, vapeur',
    domain: 'monde',
    level: 'gs',
  },
  {
    id: 'mo.cp.eau.cycle',
    label: 'Comprendre le cycle de l’eau',
    official: 'Décrire le trajet de l’eau dans la nature (évaporation, nuage, pluie)',
    domain: 'monde',
    level: 'cp',
    period: 5,
    prereqs: ['mo.gs.eau.etats'],
  },
  // ---------------- DÉCOUVRIR LE MONDE — le vivant ----------------
  {
    id: 'mo.gs.vivant.regime',
    label: 'Donner le bon repas à chaque animal',
    official:
      'Explorer le monde du vivant : associer un animal à son alimentation (ce qu’il mange dans la nature)',
    domain: 'monde',
    level: 'gs',
  },
  {
    id: 'mo.cp.vivant.classer',
    label: 'Herbivore, carnivore ou omnivore ?',
    official:
      'Questionner le monde du vivant : classer les animaux selon leur régime alimentaire (herbivore, carnivore, omnivore)',
    domain: 'monde',
    level: 'cp',
    prereqs: ['mo.gs.vivant.regime'],
  },

  // ---------------- ANGLAIS — premiers mots (CP) ----------------
  {
    id: 'en.cp.colours',
    label: 'Les couleurs en anglais',
    official: 'Comprendre à l’oral les couleurs usuelles (red, blue, green…)',
    domain: 'anglais',
    level: 'cp',
  },
  {
    id: 'en.cp.numbers',
    label: 'Compter en anglais',
    official: 'Comprendre à l’oral les nombres de 1 à 10',
    domain: 'anglais',
    level: 'cp',
  },
  {
    id: 'en.cp.animals',
    label: 'Les animaux en anglais',
    official: 'Comprendre à l’oral le nom des animaux familiers',
    domain: 'anglais',
    level: 'cp',
  },
  {
    id: 'en.cp.consignes',
    label: 'Comprendre des consignes (Simon says)',
    official: 'Comprendre des consignes simples données à l’oral en anglais',
    domain: 'anglais',
    level: 'cp',
    prereqs: ['en.cp.colours'],
  },

  // ---------------- MUSIQUE — univers sonores ----------------
  {
    id: 'ar.gs.rythme.reproduire',
    label: 'Reproduire un rythme entendu',
    official: 'Mémoriser et reproduire une courte séquence sonore',
    domain: 'arts',
    level: 'gs',
  },
  {
    id: 'ar.gs.rythme.composer',
    label: 'Composer une petite musique',
    official: 'Produire et organiser une séquence sonore intentionnelle',
    domain: 'arts',
    level: 'gs',
    prereqs: ['ar.gs.rythme.reproduire'],
  },

  // ---------------- ARTS PLASTIQUES — la couleur ----------------
  {
    id: 'ar.gs.couleurs.primaires',
    label: 'Reconnaître les couleurs primaires',
    official: 'Arts plastiques : identifier et nommer les couleurs primaires (rouge, bleu, jaune)',
    domain: 'arts',
    level: 'gs',
  },
  {
    id: 'ar.gs.couleurs.melanges',
    label: 'Mélanger les couleurs',
    official:
      'Arts plastiques : expérimenter le mélange des couleurs et découvrir les couleurs secondaires (orange, vert, violet)',
    domain: 'arts',
    level: 'gs',
    prereqs: ['ar.gs.couleurs.primaires'],
  },
  {
    id: 'ar.cp.couleurs.obtenir',
    label: 'Obtenir une couleur par mélange',
    official:
      'Arts plastiques : anticiper et réaliser le mélange permettant d’obtenir une couleur donnée, jouer sur les nuances (clair, foncé)',
    domain: 'arts',
    level: 'cp',
    prereqs: ['ar.gs.couleurs.melanges'],
  },

  // ---------------- LOGIQUE — raisonnement déductif ----------------
  {
    id: 'lo.gs.deduction.contrainte',
    label: 'Compléter une grille sans répétition',
    official:
      'Raisonner : compléter une grille (carré 4×4) en respectant la règle de non-répétition sur les lignes, les colonnes et les régions',
    domain: 'logique',
    level: 'gs',
    prereqs: ['lo.gs.quadrillage'],
  },

  // ---------------- DÉCOUVRIR LE MONDE — l’espace ----------------
  {
    id: 'mo.gs.espace.reperer',
    label: 'Se repérer sur un plan',
    official:
      'Questionner le monde de l’espace : se repérer sur un plan simple et situer des lieux les uns par rapport aux autres (à gauche, à droite, au-dessus, en-dessous)',
    domain: 'monde',
    level: 'gs',
  },
  {
    id: 'mo.cp.espace.itineraire',
    label: 'Suivre et décrire un itinéraire',
    official:
      'Questionner le monde de l’espace : coder, décoder et suivre un déplacement sur un plan quadrillé pour aller d’un lieu à un autre',
    domain: 'monde',
    level: 'cp',
    prereqs: ['mo.gs.espace.reperer'],
  },

  // ---------------- EMC — émotions et vivre-ensemble ----------------
  {
    id: 'emc.gs.emotions.nommer',
    label: 'Identifier et nommer ses émotions',
    official:
      'EMC, la sensibilité : identifier, nommer et exprimer les émotions de base (joie, tristesse, colère, peur, surprise)',
    domain: 'emc',
    level: 'gs',
  },
  {
    id: 'emc.cp.emotions.reconnaitre',
    label: 'Reconnaître l’émotion d’autrui',
    official:
      'EMC, la sensibilité : identifier les émotions et sentiments d’autrui à partir d’une situation (empathie, décentration)',
    domain: 'emc',
    level: 'cp',
    prereqs: ['emc.gs.emotions.nommer'],
  },
  {
    id: 'emc.cp.conflit.reguler',
    label: 'Réagir sans violence à une émotion forte',
    official:
      'EMC, le droit et la règle : gérer une émotion forte ou un désaccord de façon non violente, exprimer un besoin et écouter l’autre',
    domain: 'emc',
    level: 'cp',
    prereqs: ['emc.cp.emotions.reconnaitre'],
  },

  // ============================================================
  // SPRINT CONFORMITÉ 2026-2027 — nouveaux programmes au CP.
  // Sciences et technologie (BO n°24 du 11/06/2026) et histoire-
  // géographie (BO n°22 du 28/05/2026) remplacent « Questionner le
  // monde » ; anglais Pré-A1 (BO n°12 du 19/03/2026) ; géométrie et
  // mesures (BO oct. 2024, déjà en vigueur) ; EMC, le droit et l’engagement.
  // ============================================================

  // ---------------- SCIENCES & TECHNOLOGIE — le corps humain (monde) ----------------
  {
    id: 'mo.gs.corps.parties',
    label: 'Nommer les parties du corps',
    official:
      'Explorer le monde du vivant : situer et nommer les principales parties du corps humain',
    domain: 'monde',
    level: 'gs',
  },
  {
    id: 'mo.cp.corps.sens',
    label: 'Associer chaque sens à son organe',
    official:
      'Sciences et technologie : associer chacun des cinq sens à l’organe qui lui correspond',
    domain: 'monde',
    level: 'cp',
    prereqs: ['mo.gs.corps.parties'],
  },
  {
    id: 'mo.cp.corps.hygiene',
    label: 'Les gestes pour rester en bonne santé',
    official:
      'Sciences et technologie : appliquer des règles élémentaires d’hygiène de vie (sommeil, alimentation, propreté)',
    domain: 'monde',
    level: 'cp',
  },
  // ---------------- SCIENCES & TECHNOLOGIE — le vivant végétal (monde) ----------------
  {
    id: 'mo.gs.vivant.besoins',
    label: 'Les besoins des êtres vivants',
    official:
      'Explorer le monde du vivant : identifier les besoins d’un végétal pour vivre et grandir (eau, lumière)',
    domain: 'monde',
    level: 'gs',
  },
  {
    id: 'mo.cp.vivant.cycle',
    label: 'Le cycle de vie d’une plante',
    official:
      'Sciences et technologie : décrire les étapes du développement d’un végétal (graine, germe, plante, fleur, fruit)',
    domain: 'monde',
    level: 'cp',
    prereqs: ['mo.gs.vivant.besoins'],
  },
  // ---------------- TECHNOLOGIE — les objets techniques (monde) ----------------
  {
    id: 'mo.cp.objets.besoin',
    label: 'Un objet pour un besoin',
    official: 'Technologie : identifier un objet technique comme une réponse à un besoin',
    domain: 'monde',
    level: 'cp',
  },
  {
    id: 'mo.cp.objets.matiere',
    label: 'De la matière à l’objet',
    official: 'Technologie : relier un objet fabriqué à la matière première dont il est issu',
    domain: 'monde',
    level: 'cp',
    prereqs: ['mo.cp.objets.besoin'],
  },
  // ---------------- HISTOIRE — se situer dans le temps (monde) ----------------
  {
    id: 'mo.cp.histoire.avant',
    label: 'Hier et aujourd’hui',
    official:
      'Se situer dans le temps : distinguer ce qui appartient au passé (autrefois) et au présent (aujourd’hui)',
    domain: 'monde',
    level: 'cp',
  },
  {
    id: 'mo.cp.histoire.generations',
    label: 'Ranger les générations',
    official:
      'Se situer dans le temps : ordonner les générations d’une famille (bébé, enfant, parent, grand-parent)',
    domain: 'monde',
    level: 'cp',
    prereqs: ['mo.cp.histoire.avant'],
  },
  // ---------------- GÉOGRAPHIE — se situer dans l’espace (monde) ----------------
  {
    id: 'mo.gs.geo.paysages',
    label: 'Reconnaître des paysages',
    official:
      'Se situer dans l’espace : reconnaître et nommer différents paysages (mer, montagne, ville, campagne, forêt, désert)',
    domain: 'monde',
    level: 'gs',
  },
  {
    id: 'mo.cp.geo.monde',
    label: 'La Terre vue de loin',
    official:
      'Se situer dans l’espace : distinguer les terres et les océans sur un globe ou un planisphère',
    domain: 'monde',
    level: 'cp',
    prereqs: ['mo.gs.geo.paysages'],
  },
  // ---------------- ANGLAIS — Pré-A1 oral (anglais) ----------------
  {
    id: 'en.cp.greetings',
    label: 'Saluer et remercier',
    official:
      'Comprendre à l’oral des formules de salutation et de politesse (hello, goodbye, thank you, please)',
    domain: 'anglais',
    level: 'cp',
  },
  {
    id: 'en.cp.self',
    label: 'Se présenter',
    official: 'Comprendre à l’oral une présentation simple (name, age, favourite colour)',
    domain: 'anglais',
    level: 'cp',
    prereqs: ['en.cp.greetings'],
  },
  {
    id: 'en.cp.feelings',
    label: 'Dire comment je me sens',
    official:
      'Comprendre à l’oral l’expression d’émotions et d’états (happy, sad, tired, I’m OK)',
    domain: 'anglais',
    level: 'cp',
  },
  {
    id: 'en.cp.body',
    label: 'Les parties du corps en anglais',
    official: 'Comprendre à l’oral le nom des parties du corps (head, shoulders, knees, toes…)',
    domain: 'anglais',
    level: 'cp',
  },
  {
    id: 'en.cp.food',
    label: 'La nourriture en anglais',
    official: 'Comprendre à l’oral le nom d’aliments courants (apple, bread, milk…)',
    domain: 'anglais',
    level: 'cp',
  },
  {
    id: 'en.cp.tastes',
    label: 'Aimer / ne pas aimer',
    official: 'Comprendre à l’oral l’expression des goûts (I like / I don’t like)',
    domain: 'anglais',
    level: 'cp',
    prereqs: ['en.cp.food'],
  },
  // ---------------- MATHS — espace et géométrie (maths) ----------------
  {
    id: 'ma.gs.geo.formes',
    label: 'Reconnaître les formes',
    official:
      'Espace et géométrie : reconnaître et nommer les figures planes usuelles (carré, rectangle, triangle, cercle)',
    domain: 'maths',
    level: 'gs',
  },
  {
    id: 'ma.cp.geo.solides',
    label: 'Reconnaître les solides',
    official:
      'Espace et géométrie : reconnaître et nommer des solides usuels (cube, boule, pavé, pyramide)',
    domain: 'maths',
    level: 'cp',
    prereqs: ['ma.gs.geo.formes'],
  },
  // ---------------- MATHS — grandeurs et mesures (maths) ----------------
  {
    id: 'ma.gs.mesure.comparer',
    label: 'Comparer des longueurs',
    official:
      'Grandeurs et mesures : comparer et ranger des objets selon leur longueur (plus long, plus court)',
    domain: 'maths',
    level: 'gs',
  },
  {
    id: 'ma.cp.mesure.longueurs',
    label: 'Mesurer une longueur',
    official: 'Grandeurs et mesures : mesurer une longueur par report d’une unité',
    domain: 'maths',
    level: 'cp',
    prereqs: ['ma.gs.mesure.comparer'],
  },
  // ---------------- EMC — le droit, la règle et l’engagement (emc) ----------------
  {
    id: 'emc.cp.regles',
    label: 'Les règles de la vie en commun',
    official: 'EMC, le droit et la règle : comprendre et respecter les règles de la vie collective',
    domain: 'emc',
    level: 'cp',
  },
  {
    id: 'emc.cp.entraide',
    label: 'Aider et coopérer',
    official: 'EMC, l’engagement : coopérer, aider et s’entraider au sein du groupe',
    domain: 'emc',
    level: 'cp',
    prereqs: ['emc.cp.regles'],
  },
]

export const SKILLS_BY_ID: ReadonlyMap<string, SkillDef> = new Map(
  SKILL_MAP.map((s) => [s.id, s]),
)

export const DOMAIN_LABELS: Record<SkillDef['domain'], string> = {
  francais: 'Français — lire et écrire',
  maths: 'Maths — nombres et calcul',
  logique: 'Logique — se repérer et coder',
  monde: 'Explorer le monde — sciences, temps et espace',
  anglais: 'Anglais — premiers mots',
  arts: 'Arts — musique et couleurs',
  emc: 'Émotions et vivre-ensemble',
}

export const LEVEL_LABELS: Record<SkillDef['level'], string> = {
  gs: 'Grande Section',
  cp: 'CP',
  ce1: 'CE1',
}
