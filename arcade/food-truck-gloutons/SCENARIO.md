# Le Food-Truck des Gloutons — Scénario et actes

Jeu arcade 3D (React Three Fiber), 7-8 ans, CE1 → CE2. Refonte « jeu vidéo » des Gloutons du Dix.
Bible visuelle : `arcade-direction.md`. Lois de game design : `ENGINE.md` (les 5, non négociables).

## Pitch

Gloup, le petit glouton violet, a hérité du vieux food-truck de l'Archipel. Problème : il mange tout ce
qu'il cuisine. Il lui faut un **chef** : l'enfant. Le truck part faire le tour des îles. À chaque arrêt,
des gloutons de la région font la queue avec un **ticket de commande** (un nombre). Certains ont déjà
grignoté (« il veut 100, il a déjà 37 »). Le chef compose exactement ce qu'il manque, Gloup goûte,
et le client repart en dansant.

Ce que l'enfant fait, toujours : **produire une quantité** (jamais choisir parmi des réponses).
Ce que l'enfant apprend : cible − déjà mangé = à donner, en manipulant unités, dizaines, centaines, paquets.

## Personnages

- **Gloup** — copilote et goûteur. Toque blanche. Parle à l'enfant (« Chef ! »). Voix : `eloise`.
- **Les clients** — gloutons de la région, un accessoire par acte. Ils ne parlent pas : ils montrent
  leur ticket et leur ventre-jauge. Onomatopées seulement (« Gloup ! », « Hic ! », « Grrr… » de faim).
- **Les boss** — un Grand Gourmand par acte, qui commande un **menu** (3 commandes enchaînées).
- **La narratrice** — consignes. Voix : `denise`.

## Structure

- **Acte** = un arrêt du truck : décor, clients, équipement débloqué, boss, sticker.
- **Service** = 8 commandes d'un seul type, une compétence, un Tuner (2 crans), étoiles au premier essai.
- Le **plan de route** (menu du jeu) montre les 5 arrêts sur la carte de l'Archipel ; dans un arrêt, les
  services en cartes (cadenas, étoiles). Service suivant débloqué à ≥ 2 étoiles ; boss débloqué quand tous
  les services de l'acte ont ≥ 2 étoiles ; acte suivant débloqué par le boss.
- Entre deux actes : travelling du truck sur la route (4 s, tap pour passer).
- **Sticker** collé sur la carrosserie à chaque boss réussi à 3 étoiles ; visible sur le plan de route.

## Boucle d'une commande

1. Le client arrive au comptoir. Son ticket s'affiche (nombre en DOM) **et** est dit :
   « Il veut *quarante*. Il a déjà *trente-sept*. Combien il en faut encore ? »
2. L'enfant compose :
   - **mode tap** (actes 1-2) : les aliments sont posés sur le comptoir ; tap = il saute dans le plateau ;
     re-tap = il revient. Le total du plateau est affiché en permanence (déjà mangé + plateau).
   - **mode pavé** (actes 3-5) : l'enfant tape le nombre ; à chaque chiffre, le plateau se remplit en
     caisses de 100 / caisses de 10 / brochettes — la numération reste visible.
3. « Servir ! » → Gloup goûte.
   - **Juste** : « Gloup ! Parfait, chef ! », le client danse, confettis, point de progression.
   - **Trop** : « Hic ! C'est trop ! », les aliments en trop rebondissent hors du plateau (on voit l'excès).
   - **Pas assez** : « Encore faim… », la jauge du ventre montre le manque.
   - Puis **recomptage à voix haute** : dizaines puis unités (« dix, vingt, trente… trente-sept, trente-huit,
     trente-neuf, quarante — ça fait quarante, il en voulait quarante ») ; pour les compléments, le chemin
     par la dizaine est montré (37 → 40 → 100).
   - Après 2 échecs : **indice** — les bons aliments (ou le chiffre attendu sur le pavé) brillent.
   - Jamais « faux ». La commande reste jusqu'à réussite ; seule la première tentative compte pour l'étoile.
4. Le client repart, le suivant avance. 8 clients = fin du service, écran d'étoiles.

## Acte 1 — La Plage des Dix (révision CP)

Décor : plage du lagon, matin doux, parasols corail, truck garé sur le sable. Clients : petits gloutons
en lunettes de soleil. Équipement : **le comptoir à brochettes** (brochettes de 1 à 9 boulettes).

Gloup : « Bienvenue au Food-Truck des Gloutons ! Moi c'est Gloup. Toi, tu es le chef. Premier arrêt : la
plage. Ici, tout le monde veut dix ! »

Services :
- **S1 · Compléments à 10** — `ma.cp.complements10` — tap. Le client a déjà 5-8 (Tuner 0) / 1-9 (Tuner 1),
  veut 10. Une brochette valant le complément est toujours présente ; piège : une brochette égale au
  « déjà mangé » est toujours présente aussi.
- **S2 · Les Jumeaux** — `ma.cp.doubles` — tap. Deux clients identiques : chaque brochette est mangée par
  les deux. Cible paire 2-12 / 2-20. « Ce sont des jumeaux : ce que tu sers, ils le mangent tous les deux ! »
- **Boss · Les Jumeaux Géants** — menu de 3 commandes : double, double, puis double avec « déjà mangé ».

Sticker : parasol. Rôle caché : tutoriel du tap 3D et de la boucle Servir / recompter.

## Acte 2 — Le Marché des Dizaines (CE1, périodes 1-2)

Décor : marché du port, étals corail et soleil, fin de matinée. Clients : gloutons à panier.
Équipement débloqué : **la caisse de 10** — une dizaine devient un objet qu'on sert d'un tap.

Gloup : « Au marché, on compte en caisses ! Une caisse, c'est dix brochettes d'un coup. »

Services :
- **S3 · Jusqu'à la dizaine** — `ma.ce1.calc.complement-dizaine` — tap (brochettes seules).
  Déjà mangé 11-49 non multiple de 10 (Tuner 0) / 11-99 (Tuner 1) ; cible = dizaine supérieure.
- **S4 · Passer la dizaine** — `ma.ce1.calc.passage-dizaine` — tap. « Il veut 13, il a 8. » Déjà mangé
  a ∈ [5, 9], cible a + b avec b ∈ [2, 9] et passage (Tuner 0) ; a ∈ [11, 89] (Tuner 1).
- **S5 · Caisses et brochettes** — `ma.cp.num.decompo100` (rappel) — tap avec caisses de 10 **et**
  brochettes. « Il veut 60, il a 24 » → 3 caisses + 6 brochettes. Le comptoir manque parfois de brochettes :
  préférer la caisse (échange 10 brochettes = 1 caisse).
- **Boss · La Marchande** — menu : dizaine supérieure, puis caisses + brochettes, puis passage de dizaine.

Sticker : panier de fruits.

## Acte 3 — Le Port des Cent (CE1, périodes 3-5)

Décor : port de commerce, grues lagon, containers colorés, soleil de midi. Clients : gloutons dockers,
plus grands. Équipement débloqué : **le pavé de commande** (NumPad) — le nombre tapé se matérialise sur
le plateau en caisses de 10 et brochettes.

Gloup : « Les dockers ont une faim de cent ! Tape ce qu'il manque, je prépare les caisses. »

Services :
- **S6 · Compléments à 100 en dizaines** — `ma.ce1.calc.complements100` — pavé. Déjà mangé multiple de 10.
- **S7 · Compléments à 100** — `ma.ce1.calc.complements100` — pavé. Déjà mangé quelconque 11-89 ;
  recomptage par le chemin de la dizaine (37 → 40 → 100).
- **S8 · Commande directe** — `ma.cp.num.decompo100` — pavé. « Il veut 84. » Le plateau doit montrer
  8 caisses et 4 brochettes : l'enfant tape 84 et voit la décomposition se construire.
- **Boss · La Capitaine** — deux gloutons partagent une commande de 100 : le premier a déjà a, l'enfant
  sert le second ; puis trois gloutons (a + b déjà servis).

Sticker : ancre.

## Acte 4 — La Fête des Paquets (CE2, périodes 1-2)

Décor : fête foraine du village, guirlandes soleil, ciel du soir. Clients : familles de gloutons en
chapeaux de fête. Équipement débloqué : **la machine à paquets** — les aliments sortent groupés
(paquets de 2, 5, 10, puis 3 et 4).

Gloup : « À la fête, on sert par paquets ! Cinq paquets de quatre, ça fait combien ? »

Services :
- **S9 · Tables de 2, 5, 10** — `ma.ce2.mult.tables-2-5-10` — pavé. « n paquets de k » avec n ∈ [2, 9] ;
  le plateau montre les paquets servis, Gloup les compte de k en k au recomptage.
- **S10 · Tables de 3 et 4** — `ma.ce2.mult.tables-3-4` — pavé.
- **S11 · Combien de paquets ?** — `ma.ce2.mult.tables-2-5-10` (sens inverse) — pavé. « Il veut 20, en
  paquets de 4 » → 5.
- **S12 · Doubles et moitiés** — `ma.ce2.calc.doubles-moities100` — pavé. « Le double de 35 », « la
  moitié de 48 ». Moitié de pair ≤ 40 / double ≤ 50 et moitié ≤ 100.
- **Boss · Le Forain** — menu qui mêle ×5 et ×10 avec des paquets déjà servis (« il a déjà 2 paquets de 5,
  il en veut 40 »).

Sticker : ballon.

Note pédagogique : le niveau (CE1 ou CE2) des tables ×2 ×5 ×10 est à confirmer contre le BO 2025 cycle 2
avant de figer les ids de compétences ; le scénario ne change pas, seul le libellé du skill bouge.

## Acte 5 — Le Volcan des Mille (CE2, périodes 3-5)

Décor : flanc du volcan de l'île du Monde, nuit raisin, lave corail douce (jamais menaçante), lucioles.
Le Glouton Ancestral dort au sommet. Équipement débloqué : **la grande caisse de 100**.

Gloup : « Chut… le Glouton Ancestral dort. Pour le réveiller gentiment, il faut servir mille ! »

Services (multiples de 10 uniquement, pour rester 100 % clips audio) :
- **S13 · Compléments à 1000 en centaines** — `ma.ce2.calc.complements1000` — pavé. Déjà mangé multiple de 100.
- **S14 · Jusqu'à la centaine** — `ma.ce2.calc.complements1000` — pavé. « Il veut 700, il a 640. »
- **S15 · Commande directe** — `ma.ce2.calc.complements1000` — pavé. « Il veut 640. » Le plateau montre
  6 grandes caisses et 4 caisses.
- **Boss final · Le Glouton Ancestral** — menu de 3 commandes à 1000 ; à la troisième, il se réveille, danse,
  et le volcan crache des confettis.

Sticker : couronne. Générique : le truck redescend vers le port, couvert de stickers, sous les étoiles.

## Tableau récapitulatif

```
Service  Acte  Type                        Compétence                          Saisie
S1       1     complement10                ma.cp.complements10                 tap
S2       1     double (jumeaux)            ma.cp.doubles                       tap
B1       1     boss doubles                ma.cp.doubles                       tap
S3       2     complement-dizaine          ma.ce1.calc.complement-dizaine      tap
S4       2     passage-dizaine             ma.ce1.calc.passage-dizaine         tap
S5       2     decompo100 (caisses)        ma.cp.num.decompo100                tap
B2       2     boss marché                 mixte acte 2                        tap
S6       3     complements100-dizaines     ma.ce1.calc.complements100          pavé
S7       3     complements100              ma.ce1.calc.complements100          pavé
S8       3     decompo100 (directe)        ma.cp.num.decompo100                pavé
B3       3     boss capitaine              ma.ce1.calc.complements100          pavé
S9       4     table 2 5 10                ma.ce2.mult.tables-2-5-10           pavé
S10      4     table 3 4                   ma.ce2.mult.tables-3-4              pavé
S11      4     paquets-inverse             ma.ce2.mult.tables-2-5-10           pavé
S12      4     double-moitie               ma.ce2.calc.doubles-moities100      pavé
B4       4     boss forain                 mixte acte 4                        pavé
S13      5     complement1000-centaines    ma.ce2.calc.complements1000         pavé
S14      5     complement-centaine         ma.ce2.calc.complements1000         pavé
S15      5     decompo1000                 ma.ce2.calc.complements1000         pavé
B5       5     boss ancestral              ma.ce2.calc.complements1000         pavé
```

## Corpus audio provisoire (`ftg.*`)

```
ftg.intro              eloise  Bienvenue au Food-Truck des Gloutons ! Moi c'est Gloup. Toi, tu es le chef !
ftg.consigne.veut      denise  Il veut…                       (+ nombre)
ftg.consigne.deja      denise  Il a déjà…                     (+ nombre)
ftg.consigne.combien   denise  Combien il en faut encore ?
ftg.consigne.jumeaux   denise  Ce sont des jumeaux : ce que tu sers, ils le mangent tous les deux !
ftg.consigne.paquets   denise  …paquets de…                   (n + clip + k)
ftg.consigne.combien-paquets  denise  Combien de paquets ?
ftg.consigne.double    denise  Il veut le double de…          (+ nombre)
ftg.consigne.moitie    denise  Il veut la moitié de…          (+ nombre)
ftg.servir             eloise  Servir !
ftg.gloup              henri   Gloup ! Parfait, chef !
ftg.trop               henri   Hic ! C'est trop !
ftg.pas-assez          henri   Encore faim…
ftg.ca-fait            denise  Ça fait…                       (+ nombre)
ftg.il-voulait         denise  Il en voulait…                 (+ nombre)
ftg.indice             eloise  Regarde, les bons plats brillent !
ftg.acte.1 … 5         eloise  intros d'acte (textes ci-dessus)
ftg.boss.1 … 5         eloise  « Un Grand Gourmand arrive ! Il commande un menu : trois plats d'affilée. »
ftg.sticker            eloise  Un nouveau sticker pour le truck !
ftg.fin                eloise  Le tour de l'Archipel est terminé. Merci, chef !
```

Nombres : `nombre.0..100` existent ; ajouter `nombre.110..1000` par pas de 10 (`numberToFrench` à étendre).

## Hors périmètre du POC (à décider ensuite)

- Passer d'autres jeux sur la piste arcade (gabarit : ce jeu).
- Profil « 8-9 ans » et textes « 4 à 7 ans » de la landing / du manifest PWA.
- Mode deux joueurs (deux chefs, un truck) et musique d'ambiance.
