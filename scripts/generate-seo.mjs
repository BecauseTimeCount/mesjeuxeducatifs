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
:root{
  --paper:#fdf6ec;--surface:#fff;--ink:#16323d;--ink-mid:#3f5d6b;--ink-soft:#7c8f99;
  --accent:#0e7490;--accent-ink:#0a4d57;--rule:rgba(22,50,61,.13);--rule-strong:rgba(22,50,61,.22);
  --font-display:Charter,"Bitstream Charter","Sitka Text",Cambria,Georgia,"Times New Roman",serif;
  --font-body:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --font-mono:ui-monospace,"SF Mono","JetBrains Mono","Cascadia Code",Consolas,monospace;
  color-scheme:light;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink-mid);font-family:var(--font-body);font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
em{font-style:italic;color:var(--accent)}
.btn{display:inline-flex;align-items:center;gap:.5rem;font-family:var(--font-body);font-weight:700;font-size:.95rem;padding:.85rem 1.5rem;border-radius:13px;border:1px solid transparent;cursor:pointer;transition:background-color .16s,border-color .16s,color .16s}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:var(--accent-ink);text-decoration:none}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.nav{position:sticky;top:0;z-index:50;background:rgba(253,246,236,.94);border-bottom:1px solid transparent;transition:border-color .2s}
.nav.scrolled{border-bottom-color:var(--rule)}
.nav-in{display:flex;align-items:center;justify-content:space-between;gap:1rem;height:64px;max-width:1160px;margin:0 auto;padding:0 1.25rem}
@media(min-width:640px){.nav-in{padding:0 2rem}}
.brand{display:flex;align-items:center;gap:.6rem;font-family:var(--font-display);font-weight:600;font-size:1.05rem;color:var(--ink);white-space:nowrap}
.brand:hover{text-decoration:none}
.brand .mark{width:30px;height:30px;border-radius:9px;background:var(--accent);display:grid;place-items:center;font-size:1rem}
.nav-links{display:none;align-items:center;gap:2rem}
.nav-links a{font-size:.92rem;color:var(--ink-mid);font-weight:500}
.nav-links a:hover{color:var(--ink);text-decoration:none}
@media(min-width:860px){.nav-links{display:flex}}
.nav-actions{display:flex;align-items:center;gap:.6rem}
.nav .btn-primary{padding:.6rem 1.2rem;font-size:.9rem}
.hamburger{display:inline-flex;flex-direction:column;justify-content:center;gap:5px;width:44px;height:44px;flex:0 0 auto;border:1px solid var(--rule-strong);border-radius:11px;background:transparent;cursor:pointer;padding:0 10px}
.hamburger span{display:block;height:2px;background:var(--ink);border-radius:2px;transition:transform .2s,opacity .2s}
.hamburger[aria-expanded="true"] span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.hamburger[aria-expanded="true"] span:nth-child(2){opacity:0}
.hamburger[aria-expanded="true"] span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
.hamburger:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(min-width:860px){.hamburger{display:none}}
.mobile-menu{position:fixed;left:0;right:0;top:64px;z-index:49;background:var(--paper);border-bottom:1px solid var(--rule);box-shadow:0 22px 44px -26px rgba(22,50,61,.45);padding:.5rem 1.25rem 1.6rem;transform:translateY(-14px);opacity:0;visibility:hidden;transition:opacity .22s,transform .22s,visibility .22s}
.mobile-menu.open{transform:none;opacity:1;visibility:visible}
.mobile-menu a.mlink{display:block;padding:1rem .25rem;font-size:1.12rem;color:var(--ink);font-weight:500;border-bottom:1px solid var(--rule)}
.mobile-menu a.mlink:hover{text-decoration:none}
.mobile-menu .btn{margin-top:1.2rem;width:100%;justify-content:center}
@media(min-width:860px){.mobile-menu{display:none}}
main{max-width:48rem;margin:0 auto;padding:clamp(2.5rem,6vw,4.5rem) 1.25rem 4rem}
@media(min-width:640px){main{padding-left:2rem;padding-right:2rem}}
h1{font-family:var(--font-display);font-weight:600;color:var(--ink);font-size:clamp(1.9rem,4.5vw,2.8rem);line-height:1.12;letter-spacing:-.015em;margin:0 0 1rem}
h2{font-family:var(--font-display);font-weight:600;color:var(--ink);font-size:clamp(1.3rem,2.6vw,1.7rem);line-height:1.2;margin:2.5rem 0 .5rem}
p{margin:.9rem 0;color:var(--ink-mid)}
strong{color:var(--ink)}
ul{padding-left:1.2rem}
li{margin:.5rem 0}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:14px;padding:1.2rem 1.35rem;margin:.9rem 0;box-shadow:0 10px 30px -24px rgba(22,50,61,.5)}
.card strong{color:var(--ink)}
.cta{display:inline-flex;align-items:center;gap:.5rem;background:var(--accent);color:#fff;font-weight:700;padding:.85rem 1.6rem;border-radius:13px;text-decoration:none;margin:1rem 0;transition:background-color .16s}
.cta:hover{background:var(--accent-ink);text-decoration:none}
.tag{display:inline-block;font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;background:rgba(14,116,144,.09);border:1px solid rgba(14,116,144,.18);color:var(--accent-ink);border-radius:999px;padding:.2rem .55rem;margin:0 .35rem .35rem 0}
small{color:var(--ink-soft)}
footer{border-top:1px solid var(--rule);background:var(--surface);padding:2.5rem 1.25rem;color:var(--ink-soft);font-size:.9rem;text-align:center;margin-top:3rem}
footer .fl{display:flex;flex-wrap:wrap;gap:.9rem 1.1rem;justify-content:center;margin-top:1rem}
footer .fl a{color:var(--ink-mid)}
`.trim()

/** Gabarit premium commun : header + menu hamburger + footer, identité de la landing.
 *  Liens de navigation en absolu racine -> fonctionnent depuis n'importe quelle profondeur. */
function page({ path, title, description, body, jsonLd }) {
  const url = SITE + path
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0e7490">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<style>${CSS}</style>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body>
<header class="nav" id="nav">
  <div class="nav-in">
    <a class="brand" href="/"><span class="mark" aria-hidden="true">🦜</span> L’Archipel</a>
    <nav class="nav-links" aria-label="Navigation principale">
      <a href="/methode.html">La méthode</a>
      <a href="/orthophonistes.html">Professionnels</a>
      <a href="/contact.html">Contact</a>
    </nav>
    <div class="nav-actions">
      <a class="btn btn-primary" href="/jouer/">Les jeux</a>
      <button class="hamburger" id="hb" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="mobile-menu"><span></span><span></span><span></span></button>
    </div>
  </div>
  <div class="mobile-menu" id="mobile-menu">
    <a class="mlink" href="/">Accueil</a>
    <a class="mlink" href="/methode.html">La méthode</a>
    <a class="mlink" href="/orthophonistes.html">Professionnels — orthophonistes &amp; enseignants</a>
    <a class="mlink" href="/contact.html">Contact</a>
    <a class="btn btn-primary" href="/jouer/">▶ Découvrir les jeux</a>
  </div>
</header>
<main>${body}</main>
<footer>
  100 % gratuit · zéro pub · zéro compte · zéro tracking · vos données restent sur votre appareil.
  <span class="fl">
    <a href="/">Accueil</a><a href="/methode.html">Méthode</a><a href="/orthophonistes.html">Professionnels</a>
    <a href="/contact.html">Contact</a><a href="/jeux/">Tous les jeux</a><a href="/competences/">Les compétences</a><a href="/jouer/">Jouer</a>
  </span>
</footer>
<script>
(function(){
  var nav=document.getElementById('nav');
  function s(){nav.classList.toggle('scrolled',window.scrollY>8)}s();window.addEventListener('scroll',s,{passive:true});
  var hb=document.getElementById('hb'),mm=document.getElementById('mobile-menu');
  function set(o){mm.classList.toggle('open',o);hb.setAttribute('aria-expanded',o?'true':'false');hb.setAttribute('aria-label',o?'Fermer le menu':'Ouvrir le menu')}
  hb.addEventListener('click',function(){set(!mm.classList.contains('open'))});
  mm.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){set(false)})});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false)});
  window.addEventListener('resize',function(){if(window.innerWidth>=860)set(false)});
})();
</script>
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
