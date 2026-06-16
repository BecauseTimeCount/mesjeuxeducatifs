// ============================================================
// Génération des pages SEO statiques (phase 4).
// Lit LA source unique (games.manifest.ts + skill-map.ts) grâce au
// type-stripping natif de Node 24, et écrit dans public/ :
//   jeux/<id>.html, jeux/index.html,
//   competences/<slug>.html, competences/index.html,
//   methode.html, orthophonistes.html, sitemap.xml
// Lancé par `pnpm build` AVANT vite build (les pages sont copiées
// dans dist/ et précachées par la PWA). Sorties non commitées.
// ============================================================

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = resolve(ROOT, 'public')
const SITE = 'https://jeux.becausetimecounts.fr/'

const { GAMES, ISLANDS_BY_ID } = await import('../src/games.manifest.ts')
const { SKILL_MAP, SKILLS_BY_ID, DOMAIN_LABELS, LEVEL_LABELS } = await import(
  '../src/content/skill-map.ts'
)

const V2 = GAMES.filter((g) => g.status === 'v2')
const slug = (skillId) => skillId.replaceAll('.', '-')
const esc = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const CSS = `
:root{color-scheme:light}
body{font-family:Nunito,system-ui,sans-serif;background:#faf6ec;color:#2b2620;margin:0;line-height:1.6}
main{max-width:42rem;margin:0 auto;padding:1.5rem 1.25rem 3rem}
a{color:#0f766e}
h1{font-size:1.7rem;line-height:1.25}
h2{font-size:1.2rem;margin-top:2rem}
.card{background:#fff;border-radius:1rem;padding:1rem 1.25rem;margin:.75rem 0;box-shadow:0 2px 8px rgba(43,38,32,.08)}
.cta{display:inline-block;background:#0f766e;color:#fff;font-weight:800;padding:.8rem 1.6rem;border-radius:1rem;text-decoration:none;margin:.75rem 0}
.tag{display:inline-block;background:#efe7d3;border-radius:.5rem;padding:.1rem .5rem;font-size:.8rem;margin-right:.35rem}
nav{font-size:.9rem;padding:1rem 1.25rem}
footer{text-align:center;font-size:.85rem;color:#6f675c;padding:2rem 1rem}
ul{padding-left:1.2rem}
`.trim()

/** Gabarit commun : depth = profondeur du fichier sous public/ (0 ou 1). */
function page({ depth, path, title, description, body, jsonLd }) {
  const up = depth === 0 ? './' : '../'
  const url = SITE + path
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<link rel="icon" href="${up}icons/icon.svg" type="image/svg+xml">
<style>${CSS}</style>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body>
<nav><a href="${up}">🏝️ Mes Jeux Éducatifs — L’Archipel</a></nav>
<main>${body}</main>
<footer>100 % gratuit · zéro pub · zéro compte · zéro tracking · les données restent sur votre tablette.<br>
<a href="${up}">Accueil</a> · <a href="${up}methode.html">Notre méthode</a> · <a href="${up}orthophonistes.html">Pour les orthophonistes</a> · <a href="${up}contact.html">Contact</a> · <a href="${up}jeux/">Tous les jeux</a> · <a href="${up}competences/">Les compétences</a></footer>
</body>
</html>`
  const out = resolve(PUB, path)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html, 'utf8')
  return url
}

const urls = []

// ---------- Pages par jeu ----------
for (const g of V2) {
  const island = ISLANDS_BY_ID.get(g.island)
  const skills = g.skills.map((id) => SKILLS_BY_ID.get(id)).filter(Boolean)
  const levels = [...new Set(skills.map((s) => LEVEL_LABELS[s.level]))].join(', ')
  const description = `${g.title} : ${g.tagline} Jeu éducatif gratuit et sans publicité (${levels}), conforme aux programmes 2025. Jouable hors ligne, sans compte.`
  const body = `
<h1>${g.icon} ${esc(g.title)}</h1>
<p><strong>${esc(g.tagline)}</strong></p>
<p>Un jeu de <em>${esc(island?.name ?? '')}</em> (${esc(island?.tagline ?? '')}), pour les niveaux ${esc(levels)}.
L’enfant manipule directement — il construit, règle, trace ou tape sa réponse : jamais de simple
choix multiple. Toutes les consignes sont lues à voix haute : un enfant qui ne sait pas encore
lire est autonome de bout en bout.</p>
<a class="cta" href="/jouer/#/jeu/${g.id}">▶ Jouer à ${esc(g.title)}</a>
<h2>Compétences officielles travaillées</h2>
${skills
  .map(
    (s) => `<div class="card"><a href="../competences/${slug(s.id)}.html"><strong>${esc(s.label)}</strong></a><br>
<span class="tag">${esc(DOMAIN_LABELS[s.domain])}</span><span class="tag">${esc(LEVEL_LABELS[s.level])}</span>${s.period ? `<span class="tag">Période ${s.period}</span>` : ''}<br>
<small>Attendu officiel : ${esc(s.official)} (programmes 2025, BO n°41 du 31/10/2024).</small></div>`,
  )
  .join('\n')}
<p>La progression de l’enfant sur ces compétences est visible dans l’espace parents,
avec les libellés officiels des programmes.</p>`
  urls.push(
    page({
      depth: 1,
      path: `jeux/${g.id}.html`,
      title: `${g.title} — jeu éducatif gratuit (${levels})`,
      description,
      body,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: g.title,
        description: g.tagline,
        inLanguage: 'fr',
        isAccessibleForFree: true,
        educationalLevel: levels,
        teaches: skills.map((s) => s.official),
        url: SITE + `jeux/${g.id}.html`,
      },
    }),
  )
}

// ---------- Index des jeux ----------
{
  const byIsland = new Map()
  for (const g of V2) {
    if (!byIsland.has(g.island)) byIsland.set(g.island, [])
    byIsland.get(g.island).push(g)
  }
  const body = `
<h1>Tous les jeux de l’Archipel</h1>
<p>${V2.length} jeux éducatifs gratuits, sans publicité et sans compte, pour les enfants de
4 à 7 ans (Grande Section, CP, CE1). Chaque jeu travaille des compétences précises des
programmes 2025 par la manipulation directe.</p>
<a class="cta" href="/jouer/">▶ Entrer dans l’Archipel</a>
${[...byIsland.entries()]
  .map(([islandId, games]) => {
    const island = ISLANDS_BY_ID.get(islandId)
    return `<h2>${island?.emoji ?? ''} ${esc(island?.name ?? '')} — ${esc(island?.tagline ?? '')}</h2>
${games.map((g) => `<div class="card">${g.icon} <a href="${g.id}.html"><strong>${esc(g.title)}</strong></a> — ${esc(g.tagline)}</div>`).join('\n')}`
  })
  .join('\n')}`
  urls.push(
    page({
      depth: 1,
      path: 'jeux/index.html',
      title: 'Tous les jeux — Mes Jeux Éducatifs (GS, CP, CE1)',
      description: `${V2.length} jeux éducatifs gratuits et sans pub pour les 4-7 ans, alignés sur les programmes 2025 : lecture, maths, logique, temps, anglais, musique.`,
      body,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: V2.map((g, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: g.title,
          url: SITE + `jeux/${g.id}.html`,
        })),
      },
    }),
  )
}

// ---------- Pages par compétence ----------
for (const s of SKILL_MAP) {
  const games = V2.filter((g) => g.skills.includes(s.id))
  const prereqs = (s.prereqs ?? []).map((id) => SKILLS_BY_ID.get(id)).filter(Boolean)
  const description = `${s.label} (${LEVEL_LABELS[s.level]}) : « ${s.official} » — entraînez cette compétence des programmes 2025 avec des jeux gratuits, sans pub et hors ligne.`
  const body = `
<h1>${esc(s.label)}</h1>
<p><span class="tag">${esc(DOMAIN_LABELS[s.domain])}</span><span class="tag">${esc(LEVEL_LABELS[s.level])}</span>${s.period ? `<span class="tag">Période ${s.period} de l’année</span>` : ''}</p>
<div class="card"><strong>Attendu officiel (programmes 2025)</strong><br>${esc(s.official)}</div>
${
  prereqs.length
    ? `<h2>À maîtriser d’abord</h2><ul>${prereqs.map((p) => `<li><a href="${slug(p.id)}.html">${esc(p.label)}</a> (${esc(LEVEL_LABELS[p.level])})</li>`).join('')}</ul>`
    : ''
}
<h2>Les jeux qui l’entraînent</h2>
${
  games.length
    ? games
        .map(
          (g) => `<div class="card">${g.icon} <a href="../jeux/${g.id}.html"><strong>${esc(g.title)}</strong></a> — ${esc(g.tagline)}<br>
<a class="cta" href="/jouer/#/jeu/${g.id}">▶ Jouer</a></div>`,
        )
        .join('\n')
    : `<p>Cette compétence sera couverte par un prochain jeu de l’Archipel — la carte des
compétences préfère une case honnêtement grise à un exercice bâclé.</p>`
}
<p>La maîtrise est mesurée sur les <strong>premiers essais uniquement</strong> (fenêtre des 10
dernières réponses) et revue par répétition espacée. Le détail est visible dans l’espace parents.</p>`
  urls.push(
    page({
      depth: 1,
      path: `competences/${slug(s.id)}.html`,
      title: `${s.label} — ${LEVEL_LABELS[s.level]} (programmes 2025)`,
      description,
      body,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: s.label,
        description: s.official,
        inLanguage: 'fr',
        isAccessibleForFree: true,
        educationalLevel: LEVEL_LABELS[s.level],
        url: SITE + `competences/${slug(s.id)}.html`,
      },
    }),
  )
}

// ---------- Index des compétences ----------
{
  const domains = [...new Set(SKILL_MAP.map((s) => s.domain))]
  const body = `
<h1>La carte des compétences</h1>
<p>${SKILL_MAP.length} compétences extraites des programmes officiels 2025 (BO n°41 du
31/10/2024) pour la Grande Section, le CP et le CE1. Chaque jeu de l’Archipel déclare
précisément celles qu’il entraîne.</p>
${domains
  .map(
    (d) => `<h2>${esc(DOMAIN_LABELS[d])}</h2>
<ul>${SKILL_MAP.filter((s) => s.domain === d)
      .map((s) => `<li><a href="${slug(s.id)}.html">${esc(s.label)}</a> <small>(${esc(LEVEL_LABELS[s.level])}${s.period ? `, P${s.period}` : ''})</small></li>`)
      .join('')}</ul>`,
  )
  .join('\n')}`
  urls.push(
    page({
      depth: 1,
      path: 'competences/index.html',
      title: 'Les compétences GS, CP et CE1 des programmes 2025 — Mes Jeux Éducatifs',
      description: `${SKILL_MAP.length} compétences officielles des programmes 2025 (lecture, maths, logique, temps, anglais, musique) et les jeux gratuits qui les entraînent.`,
      body,
    }),
  )
}

// ---------- Page méthode ----------
urls.push(
  page({
    depth: 0,
    path: 'methode.html',
    title: 'Notre méthode — manipulation directe, programmes 2025, science de la lecture',
    description:
      'Pourquoi zéro QCM, zéro pub, zéro compte : la méthode de Mes Jeux Éducatifs — manipulation directe, voix naturelle, score honnête au premier essai, répétition espacée, programmes 2025.',
    body: `
<h1>Notre méthode</h1>
<p>Mes Jeux Éducatifs est un site personnel, construit par un parent pour ses enfants,
et offert à tous. Il n’a rien à vendre : pas de publicité, pas de compte, pas d’abonnement,
pas de données collectées. Cette liberté permet d’appliquer sans compromis ce que dit la
recherche sur les apprentissages.</p>

<h2>1. Le doigt fait la compétence — zéro QCM</h2>
<div class="card">Choisir une réponse parmi trois n’apprend presque rien. Ici, l’enfant
<strong>produit</strong> : il casse des barres de dix, assemble des wagons-syllabes, règle des
aiguilles, trace des lettres cursives, coupe des pizzas en parts égales. La mécanique du jeu
<em>est</em> la compétence.</div>

<h2>2. L’erreur enseigne</h2>
<div class="card">Jamais le mot « faux », jamais de game over. Une erreur déclenche une
conséquence comique puis une explication visuelle : on montre <em>pourquoi</em>, on redonne un
essai dans le même contexte, et la notion revient plus tard avec de nouvelles valeurs.
Un indice arrive automatiquement après deux échecs.</div>

<h2>3. Audio d’abord</h2>
<div class="card">Toutes les consignes sont dites en voix française naturelle, pré-générée et
embarquée. Un enfant de 4 ans qui ne lit pas encore est autonome de bout en bout. La phonologie
est purement auditive : dans les jeux de sons, le mot n’est jamais affiché — conformément à
l’approche graphémique des programmes 2025 et aux travaux sur l’apprentissage de la lecture
(S. Dehaene, Graphogame).</div>

<h2>4. Un score honnête, sans manipulation</h2>
<div class="card">Seuls les premiers essais comptent pour la maîtrise. Pas de streaks, pas de
classements, pas de « reviens demain » : la recherche montre que les récompenses artificielles
détruisent la motivation intrinsèque (effet de sur-justification). La difficulté s’adapte en
douceur : trois réussites élargissent le champ, deux échecs le resserrent avec un indice.</div>

<h2>5. Alignement sur les programmes 2025</h2>
<div class="card">Chaque jeu déclare les compétences exactes qu’il entraîne, avec les libellés
officiels du BO n°41 du 31/10/2024 : tempo graphémique du CP, problèmes en barres
(10 par semaine), motifs organisés en maternelle, fluence cible 30/50/70 mots par minute,
fractions précoces au CE1. <a href="competences/">Voir la carte des compétences</a>.</div>

<h2>6. La mémoire se construit dans le temps</h2>
<div class="card">Une compétence maîtrisée revient à J+2, J+7 puis J+21 (répétition espacée de
type Leitner), servie par un jeu <em>différent</em> à chaque fois — l’exposition variée est le
mécanisme de consolidation le mieux validé. Le « parcours du jour » suggère trois activités
courtes : une notion fragile, une nouveauté, une révision. Une suggestion, jamais une contrainte.</div>

<h2>7. Le temps d’écran est respecté</h2>
<div class="card">Des boucles de 3 à 5 minutes qui se terminent proprement. Vers 15 minutes, la
mascotte propose gentiment de conclure — conformément aux repères officiels sur les écrans des
jeunes enfants. Le site n’a aucun intérêt à maximiser votre temps : il ne vend rien.</div>

<h2>Et vos données ?</h2>
<div class="card">Tout est stocké sur votre appareil (IndexedDB). Aucun serveur, aucun cookie,
aucun traceur, aucun compte. Un export JSON permet de changer de tablette. Le code est ouvert
et lisible par tous.</div>
<a class="cta" href="/jouer/">▶ Entrer dans l’Archipel</a>`,
  }),
)

// ---------- Page orthophonistes ----------
urls.push(
  page({
    depth: 0,
    path: 'orthophonistes.html',
    title: 'Pour les orthophonistes et enseignants — Mes Jeux Éducatifs',
    description:
      'Un outil gratuit, sans pub et hors ligne pour les séances : phonologie purement auditive, encodage graphémique, anaphores, fluence MCLM, multi-profils et données 100 % locales.',
    body: `
<h1>Pour les orthophonistes et les enseignants</h1>
<p>Mes Jeux Éducatifs est gratuit, sans publicité, sans compte et fonctionne hors ligne une
fois installé (PWA). Plusieurs choix de conception le rendent utilisable en séance ou en
remédiation :</p>

<h2>Ce qui peut vous servir</h2>
<div class="card"><strong>Phonologie purement auditive.</strong> Dans les jeux de conscience
phonologique (Le Train des Syllabes), le mot n’est jamais affiché : scansion, fusion,
suppression et permutation syllabiques se travaillent à l’oreille, comme en séance.</div>
<div class="card"><strong>Encodage au tempo graphémique.</strong> La Machine à Écrire Magique
suit la progression graphémique du CP (voyelles → consonnes fréquentes → digraphes →
graphèmes complexes), avec un clavier de graphèmes — pas de clavier AZERTY.</div>
<div class="card"><strong>Compréhension : anaphores et inférences.</strong> Mystères au Village
travaille la reprise pronominale (il/elle/ils/elles, genre et nombre) et l’inférence — parmi
les meilleurs prédicteurs de la compréhension au CP, rarement disponibles en jeu.</div>
<div class="card"><strong>Fluence avec MCLM.</strong> Fluence Express propose une lecture
chronométrée en duo : vous chronométrez la lecture à voix haute, indiquez les erreurs, et
obtenez les mots correctement lus par minute, situés par rapport aux repères 30/50/70
(fin CP / CP consolidé / fin CE1). L’enfant, lui, ne voit jamais de chiffre.</div>
<div class="card"><strong>Geste graphique.</strong> La Lettre Magique guide le tracé cursif au
doigt (modèle animé → pointillés → autonomie), du graphisme préparatoire GS aux minuscules
cursives par familles de geste.</div>
<div class="card"><strong>Confusions visuelles.</strong> La Chasse aux Lettres fait revenir
adaptativement les paires b/d, p/q, m/n dans les trois graphies, cursive comprise.</div>

<h2>Pensé pour un cadre professionnel</h2>
<ul>
<li><strong>Multi-profils</strong> : un profil par patient/élève sur la même tablette, progressions séparées.</li>
<li><strong>Mesure honnête</strong> : seuls les premiers essais alimentent la maîtrise — pas de score gonflé par l’élimination.</li>
<li><strong>Suivi par compétence officielle</strong> : l’espace parents montre l’état de chaque attendu des programmes 2025, les fragilités détectées (&lt; 80 % de réussite) et les jeux pour y revenir.</li>
<li><strong>RGPD par construction</strong> : aucune donnée ne quitte l’appareil, aucun compte, export/import JSON local. Rien à déclarer.</li>
<li><strong>Hors ligne</strong> : installable sur tablette, fonctionne sans connexion en séance.</li>
</ul>
<p>Une remarque, un besoin, une compétence à couvrir ? Le projet est ouvert aux contributions
(corpus de mots, gabarits de problèmes) — voir le dépôt GitHub.</p>
<a class="cta" href="/jouer/">▶ Découvrir l’Archipel</a>`,
  }),
)

// ---------- Sitemap ----------
{
  const all = [SITE, SITE + 'jouer/', SITE + 'contact.html', ...urls]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`
  writeFileSync(resolve(PUB, 'sitemap.xml'), xml, 'utf8')
}

console.log(`SEO : ${urls.length} pages + sitemap.xml générés dans public/`)
