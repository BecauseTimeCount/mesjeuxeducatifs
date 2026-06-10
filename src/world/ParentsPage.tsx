import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSummary } from '@/engine/mastery'
import { currentPeriod, PERIOD_LABELS } from '@/engine/periods'
import { useProfiles } from '@/engine/profiles'
import { sessionMinutes } from '@/engine/session'
import { exportAll, gget, gset, importAll, pget } from '@/engine/storage'
import { DOMAIN_LABELS, LEVEL_LABELS, SKILL_MAP, SKILLS_BY_ID } from '@/content/skill-map'
import { V2_GAMES } from '@/games.manifest'
import { ParentGate } from '@/ui'
import type { Domain, MasteryState, SkillDef, SkillProgress } from '@/engine/types'

const DOMAIN_ORDER: Domain[] = ['francais', 'maths', 'logique', 'monde', 'anglais', 'arts']

const STATE_ORDER: MasteryState[] = ['decouverte', 'en-cours', 'maitrise', 'consolide']

const STATE_META: Record<MasteryState, { color: string; label: string }> = {
  decouverte: { color: '#cccccc', label: 'Découverte' },
  'en-cours': { color: '#ffc94d', label: 'En cours' },
  maitrise: { color: '#58c472', label: 'Maîtrisé' },
  consolide: { color: '#3a9e54', label: 'Consolidé' },
}

/** Taux de réussite sur la fenêtre des premiers essais (0..1), ou null si vide. */
function windowRatio(p: SkillProgress | undefined): number | null {
  if (!p || p.window.length === 0) return null
  return p.window.filter((w) => w.ok).length / p.window.length
}

interface Fragility {
  skill: SkillDef
  ratio: number
  games: { id: string; title: string; icon: string }[]
}

/** Compétences fragiles : « en cours » avec ≥ 3 premiers essais et < 80 % de
 *  réussite, triées de la plus fragile à la moins fragile. */
function detectFragilities(summary: Record<string, SkillProgress>): Fragility[] {
  const out: Fragility[] = []
  for (const [skillId, p] of Object.entries(summary)) {
    const skill = SKILLS_BY_ID.get(skillId)
    if (!skill) continue
    const ratio = windowRatio(p)
    if (p.state !== 'en-cours' || p.window.length < 3 || ratio === null || ratio >= 0.8) continue
    const games = V2_GAMES.filter((g) => g.skills.includes(skillId)).map((g) => ({
      id: g.id,
      title: g.title,
      icon: g.icon,
    }))
    out.push({ skill, ratio, games })
  }
  return out.sort((a, b) => a.ratio - b.ratio).slice(0, 5)
}

function OverviewSection({ summary }: { summary: Record<string, SkillProgress> }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold">Vue d’ensemble</h2>
      <ul className="mt-3 flex flex-col gap-2.5">
        {DOMAIN_ORDER.map((domain) => {
          const skills = SKILL_MAP.filter((s) => s.domain === domain)
          const started = skills.filter((s) => (summary[s.id]?.totalAttempts ?? 0) > 0).length
          const mastered = skills.filter((s) => {
            const st = summary[s.id]?.state
            return st === 'maitrise' || st === 'consolide'
          }).length
          const pct = skills.length === 0 ? 0 : Math.round((mastered / skills.length) * 100)
          return (
            <li key={domain}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">{DOMAIN_LABELS[domain]}</span>
                <span className="whitespace-nowrap text-xs text-ink-soft">
                  {mastered} maîtrisée{mastered > 1 ? 's' : ''} / {skills.length}
                  {started > mastered && ` · ${started - mastered} en route`}
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-sand" aria-hidden>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: STATE_META.maitrise.color }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function FragilitiesSection({ summary }: { summary: Record<string, SkillProgress> }) {
  const fragilities = detectFragilities(summary)
  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold">Fragilités détectées</h2>
      {fragilities.length === 0 ? (
        <p className="mt-1 text-sm text-ink-soft">
          Rien à signaler : aucune notion travaillée ne montre de difficulté persistante en ce
          moment.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            Ces notions ont été tentées plusieurs fois avec moins de 80&nbsp;% de réussite au
            premier essai. Une partie ensemble vaut mieux que dix parties seul&nbsp;!
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {fragilities.map(({ skill, ratio, games }) => (
              <li key={skill.id} className="rounded-xl bg-paper px-3 py-2.5">
                <p className="text-sm font-semibold leading-snug">
                  {skill.label}{' '}
                  <span className="font-normal text-ink-soft">
                    · {LEVEL_LABELS[skill.level]} · {Math.round(ratio * 100)}&nbsp;% de réussite
                  </span>
                </p>
                <p className="text-xs leading-snug text-ink-soft">{skill.official}</p>
                {games.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-2 text-xs">
                    <span className="font-semibold text-ink-soft">À retravailler dans&nbsp;:</span>
                    {games.map((g) => (
                      <Link
                        key={g.id}
                        to={`/jeu/${g.id}`}
                        className="font-bold text-lagoon-700 underline underline-offset-2"
                      >
                        {g.icon} {g.title}
                      </Link>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 rounded-xl bg-sand px-3 py-2 text-xs leading-snug text-ink">
        <strong>Conseil co-jeu&nbsp;:</strong> asseyez-vous à côté, laissez-le manipuler, et
        demandez-lui d’expliquer <em>pourquoi</em> — verbaliser la stratégie consolide bien plus
        que répéter l’exercice.
      </p>
    </section>
  )
}

interface FluenceEntry {
  ts: number
  wpm: number
  mode: 'solo' | 'duo'
}

/** Repères officiels de fluence (programmes 2025). */
const FLUENCE_MARKS = [
  { wpm: 30, label: 'fin CP' },
  { wpm: 50, label: 'CP consolidé' },
  { wpm: 70, label: 'fin CE1' },
]
const FLUENCE_SCALE_MAX = 100

function FluenceSection({ log }: { log: FluenceEntry[] }) {
  if (log.length === 0) return null
  const last = log[log.length - 1]
  const recent = log.slice(-8).reverse()
  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold">Fluence de lecture</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Mesurée par Fluence Express. Repères officiels&nbsp;: 30 mots/min en fin de CP,
        50 en CP consolidé, environ 70 en fin de CE1.
      </p>
      <div className="relative mt-6 h-3 rounded-full bg-sand" aria-hidden>
        {FLUENCE_MARKS.map((m) => (
          <div
            key={m.wpm}
            className="absolute -top-4 bottom-0 w-0.5 bg-ink-soft/40"
            style={{ left: `${(m.wpm / FLUENCE_SCALE_MAX) * 100}%` }}
          >
            <span className="absolute -top-1 left-1 whitespace-nowrap text-[10px] font-semibold text-ink-soft">
              {m.wpm} · {m.label}
            </span>
          </div>
        ))}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min((last.wpm / FLUENCE_SCALE_MAX) * 100, 100)}%`,
            backgroundColor: STATE_META.maitrise.color,
          }}
        />
      </div>
      <p className="mt-2 text-sm">
        Dernière mesure&nbsp;: <strong>{last.wpm}&nbsp;mots/min</strong>{' '}
        <span className="text-ink-soft">
          ({last.mode === 'duo' ? 'lecture à voix haute en duo' : 'jeu en autonomie'})
        </span>
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-soft">
        {recent.map((e) => (
          <li key={e.ts}>
            {new Date(e.ts).toLocaleDateString('fr-FR')} — {e.wpm}&nbsp;mots/min ·{' '}
            {e.mode === 'duo' ? 'duo' : 'autonomie'}
          </li>
        ))}
      </ul>
    </section>
  )
}

function SkillMapSection({ summary }: { summary: Record<string, SkillProgress> }) {
  const period = currentPeriod()
  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold">Carte de compétences</h2>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        {STATE_ORDER.map((state) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATE_META[state].color }}
            />
            {STATE_META[state].label}
          </span>
        ))}
      </div>
      {DOMAIN_ORDER.map((domain) => (
        <div key={domain} className="mt-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            {DOMAIN_LABELS[domain]}
          </h3>
          <ul className="mt-1 divide-y divide-sand">
            {SKILL_MAP.filter((s) => s.domain === domain).map((skill) => {
              const state = summary[skill.id]?.state ?? 'decouverte'
              const meta = STATE_META[state]
              return (
                <li key={skill.id} className="flex items-start gap-3 py-2">
                  <span
                    aria-hidden
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">
                      {skill.label}{' '}
                      <span className="font-normal text-ink-soft">
                        · {LEVEL_LABELS[skill.level]} · {meta.label}
                      </span>
                      {skill.period !== undefined &&
                        (skill.period === period ? (
                          <span className="ml-1.5 inline-block whitespace-nowrap rounded-md border border-lagoon-500 bg-lagoon-50 px-1.5 align-middle text-[11px] font-bold text-lagoon-700">
                            P{skill.period} ◀ en ce moment
                          </span>
                        ) : (
                          <span className="ml-1.5 inline-block rounded-md bg-paper px-1.5 align-middle text-[11px] font-semibold text-ink-soft">
                            P{skill.period}
                          </span>
                        ))}
                    </p>
                    <p className="text-xs leading-snug text-ink-soft">{skill.official}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

function ParentDashboard() {
  const profiles = useProfiles((s) => s.profiles)
  const removeProfile = useProfiles((s) => s.remove)
  const [summary, setSummary] = useState<Record<string, SkillProgress>>({})
  const [fluenceLog, setFluenceLog] = useState<FluenceEntry[]>([])
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [importError, setImportError] = useState(false)
  const [artV3, setArtV3] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const minutes = sessionMinutes()

  useEffect(() => {
    let cancelled = false
    void getSummary().then((s) => {
      if (!cancelled) setSummary(s)
    })
    void pget<{ fluenceLog?: FluenceEntry[] }>('game:fluence-express').then((p) => {
      if (!cancelled && p?.fluenceLog) setFluenceLog(p.fluenceLog)
    })
    void gget<boolean>('artV3').then((v) => {
      if (!cancelled && v) setArtV3(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRemove(id: string) {
    await removeProfile(id)
    setConfirmId(null)
  }

  async function handleExport() {
    const json = await exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mes-jeux-sauvegarde.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importAll(await file.text())
      window.location.reload()
    } catch {
      setImportError(true)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Espace parents</h1>
        <Link
          to="/"
          className="rounded-xl p-2 text-sm font-semibold text-ink-soft underline underline-offset-2"
        >
          ← Retour aux jeux
        </Link>
      </header>

      <p className="mb-4 rounded-xl bg-sand px-4 py-2.5 text-sm font-semibold text-ink">
        En ce moment à l’école&nbsp;: {PERIOD_LABELS[currentPeriod()]}
      </p>

      <div className="flex flex-col gap-4">
        <OverviewSection summary={summary} />
        <FragilitiesSection summary={summary} />
        <FluenceSection log={fluenceLog} />
        <SkillMapSection summary={summary} />

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Session en cours</h2>
          <p className="mt-1 text-sm">
            Temps de jeu cumulé&nbsp;: <strong>{minutes}&nbsp;min</strong>
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Profils</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {profiles.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-paper px-3 py-2">
                <span aria-hidden className="text-2xl">
                  {p.emoji}
                </span>
                <span className="flex-1 text-sm font-semibold">
                  {p.name} <span className="font-normal text-ink-soft">· {p.ageBand} ans</span>
                </span>
                {confirmId === p.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRemove(p.id)}
                      className="rounded-lg bg-coral-deep px-3 py-2 text-sm font-bold text-white"
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft"
                    >
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(p.id)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-coral-deep"
                  >
                    Supprimer
                  </button>
                )}
              </li>
            ))}
            {profiles.length === 0 && <li className="text-sm text-ink-soft">Aucun profil.</li>}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">
            La suppression efface définitivement la progression du profil sur cet appareil.
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Données</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Sauvegardez la progression dans un fichier, ou restaurez-la depuis une autre tablette.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleExport()}
              className="rounded-xl bg-lagoon-700 px-4 py-3 text-sm font-bold text-white"
            >
              Exporter
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border-2 border-lagoon-700 px-4 py-3 text-sm font-bold text-lagoon-700"
            >
              Importer
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void handleImport(e)}
            />
          </div>
          {importError && (
            <p className="mt-2 text-sm font-semibold text-coral-deep">
              Fichier invalide — import impossible.
            </p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Apparence (essai)</h2>
          <label className="mt-2 flex items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={artV3}
              onChange={(e) => {
                setArtV3(e.target.checked)
                void gset('artV3', e.target.checked)
              }}
              className="h-5 w-5 accent-lagoon-700"
            />
            Afficher les nouveaux décors illustrés (chantier en cours)
          </label>
          <p className="mt-2 text-xs text-ink-soft">
            Les îles déjà illustrées s’affichent avec leur décor peint. Décochez pour revenir
            à l’affichage classique à tout moment.
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Notre charte</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Zéro publicité, zéro compte, zéro tracking.</li>
            <li>Les données restent à 100&nbsp;% sur cet appareil (export manuel uniquement).</li>
            <li>
              Sessions courtes recommandées (15 à 20 minutes), conformément aux repères officiels
              sur les écrans des jeunes enfants, de préférence accompagné d’un adulte.
            </li>
          </ul>
        </section>

        <Link
          to="/"
          className="card block px-4 py-3 text-center text-base font-bold text-lagoon-700"
        >
          ← Retour aux jeux
        </Link>
      </div>
    </div>
  )
}

export default function ParentsPage() {
  const navigate = useNavigate()
  const [passed, setPassed] = useState(false)

  if (!passed) {
    return <ParentGate onPass={() => setPassed(true)} onCancel={() => void navigate('/')} />
  }

  return <ParentDashboard />
}
